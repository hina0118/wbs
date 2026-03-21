/**
 * タスク操作の共有ヘルパー関数
 * GanttChart / KanbanBoard / SearchView / TaskEditModal で共通利用
 */
import { Task } from "../types/task";

// ── 日付ユーティリティ ──────────────────────────────────────

/** 指定日数を加算した新しい Date を返す */
export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** "M/D" 形式（ガントチャート・カンバン用短縮表示） */
export function formatDateShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** "YYYY/M/D" 形式（検索・アーカイブ・分析ビュー用） */
export function formatDateYMD(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

// ── シグナル閾値 ────────────────────────────────────────────

/** 計画進捗との差がこの値（%）以上なら「進捗遅れ」と判定する */
const BEHIND_THRESHOLD = 10;

export function isLeaf(taskId: string, tasks: Task[]): boolean {
  return !tasks.some((t) => t.parentId === taskId);
}

export function computeProgress(taskId: string, tasks: Task[]): number {
  const children = tasks.filter((t) => t.parentId === taskId);
  if (children.length === 0) return tasks.find((t) => t.id === taskId)?.progress ?? 0;
  const avg = children.reduce((sum, c) => sum + computeProgress(c.id, tasks), 0) / children.length;
  return Math.round(avg);
}

export function propagateDates(changedId: string, tasks: Task[]): Task[] {
  const task = tasks.find((t) => t.id === changedId);
  if (!task?.parentId) return tasks;
  // isFloating タスクの日付は伝播しない
  const scheduledSiblings = tasks.filter((t) => t.parentId === task.parentId && !t.isFloating);
  if (scheduledSiblings.length === 0) return tasks;
  const newStart = scheduledSiblings.reduce((m, t) => (t.startDate < m ? t.startDate : m), scheduledSiblings[0].startDate);
  const newEnd   = scheduledSiblings.reduce((m, t) => (t.endDate   > m ? t.endDate   : m), scheduledSiblings[0].endDate);
  const updated  = tasks.map((t) => t.id === task.parentId ? { ...t, startDate: newStart, endDate: newEnd } : t);
  return propagateDates(task.parentId, updated);
}

export function getAllDescendantIds(taskId: string, tasks: Task[]): string[] {
  const children = tasks.filter((t) => t.parentId === taskId);
  return [taskId, ...children.flatMap((c) => getAllDescendantIds(c.id, tasks))];
}

/**
 * タスク配列をツリー構造に従って DFS 順に並び替える。
 * 兄弟間の相対順序は元の配列の出現順を維持する。
 * タスクの追加・編集・削除後に呼ぶことで、常に親子関係が正しい順番になる。
 */
export function sortByTree(tasks: Task[]): Task[] {
  const result: Task[] = [];
  const childrenMap = new Map<string | undefined, Task[]>();

  for (const task of tasks) {
    const key = task.parentId;
    if (!childrenMap.has(key)) childrenMap.set(key, []);
    childrenMap.get(key)!.push(task);
  }

  function dfs(parentId: string | undefined) {
    const siblings = [...(childrenMap.get(parentId) ?? [])].sort(
      (a, b) => (a.order ?? 0) - (b.order ?? 0)
    );
    for (const task of siblings) {
      result.push(task);
      dfs(task.id);
    }
  }
  dfs(undefined);

  return result;
}

/** ルートから対象タスクまでの祖先名（自身を除く） */
export function getAncestorNames(taskId: string, tasks: Task[]): string[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return [];
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return [];
  return [...getAncestorNames(parent.id, tasks), parent.name];
}

export function toInputDate(d: Date): string {
  const y   = d.getFullYear();
  const m   = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/** タスクのコピー用データを生成する（日付・進捗はリセット） */
export function copyTaskFields(
  source: Task,
  overrides: Partial<Task> = {}
): Omit<Task, "id"> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return {
    name: `${source.name} のコピー`,
    startDate: overrides.startDate ?? today,
    endDate: overrides.endDate ?? today,
    progress: 0,
    color: source.color,
    assignee: source.assignee,
    subMembers: source.subMembers ? [...source.subMembers] : undefined,
    memo: source.memo,
    progressCount: source.progressCount
      ? { done: 0, total: source.progressCount.total }
      : undefined,
    isFloating: source.isFloating,
    ...overrides,
  };
}

export type SignalStatus = "red" | "yellow" | "green" | "none";

export function getSignalStatus(taskId: string, tasks: Task[]): SignalStatus {
  const effectiveProgress = computeProgress(taskId, tasks);
  if (effectiveProgress === 100) return "none";
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return "none";
  // isFloating タスクは日付によるシグナル判定をしない
  if (task.isFloating) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (task.endDate < today) return "red";

  // 計画進捗率との比較（開始日〜終了日における本日の位置から期待進捗を算出）
  const startTime = task.startDate.getTime();
  const endTime = task.endDate.getTime();
  const todayTime = today.getTime();
  if (todayTime >= startTime) {
    const totalDuration = endTime - startTime;
    const expectedProgress = totalDuration > 0
      ? Math.min((todayTime - startTime) / totalDuration * 100, 100)
      : 100;
    if (effectiveProgress < expectedProgress - BEHIND_THRESHOLD) return "yellow";
  }

  return "green";
}

/** ルートタスク（parentId なし）とその全子孫を archived:true にする */
export function archiveTask(taskId: string, tasks: Task[]): Task[] {
  const ids = new Set(getAllDescendantIds(taskId, tasks));
  return tasks.map((t) => (ids.has(t.id) ? { ...t, archived: true } : t));
}

/** ルートタスクとその全子孫の archived フラグを解除する */
export function unarchiveTask(taskId: string, tasks: Task[]): Task[] {
  const ids = new Set(getAllDescendantIds(taskId, tasks));
  return tasks.map((t) => (ids.has(t.id) ? { ...t, archived: false } : t));
}
