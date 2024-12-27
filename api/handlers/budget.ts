import { Status } from "std/http/http_status.ts";
import { createResponse } from "../utils/response.ts";
import { authenticate } from "../middleware/auth.ts";
import { BudgetTransaction as _BudgetTransaction, ProfitShare as _ProfitShare } from "../../types.ts";
import {
  getBudgetTransactions,
  createProfitShare,
  getProfitShares,
  updateProjectBudget,
  getProjectMember,
  getProjectById,
} from "../../db.ts";

export const budgetHandlers = {
  async getBudgetTransactions(req: Request, projectId: string): Promise<Response> {
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
          JSON.stringify(createResponse(null, "Not authorized to view budget transactions")),
          { status: Status.Forbidden }
        );
      }

      const transactions = await getBudgetTransactions(projectId);
      return new Response(
        JSON.stringify(createResponse(transactions)),
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

  async updateBudget(req: Request, projectId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      // Verify user is project owner or admin
      const member = await getProjectMember(projectId, user.id);
      if (!member || (member.role !== "OWNER" && member.role !== "ADMIN")) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to update budget")),
          { status: Status.Forbidden }
        );
      }

      const { amount } = await req.json();
      await updateProjectBudget(projectId, amount);

      return new Response(
        JSON.stringify(createResponse({ message: "Budget updated successfully" })),
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

  async createProfitShare(req: Request, projectId: string): Promise<Response> {
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
          JSON.stringify(createResponse(null, "Only project owner can create profit shares")),
          { status: Status.Forbidden }
        );
      }

      const profitShareData = await req.json();
      const profitShare = await createProfitShare({
        ...profitShareData,
        projectId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      return new Response(
        JSON.stringify(createResponse(profitShare)),
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

  async getProfitShares(req: Request, projectId: string): Promise<Response> {
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
          JSON.stringify(createResponse(null, "Not authorized to view profit shares")),
          { status: Status.Forbidden }
        );
      }

      const profitShares = await getProfitShares(projectId);
      return new Response(
        JSON.stringify(createResponse(profitShares)),
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