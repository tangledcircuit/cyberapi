import { User, Project, TimeEntry, AuthToken } from "./types.ts";

// Initialize the KV store
// Use in-memory store for tests, default store for development/production
const kv = await Deno.openKv(Deno.env.get("DENO_ENV") === "test" ? ":memory:" : undefined);

// Helper function to create composite keys
const createKey = (parts: unknown[]) => parts.map(String);

// User operations
export async function createUser(user: User): Promise<void> {
  const userKey = createKey(["user", user.id]);
  const emailIndexKey = createKey(["user_email", user.email]);
  
  console.log("Checking email:", emailIndexKey);
  // Check if email already exists
  const existingEmail = await kv.get(emailIndexKey);
  console.log("Existing email check result:", existingEmail);
  if (existingEmail.value) {
    throw new Error("Email already exists");
  }
  
  console.log("Creating atomic transaction");
  const atomic = kv.atomic();
  atomic
    .check({ key: emailIndexKey, versionstamp: null }) // Ensure email doesn't exist
    .set(userKey, user)
    .set(emailIndexKey, { userId: user.id });
  
  console.log("Committing transaction");
  const result = await atomic.commit();
  console.log("Transaction result:", result);
  if (!result.ok) {
    throw new Error("Failed to create user: Database error");
  }
}

export async function getUserById(id: string): Promise<User | null> {
  const entry = await kv.get<User>(createKey(["user", id]));
  return entry.value;
}

export async function getUserByEmail(email: string): Promise<User | null> {
  const indexEntry = await kv.get<{ userId: string }>(createKey(["user_email", email]));
  if (!indexEntry.value) return null;
  return getUserById(indexEntry.value.userId);
}

// Project operations
export async function createProject(project: Project): Promise<void> {
  const projectKey = createKey(["project", project.id]);
  const clientIndexKey = createKey(["project_client", project.clientId, project.id]);
  
  const atomic = kv.atomic();
  atomic
    .set(projectKey, project)
    .set(clientIndexKey, { projectId: project.id });
  
  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to create project");
}

export async function getProjectById(id: string): Promise<Project | null> {
  const entry = await kv.get<Project>(createKey(["project", id]));
  return entry.value;
}

// Time entry operations
export async function createTimeEntry(entry: TimeEntry): Promise<void> {
  const timeKey = createKey(["time", entry.id]);
  const userIndexKey = createKey(["time_user", entry.userId, entry.date, entry.id]);
  const projectIndexKey = createKey(["time_project", entry.projectId, entry.date, entry.id]);
  
  console.log("Creating time entry:", { entry, timeKey, userIndexKey, projectIndexKey });
  
  const atomic = kv.atomic();
  atomic
    .set(timeKey, entry)
    .set(userIndexKey, { entryId: entry.id })
    .set(projectIndexKey, { entryId: entry.id });
  
  const result = await atomic.commit();
  console.log("Time entry creation result:", result);
  if (!result.ok) throw new Error("Failed to create time entry");
}

export async function getTimeEntriesByUser(userId: string, startDate: Date, endDate: Date): Promise<TimeEntry[]> {
  const entries: TimeEntry[] = [];
  const prefix = createKey(["time_user", userId]);
  
  console.log("Getting time entries for user:", userId);
  console.log("Date range:", { startDate, endDate });
  
  for await (const entry of kv.list<{ entryId: string }>({ prefix })) {
    console.log("Found entry:", entry);
    const timeEntry = await kv.get<TimeEntry>(createKey(["time", entry.value.entryId]));
    console.log("Time entry details:", timeEntry);
    
    // Parse the date from the entry key
    const entryDate = new Date(entry.key[2] as string);
    if (entryDate >= startDate && entryDate <= endDate) {
      const fullEntry = await kv.get<TimeEntry>(createKey(["time", entry.value.entryId]));
      if (fullEntry.value) {
        entries.push(fullEntry.value);
      }
    }
  }
  
  console.log("Returning entries:", entries);
  return entries;
}

// Auth token operations
export async function createAuthToken(token: AuthToken): Promise<void> {
  const tokenKey = createKey(["auth", token.userId, token.token]);
  await kv.set(tokenKey, token);
}

export async function getAuthToken(userId: string, token: string): Promise<AuthToken | null> {
  const entry = await kv.get<AuthToken>(createKey(["auth", userId, token]));
  return entry.value;
}

export async function deleteAuthToken(userId: string, token: string): Promise<void> {
  await kv.delete(createKey(["auth", userId, token]));
} 