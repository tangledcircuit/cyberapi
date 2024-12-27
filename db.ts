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
export async function createProject(project: Project): Promise<Project> {
  console.log("Creating project:", project);
  const atomic = kv.atomic();
  
  // Store project
  const projectKey = createKey(["project", project.id]);
  atomic.set(projectKey, project);
  
  // Create owner index
  const ownerKey = createKey(["project_owner", project.ownerId, project.id]);
  atomic.set(ownerKey, { projectId: project.id });
  
  console.log("Setting project with keys:", { projectKey, ownerKey });
  
  const result = await atomic.commit();
  console.log("Project creation result:", result);
  if (!result.ok) {
    throw new Error("Failed to create project");
  }
  
  return project;
}

export async function getProjectById(projectId: string): Promise<Project | null> {
  console.log("Getting project by ID:", projectId);
  const key = createKey(["project", projectId]);
  console.log("Using key:", key);
  const project = await kv.get<Project>(key);
  console.log("Found project:", project);
  return project.value;
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
  console.log("Getting project member:", { projectId, userId });
  const key = createKey(["project_member", projectId, userId]);
  console.log("Using key:", key);
  const member = await kv.get<ProjectMember>(key);
  console.log("Found member:", member);
  return member.value;
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
export async function createTimeEntry(entry: TimeEntry): Promise<TimeEntry> {
  const atomic = kv.atomic();
  
  // Main entry
  atomic.set(createKey(["time", entry.id]), entry);
  
  // User index
  atomic.set(createKey(["time_user", entry.userId, entry.date, entry.id]), { entryId: entry.id });
  
  // Project index
  atomic.set(createKey(["time_project", entry.projectId, entry.date, entry.id]), { entryId: entry.id });
  
  const result = await atomic.commit();
  if (!result.ok) {
    throw new Error("Failed to create time entry");
  }
  
  return entry;
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
  const tokenKey = createKey(["auth", userId, token]);
  await kv.delete(tokenKey);
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
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  
  const newTimer: ActiveTimer = {
    id,
    userId: timer.userId!,
    projectId: timer.projectId!,
    description: timer.description || "",
    startedAt: now,
    updatedAt: now,
  };
  
  const atomic = kv.atomic();
  
  // Store timer
  const timerKey = createKey(["active_timer", id]);
  atomic.set(timerKey, newTimer);
  
  // Create user index
  const userIndexKey = createKey(["active_timer_user", timer.userId!]);
  atomic.set(userIndexKey, { timerId: id });
  
  // Create project index
  const projectIndexKey = createKey(["active_timer_project", timer.projectId!, id]);
  atomic.set(projectIndexKey, { timerId: id });
  
  console.log("Starting timer with keys:", { timerKey, userIndexKey, projectIndexKey });
  
  const result = await atomic.commit();
  if (!result.ok) {
    throw new Error("Failed to start timer");
  }
  
  return newTimer;
}

export async function stopTimer(timer: ActiveTimer): Promise<TimeEntry> {
  const now = new Date();
  const startTime = new Date(timer.startedAt);
  const hours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
  
  // Get project member for hourly rate
  const member = await getProjectMember(timer.projectId, timer.userId);
  if (!member) {
    throw new Error("User is not a member of this project");
  }
  
  const timeEntry: TimeEntry = {
    id: crypto.randomUUID(),
    projectId: timer.projectId,
    userId: timer.userId,
    description: timer.description,
    hours,
    costImpact: hours * member.hourlyRate,
    date: timer.startedAt,
    isActive: false,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
  };
  
  const atomic = kv.atomic();
  
  // Create time entry
  const timeKey = createKey(["time", timeEntry.id]);
  atomic.set(timeKey, timeEntry);
  
  // Create user index
  const userIndexKey = createKey(["time_user", timeEntry.userId, timeEntry.date, timeEntry.id]);
  atomic.set(userIndexKey, { entryId: timeEntry.id });
  
  // Create project index
  const projectIndexKey = createKey(["time_project", timeEntry.projectId, timeEntry.date, timeEntry.id]);
  atomic.set(projectIndexKey, { entryId: timeEntry.id });
  
  // Delete timer and indexes
  const timerKey = createKey(["active_timer", timer.id]);
  const timerUserIndexKey = createKey(["active_timer_user", timer.userId]);
  const timerProjectIndexKey = createKey(["active_timer_project", timer.projectId, timer.id]);
  
  atomic
    .delete(timerKey)
    .delete(timerUserIndexKey)
    .delete(timerProjectIndexKey);
  
  console.log("Atomic operation result:", await atomic.commit());
  
  return timeEntry;
}

export async function getActiveTimerByUser(userId: string): Promise<ActiveTimer | null> {
  const indexEntry = await kv.get<{ timerId: string }>(createKey(["active_timer_user", userId]));
  console.log("Index entry:", indexEntry);
  
  if (!indexEntry.value) return null;
  
  const timer = await kv.get<ActiveTimer>(createKey(["active_timer", indexEntry.value.timerId]));
  console.log("Timer:", timer);
  
  return timer.value;
}

export async function getActiveTimersByProject(projectId: string): Promise<ActiveTimer[]> {
  const prefix = createKey(["active_timer_project", projectId]);
  const timers: ActiveTimer[] = [];
  
  for await (const entry of kv.list<{ timerId: string }>({ prefix })) {
    if (entry.value) {
      const timer = await kv.get<ActiveTimer>(createKey(["active_timer", entry.value.timerId]));
      if (timer.value) {
        timers.push(timer.value);
      }
    }
  }
  
  return timers;
}

export async function createProjectMember(member: ProjectMember): Promise<ProjectMember> {
  console.log("Creating project member:", member);
  const atomic = kv.atomic();
  
  // Store member
  const memberKey = createKey(["project_member", member.projectId, member.userId]);
  atomic.set(memberKey, member);
  
  // Create member index
  const memberIndexKey = createKey(["project_member_index", member.projectId, member.role, member.userId]);
  atomic.set(memberIndexKey, { userId: member.userId, role: member.role });
  
  // Create owner index if member is owner
  if (member.role === ProjectRole.OWNER) {
    const ownerKey = createKey(["project_owner", member.userId, member.projectId]);
    atomic.set(ownerKey, { projectId: member.projectId });
  }
  
  console.log("Setting member with keys:", { memberKey, memberIndexKey });
  
  const result = await atomic.commit();
  console.log("Member creation result:", result);
  if (!result.ok) {
    throw new Error("Failed to create project member");
  }
  
  return member;
}

export async function getTimeEntryById(id: string): Promise<TimeEntry | null> {
  console.log("Getting time entry by ID:", id);
  const key = createKey(["time", id]);
  console.log("Using key:", key);
  const entry = await kv.get<TimeEntry>(key);
  console.log("Found entry:", entry);
  return entry.value;
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

  // Get all time entries for the project
  const prefix = createKey(["time_project", projectId]);
  const entries = await kv.list<TimeEntry>({ prefix });
  
  let totalHours = 0;
  const timeEntries: TimeEntry[] = [];

  for await (const entry of entries) {
    totalHours += entry.value.hours;
    timeEntries.push(entry.value);
  }

  if (totalHours === 0) {
    throw new Error("No time entries found");
  }

  // Calculate total profit to distribute
  const totalProfit = timeEntries.reduce((sum, entry) => sum + entry.costImpact, 0) * project.profitSharingPercentage;

  // Distribute profits based on hours worked
  const distributions: { userId: string; amount: number }[] = timeEntries.map(entry => ({
    userId: entry.userId,
    amount: (entry.hours / totalHours) * totalProfit,
  }));

  // Create earnings records
  const payPeriodId = crypto.randomUUID();
  const now = new Date().toISOString();

  const atomic = kv.atomic();
  for (const dist of distributions) {
    const earnings: Earnings = {
      id: crypto.randomUUID(),
      userId: dist.userId,
      projectId,
      payPeriodId,
      regularHours: 0,
      regularEarnings: 0,
      bonusEarnings: dist.amount,
      totalEarnings: dist.amount,
      createdAt: now,
      updatedAt: now,
    };

    const key = createKey(["earnings", earnings.id]);
    const userIndexKey = createKey(["earnings_user", earnings.userId, earnings.payPeriodId, earnings.id]);
    const projectIndexKey = createKey(["earnings_project", earnings.projectId, earnings.payPeriodId, earnings.id]);

    atomic
      .set(key, earnings)
      .set(userIndexKey, { earningsId: earnings.id })
      .set(projectIndexKey, { earningsId: earnings.id });
  }

  const result = await atomic.commit();
  if (!result.ok) {
    throw new Error("Failed to distribute profits");
  }

  return { distributedAmount: totalProfit };
}

export async function updateProject(project: Project): Promise<void> {
  const key = createKey(["project", project.id]);
  const existing = await kv.get<Project>(key);
  if (!existing.value) {
    throw new Error("Project not found");
  }
  await kv.set(key, project);
}

export async function deleteProject(projectId: string): Promise<void> {
  const key = createKey(["project", projectId]);
  const existing = await kv.get<Project>(key);
  if (!existing.value) {
    throw new Error("Project not found");
  }
  await kv.delete(key);
  
  // Also delete owner index
  const ownerKey = createKey(["project_owner", existing.value.ownerId, projectId]);
  await kv.delete(ownerKey);
}

export async function completeTimeEntry(timeEntryId: string): Promise<TimeEntry> {
  const timeEntry = await getTimeEntryById(timeEntryId);
  if (!timeEntry) {
    throw new Error("Time entry not found");
  }

  const member = await getProjectMember(timeEntry.projectId, timeEntry.userId);
  if (!member) {
    throw new Error("User is not a member of this project");
  }

  // Calculate final cost impact based on hours and rate
  const costImpact = timeEntry.hours * member.hourlyRate;

  // Update the time entry
  const updatedEntry: TimeEntry = {
    ...timeEntry,
    isActive: false,
    costImpact,
    updatedAt: new Date().toISOString(),
  };

  const key = createKey(["timeEntries", timeEntryId]);
  await kv.set(key, updatedEntry);

  // Update project budget
  const project = await getProjectById(timeEntry.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  await updateProjectBudget(project.id, -costImpact);

  return updatedEntry;
} 