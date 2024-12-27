import { assertEquals, assertExists } from "std/assert/mod.ts";

const API_URL = "https://cyberapi.deno.dev";
let authToken = "";
let projectId = "";

// Helper function for HTTP requests
async function makeRequest(
  endpoint: string,
  method = "GET",
  body?: unknown,
  token?: string,
): Promise<Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Log error responses for debugging
  if (!response.ok) {
    const errorData = await response.json();
    console.error(`Error on ${method} ${endpoint}:`, errorData);
  }

  return response;
}

// Test user credentials
const TEST_USER = {
  email: `test${Date.now()}@example.com`, // Make email unique
  password: "testpass123",
  firstName: "Test",
  lastName: "User",
  hourlyRate: 50,
};

Deno.test({
  name: "API Integration Tests",
  async fn(t) {
    // Test user registration
    await t.step("POST /api/users - Create new user", async () => {
      const response = await makeRequest("/api/users", "POST", TEST_USER);
      const data = await response.json();
      
      assertEquals(response.status, 201);
      assertExists(data.data.id);
      assertEquals(data.data.email, TEST_USER.email);
    });

    // Test user login
    await t.step("POST /api/auth/login - User login", async () => {
      const response = await makeRequest("/api/auth/login", "POST", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      });
      const data = await response.json();
      
      assertEquals(response.status, 200);
      assertExists(data.data.token);
      authToken = data.data.token;
    });

    // Test project creation
    await t.step("POST /api/projects - Create new project", async () => {
      const projectData = {
        name: "Test Project",
        description: "A test project",
        budget: 10000,
        startDate: new Date().toISOString(),
        endDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      };

      const response = await makeRequest("/api/projects", "POST", projectData, authToken);
      const data = await response.json();
      
      assertEquals(response.status, 201);
      assertExists(data.data.id);
      assertEquals(data.data.name, projectData.name);
      projectId = data.data.id; // Save for later tests
    });

    // Test time entry creation
    await t.step("POST /api/time-entries - Create time entry", async () => {
      const timeEntry = {
        projectId,
        description: "Test time entry",
        duration: 3600, // 1 hour in seconds
        date: new Date().toISOString(),
      };

      const response = await makeRequest("/api/time-entries", "POST", timeEntry, authToken);
      const data = await response.json();
      
      assertEquals(response.status, 201);
      assertExists(data.data.id);
      assertEquals(data.data.duration, timeEntry.duration);
    });

    // Test getting user time entries
    await t.step("GET /api/time-entries - Get user time entries", async () => {
      const response = await makeRequest("/api/time-entries", "GET", undefined, authToken);
      const data = await response.json();
      
      assertEquals(response.status, 200);
      assertExists(data.data);
      assertEquals(Array.isArray(data.data), true);
    });

    // Test starting a timer
    await t.step("POST /api/timers/start - Start timer", async () => {
      const timerData = {
        projectId,
        description: "Test timer",
      };

      const response = await makeRequest("/api/timers/start", "POST", timerData, authToken);
      const data = await response.json();
      
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertExists(data.data.startTime);
    });

    // Test stopping a timer
    await t.step("POST /api/timers/stop - Stop timer", async () => {
      const response = await makeRequest("/api/timers/stop", "POST", undefined, authToken);
      const data = await response.json();
      
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertExists(data.data.endTime);
    });

    // Test getting user financial summary
    await t.step("GET /api/financial/user-summary - Get user financial summary", async () => {
      const response = await makeRequest("/api/financial/user-summary", "GET", undefined, authToken);
      const data = await response.json();
      
      assertEquals(response.status, 200);
      assertExists(data.data);
      assertExists(data.data.totalEarnings);
    });

    // Test getting project financial summary
    await t.step("GET /api/financial/project-summary/:projectId - Get project financial summary", async () => {
      const response = await makeRequest(`/api/financial/project-summary/${projectId}`, "GET", undefined, authToken);
      const data = await response.json();
      
      assertEquals(response.status, 200);
      assertExists(data.data);
      assertExists(data.data.totalSpent);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
}); 