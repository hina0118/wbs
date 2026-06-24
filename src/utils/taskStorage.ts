import { invoke } from "@tauri-apps/api/core";
import { Task, ReminderRepeat } from "../types/task";
import { loadSampleTasks } from "../data/sampleData";
import { toInputDate } from "./taskUtils";

// ── JSON ↔ Task 変換 ──────────────────────────────────────

interface TaskRaw {
  id: string;
  name: string;
  startDate: string; // "YYYY-MM-DD"
  endDate: string; // "YYYY-MM-DD"
  progress: number;
  color?: string;
  parentId?: string;
  collapsed?: boolean;
  assignee?: string;
  subMembers?: string[];
  hasMemo?: boolean; // Rust が付与するフラグ（memo の有無）
  progressCount?: { done: number; total: number };
  order?: number;
  isFloating?: boolean;
  archived?: boolean;
  reminder?: { datetime: string; notified: boolean; repeat?: string };
  taskTypeId?: string;
  quantity?: number;
}

function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const VALID_REPEATS = new Set<ReminderRepeat>(["none", "daily", "weekly", "monthly"]);

function toTask(raw: TaskRaw): Task {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reminder = raw.reminder
    ? {
        ...raw.reminder,
        repeat: VALID_REPEATS.has(raw.reminder.repeat as ReminderRepeat)
          ? (raw.reminder.repeat as ReminderRepeat)
          : undefined,
      }
    : undefined;
  return {
    ...raw,
    startDate: raw.isFloating ? today : parseLocalDate(raw.startDate),
    endDate: raw.isFloating ? today : parseLocalDate(raw.endDate),
    reminder,
  };
}

function toRaw(task: Task): TaskRaw {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // memo・hasMemo はサーバー側で管理するためシリアライズから除外
  const { memo: _memo, hasMemo: _hasMemo, ...rest } = task;
  return {
    ...rest,
    startDate: task.isFloating ? toInputDate(today) : toInputDate(task.startDate),
    endDate: task.isFloating ? toInputDate(today) : toInputDate(task.endDate),
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

/** 指定ミリ秒でリジェクトする Promise を返す */
function rejectAfter(ms: number, message: string): Promise<never> {
  return new Promise((_, reject) => setTimeout(() => reject(new Error(message)), ms));
}

const LOAD_TIMEOUT_MS = 15_000;

/**
 * 起動時のタスク読み込み。
 * memo フィールドを除いたサマリーを取得し、AppState にフルデータを保持させる。
 * LOAD_TIMEOUT_MS 以内に完了しない場合はタイムアウトエラーとしてフォールバック。
 * ファイルがなければ public/data/sampleTasks.json のデフォルトデータを返す。
 */
export async function loadTasks(onFallback?: (reason: string) => void): Promise<Task[]> {
  try {
    const buf = await Promise.race([
      invoke<ArrayBuffer>("load_tasks_without_memo"),
      rejectAfter(
        LOAD_TIMEOUT_MS,
        `タスク読み込みがタイムアウトしました（${LOAD_TIMEOUT_MS / 1000}秒）`,
      ),
    ]);
    const text = new TextDecoder().decode(buf);
    if (text) {
      const raws: TaskRaw[] = JSON.parse(text);
      return migrateOrder(raws.map(toTask));
    }
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn("保存済みタスクの読み込みに失敗（デフォルトを使用）:", reason);
    onFallback?.(reason);
  }
  return migrateOrder(await loadSampleTasks());
}

// ── メモの個別取得・保存 ─────────────────────────────────

/** 特定タスクの memo を Tauri から取得する（NoteView 選択時に呼ぶ） */
export async function getTaskMemo(id: string): Promise<string> {
  const memo = await invoke<string | null>("get_task_memo", { id });
  return memo ?? "";
}

/** 特定タスクの memo を Tauri に保存する */
export async function saveTaskMemo(id: string, memo: string): Promise<void> {
  await invoke("save_task_memo", { id, memo });
}

// ── 保存 ────────────────────────────────────────────────────

/**
 * タスクをアプリデータディレクトリの tasks.json に保存する。
 * memo フィールドは Rust 側の AppState から自動マージされる。
 * 保存先 (Windows): %APPDATA%\com.wbs.app\tasks.json
 */
export async function saveTasks(tasks: Task[]): Promise<void> {
  const json = JSON.stringify(tasks.map(toRaw));
  await invoke("save_tasks", { json });
}

// ── エクスポート ─────────────────────────────────────────

/**
 * memo を含む全タスクデータを JSON 文字列で返す（設定画面のエクスポート用）。
 */
export async function exportTasksJson(): Promise<string> {
  const buf = await invoke<ArrayBuffer>("get_all_tasks_json");
  return new TextDecoder().decode(buf);
}
