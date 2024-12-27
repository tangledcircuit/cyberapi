import { User, Project, TimeEntry, AuthToken, ProjectMember, ProjectInvitation, BudgetTransaction, ProfitShare, ProjectRole, PayPeriod, Earnings, ProjectFinancialSummary, UserFinancialSummary, ActiveTimer, _ActiveTimerUserIndex, ActiveTimerProjectIndex } from "./types.ts";

// Initialize the KV store
// Use in-memory store for tests, default store for development/production
export const kv = await Deno.openKv();

// Helper function to create composite keys
export function createKey(parts: string[]): string[] {
  return parts;
}

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
  const memberKey = createKey(["project_member", project.id, project.ownerId]);
  
  const member: ProjectMember = {
    projectId: project.id,
    userId: project.ownerId,
    role: ProjectRole.OWNER,
    hourlyRate: (await getUserById(project.ownerId))?.hourlyRate || 0,
    totalHours: 0,
    joinedAt: project.createdAt,
    updatedAt: project.createdAt,
  };
  
  const atomic = kv.atomic();
  atomic
    .set(projectKey, project)
    .set(memberKey, member);
  
  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to create project");
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  const key = createKey(["project", projectId]);
  const result = await kv.get<Project>(key);
  return result.value;
}

export async function updateProjectBudget(projectId: string, amount: number): Promise<void> {
  const key = createKey(["project", projectId]);
  const project = await kv.get<Project>(key);
  
  if (project.value) {
    project.value.remainingBudget += amount;
    await kv.set(key, project.value);
  }
}

// Project member operations
export async function addProjectMember(member: ProjectMember): Promise<void> {
  const key = createKey(["project_member", member.projectId, member.userId]);
  await kv.set(key, member);
}

export async function getProjectMember(projectId: string, userId: string): Promise<ProjectMember | null> {
  const key = createKey(["project_member", projectId, userId]);
  const result = await kv.get<ProjectMember>(key);
  return result.value;
}

export async function getProjectMembers(projectId: string): Promise<ProjectMember[]> {
  const prefix = createKey(["project_member", projectId]);
  const members: ProjectMember[] = [];
  
  for await (const entry of kv.list<ProjectMember>({ prefix })) {
    if (entry.value) {
      members.push(entry.value);
    }
  }
  
  return members;
}

// Project invitation operations
export async function createProjectInvitation(invitation: ProjectInvitation): Promise<void> {
  const key = createKey(["project_invitation", invitation.id]);
  await kv.set(key, invitation);
  
  // Create index by email
  const emailKey = createKey(["project_invitation_email", invitation.inviteeEmail, invitation.id]);
  await kv.set(emailKey, { invitationId: invitation.id });
}

export async function getProjectInvitation(invitationId: string): Promise<ProjectInvitation | null> {
  const key = createKey(["project_invitation", invitationId]);
  const result = await kv.get<ProjectInvitation>(key);
  return result.value;
}

export async function updateProjectInvitation(invitation: ProjectInvitation): Promise<void> {
  const key = createKey(["project_invitation", invitation.id]);
  await kv.set(key, invitation);
}

// Time entry operations
export async function createTimeEntry(entry: Omit<TimeEntry, "id" | "createdAt" | "updatedAt">): Promise<TimeEntry> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const timeEntry: TimeEntry = {
    ...entry,
    id,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };

  const timeKey = ["time", id];
  const userIndexKey = ["time_user", entry.userId, entry.date, id];
  const projectIndexKey = ["time_project", entry.projectId, entry.date, id];

  console.log("Creating time entry:", {
    entry: timeEntry,
    timeKey,
    userIndexKey,
    projectIndexKey,
  });

  const ok = await kv.atomic()
    .set(timeKey, timeEntry)
    .set(userIndexKey, { timeEntryId: id })
    .set(projectIndexKey, { timeEntryId: id })
    .commit();

  console.log("Time entry creation result:", ok);

  if (!ok.ok) {
    throw new Error("Failed to create time entry");
  }

  return timeEntry;
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

