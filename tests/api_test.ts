import { assertEquals, assertExists } from "std/testing/asserts.ts";
import { describe, it, beforeAll, afterAll } from "std/testing/bdd.ts";
import { Status } from "std/http/http_status.ts";
import { serve } from "std/http/server.ts";
import { router } from "../api.ts";
import { kv } from "../db.ts";

// Helper function to clear the database
async function clearDatabase() {
  for await (const entry of kv.list({ prefix: [] })) {
    await kv.delete(entry.key);
  }
}

// Mock data
const testUser = {
  email: "test@example.com",
  password: "test123",
  firstName: "Test",
  lastName: "User",
  hourlyRate: 100,
};

const testProject = {
  name: "Test Project",
  description: "Testing financial summaries",
  budget: 10000,
  clientId: "client123",
  profitSharingEnabled: true,
};

const testTimeEntry: {
  projectId?: string;
  description: string;
  hours: number;
  date: string;
} = {
  description: "Testing financial summaries",
  hours: 4,
  date: new Date("2024-12-20T12:00:00.000Z").toISOString(),
};

// Helper function to make API calls
async function makeRequest(
  method: string,
  path: string,
  body?: unknown,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`http://localhost:8000${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  return response;
}

describe("API Tests", () => {
  let authToken: string;
  let userId: string;
  let projectId: string;
  let controller: AbortController;

  // Start server before all tests
  beforeAll(async () => {
    // Clear the database first
    await clearDatabase();
    
    controller = new AbortController();
    const signal = controller.signal;
    
    // Start server in the background
    (async () => {
      try {
        await serve(router, { port: 8000, signal });
      } catch (error: unknown) {
        if (error instanceof Error && error.name !== "AbortError") {
          throw error;
        }
      }
    })();

    // Wait for server to be ready
    await new Promise((resolve) => setTimeout(resolve, 100));
  });

  // Stop server after all tests
  afterAll(() => {
    controller.abort();
  });

  describe("User Authentication", () => {
    it("should create a new user", async () => {
      const response = await makeRequest("POST", "/users", testUser);
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data.id);
      assertEquals(data.data.email, testUser.email);
      assertEquals(data.data.firstName, testUser.firstName);
      assertEquals(data.data.lastName, testUser.lastName);
      assertEquals(data.data.hourlyRate, testUser.hourlyRate);
      
      // Store userId for later tests
      userId = data.data.id;
    });

    it("should login with valid credentials", async () => {
      const response = await makeRequest("POST", "/auth/login", {
        email: testUser.email,
        password: testUser.password,
      });
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertExists(data.data.token);
      
      // Store token for later tests
      authToken = data.data.token;
    });

    it("should reject invalid credentials", async () => {
      const response = await makeRequest("POST", "/auth/login", {
        email: testUser.email,
        password: "wrongpassword",
      });
      assertEquals(response.status, Status.Unauthorized);
      await response.text(); // Consume response body
    });
  });

  describe("Project Management", () => {
    it("should require authentication for creating projects", async () => {
      const response = await makeRequest("POST", "/projects", testProject);
      assertEquals(response.status, Status.Unauthorized);
      await response.text(); // Consume response body
    });

    it("should create a new project when authenticated", async () => {
      const response = await makeRequest(
        "POST",
        "/projects",
        testProject,
        authToken,
      );
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data.id);
      assertEquals(data.data.name, testProject.name);
      assertEquals(data.data.budget, testProject.budget);
      assertEquals(data.data.profitSharingEnabled, testProject.profitSharingEnabled);
      assertEquals(data.data.remainingBudget, testProject.budget);
      assertEquals(data.data.bonusPool, 0);
      assertEquals(data.data.ownerId, userId);
      assertEquals(data.data.status, "PLANNED");
      
      // Store projectId for later tests
      projectId = data.data.id;
      testTimeEntry.projectId = data.data.id;
    });
  });

  describe("Time Entries", () => {
    it("should require authentication for creating time entries", async () => {
      const response = await makeRequest("POST", "/time-entries", testTimeEntry);
      assertEquals(response.status, Status.Unauthorized);
      await response.text(); // Consume response body
    });

    it("should create a new time entry when authenticated", async () => {
      const response = await makeRequest(
        "POST",
        "/time-entries",
        testTimeEntry,
        authToken,
      );
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data.id);
      assertEquals(data.data.projectId, testTimeEntry.projectId);
      assertEquals(data.data.hours, testTimeEntry.hours);
      assertEquals(data.data.costImpact, testTimeEntry.hours * testUser.hourlyRate);
    });

    it("should get time entries for authenticated user", async () => {
      const startDate = new Date("2024-12-19T00:00:00.000Z");
      const endDate = new Date("2024-12-21T23:59:59.999Z");

      const response = await makeRequest(
        "GET",
        `/time-entries?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
        undefined,
        authToken,
      );
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertEquals(Array.isArray(data.data), true);
      assertEquals(data.data.length, 1);
      assertEquals(data.data[0].hours, testTimeEntry.hours);
      assertEquals(data.data[0].costImpact, testTimeEntry.hours * testUser.hourlyRate);
    });
  });

  describe("Financial Tracking", () => {
    it("should get user financial summary showing regular earnings", async () => {
      const startDate = "2024-12-01T00:00:00.000Z";
      const endDate = "2024-12-31T23:59:59.999Z";

      const response = await makeRequest(
        "GET",
        `/financials/user?startDate=${startDate}&endDate=${endDate}`,
        undefined,
        authToken,
      );
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertExists(data.data.summaries);
      assertEquals(data.data.summaries.length >= 1, true);

      const summary = data.data.summaries[0];
      assertEquals(summary.totalHoursWorked, testTimeEntry.hours);
      assertEquals(summary.totalRegularEarnings, testTimeEntry.hours * testUser.hourlyRate);
      assertEquals(summary.totalBonusEarnings, 0);
      assertEquals(summary.totalEarnings, testTimeEntry.hours * testUser.hourlyRate);

      assertEquals(summary.projectEarnings.length, 1);
      assertEquals(summary.projectEarnings[0].projectId, projectId);
      assertEquals(summary.projectEarnings[0].hoursWorked, testTimeEntry.hours);
      assertEquals(summary.projectEarnings[0].regularEarnings, testTimeEntry.hours * testUser.hourlyRate);
      assertEquals(summary.projectEarnings[0].bonusEarnings, 0);
      assertEquals(summary.projectEarnings[0].totalEarnings, testTimeEntry.hours * testUser.hourlyRate);
    });

    it("should get project financial summary showing regular earnings", async () => {
      const startDate = "2024-12-01T00:00:00.000Z";
      const endDate = "2024-12-31T23:59:59.999Z";

      const response = await makeRequest(
        "GET",
        `/financials/project?projectId=${projectId}&startDate=${startDate}&endDate=${endDate}`,
        undefined,
        authToken,
      );
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertExists(data.data.summaries);
      assertEquals(data.data.summaries.length >= 1, true);

      const summary = data.data.summaries[0];
      assertEquals(summary.totalBudget, testProject.budget);
      assertEquals(summary.totalSpent, testTimeEntry.hours * testUser.hourlyRate);
      assertEquals(summary.totalBonusesDistributed, 0);

      assertEquals(summary.memberSummaries.length, 1);
      assertEquals(summary.memberSummaries[0].userId, userId);
      assertEquals(summary.memberSummaries[0].hoursWorked, testTimeEntry.hours);
      assertEquals(summary.memberSummaries[0].regularEarnings, testTimeEntry.hours * testUser.hourlyRate);
      assertEquals(summary.memberSummaries[0].bonusEarnings, 0);
      assertEquals(summary.memberSummaries[0].totalEarnings, testTimeEntry.hours * testUser.hourlyRate);
    });

    it("should distribute profits and update financial summaries", async () => {
      // Distribute profits
      const bonusAmount = 1000;
      const response = await makeRequest(
        "POST",
        "/projects/profits/distribute",
        {
          projectId,
          amount: bonusAmount,
        },
        authToken,
      );
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data);
      assertEquals(Array.isArray(data.data), true);
      assertEquals(data.data.length, 1);
      assertEquals(data.data[0].amount, bonusAmount);
      assertEquals(data.data[0].percentage, 100);
      assertEquals(data.data[0].status, "PENDING");

      // Check user financial summary after bonus
      const startDate = "2024-12-01T00:00:00.000Z";
      const endDate = "2024-12-31T23:59:59.999Z";

      const userResponse = await makeRequest(
        "GET",
        `/financials/user?startDate=${startDate}&endDate=${endDate}`,
        undefined,
        authToken,
      );
      assertEquals(userResponse.status, Status.OK);

      const userData = await userResponse.json();
      assertExists(userData.data.summaries);
      assertEquals(userData.data.summaries.length >= 2, true);

      const bonusSummary = userData.data.summaries[1];
      assertEquals(bonusSummary.totalHoursWorked, 0);
      assertEquals(bonusSummary.totalRegularEarnings, 0);
      assertEquals(bonusSummary.totalBonusEarnings, bonusAmount);
      assertEquals(bonusSummary.totalEarnings, bonusAmount);

      // Check project financial summary after bonus
      const projectResponse = await makeRequest(
        "GET",
        `/financials/project?projectId=${projectId}&startDate=${startDate}&endDate=${endDate}`,
        undefined,
        authToken,
      );
      assertEquals(projectResponse.status, Status.OK);

      const projectData = await projectResponse.json();
      assertExists(projectData.data.summaries);
      assertEquals(projectData.data.summaries.length >= 2, true);

      const projectBonusSummary = projectData.data.summaries[1];
      assertEquals(projectBonusSummary.totalBudget, testProject.budget);
      assertEquals(projectBonusSummary.totalSpent, bonusAmount);
      assertEquals(projectBonusSummary.totalBonusesDistributed, bonusAmount);

      assertEquals(projectBonusSummary.memberSummaries.length, 1);
      assertEquals(projectBonusSummary.memberSummaries[0].userId, userId);
      assertEquals(projectBonusSummary.memberSummaries[0].hoursWorked, 0);
      assertEquals(projectBonusSummary.memberSummaries[0].regularEarnings, 0);
      assertEquals(projectBonusSummary.memberSummaries[0].bonusEarnings, bonusAmount);
      assertEquals(projectBonusSummary.memberSummaries[0].totalEarnings, bonusAmount);
    });
  });

  describe("Logout", () => {
    it("should successfully logout", async () => {
      const response = await makeRequest(
        "DELETE",
        "/auth/logout",
        undefined,
        authToken,
      );
      assertEquals(response.status, Status.OK);
      await response.text(); // Consume response body

      // Verify token is invalid after logout
      const projectResponse = await makeRequest(
        "POST",
        "/projects",
        testProject,
        authToken,
      );
      assertEquals(projectResponse.status, Status.Unauthorized);
      await projectResponse.text(); // Consume response body
    });
  });
}); 