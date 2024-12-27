// User related types
export interface User {
  id: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  hourlyRate: number;
  createdAt: Date;
  updatedAt: Date;
}

// Project related types
export interface Project {
  id: string;
  name: string;
  description: string;
  budget: number;
  status: ProjectStatus;
  clientId: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum ProjectStatus {
  PLANNED = "PLANNED",
  IN_PROGRESS = "IN_PROGRESS",
  ON_HOLD = "ON_HOLD",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED"
}

// Time tracking related types
export interface TimeEntry {
  id: string;
  projectId: string;
  userId: string;
  description: string;
  hours: number;
  date: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Authentication related types
export interface AuthToken {
  token: string;
  userId: string;
  expiresAt: Date;
  createdAt: Date;
}

// KV Schema types
export type KvUser = {
  prefix: "user";
  id: string;
};

export type KvProject = {
  prefix: "project";
  id: string;
};

export type KvTimeEntry = {
  prefix: "time";
  projectId: string;
  userId: string;
  id: string;
};

export type KvAuthToken = {
  prefix: "auth";
  userId: string;
  token: string;
};

// Index types for querying
export type KvUserEmailIndex = {
  prefix: "user_email";
  email: string;
};

export type KvProjectClientIndex = {
  prefix: "project_client";
  clientId: string;
  projectId: string;
};

export type KvTimeEntryUserIndex = {
  prefix: "time_user";
  userId: string;
  date: string;
  id: string;
};

export type KvTimeEntryProjectIndex = {
  prefix: "time_project";
  projectId: string;
  date: string;
  id: string;
}; 