export type ProjectLocation = {
  label?: string;
  address: string;
  city?: string;
  postalCode?: string;
  country?: string;
  lat?: number;
  lng?: number;
  notes?: string;
};

export type ProjectContact = {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  notes?: string;
};

export type ProjectStatus = "draft" | "in_progress" | "sent" | "approved" | "archived";
export type ProjectPhaseStatus = "draft" | "sent" | "approved" | "rejected" | "archived";

export type ProjectPhaseMetadata = {
  phaseId: string;
  phaseName: string;
  phaseNumber: number;
  status: ProjectPhaseStatus;
  createdAt: string;
  updatedAt: string;
};

export type ProjectMetadata = {
  version: 1;
  clientId: string;
  projectId: string;
  name: string;
  location: ProjectLocation;
  contact: ProjectContact;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
  createdByUserId: string;
  updatedByUserId: string;
  activePhaseId: string;
  phases: string[];
  phaseDetails: ProjectPhaseMetadata[];
  importedFrom?: {
    projectId: string;
    importedAt: string;
  };
};

export type CreateProjectInput = {
  name: string;
  location: ProjectLocation;
  contact: ProjectContact;
  notes?: string;
};