// Budget transaction operations
export async function getBudgetTransactions(projectId: string): Promise<BudgetTransaction[]> {
  const prefix = createKey(["budget_transaction_project", projectId]);
  const transactions: BudgetTransaction[] = [];
  
  for await (const entry of kv.list<{ transactionId: string }>({ prefix })) {
    if (entry.value) {
      const transactionKey = createKey(["budget_transaction", entry.value.transactionId]);
      const transaction = await kv.get<BudgetTransaction>(transactionKey);
      if (transaction.value) {
        transactions.push(transaction.value);
      }
    }
  }
  
  return transactions;
}

// Profit sharing operations
export async function createProfitShare(share: ProfitShare): Promise<void> {
  const key = createKey(["profit_share", share.id]);
  await kv.set(key, share);
  
  // Create index by project
  const projectKey = createKey(["profit_share_project", share.projectId, share.id]);
  await kv.set(projectKey, { shareId: share.id });
}

export async function getProfitShares(projectId: string): Promise<ProfitShare[]> {
  const prefix = createKey(["profit_share_project", projectId]);
  const shares: ProfitShare[] = [];
  
  for await (const entry of kv.list<{ shareId: string }>({ prefix })) {
    if (entry.value) {
      const shareKey = createKey(["profit_share", entry.value.shareId]);
      const share = await kv.get<ProfitShare>(shareKey);
      if (share.value) {
        shares.push(share.value);
      }
    }
  }
  
  return shares;
}

