import { User, Project, TimeEntry, AuthToken } from "./types.ts";

// Initialize the KV store
const kv = await Deno.openKv();

// Helper function to create composite keys
const createKey = (parts: unknown[]) => parts.map(String);

// User operations
export async function createUser(user: User): Promise<void> {
  const userKey = createKey(["user", user.id]);
  const emailIndexKey = createKey(["user_email", user.email]);
  
  const atomic = kv.atomic();
  atomic
    .check({ key: emailIndexKey, versionstamp: null }) // Ensure email doesn't exist
    .set(userKey, user)
    .set(emailIndexKey, { userId: user.id });
  
  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to create user");
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
  const timeKey = createKey(["time", entry.projectId, entry.userId, entry.id]);
  const userIndexKey = createKey(["time_user", entry.userId, entry.date.toISOString(), entry.id]);
  const projectIndexKey = createKey(["time_project", entry.projectId, entry.date.toISOString(), entry.id]);
  
  const atomic = kv.atomic();
  atomic
    .set(timeKey, entry)
    .set(userIndexKey, { entryId: entry.id })
    .set(projectIndexKey, { entryId: entry.id });
  
  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to create time entry");
}

export async function getTimeEntriesByUser(userId: string, startDate: Date, endDate: Date): Promise<TimeEntry[]> {
  const entries: TimeEntry[] = [];
  const prefix = createKey(["time_user", userId]);
  
  for await (const entry of kv.list<{ entryId: string }>({ prefix })) {
    const timeEntry = await kv.get<TimeEntry>(createKey(["time", entry.value.entryId]));
    if (timeEntry.value && timeEntry.value.date >= startDate && timeEntry.value.date <= endDate) {
      entries.push(timeEntry.value);
    }
  }
  
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