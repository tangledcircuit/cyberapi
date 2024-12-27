/// <reference lib="deno.unstable" />

import { serve } from "std/http/server.ts";
import { Status } from "std/http/http_status.ts";
import {
  createUser,
  getUserByEmail,
  getUserById,
  createProject,
  createTimeEntry,
  getTimeEntriesByUser,
  createAuthToken,
  getAuthToken,
  deleteAuthToken,
  createPayPeriod,
  getPayPeriods,
  getUserFinancialSummaries,
  getUserEarnings,
  getProjectFinancialSummaries,
  getProjectEarnings,
  createEarnings,
  createUserFinancialSummary,
  createProjectFinancialSummary,
} from "./db.ts";
import {
  User,
  Project,
  TimeEntry,
  AuthToken,
  ProjectStatus,
  ProjectMember,
  ProjectInvitation,
  BudgetTransaction,
  ProfitShare,
  ProjectRole,
  PayPeriod,
  Earnings,
  ProjectFinancialSummary,
  UserFinancialSummary,
} from "./types.ts";
import { crypto } from "std/crypto/mod.ts";
import {
  createKey,
  getProjectMember,
  getProjectMembers,
  getProjectById,
  getBudgetTransactions,
  createProjectInvitation,
  updateProjectInvitation,
  getProjectInvitation,
  addProjectMember,
  createProfitShare,
  getProfitShares,
  updateProjectBudget,
} from "./db.ts";
import { kv } from "./db.ts";

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
    const hashedPassword = await hashPassword(password);
    
    if (!user || user.passwordHash !== hashedPassword) {
      return new Response(
        JSON.stringify(createResponse(null, "Invalid credentials")),
        { status: Status.Unauthorized }
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
    
    const existingUser = await getUserByEmail(userData.email);
    if (existingUser) {
      return new Response(
        JSON.stringify(createResponse(null, "Email already exists")),
        { status: Status.BadRequest }
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
      ownerId: user.id,
      status: ProjectStatus.PLANNED,
      remainingBudget: projectData.budget,
      bonusPool: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
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
      costImpact: 0, // Will be calculated in createTimeEntry
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      date: new Date(entryData.date).toISOString(),
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

// Project collaboration endpoints
async function handleInviteToProject(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const { projectId, email, role, hourlyRate } = await req.json();
    
    // Check if user is project owner
    const member = await getProjectMember(projectId, user.id);
    if (!member || member.role !== ProjectRole.OWNER) {
      return new Response(
        JSON.stringify(createResponse(null, "Only project owners can send invitations")),
        { status: Status.Forbidden }
      );
    }
    
    const invitation: ProjectInvitation = {
      id: crypto.randomUUID(),
      projectId,
      inviterId: user.id,
      inviteeEmail: email,
      status: "PENDING",
      role,
      hourlyRate,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
    };
    
    await createProjectInvitation(invitation);
    
    return new Response(
      JSON.stringify(createResponse(invitation)),
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

async function handleRespondToInvitation(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const { invitationId, accept } = await req.json();
    const invitation = await getProjectInvitation(invitationId);
    
    if (!invitation) {
      return new Response(
        JSON.stringify(createResponse(null, "Invitation not found")),
        { status: Status.NotFound }
      );
    }
    
    if (invitation.inviteeEmail !== user.email) {
      return new Response(
        JSON.stringify(createResponse(null, "This invitation is not for you")),
        { status: Status.Forbidden }
      );
    }
    
    if (invitation.status !== "PENDING") {
      return new Response(
        JSON.stringify(createResponse(null, "Invitation has already been responded to")),
        { status: Status.BadRequest }
      );
    }
    
    if (invitation.expiresAt < new Date().toISOString()) {
      return new Response(
        JSON.stringify(createResponse(null, "Invitation has expired")),
        { status: Status.BadRequest }
      );
    }
    
    invitation.status = accept ? "ACCEPTED" : "DECLINED";
    invitation.updatedAt = new Date().toISOString();
    await updateProjectInvitation(invitation);
    
    if (accept) {
      const member: ProjectMember = {
        projectId: invitation.projectId,
        userId: user.id,
        role: invitation.role,
        hourlyRate: invitation.hourlyRate,
        totalHours: 0,
        joinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await addProjectMember(member);
    }
    
    return new Response(
      JSON.stringify(createResponse({ message: `Invitation ${accept ? "accepted" : "declined"}` })),
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

async function handleGetProjectMembers(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return new Response(
        JSON.stringify(createResponse(null, "Project ID is required")),
        { status: Status.BadRequest }
      );
    }
    
    // Check if user is project member
    const member = await getProjectMember(projectId, user.id);
    if (!member) {
      return new Response(
        JSON.stringify(createResponse(null, "You are not a member of this project")),
        { status: Status.Forbidden }
      );
    }
    
    const members = await getProjectMembers(projectId);
    
    return new Response(
      JSON.stringify(createResponse(members)),
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

// Budget tracking endpoints
async function handleGetProjectBudget(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return new Response(
        JSON.stringify(createResponse(null, "Project ID is required")),
        { status: Status.BadRequest }
      );
    }
    
    // Check if user is project member
    const member = await getProjectMember(projectId, user.id);
    if (!member) {
      return new Response(
        JSON.stringify(createResponse(null, "You are not a member of this project")),
        { status: Status.Forbidden }
      );
    }
    
    const project = await getProjectById(projectId);
    if (!project) {
      return new Response(
        JSON.stringify(createResponse(null, "Project not found")),
        { status: Status.NotFound }
      );
    }
    
    const transactions = await getBudgetTransactions(projectId);
    
    return new Response(
      JSON.stringify(createResponse({
        budget: project.budget,
        remainingBudget: project.remainingBudget,
        transactions,
      })),
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

// Profit sharing endpoints
async function handleDistributeProfits(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const { projectId, amount } = await req.json();
    
    // Check if user is project owner
    const member = await getProjectMember(projectId, user.id);
    if (!member || member.role !== ProjectRole.OWNER) {
      return new Response(
        JSON.stringify(createResponse(null, "Only project owners can distribute profits")),
        { status: Status.Forbidden }
      );
    }
    
    const project = await getProjectById(projectId);
    if (!project) {
      return new Response(
        JSON.stringify(createResponse(null, "Project not found")),
        { status: Status.NotFound }
      );
    }
    
    if (!project.profitSharingEnabled) {
      return new Response(
        JSON.stringify(createResponse(null, "Profit sharing is not enabled for this project")),
        { status: Status.BadRequest }
      );
    }
    
    // Get all members and their total hours
    const members = await getProjectMembers(projectId);
    const totalProjectHours = members.reduce((sum: number, m: ProjectMember) => sum + m.totalHours, 0);
    
    // Calculate shares based on time invested
    const shares: ProfitShare[] = members.map((m: ProjectMember) => ({
      id: crypto.randomUUID(),
      projectId,
      userId: m.userId,
      amount: amount * (m.totalHours / totalProjectHours),
      percentage: (m.totalHours / totalProjectHours) * 100,
      status: "PENDING",
      createdAt: new Date().toISOString(),
    }));
    
    // Create profit shares and update financial summaries
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString();
    
    for (const share of shares) {
      await createProfitShare(share);
      
      // Get or create pay period for this month
      let payPeriod = (await getPayPeriods(share.userId, startOfMonth, endOfMonth))[0];
      if (!payPeriod) {
        payPeriod = {
          id: crypto.randomUUID(),
          userId: share.userId,
          startDate: startOfMonth,
          endDate: endOfMonth,
          status: "OPEN",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await createPayPeriod(payPeriod);
      }
      
      // Create earnings record for the bonus
      const earnings: Earnings = {
        id: crypto.randomUUID(),
        userId: share.userId,
        projectId: share.projectId,
        payPeriodId: payPeriod.id,
        regularHours: 0,
        regularEarnings: 0,
        bonusEarnings: share.amount,
        totalEarnings: share.amount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await createEarnings(earnings);
      
      // Update user financial summary
      const userSummary: UserFinancialSummary = {
        id: crypto.randomUUID(),
        userId: share.userId,
        period: {
          startDate: startOfMonth,
          endDate: endOfMonth,
        },
        projectEarnings: [{
          projectId: share.projectId,
          hoursWorked: 0,
          regularEarnings: 0,
          bonusEarnings: share.amount,
          totalEarnings: share.amount,
        }],
        totalHoursWorked: 0,
        totalRegularEarnings: 0,
        totalBonusEarnings: share.amount,
        totalEarnings: share.amount,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      
      await createUserFinancialSummary(userSummary);
    }
    
    // Update project financial summary
    const projectSummary: ProjectFinancialSummary = {
      id: crypto.randomUUID(),
      projectId,
      period: {
        startDate: startOfMonth,
        endDate: endOfMonth,
      },
      totalBudget: project.budget,
      totalSpent: amount,
      totalBonusesDistributed: amount,
      memberSummaries: shares.map(share => ({
        userId: share.userId,
        hoursWorked: 0,
        regularEarnings: 0,
        bonusEarnings: share.amount,
        totalEarnings: share.amount,
      })),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await createProjectFinancialSummary(projectSummary);
    
    // Create budget transaction
    const transaction: BudgetTransaction = {
      id: crypto.randomUUID(),
      projectId,
      userId: user.id,
      amount: -amount,
      type: "BONUS",
      description: "Profit distribution",
      createdAt: new Date().toISOString(),
    };
    
    await kv.set(
      createKey(["budget_transaction", transaction.id]),
      transaction
    );
    await kv.set(
      createKey(["budget_transaction_project", projectId, transaction.id]),
      { transactionId: transaction.id }
    );
    
    // Update project budget
    await updateProjectBudget(projectId, -amount);
    
    return new Response(
      JSON.stringify(createResponse(shares)),
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

async function handleGetProfitShares(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return new Response(
        JSON.stringify(createResponse(null, "Project ID is required")),
        { status: Status.BadRequest }
      );
    }
    
    // Check if user is project member
    const member = await getProjectMember(projectId, user.id);
    if (!member) {
      return new Response(
        JSON.stringify(createResponse(null, "You are not a member of this project")),
        { status: Status.Forbidden }
      );
    }
    
    const shares = await getProfitShares(projectId);
    
    return new Response(
      JSON.stringify(createResponse(shares)),
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

// Financial tracking endpoints
async function handleCreatePayPeriod(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const { startDate, endDate } = await req.json();
    const payPeriod: PayPeriod = {
      id: crypto.randomUUID(),
      userId: user.id,
      startDate,
      endDate,
      status: "OPEN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    
    await createPayPeriod(payPeriod);
    
    return new Response(
      JSON.stringify(createResponse(payPeriod)),
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

async function handleGetPayPeriods(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const url = new URL(req.url);
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    
    const periods = await getPayPeriods(user.id, startDate, endDate);
    
    return new Response(
      JSON.stringify(createResponse(periods)),
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

async function handleGetUserFinancials(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const url = new URL(req.url);
    const targetUserId = url.searchParams.get("userId") || user.id;
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    
    // If requesting another user's financials, check if requester is a project owner
    if (targetUserId !== user.id) {
      const project = await getProjectById(url.searchParams.get("projectId") || "");
      if (!project || project.ownerId !== user.id) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to view this user's financials")),
          { status: Status.Forbidden }
        );
      }
    }
    
    const summaries = await getUserFinancialSummaries(targetUserId, startDate, endDate);
    const earnings = await getUserEarnings(targetUserId, startDate);
    
    return new Response(
      JSON.stringify(createResponse({ summaries, earnings })),
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

async function handleGetProjectFinancials(req: Request): Promise<Response> {
  const user = await authenticate(req);
  if (!user) {
    return new Response(
      JSON.stringify(createResponse(null, "Unauthorized")),
      { status: Status.Unauthorized }
    );
  }
  
  try {
    const url = new URL(req.url);
    const projectId = url.searchParams.get("projectId");
    if (!projectId) {
      return new Response(
        JSON.stringify(createResponse(null, "Project ID is required")),
        { status: Status.BadRequest }
      );
    }
    
    // Check if user is project owner
    const project = await getProjectById(projectId);
    if (!project || project.ownerId !== user.id) {
      return new Response(
        JSON.stringify(createResponse(null, "Not authorized to view project financials")),
        { status: Status.Forbidden }
      );
    }
    
    const startDate = url.searchParams.get("startDate") || "";
    const endDate = url.searchParams.get("endDate") || "";
    
    const summaries = await getProjectFinancialSummaries(projectId, startDate, endDate);
    const earnings = await getProjectEarnings(projectId, startDate);
    
    return new Response(
      JSON.stringify(createResponse({ summaries, earnings })),
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
    case "POST /projects/invite":
      response = await handleInviteToProject(req);
      break;
    case "POST /projects/invitations/respond":
      response = await handleRespondToInvitation(req);
      break;
    case "GET /projects/members":
      response = await handleGetProjectMembers(req);
      break;
    case "GET /projects/budget":
      response = await handleGetProjectBudget(req);
      break;
    case "POST /projects/profits/distribute":
      response = await handleDistributeProfits(req);
      break;
    case "GET /projects/profits":
      response = await handleGetProfitShares(req);
      break;
    case "POST /pay-periods":
      response = await handleCreatePayPeriod(req);
      break;
    case "GET /pay-periods":
      response = await handleGetPayPeriods(req);
      break;
    case "GET /financials/user":
      response = await handleGetUserFinancials(req);
      break;
    case "GET /financials/project":
      response = await handleGetProjectFinancials(req);
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