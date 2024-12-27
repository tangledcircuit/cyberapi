import { assertEquals, assertExists } from "std/testing/asserts.ts";
import { describe, it } from "std/testing/bdd.ts";
import { Status } from "std/http/http_status.ts";

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
  description: "A test project",
  budget: 10000,
  clientId: "client123",
};

const testTimeEntry = {
  projectId: "project123",
  description: "Working on tests",
  hours: 2,
  date: new Date().toISOString(),
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
  let _userId: string;

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
      _userId = data.data.id;
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
    });
  });

  describe("Project Management", () => {
    it("should require authentication for creating projects", async () => {
      const response = await makeRequest("POST", "/projects", testProject);
      assertEquals(response.status, Status.Unauthorized);
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
      
      // Store projectId for time entry tests
      testTimeEntry.projectId = data.data.id;
    });
  });

  describe("Time Entries", () => {
    it("should require authentication for creating time entries", async () => {
      const response = await makeRequest("POST", "/time-entries", testTimeEntry);
      assertEquals(response.status, Status.Unauthorized);
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
    });

    it("should get time entries for authenticated user", async () => {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 1);
      
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + 1);

      const response = await makeRequest(
        "GET",
        `/time-entries?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`,
        undefined,
        authToken,
      );
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertEquals(Array.isArray(data.data), true);
      assertEquals(data.data.length >= 1, true);
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

      // Verify token is invalid after logout
      const projectResponse = await makeRequest(
        "POST",
        "/projects",
        testProject,
        authToken,
      );
      assertEquals(projectResponse.status, Status.Unauthorized);
    });
  });
}); 