export async function updateProfitShare(profitShare: ProfitShare): Promise<void> {
  const profitShareKey = createKey(["profit_share", profitShare.id]);
  await kv.set(profitShareKey, profitShare);
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

// Pay period operations
export async function createPayPeriod(payPeriod: PayPeriod): Promise<void> {
  const key = createKey(["pay_period", payPeriod.userId, payPeriod.id]);
  const userIndexKey = createKey(["pay_period_user", payPeriod.userId, payPeriod.startDate, payPeriod.id]);
  
  const atomic = kv.atomic();
  atomic
    .set(key, payPeriod)
    .set(userIndexKey, { payPeriodId: payPeriod.id });
  
  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to create pay period");
}

export async function getPayPeriods(userId: string, startDate: string, endDate: string): Promise<PayPeriod[]> {
  const prefix = createKey(["pay_period_user", userId]);
  const periods: PayPeriod[] = [];
  
  for await (const entry of kv.list<{ payPeriodId: string }>({ prefix })) {
    const periodDate = entry.key[2] as string;
    if (periodDate >= startDate && periodDate <= endDate) {
      const period = await kv.get<PayPeriod>(createKey(["pay_period", userId, entry.value.payPeriodId]));
      if (period.value) {
        periods.push(period.value);
      }
    }
  }
  
  return periods;
}

// Earnings operations
export async function createEarnings(earnings: Earnings): Promise<void> {
  const key = createKey(["earnings", earnings.id]);
  const userIndexKey = createKey(["earnings_user", earnings.userId, earnings.payPeriodId, earnings.id]);
  const projectIndexKey = createKey(["earnings_project", earnings.projectId, earnings.payPeriodId, earnings.id]);
  
  const atomic = kv.atomic();
  atomic
    .set(key, earnings)
    .set(userIndexKey, { earningsId: earnings.id })
    .set(projectIndexKey, { earningsId: earnings.id });
  
  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to create earnings record");
}

export async function getUserEarnings(userId: string, payPeriodId: string): Promise<Earnings[]> {
  const prefix = createKey(["earnings_user", userId, payPeriodId]);
  const earnings: Earnings[] = [];
  
  for await (const entry of kv.list<{ earningsId: string }>({ prefix })) {
    const record = await kv.get<Earnings>(createKey(["earnings", entry.value.earningsId]));
    if (record.value) {
      earnings.push(record.value);
    }
  }
  
  return earnings;
}

export async function getProjectEarnings(projectId: string, payPeriodId: string): Promise<Earnings[]> {
  const prefix = createKey(["earnings_project", projectId, payPeriodId]);
  const earnings: Earnings[] = [];
  
  for await (const entry of kv.list<{ earningsId: string }>({ prefix })) {
    const record = await kv.get<Earnings>(createKey(["earnings", entry.value.earningsId]));
    if (record.value) {
      earnings.push(record.value);
    }
  }
  
  return earnings;
}

// Financial summary operations
export async function createProjectFinancialSummary(summary: ProjectFinancialSummary): Promise<void> {
  const key = createKey(["project_summary", summary.projectId, summary.period.startDate, summary.id]);
  await kv.set(key, summary);
}

export async function getProjectFinancialSummaries(
  projectId: string,
  startDate?: string,
  endDate?: string
): Promise<ProjectFinancialSummary[]> {
  const prefix = createKey(["project_financial_summary", projectId]);
  const summaries: ProjectFinancialSummary[] = [];
  
  for await (const entry of kv.list<ProjectFinancialSummary>({ prefix })) {
    if (entry.value) {
      // Filter by date range if provided
      if (startDate && endDate) {
        if (entry.value.period.startDate >= startDate && entry.value.period.endDate <= endDate) {
          summaries.push(entry.value);
        }
      } else {
        summaries.push(entry.value);
      }
    }
  }
  
  return summaries;
}

export async function createUserFinancialSummary(summary: UserFinancialSummary): Promise<void> {
  const key = createKey(["user_summary", summary.userId, summary.period.startDate, summary.id]);
  await kv.set(key, summary);
}

export async function getUserFinancialSummaries(
  userId: string,
  startDate?: string,
  endDate?: string
): Promise<UserFinancialSummary[]> {
  const prefix = createKey(["user_financial_summary", userId]);
  const summaries: UserFinancialSummary[] = [];
  
  for await (const entry of kv.list<UserFinancialSummary>({ prefix })) {
    if (entry.value) {
      // Filter by date range if provided
      if (startDate && endDate) {
        if (entry.value.period.startDate >= startDate && entry.value.period.endDate <= endDate) {
          summaries.push(entry.value);
        }
      } else {
        summaries.push(entry.value);
      }
    }
  }
  
  return summaries;
}

// Update project member operations to include financial data
export async function updateProjectMemberFinancials(
  projectId: string,
  userId: string,
  hoursWorked: number,
  _regularEarnings: number,
  _bonusEarnings: number
): Promise<void> {
  const member = await getProjectMember(projectId, userId);
  if (!member) throw new Error("Member not found");
  
  member.totalHours += hoursWorked;
  member.updatedAt = new Date().toISOString();
  
  await addProjectMember(member);
}

// Active timer operations
export async function startTimer(timer: Partial<ActiveTimer>): Promise<ActiveTimer> {
  // Check if user already has an active timer
  const existingTimer = await getActiveTimerByUser(timer.userId!);
  if (existingTimer) {
    throw new Error("User already has an active timer");
  }

  const newTimer: ActiveTimer = {
    id: crypto.randomUUID(),
    userId: timer.userId!,
    projectId: timer.projectId!,
    description: timer.description || "",
    startedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Use single key for user's active timer
  const timerKey = createKey(["active_timer", newTimer.id]);
  const userIndexKey = createKey(["active_timer_user", newTimer.userId]); // Single active timer per user
  const projectIndexKey = createKey(["active_timer_project", newTimer.projectId, newTimer.id]);

  console.log("Starting timer with keys:", { timerKey, userIndexKey, projectIndexKey });

  const atomic = kv.atomic();
  atomic
    .set(timerKey, newTimer)
    .set(userIndexKey, { timerId: newTimer.id })
    .set(projectIndexKey, { timerId: newTimer.id });

  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to start timer");

  return newTimer;
}

export async function stopTimer(timer: ActiveTimer): Promise<TimeEntry> {
  const now = new Date().toISOString();
  const duration = (new Date(now).getTime() - new Date(timer.startedAt).getTime()) / 1000 / 60 / 60; // Convert to hours

  // Get project member to calculate cost impact
  const member = await getProjectMember(timer.projectId, timer.userId);
  if (!member) {
    throw new Error("User is not a member of this project");
  }

  const timeEntry: TimeEntry = {
    id: crypto.randomUUID(),
    projectId: timer.projectId,
    userId: timer.userId,
    description: timer.description,
    hours: duration,
    costImpact: duration * member.hourlyRate,
    date: timer.startedAt,
    status: "PENDING",
    createdAt: now,
    updatedAt: now,
  };

  await createTimeEntry(timeEntry);
  return timeEntry;
}

export async function getActiveTimerByUser(userId: string): Promise<ActiveTimer | null> {
  const userIndexKey = createKey(["active_timer_user", userId]);
  console.log("Getting active timer for user:", userIndexKey);
  
  const indexEntry = await kv.get<{ timerId: string }>(userIndexKey);
  console.log("Index entry:", indexEntry);
  
  if (indexEntry.value) {
    const timer = await kv.get<ActiveTimer>(createKey(["active_timer", indexEntry.value.timerId]));
    console.log("Timer:", timer);
    return timer.value;
  }
  
  return null;
}

export async function getActiveTimersByProject(projectId: string): Promise<ActiveTimer[]> {
  const prefix = createKey(["active_timer_project", projectId]);
  const timers: ActiveTimer[] = [];
  
  for await (const entry of kv.list<ActiveTimerProjectIndex>({ prefix })) {
    const timer = await kv.get<ActiveTimer>(createKey(["active_timer", entry.value.timerId]));
    if (timer.value) {
      timers.push(timer.value);
    }
  }
  
  return timers;
}

export async function createProjectMember(member: Omit<ProjectMember, "id">): Promise<ProjectMember> {
  const now = new Date().toISOString();
  const newMember: ProjectMember = {
    ...member,
    createdAt: now,
    updatedAt: now,
  };

  const ok = await kv.set(["project_member", member.projectId, member.userId], newMember);
  if (!ok) {
    throw new Error("Failed to create project member");
  }

  return newMember;
}

export async function getTimeEntryById(id: string): Promise<TimeEntry | null> {
  const key = ["time", id];
  const entry = await kv.get<TimeEntry>(key);
  return entry.value;
}

export async function completeTimeEntry(id: string): Promise<TimeEntry> {
  const key = ["time", id];
  const entry = await kv.get<TimeEntry>(key);
  if (!entry.value) {
    throw new Error("Time entry not found");
  }

  const now = new Date().toISOString();
  const updatedEntry = {
    ...entry.value,
    status: "COMPLETED",
    updatedAt: now,
  };

  const ok = await kv.set(key, updatedEntry);
  if (!ok) {
    throw new Error("Failed to complete time entry");
  }

  return updatedEntry;
}

export async function distributeProjectProfits(projectId: string): Promise<{ distributedAmount: number }> {
  // Get project details
  const project = await getProjectById(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  if (!project.profitSharingEnabled) {
    throw new Error("Profit sharing is not enabled for this project");
  }

  // Get all completed time entries for the project
  const prefix = ["time_project", projectId];
  const entries = await kv.list<TimeEntry>({ prefix });
  
  let totalHours = 0;
  const completedEntries: TimeEntry[] = [];

  for await (const entry of entries) {
    if (entry.value.status === "COMPLETED") {
      totalHours += entry.value.hours;
      completedEntries.push(entry.value);
    }
  }

  if (totalHours === 0) {
    throw new Error("No completed time entries found");
  }

  // Calculate profit pool (10% of project budget)
  const profitPool = project.budget * 0.1;
  const hourlyProfit = profitPool / totalHours;

  // Distribute profits to team members
  for (const entry of completedEntries) {
    const profit = entry.hours * hourlyProfit;
    const member = await getProjectMember(projectId, entry.userId);
    if (member) {
      await kv.set(["profit", entry.id], {
        timeEntryId: entry.id,
        userId: entry.userId,
        projectId,
        amount: profit,
        distributedAt: new Date().toISOString(),
      });
    }
  }

  // Update project bonus pool
  const updatedProject = {
    ...project,
    bonusPool: profitPool,
    updatedAt: new Date().toISOString(),
  };
  await kv.set(["project", projectId], updatedProject);

  return { distributedAmount: profitPool };
} 