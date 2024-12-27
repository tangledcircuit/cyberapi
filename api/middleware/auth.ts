import { User } from "../../types.ts";
import { getAuthToken, getUserById } from "../../db.ts";

// Authentication middleware
export async function authenticate(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("Authorization");
  console.log("Auth header:", authHeader);
  if (!authHeader?.startsWith("Bearer ")) return null;
  
  const token = authHeader.slice(7);
  const [userId, authToken] = token.split(":");
  console.log("Token parts:", { userId, authToken });
  if (!userId || !authToken) return null;
  
  const tokenData = await getAuthToken(userId, authToken);
  console.log("Token data:", tokenData);
  if (!tokenData || new Date(tokenData.expiresAt) < new Date()) return null;
  
  const user = await getUserById(userId);
  console.log("User data:", user);
  return user;
} 