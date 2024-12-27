import { Status } from "std/http/http_status.ts";
import { createResponse } from "../utils/response.ts";
import { authenticate } from "../middleware/auth.ts";
import { TimeEntry } from "../../types.ts";
import {
  createTimeEntry,
  getTimeEntriesByUser,
  getTimeEntryById,
  getProjectMember,
  completeTimeEntry,
} from "../../db.ts";
import { crypto } from "std/crypto/mod.ts";

export const timeEntryHandlers = {
  async createTimeEntry(req: Request): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }
    
    try {
      const entryData = await req.json();
      
      // Verify user is project member
      const member = await getProjectMember(entryData.projectId, user.id);
      if (!member) {
        return new Response(
          JSON.stringify(createResponse(null, "User is not a member of this project")),
          { status: Status.Forbidden }
        );
      }

      const timeEntry: TimeEntry = {
        ...entryData,
        id: crypto.randomUUID(),
        userId: user.id,
        costImpact: entryData.hours * member.hourlyRate,
        isActive: false,
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
  },

  async getTimeEntries(req: Request): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }
    
    try {
      const url = new URL(req.url);
      const startDate = url.searchParams.get("startDate");
      const endDate = url.searchParams.get("endDate");
      
      if (!startDate || !endDate) {
        return new Response(
          JSON.stringify(createResponse(null, "Start date and end date are required")),
          { status: Status.BadRequest }
        );
      }

      const timeEntries = await getTimeEntriesByUser(
        user.id,
        new Date(startDate),
        new Date(endDate)
      );
      
      return new Response(
        JSON.stringify(createResponse(timeEntries)),
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

  async getTimeEntry(req: Request, entryId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }
    
    try {
      const timeEntry = await getTimeEntryById(entryId);
      if (!timeEntry) {
        return new Response(
          JSON.stringify(createResponse(null, "Time entry not found")),
          { status: Status.NotFound }
        );
      }

      // Verify user owns the entry or is project admin
      const member = await getProjectMember(timeEntry.projectId, user.id);
      if (!member || (timeEntry.userId !== user.id && member.role !== "ADMIN")) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to view this time entry")),
          { status: Status.Forbidden }
        );
      }

      // If entry is active, calculate current stats
      let response = timeEntry;
      if (timeEntry.isActive) {
        const startTime = new Date(timeEntry.date);
        const now = new Date();
        const hours = (now.getTime() - startTime.getTime()) / (1000 * 60 * 60);
        const currentEarnings = hours * member.hourlyRate;

        response = {
          ...timeEntry,
          currentStats: {
            hours,
            earnings: currentEarnings,
          }
        };
      }

      return new Response(
        JSON.stringify(createResponse(response)),
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

  async completeTimeEntry(req: Request, entryId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const timeEntry = await getTimeEntryById(entryId);
      if (!timeEntry) {
        return new Response(
          JSON.stringify(createResponse(null, "Time entry not found")),
          { status: Status.NotFound }
        );
      }

      // Check if user is project owner or time entry owner
      const member = await getProjectMember(timeEntry.projectId, user.id);
      if (!(timeEntry.userId === user.id || (member?.role === "OWNER" || member?.role === "ADMIN"))) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to complete time entries")),
          { status: Status.Forbidden }
        );
      }

      const updatedEntry = await completeTimeEntry(entryId);
      return new Response(
        JSON.stringify(createResponse(updatedEntry)),
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