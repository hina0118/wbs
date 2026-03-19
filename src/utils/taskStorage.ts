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
  subMembers?: string[];
  progressCount?: { done: number; total: number };
  order?: number;
  isFloating?: boolean;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toTask(raw: TaskRaw): Task {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    ...raw,
    startDate: raw.isFloating ? today : parseLocalDate(raw.startDate),
    endDate:   raw.isFloating ? today : parseLocalDate(raw.endDate),
  };
}

function toRaw(task: Task): TaskRaw {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    ...task,
    startDate: task.isFloating ? toInputDate(today) : toInputDate(task.startDate),
    endDate:   task.isFloating ? toInputDate(today) : toInputDate(task.endDate),
  };
}

// ── 読み込み ────────────────────────────────────────────────

/** order未設定のタスクに兄弟内インデックスを自動付与する */
function migrateOrder(tasks: Task[]): Task[] {
  const siblingCount = new Map<string | undefined, number>();
  return tasks.map((task) => {
    if (task.order !== undefined) return task;
    const key = task.parentId;
    const idx = siblingCount.get(key) ?? 0;
    siblingCount.set(key, idx + 1);
    return { ...task, order: idx };
  });
}

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
      return migrateOrder(raws.map(toTask));
    }
  } catch (e) {
    console.warn("保存済みタスクの読み込みに失敗（デフォルトを使用）:", e);
  }
  return migrateOrder(await loadSampleTasks());
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
