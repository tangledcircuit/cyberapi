import { User, Project, ProjectRole, AuthToken, ProjectMember, PayPeriod, UserFinancialSummary, ProjectFinancialSummary, Earnings, TimeEntry } from "../../types.ts";

export class MockDb {
  private mockUser: User;
  private mockProject: Project;
  private mockAuthToken: AuthToken;
  private mockProjectMember: ProjectMember;
  private mockProjectMembers: Map<string, ProjectMember[]>;

  constructor(mockUser: User, mockProject: Project) {
    this.mockUser = mockUser;
    this.mockProject = mockProject;
    this.mockAuthToken = {
      token: "test-token",
      userId: mockUser.id,
      expiresAt: new Date(Date.now() + 3600000).toISOString(), // 1 hour from now
      createdAt: new Date().toISOString(),
    };
    this.mockProjectMember = {
      projectId: mockProject.id,
      userId: mockUser.id,
      role: ProjectRole.OWNER,
      hourlyRate: mockUser.hourlyRate,
      totalHours: 0,
      joinedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Initialize project members map
    this.mockProjectMembers = new Map();
    this.mockProjectMembers.set(mockProject.id, [
      this.mockProjectMember,
      {
        projectId: mockProject.id,
        userId: "project-member-id",
        role: ProjectRole.MEMBER,
        hourlyRate: 75,
        totalHours: 0,
        joinedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    ]);
  }

  getAuthToken(userId: string, token: string): Promise<AuthToken | null> {
    if (userId === this.mockUser.id && token === "test-token") {
      return Promise.resolve(this.mockAuthToken);
    }
    return Promise.resolve(null);
  }

  getUserById(userId: string): Promise<User | null> {
    if (userId === this.mockUser.id) {
      return Promise.resolve(this.mockUser);
    }
    return Promise.resolve(null);
  }

  getProjectMember(projectId: string, userId: string): Promise<ProjectMember | null> {
    const members = this.mockProjectMembers.get(projectId);
    if (!members) return Promise.resolve(null);
    return Promise.resolve(members.find(m => m.userId === userId) || null);
  }

  getProjectById(projectId: string): Promise<Project | null> {
    if (projectId === this.mockProject.id) {
      return Promise.resolve(this.mockProject);
    }
    return Promise.resolve(null);
  }

  // Returns a project if the two users share any project
  getSharedProject(userId1: string, userId2: string): Promise<Project | null> {
    // Check if both users are members of mockProject
    const members = this.mockProjectMembers.get(this.mockProject.id) || [];
    const user1IsMember = members.some(m => m.userId === userId1);
    const user2IsMember = members.some(m => m.userId === userId2);

    if (user1IsMember && user2IsMember) {
      return Promise.resolve(this.mockProject);
    }
    return Promise.resolve(null);
  }

  createPayPeriod(data: Partial<PayPeriod>): Promise<PayPeriod> {
    return Promise.resolve({
      id: crypto.randomUUID(),
      userId: this.mockUser.id,
      startDate: data.startDate || "",
      endDate: data.endDate || "",
      status: "OPEN",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  getPayPeriods(_userId: string, _startDate: string, _endDate: string): Promise<PayPeriod[]> {
    return Promise.resolve([]);
  }

  getUserFinancialSummaries(_userId: string, _startDate: string, _endDate: string): Promise<UserFinancialSummary[]> {
    return Promise.resolve([]);
  }

  getUserEarnings(_userId: string, _payPeriodId: string): Promise<Earnings[]> {
    return Promise.resolve([]);
  }

  getProjectFinancialSummaries(_projectId: string, _startDate: string, _endDate: string): Promise<ProjectFinancialSummary[]> {
    return Promise.resolve([]);
  }

  getProjectEarnings(_projectId: string, _payPeriodId: string): Promise<Earnings[]> {
    return Promise.resolve([]);
  }

  distributeProjectProfits(_projectId: string): Promise<{
    success: boolean;
    profitsDistributed: number;
    memberShares: Array<{
      userId: string;
      amount: number;
    }>;
  }> {
    return Promise.resolve({
      success: true,
      profitsDistributed: 1000,
      memberShares: [
        {
          userId: this.mockUser.id,
          amount: 1000,
        },
      ],
    });
  }

  distributeProjectProfitsMultiMember(projectId: string): Promise<{
    success: boolean;
    profitsDistributed: number;
    memberShares: Array<{
      userId: string;
      amount: number;
    }>;
  }> {
    return Promise.resolve({
      success: true,
      profitsDistributed: 2000,
      memberShares: [
        {
          userId: this.mockUser.id,
          amount: 1200, // 60% for owner
        },
        {
          userId: "project-member-id",
          amount: 800, // 40% for member
        },
      ],
    });
  }

  closePayPeriod(payPeriodId: string): Promise<PayPeriod> {
    return Promise.resolve({
      id: payPeriodId,
      userId: this.mockUser.id,
      startDate: "2024-01-01",
      endDate: "2024-01-15",
      status: "CLOSED",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  createTimeEntry(data: {
    projectId: string;
    userId: string;
    description: string;
    hours: number;
    date: string;
    costImpact: number;
  }): Promise<TimeEntry> {
    return Promise.resolve({
      id: crypto.randomUUID(),
      projectId: data.projectId,
      userId: data.userId,
      description: data.description,
      hours: data.hours,
      costImpact: data.costImpact,
      date: data.date,
      isActive: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }
} 