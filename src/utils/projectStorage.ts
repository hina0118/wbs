import { invoke } from "@tauri-apps/api/core";
import { ProjectsManifest } from "../types/project";

/** プロジェクト一覧とアクティブIDを取得する（未移行なら自動で移行される）。 */
export async function listProjects(): Promise<ProjectsManifest> {
  return invoke<ProjectsManifest>("list_projects");
}

/** 新規プロジェクトを作成する。 */
export async function createProject(name: string): Promise<ProjectsManifest> {
  const id = crypto.randomUUID();
  return invoke<ProjectsManifest>("create_project", { id, name });
}

/** プロジェクト名を変更する。 */
export async function renameProject(id: string, name: string): Promise<ProjectsManifest> {
  return invoke<ProjectsManifest>("rename_project", { id, name });
}

/** プロジェクトを削除する（最後の1件は削除できない）。 */
export async function deleteProject(id: string): Promise<ProjectsManifest> {
  return invoke<ProjectsManifest>("delete_project", { id });
}

/** アクティブなプロジェクトを切り替える。 */
export async function setActiveProject(id: string): Promise<void> {
  await invoke("set_active_project", { id });
}

/**
 * 他メンバーから受け取った tasks.json をファイル選択ダイアログで選ばせ、
 * 新規プロジェクトとしてインポートする。ダイアログでキャンセルした場合は null を返す。
 */
export async function importProject(name: string): Promise<ProjectsManifest | null> {
  const id = crypto.randomUUID();
  return invoke<ProjectsManifest | null>("import_project", { id, name });
}

/** 指定したプロジェクトの tasks.json（memo 含む）を JSON 文字列で取得する。アクティブでなくてもよい。 */
export async function exportProjectTasksJson(projectId: string): Promise<string> {
  const buf = await invoke<ArrayBuffer>("export_project_tasks", { projectId });
  return new TextDecoder().decode(buf);
}
