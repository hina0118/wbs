import { invoke } from "@tauri-apps/api/core";
import { Task } from "../types/task";
import { loadSampleTasks } from "../data/sampleData";
import { toInputDate } from "./taskUtils";

// ── JSON ↔ Task 変換 ──────────────────────────────────────

interface TaskRaw {
  id: string;
  name: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string;   // "YYYY-MM-DD"
  progress: number;
  color?: string;
  parentId?: string;
  assignee?: string;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toTask(raw: TaskRaw): Task {
  return {
    ...raw,
    startDate: parseLocalDate(raw.startDate),
    endDate: parseLocalDate(raw.endDate),
  };
}

function toRaw(task: Task): TaskRaw {
  return { ...task, startDate: toInputDate(task.startDate), endDate: toInputDate(task.endDate) };
}

// ── 読み込み ────────────────────────────────────────────────

/**
 * 起動時のタスク読み込み。
 * アプリデータに保存済みデータがあればそれを使い、
 * なければ public/data/sampleTasks.json のデフォルトデータを返す。
 */
export async function loadTasks(): Promise<Task[]> {
  try {
    const saved = await invoke<string | null>("load_saved_tasks");
    if (saved) {
      const raws: TaskRaw[] = JSON.parse(saved);
      return raws.map(toTask);
    }
  } catch (e) {
    console.warn("保存済みタスクの読み込みに失敗（デフォルトを使用）:", e);
  }
  return loadSampleTasks();
}

// ── 保存 ────────────────────────────────────────────────────

/**
 * タスクをアプリデータディレクトリの tasks.json に保存する。
 * 保存先 (Windows): %APPDATA%\com.wbs.app\tasks.json
 */
export async function saveTasks(tasks: Task[]): Promise<void> {
  const json = JSON.stringify(tasks.map(toRaw));
  await invoke("save_tasks", { json });
}
