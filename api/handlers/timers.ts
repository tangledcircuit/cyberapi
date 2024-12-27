import { Status } from "std/http/http_status.ts";
import { createResponse } from "../utils/response.ts";
import { authenticate } from "../middleware/auth.ts";
import { ActiveTimer } from "../../types.ts";
import {
  startTimer,
  stopTimer,
  getActiveTimerByUser,
  getActiveTimersByProject,
  getProjectMember,
} from "../../db.ts";

export const timerHandlers = {
  async startTimer(req: Request): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const { projectId, description } = await req.json();
      
      // Check for existing active timer
      const existingTimer = await getActiveTimerByUser(user.id);
      if (existingTimer) {
        return new Response(
          JSON.stringify(createResponse(null, "User already has an active timer")),
          { status: Status.BadRequest }
        );
      }
      
      // Verify user is project member
      const member = await getProjectMember(projectId, user.id);
      if (!member) {
        return new Response(
          JSON.stringify(createResponse(null, "User is not a member of this project")),
          { status: Status.Forbidden }
        );
      }

      const timer: Partial<ActiveTimer> = {
        userId: user.id,
        projectId,
        description,
      };

      const newTimer = await startTimer(timer);
      return new Response(
        JSON.stringify(createResponse(newTimer)),
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

  async stopTimer(req: Request): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const { timerId } = await req.json();
      const activeTimer = await getActiveTimerByUser(user.id);
      
      if (!activeTimer || activeTimer.id !== timerId) {
        return new Response(
          JSON.stringify(createResponse(null, "Timer not found or not active")),
          { status: Status.NotFound }
        );
      }

      // Verify user owns the timer or is project admin
      const member = await getProjectMember(activeTimer.projectId, user.id);
      if (!member || (member.userId !== activeTimer.userId && member.role !== "ADMIN")) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to stop this timer")),
          { status: Status.Forbidden }
        );
      }

      const timeEntry = await stopTimer(activeTimer);
      return new Response(
        JSON.stringify(createResponse(timeEntry)),
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

  async getActiveTimer(req: Request): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const timer = await getActiveTimerByUser(user.id);
      return new Response(
        JSON.stringify(createResponse(timer)),
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

  async getProjectTimers(req: Request, projectId: string): Promise<Response> {
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
          JSON.stringify(createResponse(null, "User is not a member of this project")),
          { status: Status.Forbidden }
        );
      }

      const timers = await getActiveTimersByProject(projectId);
      return new Response(
        JSON.stringify(createResponse(timers)),
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
}; 