import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Status } from "std/http/http_status.ts";
import { projectHandlers } from "../../api/handlers/projects.ts";
import { createUser, createAuthToken } from "../../db.ts";
import { User, Project, ProjectRole, AuthToken } from "../../types.ts";
import { crypto } from "std/crypto/mod.ts";

// Mock data
const TEST_USER: User = {
  id: crypto.randomUUID(),
  email: `test${Date.now()}@example.com`,
  firstName: "Test",
  lastName: "User",
  hourlyRate: 100,
  passwordHash: "test123hash",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const TEST_PROJECT = {
  name: "Test Project",
  description: "A test project",
  budget: 10000,
  profitSharingEnabled: true,
  profitSharingPercentage: 0.1,
};

Deno.test({
  name: "Project Handler Unit Tests",
  async fn(t) {
    // Create a test user first
    await createUser(TEST_USER);
    let projectId = "";

    // Create a real auth token
    const authToken = crypto.randomUUID();
    await createAuthToken({
      token: authToken,
      userId: TEST_USER.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    await t.step("createProject() - should create a new project", async () => {
      const request = new Request("http://localhost/api/projects", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
        body: JSON.stringify(TEST_PROJECT),
      });

      const response = await projectHandlers.createProject(request);
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data.id);
      assertEquals(data.data.name, TEST_PROJECT.name);
      assertEquals(data.data.description, TEST_PROJECT.description);
      assertEquals(data.data.budget, TEST_PROJECT.budget);
      assertEquals(data.data.ownerId, TEST_USER.id);
      projectId = data.data.id;
    });

    await t.step("getProject() - should retrieve project details", async () => {
      const request = new Request("http://localhost/api/projects/" + projectId, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
      });

      const response = await projectHandlers.getProject(request, projectId);
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertEquals(data.data.id, projectId);
      assertEquals(data.data.name, TEST_PROJECT.name);
    });

    await t.step("inviteMember() - should create project invitation", async () => {
      const inviteData = {
        email: "invited@example.com",
        role: ProjectRole.MEMBER,
      };

      const request = new Request("http://localhost/api/projects/" + projectId + "/invite", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
        body: JSON.stringify(inviteData),
      });

      const response = await projectHandlers.inviteMember(request, projectId);
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data.id);
      assertEquals(data.data.projectId, projectId);
      assertEquals(data.data.inviteeEmail, inviteData.email);
      assertEquals(data.data.role, inviteData.role);
    });

    await t.step("getMembers() - should list project members", async () => {
      const request = new Request("http://localhost/api/projects/" + projectId + "/members", {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
      });

      const response = await projectHandlers.getMembers(request, projectId);
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertEquals(data.data.length, 1); // Should only have the owner at this point
      assertEquals(data.data[0].userId, TEST_USER.id);
      assertEquals(data.data[0].role, ProjectRole.OWNER);
    });
  },
}); 