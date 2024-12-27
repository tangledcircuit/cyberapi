import { Status } from "std/http/http_status.ts";
import { createResponse } from "../utils/response.ts";
import { authenticate } from "../middleware/auth.ts";
import { Project, ProjectMember, ProjectRole, ProjectInvitation } from "../../types.ts";
import {
  createProject,
  getProjectById,
  updateProject,
  createProjectMember,
  getProjectMember,
  getProjectMembers,
  createProjectInvitation,
  getProjectInvitation,
  updateProjectInvitation,
} from "../../db.ts";
import { crypto } from "std/crypto/mod.ts";

export const projectHandlers = {
  async createProject(req: Request): Promise<Response> {
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
        id: crypto.randomUUID(),
        name: projectData.name,
        description: projectData.description || "",
        budget: projectData.budget || 0,
        remainingBudget: projectData.budget || 0,
        clientId: projectData.clientId,
        ownerId: user.id,
        status: projectData.status || "PLANNED",
        profitSharingEnabled: projectData.profitSharingEnabled || false,
        profitSharingPercentage: projectData.profitSharingPercentage || 0.1,
        bonusPool: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await createProject(project);

      // Create project member entry for owner
      const member: ProjectMember = {
        projectId: project.id,
        userId: user.id,
        role: ProjectRole.OWNER,
        hourlyRate: user.hourlyRate,
        totalHours: 0,
        joinedAt: project.createdAt,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };

      await createProjectMember(member);

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
  },

  async getProject(req: Request, projectId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const member = await getProjectMember(projectId, user.id);
      if (!member) {
        return new Response(
          JSON.stringify(createResponse(null, "User is not a member of this project")),
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

      return new Response(
        JSON.stringify(createResponse(project)),
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

  async updateProject(req: Request, projectId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const member = await getProjectMember(projectId, user.id);
      if (!member || (member.role !== ProjectRole.OWNER && member.role !== ProjectRole.ADMIN)) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to update project")),
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

      const updates = await req.json();
      const updatedProject = {
        ...project,
        ...updates,
        updatedAt: new Date().toISOString(),
      };

      await updateProject(updatedProject);

      return new Response(
        JSON.stringify(createResponse(updatedProject)),
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

  async inviteMember(req: Request, projectId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const member = await getProjectMember(projectId, user.id);
      if (!member || (member.role !== ProjectRole.OWNER && member.role !== ProjectRole.ADMIN)) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to invite members")),
          { status: Status.Forbidden }
        );
      }

      const { email, role, hourlyRate } = await req.json();
      const invitation: ProjectInvitation = {
        id: crypto.randomUUID(),
        projectId,
        inviterId: user.id,
        inviteeEmail: email,
        status: "PENDING",
        role: role || ProjectRole.MEMBER,
        hourlyRate: hourlyRate || 0,
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
  },

  async respondToInvitation(req: Request, invitationId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const invitation = await getProjectInvitation(invitationId);
      if (!invitation) {
        return new Response(
          JSON.stringify(createResponse(null, "Invitation not found")),
          { status: Status.NotFound }
        );
      }

      if (invitation.inviteeEmail !== user.email) {
        return new Response(
          JSON.stringify(createResponse(null, "Not authorized to respond to this invitation")),
          { status: Status.Forbidden }
        );
      }

      const { accept } = await req.json();
      const now = new Date().toISOString();

      if (accept) {
        const member: ProjectMember = {
          projectId: invitation.projectId,
          userId: user.id,
          role: invitation.role,
          hourlyRate: invitation.hourlyRate,
          totalHours: 0,
          joinedAt: now,
          createdAt: now,
          updatedAt: now,
        };

        await createProjectMember(member);
      }

      const updatedInvitation: ProjectInvitation = {
        ...invitation,
        status: accept ? "ACCEPTED" as const : "DECLINED" as const,
        updatedAt: now,
      };

      await updateProjectInvitation(updatedInvitation);

      return new Response(
        JSON.stringify(createResponse(updatedInvitation)),
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

  async getMembers(req: Request, projectId: string): Promise<Response> {
    const user = await authenticate(req);
    if (!user) {
      return new Response(
        JSON.stringify(createResponse(null, "Unauthorized")),
        { status: Status.Unauthorized }
      );
    }

    try {
      const member = await getProjectMember(projectId, user.id);
      if (!member) {
        return new Response(
          JSON.stringify(createResponse(null, "User is not a member of this project")),
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
  },
}; 