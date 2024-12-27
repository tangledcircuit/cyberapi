import { assertEquals, assertExists } from "std/assert/mod.ts";
import { ProjectRole } from "../../types.ts";

const API_URL = "http://localhost:8000";

// Helper function for HTTP requests
async function makeRequest<T>(
  endpoint: string,
  method = "GET",
  body?: unknown,
  token?: string,
): Promise<{ response: Response; data: { success: boolean; data: T; error?: string } }> {
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

  const data = await response.json();
  if (!response.ok) {
    console.error(`Error on ${method} ${endpoint}:`, data);
  }

  return { response, data };
}

// Test data
const TEST_USER = {
  email: `test${Date.now()}@example.com`,
  password: "test123",
  firstName: "Test",
  lastName: "User",
  hourlyRate: 100,
};

const TEST_PROJECT = {
  name: "Test Project",
  description: "A test project",
  budget: 10000,
  profitSharingEnabled: true,
  profitSharingPercentage: 0.1,
};

interface AuthResponse {
  token: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  budget: number;
  remainingBudget: number;
  ownerId: string;
  profitSharingEnabled: boolean;
  profitSharingPercentage: number;
  createdAt: string;
  updatedAt: string;
}

interface ProjectInvitation {
  id: string;
  projectId: string;
  inviteeEmail: string;
  role: ProjectRole;
  status: string;
  createdAt: string;
  updatedAt: string;
}

interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
  hourlyRate: number;
  totalHours: number;
  createdAt: string;
  updatedAt: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
}

Deno.test({
  name: "Project Management Flow Integration Tests",
  async fn(t) {
    let authToken = "";
    let userId = "";
    let projectId = "";
    let invitationId = "";

    // Register and login a test user
    await t.step("1. Setup test user", async () => {
      // Register
      const { response: registerResponse, data: registerData } = await makeRequest<User>("/api/auth/register", "POST", TEST_USER);
      assertEquals(registerResponse.status, 200);
      userId = registerData.data.id;

      // Login
      const { response: loginResponse, data: loginData } = await makeRequest<AuthResponse>("/api/auth/login", "POST", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      });
      assertEquals(loginResponse.status, 200);
      authToken = loginData.data.token;
    });

    // Create a new project
    await t.step("2. Create project", async () => {
      const { response, data } = await makeRequest<Project>("/api/projects", "POST", TEST_PROJECT, authToken);
      assertEquals(response.status, 201);
      assertExists(data.data.id);
      assertEquals(data.data.name, TEST_PROJECT.name);
      assertEquals(data.data.ownerId, userId);
      projectId = data.data.id;
      console.log("Created project with ID:", projectId);
    });

    // Get project details
    await t.step("3. Get project details", async () => {
      const { response, data } = await makeRequest<Project>(`/api/projects/${projectId}`, "GET", undefined, authToken);
      assertEquals(response.status, 200);
      assertEquals(data.data.id, projectId);
      assertEquals(data.data.name, TEST_PROJECT.name);
      assertEquals(data.data.budget, TEST_PROJECT.budget);
    });

    // Invite a member
    await t.step("4. Invite project member", async () => {
      const inviteData = {
        email: "invited@example.com",
        role: ProjectRole.MEMBER,
      };

      const { response, data } = await makeRequest<ProjectInvitation>(
        `/api/projects/${projectId}/invite`,
        "POST",
        inviteData,
        authToken
      );
      assertEquals(response.status, 201);
      assertExists(data.data.id);
      assertEquals(data.data.projectId, projectId);
      assertEquals(data.data.inviteeEmail, inviteData.email);
      invitationId = data.data.id;
    });

    // Get project members
    await t.step("5. Get project members", async () => {
      const { response, data } = await makeRequest<ProjectMember[]>(
        `/api/projects/${projectId}/members`,
        "GET",
        undefined,
        authToken
      );
      assertEquals(response.status, 200);
      assertEquals(data.data.length, 1); // Should only have the owner
      assertEquals(data.data[0].userId, userId);
      assertEquals(data.data[0].role, ProjectRole.OWNER);
    });

    // Update project
    await t.step("6. Update project", async () => {
      const updateData = {
        name: "Updated Project Name",
        description: "Updated description",
      };

      const { response, data } = await makeRequest<Project>(
        `/api/projects/${projectId}`,
        "PUT",
        updateData,
        authToken
      );
      assertEquals(response.status, 200);
      assertEquals(data.data.name, updateData.name);
      assertEquals(data.data.description, updateData.description);
    });

    // Try to access project without auth
    await t.step("7. Access project without auth should fail", async () => {
      const { response } = await makeRequest<Project>(`/api/projects/${projectId}`, "GET");
      assertEquals(response.status, 401);
    });
  },
}); 