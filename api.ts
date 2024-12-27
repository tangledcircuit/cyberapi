/// <reference lib="deno.unstable" />

import { serve } from "std/http/server.ts";
import { Status } from "std/http/http_status.ts";
import { createUser, getUserByEmail, getUserById, createProject, createTimeEntry, getTimeEntriesByUser, createAuthToken, getAuthToken, deleteAuthToken } from "./db.ts";
import { User, Project, TimeEntry, AuthToken, ProjectStatus } from "./types.ts";
import { crypto } from "std/crypto/mod.ts";

// Standard response type for consistency
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

// Helper to create consistent API responses
function createResponse<T>(data?: T, error?: string): ApiResponse<T> {
  return {
    success: !error,
    ...(data && { data }),
    ...(error && { error }),
    timestamp: new Date().toISOString(),
  };
}

// Authentication middleware
async function authenticate(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;
  
  const token = authHeader.slice(7);
  const [userId, authToken] = token.split(":");
  if (!userId || !authToken) return null;
  
  const tokenData = await getAuthToken(userId, authToken);
  if (!tokenData || tokenData.expiresAt < new Date()) return null;
  
  return await getUserById(userId);
}

// Password hashing
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// Request handlers
async function handleLogin(req: Request): Promise<Response> {
  try {
    const { email, password } = await req.json();
    const user = await getUserByEmail(email);
    
    if (!user || user.passwordHash !== await hashPassword(password)) {
      return new Response(
        JSON.stringify(createResponse(null, "Invalid credentials")),
        { status: Status.Unauthorized }
      );
    }
    
    const token = crypto.randomUUID();
    const authToken: AuthToken = {
      token,
      userId: user.id,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      createdAt: new Date(),
    };
    
    await createAuthToken(authToken);
    
    return new Response(
      JSON.stringify(createResponse({ token: `${user.id}:${token}` })),
      { status: Status.OK }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify(createResponse(null, errorMessage)),
      { status: Status.InternalServerError }
    );
  }
}

async function handleCreateUser(req: Request): Promise<Response> {
  try {
    const userData = await req.json();
    console.log("Creating user:", userData);
    
    const user: User = {
      ...userData,
      id: crypto.randomUUID(),
      passwordHash: await hashPassword(userData.password),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    console.log("User object:", user);
    await createUser(user);
    const { passwordHash: _, ...safeUser } = user;
    
    return new Response(
      JSON.stringify(createResponse(safeUser)),
      { status: Status.Created }
    );
  } catch (error: unknown) {
    console.error("Error creating user:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify(createResponse(null, errorMessage)),
      { status: Status.InternalServerError }
    );
  }
}

async function handleCreateProject(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const projectData = await req.json();
    const project: Project = {
      ...projectData,
      id: crypto.randomUUID(),
      status: ProjectStatus.PLANNED,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    
    await createProject(project);
    
    return new Response(
      JSON.stringify(createResponse(project)),
      { status: Status.Created }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify(createResponse(null, errorMessage)),
      { status: Status.InternalServerError }
    );
  }
}

async function handleCreateTimeEntry(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const entryData = await req.json();
    const timeEntry: TimeEntry = {
      ...entryData,
      id: crypto.randomUUID(),
      userId: user.id,
      createdAt: new Date(),
      updatedAt: new Date(),
      date: new Date(entryData.date),
    };
    
    await createTimeEntry(timeEntry);
    
    return new Response(
      JSON.stringify(createResponse(timeEntry)),
      { status: Status.Created }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify(createResponse(null, errorMessage)),
      { status: Status.InternalServerError }
    );
  }
}

async function handleGetTimeEntries(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const url = new URL(req.url);
    const startDate = new Date(url.searchParams.get("startDate") || "");
    const endDate = new Date(url.searchParams.get("endDate") || "");
    
    const entries = await getTimeEntriesByUser(user.id, startDate, endDate);
    
    return new Response(
      JSON.stringify(createResponse(entries)),
      { status: Status.OK }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify(createResponse(null, errorMessage)),
      { status: Status.InternalServerError }
    );
  }
}

async function handleLogout(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const authHeader = req.headers.get("Authorization");
    const token = authHeader!.slice(7); // Safe because we checked in authenticate
    const [userId, authToken] = token.split(":");
    
    await deleteAuthToken(userId, authToken);
    
    return new Response(
      JSON.stringify(createResponse({ message: "Logged out successfully" })),
      { status: Status.OK }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(
      JSON.stringify(createResponse(null, errorMessage)),
      { status: Status.InternalServerError }
    );
  }
}

// Router
export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  
  // CORS headers
  const headers = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
  };
  
  // Handle preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers });
  }
  
  let response: Response;
  
  switch (`${req.method} ${path}`) {
    case "POST /auth/login":
      response = await handleLogin(req);
      break;
    case "DELETE /auth/logout":
      response = await handleLogout(req);
      break;
    case "POST /users":
      response = await handleCreateUser(req);
      break;
    case "POST /projects":
      response = await handleCreateProject(req);
      break;
    case "POST /time-entries":
      response = await handleCreateTimeEntry(req);
      break;
    case "GET /time-entries":
      response = await handleGetTimeEntries(req);
      break;
    default:
      response = new Response(
        JSON.stringify(createResponse(null, "Not Found")),
        { status: Status.NotFound }
      );
  }
  
  // Add CORS headers to response
  const responseHeaders = new Headers(response.headers);
  Object.entries(headers).forEach(([key, value]) => {
    responseHeaders.set(key, value);
  });
  
  return new Response(response.body, {
    status: response.status,
    headers: responseHeaders,
  });
}

// Start the server
if (import.meta.main) {
  const port = 8000;
  console.log(`Server running on http://localhost:${port}`);
  await serve(router, { port });
} 