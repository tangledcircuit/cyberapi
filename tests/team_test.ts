import { assertEquals, assertExists } from "std/assert/mod.ts";

const API_URL = "http://localhost:8000";
const timestamp = Date.now();
const TEAM = [
  { email: `alice${timestamp}@example.com`, firstName: "Alice", lastName: "Johnson", hourlyRate: 150 },
  { email: `bob${timestamp}@example.com`, firstName: "Bob", lastName: "Smith", hourlyRate: 120 },
  { email: `tim${timestamp}@example.com`, firstName: "Tim", lastName: "Wilson", hourlyRate: 100 },
  { email: `frank${timestamp}@example.com`, firstName: "Frank", lastName: "Davis", hourlyRate: 80 },
];

// Helper function for HTTP requests
async function makeRequest(
  endpoint: string,
  method = "GET",
  body?: unknown,
  token?: string,
): Promise<{ response: Response; data: any }> {
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

interface TeamMember {
  email: string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
  id?: string;
  token?: string;
}

Deno.test({
  name: "Team Project Simulation",
  async fn(t) {
    const team: TeamMember[] = [...TEAM];
    let projectId = "";

    // Register all team members
    await t.step("Register team members", async () => {
      for (const member of team) {
        const { response, data } = await makeRequest("/api/auth/register", "POST", {
          ...member,
          password: "test123",
        });
        assertEquals(response.status, 201);
        assertExists(data.data.id);
        assertEquals(data.data.email, member.email);
        member.id = data.data.id;
      }
    });

    // Log in all team members
    await t.step("Log in team members", async () => {
      for (const member of team) {
        const { response, data } = await makeRequest("/api/auth/login", "POST", {
          email: member.email,
          password: "test123",
        });
        assertEquals(response.status, 200);
        assertExists(data.data.token);
        member.token = data.data.token;
      }
    });

    // Alice creates a project
    await t.step("Create project", async () => {
      const projectData = {
        name: "Team Test Project",
        description: "A project to test team collaboration",
        budget: 10000,
        profitSharingEnabled: true,
      };

      const { response, data } = await makeRequest(
        "/api/projects",
        "POST",
        projectData,
        team[0].token
      );
      assertEquals(response.status, 201);
      assertExists(data.data.id);
      assertEquals(data.data.name, projectData.name);
      projectId = data.data.id;
    });

    // Add team members to project
    await t.step("Add team members to project", async () => {
      for (let i = 1; i < team.length; i++) {
        const memberData = {
          projectId,
          userId: team[i].id,
          role: "MEMBER",
          hourlyRate: team[i].hourlyRate,
        };

        const { response } = await makeRequest(
          "/api/projects/members",
          "POST",
          memberData,
          team[0].token
        );
        assertEquals(response.status, 200);
      }
    });

    // Start timers for all team members
    await t.step("Start timers for team members", async () => {
      for (const member of team) {
        const timerData = {
          projectId,
          description: `${member.firstName}'s work`,
        };

        const { response, data } = await makeRequest(
          "/api/timers/start",
          "POST",
          timerData,
          member.token
        );
        assertEquals(response.status, 201);
        assertExists(data.data.id);
      }
    });

    // Wait different durations for each member
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Stop timers in different order
    await t.step("Stop timers for team members", async () => {
      for (const member of team.reverse()) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        const { response, data } = await makeRequest(
          "/api/timers/stop",
          "POST",
          undefined,
          member.token
        );
        assertEquals(response.status, 200);
        assertExists(data.data.id);
        assertExists(data.data.hours);
        assertExists(data.data.costImpact);
      }
    });

    // Check project financial summary
    await t.step("Check project financial summary", async () => {
      const { response, data } = await makeRequest(
        `/api/financials/project?projectId=${projectId}`,
        "GET",
        undefined,
        team[0].token
      );
      assertEquals(response.status, 200);
      assertExists(data.data);
      console.log("Project financial summary:", JSON.stringify(data.data, null, 2));
    });

    // Check individual financial summaries
    await t.step("Check individual financial summaries", async () => {
      for (const member of team) {
        const { response, data } = await makeRequest(
          "/api/financials/user",
          "GET",
          undefined,
          member.token
        );
        assertEquals(response.status, 200);
        assertExists(data.data);
        console.log(`${member.firstName}'s financial summary:`, JSON.stringify(data.data, null, 2));
      }
    });
  },
  sanitizeResources: false,
  sanitizeOps: false,
}); 