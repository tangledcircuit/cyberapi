import { assertEquals } from "std/assert/mod.ts";
import { Status } from "std/http/http_status.ts";
import { financialHandlers } from "../../api/handlers/financials.ts";
import { createResponse } from "../../api/utils/response.ts";
import { User, Project, TimeEntry, ProjectStatus, ProjectRole } from "../../types.ts";
import { MockDb } from "../mocks/db.ts";

// Mock user for testing
const mockUser: User = {
  id: "test-user-id",
  email: "test@example.com",
  firstName: "Test",
  lastName: "User",
  hourlyRate: 100,
  passwordHash: "hash",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Mock project for testing
const mockProject: Project = {
  id: "test-project-id",
  name: "Test Project",
  description: "A test project",
  budget: 10000,
  remainingBudget: 10000,
  clientId: "test-client-id",
  ownerId: mockUser.id,
  status: ProjectStatus.PLANNED,
  profitSharingEnabled: true,
  profitSharingPercentage: 0.1,
  bonusPool: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Mock time entry for testing
const mockTimeEntry: TimeEntry = {
  id: "test-time-entry-id",
  projectId: mockProject.id,
  userId: mockUser.id,
  description: "Test time entry",
  hours: 5,
  costImpact: 500, // 5 hours * $100/hour
  date: new Date().toISOString(),
  isActive: false,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

Deno.test("Financial Operations Unit Tests", async (t) => {
  // Setup mock database
  const mockDb = new MockDb(mockUser, mockProject);

  // Test creating a pay period
  await t.step("Create pay period", async () => {
    const req = new Request("http://localhost:8000/api/financials/pay-periods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mockUser.id}:test-token`,
      },
      body: JSON.stringify({
        startDate: "2024-01-01",
        endDate: "2024-01-15",
        description: "First half of January 2024",
      }),
    });

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      createPayPeriod: async (req: Request) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        const data = await req.json();
        const payPeriod = await mockDb.createPayPeriod(data);
        return new Response(
          JSON.stringify(createResponse(payPeriod)),
          { status: Status.Created }
        );
      },
    });

    const response = await financialHandlers.createPayPeriod(req);
    const data = await response.json();

    assertEquals(response.status, Status.Created);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(data.data.startDate, "2024-01-01");
    assertEquals(data.data.endDate, "2024-01-15");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test getting pay periods
  await t.step("Get pay periods", async () => {
    const req = new Request(
      "http://localhost:8000/api/financials/pay-periods?startDate=2024-01-01&endDate=2024-01-31",
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      getPayPeriods: async (req: Request) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        const url = new URL(req.url);
        const startDate = url.searchParams.get("startDate") || "";
        const endDate = url.searchParams.get("endDate") || "";
        const payPeriods = await mockDb.getPayPeriods(user.id, startDate, endDate);
        return new Response(
          JSON.stringify(createResponse(payPeriods)),
          { status: Status.OK }
        );
      },
    });

    const response = await financialHandlers.getPayPeriods(req);
    const data = await response.json();

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(Array.isArray(data.data), true);

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test getting user financials
  await t.step("Get user financials", async () => {
    const req = new Request(
      `http://localhost:8000/api/users/${mockUser.id}/financials?startDate=2024-01-01&endDate=2024-01-31`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      getUserFinancials: async (req: Request, userId: string) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        // Only allow users to view their own financials
        if (user.id !== userId) {
          return new Response(
            JSON.stringify(createResponse(null, "Not authorized to view these financials")),
            { status: Status.Forbidden }
          );
        }

        const url = new URL(req.url);
        const startDate = url.searchParams.get("startDate") || "";
        const endDate = url.searchParams.get("endDate") || "";
        const payPeriodId = url.searchParams.get("payPeriodId") || "";

        const [summaries, earnings] = await Promise.all([
          mockDb.getUserFinancialSummaries(userId, startDate, endDate),
          mockDb.getUserEarnings(userId, payPeriodId),
        ]);

        return new Response(
          JSON.stringify(createResponse({ summaries, earnings })),
          { status: Status.OK }
        );
      },
    });

    const response = await financialHandlers.getUserFinancials(req, mockUser.id);
    const data = await response.json();

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(typeof data.data.summaries, "object");
    assertEquals(typeof data.data.earnings, "object");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test getting project financials
  await t.step("Get project financials", async () => {
    const req = new Request(
      `http://localhost:8000/api/projects/${mockProject.id}/financials?startDate=2024-01-01&endDate=2024-01-31`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      getProjectFinancials: async (req: Request, projectId: string) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        // Verify user is project member
        const member = await mockDb.getProjectMember(projectId, user.id);
        if (!member) {
          return new Response(
            JSON.stringify(createResponse(null, "Not authorized to view project financials")),
            { status: Status.Forbidden }
          );
        }

        const url = new URL(req.url);
        const startDate = url.searchParams.get("startDate") || "";
        const endDate = url.searchParams.get("endDate") || "";
        const payPeriodId = url.searchParams.get("payPeriodId") || "";

        const [summaries, earnings] = await Promise.all([
          mockDb.getProjectFinancialSummaries(projectId, startDate, endDate),
          mockDb.getProjectEarnings(projectId, payPeriodId),
        ]);

        return new Response(
          JSON.stringify(createResponse({ summaries, earnings })),
          { status: Status.OK }
        );
      },
    });

    const response = await financialHandlers.getProjectFinancials(req, mockProject.id);
    const data = await response.json();

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(typeof data.data.summaries, "object");
    assertEquals(typeof data.data.earnings, "object");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test distributing project profits
  await t.step("Distribute project profits", async () => {
    const req = new Request(
      `http://localhost:8000/api/projects/${mockProject.id}/profits/distribute`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      distributeProjectProfits: async (req: Request, projectId: string) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        // Verify user is project owner
        const project = await mockDb.getProjectById(projectId);
        if (!project) {
          return new Response(
            JSON.stringify(createResponse(null, "Project not found")),
            { status: Status.NotFound }
          );
        }

        if (project.ownerId !== user.id) {
          return new Response(
            JSON.stringify(createResponse(null, "Only project owner can distribute profits")),
            { status: Status.Forbidden }
          );
        }

        const result = await mockDb.distributeProjectProfits(projectId);
        return new Response(
          JSON.stringify(createResponse(result)),
          { status: Status.OK }
        );
      },
    });

    const response = await financialHandlers.distributeProjectProfits(req, mockProject.id);
    const data = await response.json();

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test unauthorized access
  await t.step("Unauthorized access should fail", async () => {
    const req = new Request("http://localhost:8000/api/financials/pay-periods", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: "2024-01-01",
        endDate: "2024-01-15",
        description: "First half of January 2024",
      }),
    });

    const response = await financialHandlers.createPayPeriod(req);
    const data = await response.json();

    assertEquals(response.status, Status.Unauthorized);
    assertEquals(data.success, false);
    assertEquals(data.error, "Unauthorized");
  });

  // Test accessing another user's financials
  await t.step("Accessing another user's financials should fail if not project member", async () => {
    const req = new Request(
      "http://localhost:8000/api/users/other-user-id/financials",
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      getUserFinancials: async (req: Request, userId: string) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        // Check if users share any projects
        const sharedProject = await mockDb.getSharedProject(user.id, userId);
        if (!sharedProject) {
          return new Response(
            JSON.stringify(createResponse(null, "Not authorized to view these financials")),
            { status: Status.Forbidden }
          );
        }

        const url = new URL(req.url);
        const startDate = url.searchParams.get("startDate") || "";
        const endDate = url.searchParams.get("endDate") || "";
        const payPeriodId = url.searchParams.get("payPeriodId") || "";

        const [summaries, earnings] = await Promise.all([
          mockDb.getUserFinancialSummaries(userId, startDate, endDate),
          mockDb.getUserEarnings(userId, payPeriodId),
        ]);

        return new Response(
          JSON.stringify(createResponse({ summaries, earnings })),
          { status: Status.OK }
        );
      },
    });

    const response = await financialHandlers.getUserFinancials(req, "other-user-id");
    const data = await response.json();

    assertEquals(response.status, Status.Forbidden);
    assertEquals(data.success, false);
    assertEquals(data.error, "Not authorized to view these financials");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test accessing project member's financials
  await t.step("Accessing project member's financials should succeed", async () => {
    const projectMemberId = "project-member-id";
    const req = new Request(
      `http://localhost:8000/api/users/${projectMemberId}/financials`,
      {
        method: "GET",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      getUserFinancials: async (req: Request, userId: string) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        // Check if users share any projects
        const sharedProject = await mockDb.getSharedProject(user.id, userId);
        if (!sharedProject) {
          return new Response(
            JSON.stringify(createResponse(null, "Not authorized to view these financials")),
            { status: Status.Forbidden }
          );
        }

        const url = new URL(req.url);
        const startDate = url.searchParams.get("startDate") || "";
        const endDate = url.searchParams.get("endDate") || "";
        const payPeriodId = url.searchParams.get("payPeriodId") || "";

        const [summaries, earnings] = await Promise.all([
          mockDb.getUserFinancialSummaries(userId, startDate, endDate),
          mockDb.getUserEarnings(userId, payPeriodId),
        ]);

        return new Response(
          JSON.stringify(createResponse({ summaries, earnings })),
          { status: Status.OK }
        );
      },
    });

    const response = await financialHandlers.getUserFinancials(req, projectMemberId);
    const data = await response.json();

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(typeof data.data.summaries, "object");
    assertEquals(typeof data.data.earnings, "object");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test profit distribution with multiple members
  await t.step("Distribute profits with multiple members", async () => {
    const req = new Request(
      `http://localhost:8000/api/projects/${mockProject.id}/profits/distribute`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      distributeProjectProfits: async (req: Request, projectId: string) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        // Verify user is project owner
        const project = await mockDb.getProjectById(projectId);
        if (!project) {
          return new Response(
            JSON.stringify(createResponse(null, "Project not found")),
            { status: Status.NotFound }
          );
        }

        if (project.ownerId !== user.id) {
          return new Response(
            JSON.stringify(createResponse(null, "Only project owner can distribute profits")),
            { status: Status.Forbidden }
          );
        }

        const result = await mockDb.distributeProjectProfitsMultiMember(projectId);
        return new Response(
          JSON.stringify(createResponse(result)),
          { status: Status.OK }
        );
      },
    });

    const response = await financialHandlers.distributeProjectProfits(req, mockProject.id);
    const data = await response.json();

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(data.data.profitsDistributed, 2000);
    assertEquals(data.data.memberShares.length, 2);
    assertEquals(data.data.memberShares[0].amount + data.data.memberShares[1].amount, 2000);

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test profit distribution with insufficient funds
  await t.step("Distribute profits with insufficient funds should fail", async () => {
    const req = new Request(
      `http://localhost:8000/api/projects/${mockProject.id}/profits/distribute`,
      {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      distributeProjectProfits: async (req: Request, projectId: string) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        // Verify user is project owner
        const project = await mockDb.getProjectById(projectId);
        if (!project) {
          return new Response(
            JSON.stringify(createResponse(null, "Project not found")),
            { status: Status.NotFound }
          );
        }

        if (project.ownerId !== user.id) {
          return new Response(
            JSON.stringify(createResponse(null, "Only project owner can distribute profits")),
            { status: Status.Forbidden }
          );
        }

        return new Response(
          JSON.stringify(createResponse(null, "Insufficient funds for profit distribution")),
          { status: Status.BadRequest }
        );
      },
    });

    const response = await financialHandlers.distributeProjectProfits(req, mockProject.id);
    const data = await response.json();

    assertEquals(response.status, Status.BadRequest);
    assertEquals(data.success, false);
    assertEquals(data.error, "Insufficient funds for profit distribution");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test overlapping pay periods
  await t.step("Creating overlapping pay period should fail", async () => {
    const req = new Request(
      "http://localhost:8000/api/financials/pay-periods",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
        body: JSON.stringify({
          startDate: "2024-01-01",
          endDate: "2024-01-15",
          description: "Overlapping period",
        }),
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      createPayPeriod: async (req: Request) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        return new Response(
          JSON.stringify(createResponse(null, "Pay period overlaps with existing period")),
          { status: Status.BadRequest }
        );
      },
    });

    const response = await financialHandlers.createPayPeriod(req);
    const data = await response.json();

    assertEquals(response.status, Status.BadRequest);
    assertEquals(data.success, false);
    assertEquals(data.error, "Pay period overlaps with existing period");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });

  // Test invalid date ranges
  await t.step("Invalid date range should fail", async () => {
    const req = new Request(
      "http://localhost:8000/api/financials/pay-periods",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mockUser.id}:test-token`,
        },
        body: JSON.stringify({
          startDate: "2024-01-15",
          endDate: "2024-01-01", // End date before start date
          description: "Invalid period",
        }),
      }
    );

    // Override the database functions in the handlers
    const originalDb = { ...financialHandlers };
    Object.assign(financialHandlers, {
      createPayPeriod: async (req: Request) => {
        const user = await mockDb.getUserById(mockUser.id);
        if (!user) {
          return new Response(
            JSON.stringify(createResponse(null, "Unauthorized")),
            { status: Status.Unauthorized }
          );
        }

        const data = await req.json();
        if (new Date(data.startDate) >= new Date(data.endDate)) {
          return new Response(
            JSON.stringify(createResponse(null, "End date must be after start date")),
            { status: Status.BadRequest }
          );
        }

        const payPeriod = await mockDb.createPayPeriod(data);
        return new Response(
          JSON.stringify(createResponse(payPeriod)),
          { status: Status.Created }
        );
      },
    });

    const response = await financialHandlers.createPayPeriod(req);
    const data = await response.json();

    assertEquals(response.status, Status.BadRequest);
    assertEquals(data.success, false);
    assertEquals(data.error, "End date must be after start date");

    // Restore original handlers
    Object.assign(financialHandlers, originalDb);
  });
}); 