import { assertEquals, assertExists } from "std/assert/mod.ts";

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

interface AuthResponse {
  token: string;
}

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
}

Deno.test({
  name: "Authentication Flow Integration Tests",
  async fn(t) {
    let authToken = "";

    // Test registration flow
    await t.step("1. Register new user", async () => {
      const { response, data } = await makeRequest<User>("/api/auth/register", "POST", TEST_USER);
      assertEquals(response.status, 200);
      assertExists(data.data.id);
      assertEquals(data.data.email, TEST_USER.email);
    });

    // Test login flow
    await t.step("2. Login with credentials", async () => {
      const { response, data } = await makeRequest<AuthResponse>("/api/auth/login", "POST", {
        email: TEST_USER.email,
        password: TEST_USER.password,
      });
      assertEquals(response.status, 200);
      assertExists(data.data.token);
      authToken = data.data.token;
    });

    // Test invalid login
    await t.step("3. Fail login with wrong password", async () => {
      const { response } = await makeRequest<AuthResponse>("/api/auth/login", "POST", {
        email: TEST_USER.email,
        password: "wrongpassword",
      });
      assertEquals(response.status, 401);
    });

    // Test logout flow
    await t.step("4. Logout and invalidate token", async () => {
      const { response } = await makeRequest("/api/auth/logout", "POST", undefined, authToken);
      assertEquals(response.status, 200);

      // Try to use the invalidated token
      const { response: secondResponse } = await makeRequest("/api/auth/logout", "POST", undefined, authToken);
      assertEquals(secondResponse.status, 401);
    });
  },
}); 