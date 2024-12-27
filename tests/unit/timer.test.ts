import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Status } from "std/http/http_status.ts";
import { timerHandlers } from "../../api/handlers/timers.ts";
import { createUser, createAuthToken, createProject, createProjectMember } from "../../db.ts";
import { User, Project, ProjectRole, ProjectStatus } from "../../types.ts";
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
  id: crypto.randomUUID(),
  name: "Test Project",
  description: "A test project",
  budget: 10000,
  remainingBudget: 10000,
  clientId: crypto.randomUUID(),
  ownerId: TEST_USER.id,
  status: ProjectStatus.PLANNED,
  profitSharingEnabled: true,
  profitSharingPercentage: 0.1,
  bonusPool: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

Deno.test({
  name: "Timer Handler Unit Tests",
  async fn(t) {
    // Create test user and project
    await createUser(TEST_USER);
    await createProject(TEST_PROJECT);
    await createProjectMember({
      projectId: TEST_PROJECT.id,
      userId: TEST_USER.id,
      role: ProjectRole.OWNER,
      hourlyRate: TEST_USER.hourlyRate,
      totalHours: 0,
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Create auth token
    const authToken = crypto.randomUUID();
    await createAuthToken({
      token: authToken,
      userId: TEST_USER.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
    });

    let timerId = "";

    await t.step("startTimer() - should start a new timer", async () => {
      const request = new Request("http://localhost/api/timers/start", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
        body: JSON.stringify({
          projectId: TEST_PROJECT.id,
          description: "Test timer",
        }),
      });

      const response = await timerHandlers.startTimer(request);
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data);
      assertEquals(data.data.projectId, TEST_PROJECT.id);
      assertEquals(data.data.userId, TEST_USER.id);
      assertEquals(data.data.description, "Test timer");
      assertExists(data.data.startedAt);
      timerId = data.data.id;
    });

    await t.step("getActiveTimer() - should retrieve active timer", async () => {
      const request = new Request("http://localhost/api/timers/active", {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
      });

      const response = await timerHandlers.getActiveTimer(request);
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertExists(data.data);
      assertEquals(data.data.id, timerId);
      assertEquals(data.data.projectId, TEST_PROJECT.id);
      assertEquals(data.data.userId, TEST_USER.id);
      assertExists(data.data.startedAt);
    });

    await t.step("stopTimer() - should stop active timer", async () => {
      const request = new Request("http://localhost/api/timers/stop", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
        body: JSON.stringify({ timerId }),
      });

      const response = await timerHandlers.stopTimer(request);
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertExists(data.data);
      assertExists(data.data.id);
      assertEquals(data.data.projectId, TEST_PROJECT.id);
      assertEquals(data.data.userId, TEST_USER.id);
      assertExists(data.data.date);
      assertEquals(data.data.isActive, false);
    });

    await t.step("getProjectTimers() - should list project timers", async () => {
      const request = new Request(`http://localhost/api/projects/${TEST_PROJECT.id}/timers`, {
        method: "GET",
        headers: { 
          "Authorization": `Bearer ${TEST_USER.id}:${authToken}`
        },
      });

      const response = await timerHandlers.getProjectTimers(request, TEST_PROJECT.id);
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertExists(data.data);
      assertEquals(data.data.length, 0);
    });
  },
}); 