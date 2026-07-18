import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  setActiveProject,
} from "../utils/projectStorage";
import type { ProjectsManifest } from "../types/project";

const mockInvoke = vi.mocked(invoke);

const manifest: ProjectsManifest = {
  projects: [{ id: "default", name: "メインプロジェクト", createdAt: "t0", updatedAt: "t0" }],
  activeProjectId: "default",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("listProjects", () => {
  it("list_projects を呼び出しマニフェストを返す", async () => {
    mockInvoke.mockResolvedValueOnce(manifest);
    const result = await listProjects();
    expect(mockInvoke).toHaveBeenCalledWith("list_projects");
    expect(result).toEqual(manifest);
  });
});

describe("createProject", () => {
  it("uuid を生成して create_project を呼び出す", async () => {
    mockInvoke.mockResolvedValueOnce(manifest);
    await createProject("新規プロジェクト");
    const [cmd, args] = mockInvoke.mock.calls[0] as [string, { id: string; name: string }];
    expect(cmd).toBe("create_project");
    expect(args.name).toBe("新規プロジェクト");
    expect(typeof args.id).toBe("string");
    expect(args.id.length).toBeGreaterThan(0);
  });
});

describe("renameProject", () => {
  it("rename_project を id と name 付きで呼び出す", async () => {
    mockInvoke.mockResolvedValueOnce(manifest);
    await renameProject("default", "改名後");
    expect(mockInvoke).toHaveBeenCalledWith("rename_project", { id: "default", name: "改名後" });
  });
});

describe("deleteProject", () => {
  it("delete_project を id 付きで呼び出す", async () => {
    mockInvoke.mockResolvedValueOnce(manifest);
    await deleteProject("default");
    expect(mockInvoke).toHaveBeenCalledWith("delete_project", { id: "default" });
  });
});

describe("setActiveProject", () => {
  it("set_active_project を id 付きで呼び出す", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);
    await setActiveProject("default");
    expect(mockInvoke).toHaveBeenCalledWith("set_active_project", { id: "default" });
  });
});
