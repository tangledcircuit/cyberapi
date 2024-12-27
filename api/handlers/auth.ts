import { Status } from "std/http/http_status.ts";
import { createResponse } from "../utils/response.ts";
import { authenticate } from "../middleware/auth.ts";
import { User, AuthToken } from "../../types.ts";
import { 
  createUser, 
  getUserByEmail, 
  createAuthToken, 
  deleteAuthToken 
} from "../../db.ts";
import { crypto } from "std/crypto/mod.ts";

// Password hashing
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export const authHandlers = {
  async login(req: Request): Promise<Response> {
    try {
      const { email, password } = await req.json();
      const user = await getUserByEmail(email);
      const hashedPassword = await hashPassword(password);
      
      if (!user || user.passwordHash !== hashedPassword) {
        return new Response(
          JSON.stringify(createResponse(null, "Invalid credentials")),
          { 
            status: Status.Unauthorized,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      
      const token = crypto.randomUUID();
      const authToken: AuthToken = {
        token,
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
        createdAt: new Date().toISOString(),
      };
      
      await createAuthToken(authToken);
      
      return new Response(
        JSON.stringify(createResponse({ token: `${user.id}:${token}` })),
        { 
          status: Status.OK,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return new Response(
        JSON.stringify(createResponse(null, errorMessage)),
        { 
          status: Status.InternalServerError,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },

  async register(req: Request): Promise<Response> {
    try {
      const userData = await req.json();
      console.log("Creating user:", userData);
      
      const existingUser = await getUserByEmail(userData.email);
      if (existingUser) {
        return new Response(
          JSON.stringify(createResponse(null, "Email already exists")),
          { 
            status: Status.BadRequest,
            headers: { "Content-Type": "application/json" }
          }
        );
      }
      
      const user: User = {
        id: crypto.randomUUID(),
        email: userData.email,
        firstName: userData.firstName || "",
        lastName: userData.lastName || "",
        hourlyRate: userData.hourlyRate || 0,
        passwordHash: await hashPassword(userData.password),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      console.log("User object:", user);
      await createUser(user);
      const { passwordHash: _, ...safeUser } = user;
      
      return new Response(
        JSON.stringify(createResponse(safeUser)),
        { 
          status: Status.OK,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error: unknown) {
      console.error("Error creating user:", error);
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return new Response(
        JSON.stringify(createResponse(null, errorMessage)),
        { 
          status: Status.InternalServerError,
          headers: { "Content-Type": "application/json" }
        }
      );
    }
  },

  async logout(req: Request): Promise<Response> {
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
}; 