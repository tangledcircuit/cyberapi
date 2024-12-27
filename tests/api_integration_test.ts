import { assertEquals, assertExists } from "std/assert/mod.ts";

// Define the API response type
interface ApiResponse<T> {
  success: boolean;
  data: T;
  error?: string;
  timestamp: string;
}

// Define types for our API responses
interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
}

interface AuthResponse {
  token: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  ownerId: string;
}

interface TimeEntry {
  id: string;
  hours: number;
  costImpact: number;
}

interface Timer {
  id: string;
  startedAt: string;
}

const API_URL = "https://cyberapi.deno.dev";
let authToken = "";
let projectId = "";

// Helper function for HTTP requests
async function makeRequest<T>(
  endpoint: string,
  method = "GET",
  body?: unknown,
  token?: string,
): Promise<{ response: Response; data: ApiResponse<T> }> {
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
  const data = await response.json();
  if (!response.ok) {
    console.error(`Error on ${method} ${endpoint}:`, data);
  }

  return { response, data };
}

// Test user credentials
const TEST_USER = {
  email: `test${Date.now()}@example.com`, // Make email unique
  password: "test123",
  firstName: "Test",
  lastName: "User",
  hourlyRate: 100,
};

Deno.test({
  name: "API Integration Tests",
  async fn(t) {
    // Test user registration
    await t.step("POST /api/auth/register - Create new user", async () => {
      const { response, data } = await makeRequest<User>("/api/auth/register", "POST", TEST_USER);
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertEquals(data.data.email, TEST_USER.email);
    });

    // Test user login
    await t.step("POST /api/auth/login - User login", async () => {
      const { response, data } = await makeRequest<AuthResponse>("/api/auth/login", "POST", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      });
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
        profitSharingEnabled: true,
        profitSharingPercentage: 0.1,
      };

      const { response, data } = await makeRequest<Project>("/api/projects", "POST", projectData, authToken);
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertEquals(data.data.name, projectData.name);
      projectId = data.data.id; // Save for later tests

      // Add the user as a project member
      const memberData = {
        projectId,
        userId: data.data.ownerId,
        role: "OWNER",
        hourlyRate: TEST_USER.hourlyRate,
      };

      const { response: memberResponse } = await makeRequest<unknown>("/api/projects/members", "POST", memberData, authToken);
      assertEquals(memberResponse.status, 200);
    });

    // Test time entry creation
    await t.step("POST /api/time-entries - Create time entry", async () => {
      const timeEntry = {
        projectId,
        description: "Initial work",
        hours: 2,
        date: new Date().toISOString(),
      };

      const { response, data } = await makeRequest<TimeEntry>("/api/time-entries", "POST", timeEntry, authToken);
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertEquals(data.data.hours, timeEntry.hours);
    });

    // Test getting user time entries
    await t.step("GET /api/time-entries - Get user time entries", async () => {
      const startDate = new Date();
      startDate.setMonth(startDate.getMonth() - 1);
      const endDate = new Date();
      
      const { response, data } = await makeRequest<TimeEntry[]>(
        `/api/time-entries?startDate=${startDate.toISOString().split('T')[0]}&endDate=${endDate.toISOString().split('T')[0]}`,
        "GET",
        undefined,
        authToken
      );
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

      const { response, data } = await makeRequest<Timer>("/api/timers/start", "POST", timerData, authToken);
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertExists(data.data.startedAt);
    });

    // Wait a bit before stopping the timer
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Test stopping a timer
    await t.step("POST /api/timers/stop - Stop timer", async () => {
      const { response, data } = await makeRequest<TimeEntry>("/api/timers/stop", "POST", undefined, authToken);
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertExists(data.data.hours);
      assertExists(data.data.costImpact);
    });

    // Test getting user financial summary
    await t.step("GET /api/financial/user-summary - Get user financial summary", async () => {
      const { response, data } = await makeRequest<unknown>("/api/financial/user-summary", "GET", undefined, authToken);
      assertEquals(response.status, 200);
      assertExists(data.data);
    });

    // Test getting project financial summary
    await t.step("GET /api/financial/project-summary/:projectId - Get project financial summary", async () => {
      const { response, data } = await makeRequest<unknown>(`/api/financial/project-summary/${projectId}`, "GET", undefined, authToken);
      assertEquals(response.status, 200);
      assertExists(data.data);
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
}); 