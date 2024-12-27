import { Status } from "std/http/http_status.ts";
import { createResponse } from "../utils/response.ts";
import { authenticate } from "../middleware/auth.ts";
import {
  createPayPeriod,
  getPayPeriods,
  getUserFinancialSummaries,
  getUserEarnings,
  getProjectFinancialSummaries,
  getProjectEarnings,
  distributeProjectProfits,
  getProjectMember,
  getProjectById,
} from "../../db.ts";

export const financialHandlers = {
  async createPayPeriod(req: Request): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const payPeriodData = await req.json();
      const payPeriod = await createPayPeriod({
        ...payPeriodData,
        userId: user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
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
  },

  async getPayPeriods(req: Request): Promise<Response> {
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
      const payPeriods = await getPayPeriods(user.id, startDate, endDate);
      return new Response(
        JSON.stringify(createResponse(payPeriods)),
        { status: Status.OK }
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return new Response(
        JSON.stringify(createResponse(null, errorMessage)),
        { status: Status.InternalServerError }
      );
    }
  },

  async getUserFinancials(req: Request, userId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    // Only allow users to view their own financials
    if (user.id !== userId) {
      return new Response(
        JSON.stringify(createResponse(null, "Not authorized to view these financials")),
        { status: Status.Forbidden }
      );
    }

    try {
      const url = new URL(req.url);
      const startDate = url.searchParams.get("startDate") || "";
      const endDate = url.searchParams.get("endDate") || "";
      const payPeriodId = url.searchParams.get("payPeriodId") || "";

      const [summaries, earnings] = await Promise.all([
        getUserFinancialSummaries(userId, startDate, endDate),
        getUserEarnings(userId, payPeriodId),
      ]);

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
  },

  async getProjectFinancials(req: Request, projectId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      // Verify user is project member
      const member = await getProjectMember(projectId, user.id);
      if (!member) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to view project financials")),
          { status: Status.Forbidden }
        );
      }

      const url = new URL(req.url);
      const startDate = url.searchParams.get("startDate") || "";
      const endDate = url.searchParams.get("endDate") || "";
      const payPeriodId = url.searchParams.get("payPeriodId") || "";

      const [summaries, earnings] = await Promise.all([
        getProjectFinancialSummaries(projectId, startDate, endDate),
        getProjectEarnings(projectId, payPeriodId),
      ]);

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
  },

  async distributeProjectProfits(req: Request, projectId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      // Verify user is project owner
      const project = await getProjectById(projectId);
      if (!project) {
        return new Response(
          JSON.stringify(createResponse(null, "Project not found")),
          { status: Status.NotFound }
        );
      }

      if (project.ownerId !== user.id) {
        return new Response(
          JSON.stringify(createResponse(null, "Only project owner can distribute profits")),
          { status: Status.Forbidden }
        );
      }

      const result = await distributeProjectProfits(projectId);
      return new Response(
        JSON.stringify(createResponse(result)),
        { status: Status.OK }
      );
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : "Unknown error occurred";
      return new Response(
        JSON.stringify(createResponse(null, errorMessage)),
        { status: Status.InternalServerError }
      );
    }
  },
}; 