// User related types
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
  createdAt: string;
  updatedAt: string;
  defaultPayPeriodSettings?: {
    type: "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "CUSTOM";
    customPeriodDays?: number;
    startDayOfWeek?: number; // 0-6 for Sunday-Saturday
    startDayOfMonth?: number; // 1-31
  };
}

export interface UserPublic {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}

// Project related types
export enum ProjectStatus {
  PLANNED = "PLANNED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  ON_HOLD = "ON_HOLD",
  CANCELLED = "CANCELLED"
}

export enum ProjectRole {
  OWNER = "OWNER",
  MEMBER = "MEMBER",
  ADMIN = "ADMIN",
}

export interface Project {
  id: string;
  name: string;
  description: string;
  budget: number;
  remainingBudget: number;
  clientId: string;
  ownerId: string;
  status: ProjectStatus;
  profitSharingEnabled: boolean;
  bonusPool: number;
  createdAt: string;
  updatedAt: string;
  invoiceSettings?: {
    payPeriodType: "WEEKLY" | "BI_WEEKLY" | "MONTHLY" | "CUSTOM";
    customPeriodDays?: number;
    autoGenerateInvoices: boolean;
  };
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: ProjectRole;
  hourlyRate: number;
  totalHours: number;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectInvitation {
  id: string;
  projectId: string;
  inviterId: string;
  inviteeEmail: string;
  status: "PENDING" | "ACCEPTED" | "DECLINED";
  role: ProjectRole;
  hourlyRate: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
}

// Time tracking related types
export interface TimeEntry {
  id: string;
  projectId: string;
  userId: string;
  description: string;
  hours: number;
  costImpact: number;
  date: string;
  status: "PENDING" | "COMPLETED";
  createdAt: string;
  updatedAt: string;
}

// Budget and profit sharing types
export interface BudgetTransaction {
  id: string;
  projectId: string;
  userId: string;
  amount: number;
  type: "TIME" | "BONUS";
  description: string;
  createdAt: string;
}

export interface ProfitShare {
  id: string;
  projectId: string;
  userId: string;
  amount: number;
  percentage: number;
  status: "PENDING" | "PAID";
  createdAt: string;
}

// Authentication related types
export interface AuthToken {
  token: string;
  userId: string;
  expiresAt: string;
  createdAt: string;
}

// KV Schema types
export type KvUser = User;
export type KvProject = Project;
export type KvTimeEntry = TimeEntry;
export type KvAuthToken = AuthToken;
export type KvProjectMember = ProjectMember;
export type KvProjectInvitation = ProjectInvitation;
export type KvBudgetTransaction = BudgetTransaction;
export type KvProfitShare = ProfitShare;

// Index types for querying
export type UserEmailIndex = { userId: string };
export type ProjectClientIndex = { projectId: string };
export type TimeUserIndex = { entryId: string };
export type TimeProjectIndex = { entryId: string };
export type ProjectMemberIndex = { userId: string; role: ProjectRole };
export type ProjectInvitationEmailIndex = { invitationId: string };
export type BudgetTransactionProjectIndex = { transactionId: string };
export type ProfitShareProjectIndex = { profitShareId: string };
export type _ActiveTimerUserIndex = { timerId: string };
export type ActiveTimerProjectIndex = { timerId: string };

export interface PayPeriod {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  status: "OPEN" | "CLOSED";
  createdAt: string;
  updatedAt: string;
}

export interface Earnings {
  id: string;
  userId: string;
  projectId: string;
  payPeriodId: string;
  regularHours: number;
  regularEarnings: number;
  bonusEarnings: number;
  totalEarnings: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectFinancialSummary {
  id: string;
  projectId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  totalBudget: number;
  totalSpent: number;
  totalBonusesDistributed: number;
  memberSummaries: {
    userId: string;
    hoursWorked: number;
    regularEarnings: number;
    bonusEarnings: number;
    totalEarnings: number;
  }[];
  createdAt: string;
  updatedAt: string;
}

export interface UserFinancialSummary {
  id: string;
  userId: string;
  period: {
    startDate: string;
    endDate: string;
  };
  projectEarnings: {
    projectId: string;
    hoursWorked: number;
    regularEarnings: number;
    bonusEarnings: number;
    totalEarnings: number;
  }[];
  totalHoursWorked: number;
  totalRegularEarnings: number;
  totalBonusEarnings: number;
  totalEarnings: number;
  createdAt: string;
  updatedAt: string;
}

export interface ActiveTimer {
  id: string;
  userId: string;
  projectId: string;
  description: string;
  startedAt: string;
  updatedAt: string;
}

// KV Schema types
export type KvActiveTimer = ActiveTimer; 