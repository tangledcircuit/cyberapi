import { User, Project, TimeEntry, AuthToken, ProjectMember, ProjectInvitation, BudgetTransaction, ProfitShare, ProjectRole, PayPeriod, Earnings, ProjectFinancialSummary, UserFinancialSummary, ActiveTimer, ActiveTimerUserIndex, ActiveTimerProjectIndex } from "./types.ts";

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
export async function createTimeEntry(entry: TimeEntry): Promise<void> {
  const timeKey = createKey(["time", entry.id]);
  const userIndexKey = createKey(["time_user", entry.userId, entry.date, entry.id]);
  const projectIndexKey = createKey(["time_project", entry.projectId, entry.date, entry.id]);
  
  // Get project member to get their hourly rate
  const member = await getProjectMember(entry.projectId, entry.userId);
  if (!member) throw new Error("User is not a member of this project");
  
  // Calculate cost impact
  entry.costImpact = entry.hours * member.hourlyRate;
  
  // Create budget transaction
  const transaction: BudgetTransaction = {
    id: crypto.randomUUID(),
    projectId: entry.projectId,
    userId: entry.userId,
    amount: -entry.costImpact,
    type: "TIME",
    description: `Time entry: ${entry.description}`,
    createdAt: new Date().toISOString(),
  };
  
  // Get or create pay period for this month
  const entryDate = new Date(entry.date);
  const startOfMonth = new Date(entryDate.getFullYear(), entryDate.getMonth(), 1).toISOString();
  const endOfMonth = new Date(entryDate.getFullYear(), entryDate.getMonth() + 1, 0).toISOString();
  
  let payPeriod = (await getPayPeriods(entry.userId, startOfMonth, endOfMonth))[0];
  if (!payPeriod) {
    payPeriod = {
      id: crypto.randomUUID(),
      userId: entry.userId,
      startDate: startOfMonth,
      endDate: endOfMonth,
      status: "OPEN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }
  
  // Create earnings record
  const earnings: Earnings = {
    id: crypto.randomUUID(),
    userId: entry.userId,
    projectId: entry.projectId,
    payPeriodId: payPeriod.id,
    regularHours: entry.hours,
    regularEarnings: entry.costImpact,
    bonusEarnings: 0,
    totalEarnings: entry.costImpact,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Get project for budget info
  const project = await getProjectById(entry.projectId);
  if (!project) throw new Error("Project not found");
  
  // Update user financial summary
  const userSummary: UserFinancialSummary = {
    id: crypto.randomUUID(),
    userId: entry.userId,
    period: {
      startDate: startOfMonth,
      endDate: endOfMonth,
    },
    projectEarnings: [{
      projectId: entry.projectId,
      hoursWorked: entry.hours,
      regularEarnings: entry.costImpact,
      bonusEarnings: 0,
      totalEarnings: entry.costImpact,
    }],
    totalHoursWorked: entry.hours,
    totalRegularEarnings: entry.costImpact,
    totalBonusEarnings: 0,
    totalEarnings: entry.costImpact,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  // Update project financial summary
  const projectSummary: ProjectFinancialSummary = {
    id: crypto.randomUUID(),
    projectId: entry.projectId,
    period: {
      startDate: startOfMonth,
      endDate: endOfMonth,
    },
    totalBudget: project.budget,
    totalSpent: entry.costImpact,
    totalBonusesDistributed: 0,
    memberSummaries: [{
      userId: entry.userId,
      hoursWorked: entry.hours,
      regularEarnings: entry.costImpact,
      bonusEarnings: 0,
      totalEarnings: entry.costImpact,
    }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  
  console.log("Creating time entry:", { entry, timeKey, userIndexKey, projectIndexKey });
  
  const atomic = kv.atomic();
  atomic
    .set(timeKey, entry)
    .set(userIndexKey, { entryId: entry.id })
    .set(projectIndexKey, { entryId: entry.id })
    .set(createKey(["budget_transaction", transaction.id]), transaction)
    .set(createKey(["budget_transaction_project", entry.projectId, transaction.id]), { transactionId: transaction.id })
    .set(createKey(["pay_period", payPeriod.userId, payPeriod.id]), payPeriod)
    .set(createKey(["pay_period_user", payPeriod.userId, payPeriod.startDate, payPeriod.id]), { payPeriodId: payPeriod.id })
    .set(createKey(["earnings", earnings.id]), earnings)
    .set(createKey(["earnings_user", earnings.userId, earnings.payPeriodId, earnings.id]), { earningsId: earnings.id })
    .set(createKey(["earnings_project", earnings.projectId, earnings.payPeriodId, earnings.id]), { earningsId: earnings.id })
    .set(createKey(["user_summary", userSummary.userId, userSummary.period.startDate, userSummary.id]), userSummary)
    .set(createKey(["project_summary", projectSummary.projectId, projectSummary.period.startDate, projectSummary.id]), projectSummary);
  
  // Update project budget
  await updateProjectBudget(entry.projectId, -entry.costImpact);
  
  // Update member's total hours
  member.totalHours += entry.hours;
  member.updatedAt = new Date().toISOString();
  await addProjectMember(member);
  
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

  const timerKey = createKey(["timer", newTimer.id]);
  const userIndexKey = createKey(["timer_user", newTimer.userId]);
  const projectIndexKey = createKey(["timer_project", newTimer.projectId, newTimer.id]);

  const atomic = kv.atomic();
  atomic
    .set(timerKey, newTimer)
    .set(userIndexKey, { timerId: newTimer.id })
    .set(projectIndexKey, { timerId: newTimer.id });

  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to start timer");

  return newTimer;
}

export async function stopTimer(userId: string): Promise<TimeEntry> {
  const timer = await getActiveTimerByUser(userId);
  if (!timer) {
    throw new Error("No active timer found");
  }

  // Calculate duration
  const startTime = new Date(timer.startedAt);
  const endTime = new Date();
  const hours = (endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60);

  // Create time entry
  const timeEntry: TimeEntry = {
    id: crypto.randomUUID(),
    projectId: timer.projectId,
    userId: timer.userId,
    description: timer.description,
    hours,
    costImpact: 0, // Will be calculated in createTimeEntry
    date: timer.startedAt,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Delete timer and create time entry
  const timerKey = createKey(["timer", timer.id]);
  const userIndexKey = createKey(["timer_user", timer.userId]);
  const projectIndexKey = createKey(["timer_project", timer.projectId, timer.id]);

  const atomic = kv.atomic();
  atomic
    .delete(timerKey)
    .delete(userIndexKey)
    .delete(projectIndexKey);

  const result = await atomic.commit();
  if (!result.ok) throw new Error("Failed to stop timer");

  // Create the time entry
  await createTimeEntry(timeEntry);

  return timeEntry;
}

export async function getActiveTimerByUser(userId: string): Promise<ActiveTimer | null> {
  const prefix = createKey(["active_timer_user", userId]);
  
  for await (const entry of kv.list<ActiveTimerUserIndex>({ prefix })) {
    const timer = await kv.get<ActiveTimer>(createKey(["active_timer", entry.value.timerId]));
    if (timer.value) {
      return timer.value;
    }
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