import { assertEquals, assertExists } from "std/assert/mod.ts";
import { Status } from "std/http/http_status.ts";
import { authHandlers } from "../../api/handlers/auth.ts";

// Mock data
const TEST_USER = {
  email: `test${Date.now()}@example.com`,
  password: "test123",
  firstName: "Test",
  lastName: "User",
  hourlyRate: 100,
};

Deno.test({
  name: "Auth Handler Unit Tests",
  async fn(t) {
    let authToken = "";

    await t.step("register() - should create a new user", async () => {
      const request = new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(TEST_USER),
      });

      const response = await authHandlers.register(request);
      assertEquals(response.status, Status.Created);

      const data = await response.json();
      assertExists(data.data.id);
      assertEquals(data.data.email, TEST_USER.email);
      assertEquals(data.data.firstName, TEST_USER.firstName);
      assertEquals(data.data.lastName, TEST_USER.lastName);
    });

    await t.step("login() - should authenticate user", async () => {
      const request = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: TEST_USER.email,
          password: TEST_USER.password,
        }),
      });

      const response = await authHandlers.login(request);
      assertEquals(response.status, Status.OK);

      const data = await response.json();
      assertExists(data.data.token);
      authToken = data.data.token;
    });

    await t.step("login() - should fail with wrong password", async () => {
      const request = new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: TEST_USER.email,
          password: "wrongpassword",
        }),
      });

      const response = await authHandlers.login(request);
      assertEquals(response.status, Status.Unauthorized);
    });

    await t.step("logout() - should invalidate token", async () => {
      const request = new Request("http://localhost/api/auth/logout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${authToken}`,
        },
      });

      const response = await authHandlers.logout(request);
      assertEquals(response.status, Status.OK);

      // Try to use the token again
      const secondResponse = await authHandlers.logout(request);
      assertEquals(secondResponse.status, Status.Unauthorized);
    });
  },
}); 