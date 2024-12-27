import { serve } from "std/http/server.ts";
import { Status } from "std/http/http_status.ts";
import { createResponse } from "./utils/response.ts";
import { authHandlers } from "./handlers/auth.ts";
import { projectHandlers } from "./handlers/projects.ts";
import { timerHandlers } from "./handlers/timers.ts";
import { financialHandlers } from "./handlers/financials.ts";
import { timeEntryHandlers } from "./handlers/timeEntries.ts";
import { budgetHandlers } from "./handlers/budget.ts";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

// Router function to handle all requests
export async function router(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  console.log(`${method} ${path}`);

  // Handle preflight requests
  if (method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // Add CORS headers to all responses
  const headers = {
    "Content-Type": "application/json",
    ...corsHeaders,
  };

  try {
    // Remove /api prefix from path for routing
    const apiPath = path.replace(/^\/api/, "");

    // Auth routes
    if (apiPath === "/auth/register" && method === "POST") {
      const response = await authHandlers.register(req);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath === "/auth/login" && method === "POST") {
      const response = await authHandlers.login(req);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath === "/auth/logout" && method === "POST") {
      const response = await authHandlers.logout(req);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }

    // Project routes
    if (apiPath === "/projects" && method === "POST") {
      const response = await projectHandlers.createProject(req);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath.match(/^\/projects\/[\w-]+$/) && method === "GET") {
      const projectId = apiPath.split("/")[2];
      const response = await projectHandlers.getProject(req, projectId);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath.match(/^\/projects\/[\w-]+$/) && method === "PUT") {
      const projectId = apiPath.split("/")[2];
      const response = await projectHandlers.updateProject(req, projectId);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/members$/) && method === "GET") {
      const projectId = apiPath.split("/")[2];
      const response = await projectHandlers.getMembers(req, projectId);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/invite$/) && method === "POST") {
      const projectId = apiPath.split("/")[2];
      const response = await projectHandlers.inviteMember(req, projectId);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath.match(/^\/invitations\/[\w-]+\/respond$/) && method === "POST") {
      const invitationId = apiPath.split("/")[2];
      const response = await projectHandlers.respondToInvitation(req, invitationId);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }

    // Timer routes
    if (apiPath === "/timers/start" && method === "POST") {
      const response = await timerHandlers.startTimer(req);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath === "/timers/stop" && method === "POST") {
      const response = await timerHandlers.stopTimer(req);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath === "/timers/active" && method === "GET") {
      const response = await timerHandlers.getActiveTimer(req);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/timers$/) && method === "GET") {
      const projectId = apiPath.split("/")[2];
      const response = await timerHandlers.getProjectTimers(req, projectId);
      return new Response(response.body, { 
        status: response.status,
        headers: { ...response.headers, ...headers } 
      });
    }

    // Time entry routes
    if (apiPath === "/time-entries" && method === "POST") {
      const response = await timeEntryHandlers.createTimeEntry(req);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath === "/time-entries" && method === "GET") {
      const response = await timeEntryHandlers.getTimeEntries(req);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/time-entries\/[\w-]+$/) && method === "GET") {
      const entryId = apiPath.split("/")[2];
      const response = await timeEntryHandlers.getTimeEntry(req, entryId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/time-entries\/[\w-]+\/complete$/) && method === "POST") {
      const entryId = apiPath.split("/")[2];
      const response = await timeEntryHandlers.completeTimeEntry(req, entryId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }

    // Budget routes
    if (apiPath.match(/^\/projects\/[\w-]+\/budget\/transactions$/) && method === "GET") {
      const projectId = apiPath.split("/")[2];
      const response = await budgetHandlers.getBudgetTransactions(req, projectId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/budget$/) && method === "PUT") {
      const projectId = apiPath.split("/")[2];
      const response = await budgetHandlers.updateBudget(req, projectId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/profit-shares$/) && method === "POST") {
      const projectId = apiPath.split("/")[2];
      const response = await budgetHandlers.createProfitShare(req, projectId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/profit-shares$/) && method === "GET") {
      const projectId = apiPath.split("/")[2];
      const response = await budgetHandlers.getProfitShares(req, projectId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }

    // Financial routes
    if (apiPath === "/pay-periods" && method === "POST") {
      const response = await financialHandlers.createPayPeriod(req);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath === "/pay-periods" && method === "GET") {
      const response = await financialHandlers.getPayPeriods(req);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/users\/[\w-]+\/financials$/) && method === "GET") {
      const userId = apiPath.split("/")[2];
      const response = await financialHandlers.getUserFinancials(req, userId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/financials$/) && method === "GET") {
      const projectId = apiPath.split("/")[2];
      const response = await financialHandlers.getProjectFinancials(req, projectId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }
    if (apiPath.match(/^\/projects\/[\w-]+\/distribute-profits$/) && method === "POST") {
      const projectId = apiPath.split("/")[2];
      const response = await financialHandlers.distributeProjectProfits(req, projectId);
      return new Response(response.body, { ...response, headers: { ...response.headers, ...headers } });
    }

    // Not found
    return new Response(
      JSON.stringify(createResponse(null, "Not found")),
      { status: Status.NotFound, headers }
    );
  } catch (error: unknown) {
    console.error("Router error:", error);
    const errorMessage = error instanceof Error ? error.message : "Internal server error";
    return new Response(
      JSON.stringify(createResponse(null, errorMessage)),
      { status: Status.InternalServerError, headers }
    );
  }
} 