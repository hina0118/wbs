export interface ProjectMeta {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectsManifest {
  projects: ProjectMeta[];
  activeProjectId: string;
}
