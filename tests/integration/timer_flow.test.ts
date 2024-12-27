import { assertEquals } from "std/assert/mod.ts";
import { Status } from "std/http/http_status.ts";
import { createResponse } from "../../api/utils/response.ts";
import { ActiveTimer } from "../../types.ts";

const BASE_URL = "http://localhost:8000/api";

interface TestContext {
  userId: string;
  authToken: string;
  projectId: string;
  timerId: string;
}

interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

interface AuthResponse {
  token: string;
}

interface ProjectResponse {
  id: string;
  name: string;
  description: string;
  budget: number;
  remainingBudget: number;
  clientId: string;
  ownerId: string;
  status: string;
  profitSharingEnabled: boolean;
  profitSharingPercentage: number;
  bonusPool: number;
  createdAt: string;
  updatedAt: string;
}

interface TimeEntryResponse {
  id: string;
  projectId: string;
  userId: string;
  description: string;
  hours: number;
  costImpact: number;
  date: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

async function makeRequest<T>(
  path: string,
  method = "GET",
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<{ response: Response; data: ApiResponse<T> }> {
  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await response.json() as ApiResponse<T>;
  return { response, data };
}

Deno.test("Timer Flow Integration Tests", async (t) => {
  const context: TestContext = {
    userId: "",
    authToken: "",
    projectId: "",
    timerId: "",
  };

  // 1. Setup test user
  await t.step("1. Setup test user", async () => {
    const email = `test${Date.now()}@example.com`;
    const { response, data } = await makeRequest<AuthResponse>("/auth/register", "POST", {
      email,
      password: "test123",
      firstName: "Test",
      lastName: "User",
      hourlyRate: 100,
    });

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);

    // Login to get auth token
    const loginResponse = await makeRequest<AuthResponse>("/auth/login", "POST", {
      email,
      password: "test123",
    });

    assertEquals(loginResponse.response.status, Status.OK);
    assertEquals(loginResponse.data.success, true);
    assertEquals(loginResponse.data.error, undefined);

    const [userId, token] = loginResponse.data.data!.token.split(":");
    context.userId = userId;
    context.authToken = token;
  });

  // 2. Create test project
  await t.step("2. Create test project", async () => {
    const { response, data } = await makeRequest<ProjectResponse>(
      "/projects",
      "POST",
      {
        name: "Test Project",
        description: "A test project",
        budget: 10000,
        clientId: crypto.randomUUID(),
        profitSharingEnabled: true,
        profitSharingPercentage: 0.1,
      },
      { Authorization: `Bearer ${context.userId}:${context.authToken}` }
    );

    assertEquals(response.status, Status.Created);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);

    const { id } = data.data!;
    context.projectId = id;
    console.log("Created project with ID:", id);
  });

  // 3. Start timer
  await t.step("3. Start timer", async () => {
    const { response, data } = await makeRequest<ActiveTimer>(
      "/timers/start",
      "POST",
      {
        projectId: context.projectId,
        description: "Test timer",
      },
      { Authorization: `Bearer ${context.userId}:${context.authToken}` }
    );

    assertEquals(response.status, Status.Created);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);

    const { id } = data.data!;
    context.timerId = id;
  });

  // 4. Get active timer
  await t.step("4. Get active timer", async () => {
    const { response, data } = await makeRequest<ActiveTimer>(
      "/timers/active",
      "GET",
      undefined,
      { Authorization: `Bearer ${context.userId}:${context.authToken}` }
    );

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(data.data!.id, context.timerId);
  });

  // 5. Stop timer
  await t.step("5. Stop timer", async () => {
    const { response, data } = await makeRequest<TimeEntryResponse>(
      "/timers/stop",
      "POST",
      { timerId: context.timerId },
      { Authorization: `Bearer ${context.userId}:${context.authToken}` }
    );

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    // Don't check the ID since it's a new time entry
  });

  // 6. Get project timers
  await t.step("6. Get project timers", async () => {
    const { response, data } = await makeRequest<ActiveTimer[]>(
      `/projects/${context.projectId}/timers`,
      "GET",
      undefined,
      { Authorization: `Bearer ${context.userId}:${context.authToken}` }
    );

    assertEquals(response.status, Status.OK);
    assertEquals(data.success, true);
    assertEquals(data.error, undefined);
    assertEquals(data.data!.length, 0); // Timer was stopped, so no active timers
  });

  // 7. Cannot start timer while another is active
  await t.step("7. Cannot start timer while another is active", async () => {
    // First start a timer
    const firstTimer = await makeRequest<ActiveTimer>(
      "/timers/start",
      "POST",
      {
        projectId: context.projectId,
        description: "First timer",
      },
      { Authorization: `Bearer ${context.userId}:${context.authToken}` }
    );

    assertEquals(firstTimer.response.status, Status.Created);
    assertEquals(firstTimer.data.success, true);
    assertEquals(firstTimer.data.error, undefined);

    // Try to start another timer
    const { response, data } = await makeRequest<ActiveTimer>(
      "/timers/start",
      "POST",
      {
        projectId: context.projectId,
        description: "Second timer",
      },
      { Authorization: `Bearer ${context.userId}:${context.authToken}` }
    );

    assertEquals(response.status, Status.BadRequest);
    assertEquals(data.success, false);
    assertEquals(data.error, "User already has an active timer");
  });

  // 8. Access timers without auth should fail
  await t.step("8. Access timers without auth should fail", async () => {
    const { response, data } = await makeRequest<ActiveTimer>("/timers/active");
    assertEquals(response.status, Status.Unauthorized);
    assertEquals(data.success, false);
    assertEquals(data.error, "Unauthorized");
  });
}); 