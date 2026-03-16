/**
 * タスク操作の共有ヘルパー関数
 * GanttChart / KanbanBoard / SearchView / TaskEditModal で共通利用
 */
import { Task } from "../types/task";

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
  const siblings = tasks.filter((t) => t.parentId === task.parentId);
  const newStart = siblings.reduce((m, t) => (t.startDate < m ? t.startDate : m), siblings[0].startDate);
  const newEnd   = siblings.reduce((m, t) => (t.endDate   > m ? t.endDate   : m), siblings[0].endDate);
  const updated  = tasks.map((t) => t.id === task.parentId ? { ...t, startDate: newStart, endDate: newEnd } : t);
  return propagateDates(task.parentId, updated);
}

export function getAllDescendantIds(taskId: string, tasks: Task[]): string[] {
  const children = tasks.filter((t) => t.parentId === taskId);
  return [taskId, ...children.flatMap((c) => getAllDescendantIds(c.id, tasks))];
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

export type SignalStatus = "red" | "yellow" | "green" | "none";

export function getSignalStatus(taskId: string, tasks: Task[]): SignalStatus {
  const effectiveProgress = computeProgress(taskId, tasks);
  if (effectiveProgress === 100) return "none";
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return "none";
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  if (task.endDate < today) return "red";
  if (task.startDate < today && effectiveProgress === 0) return "yellow";
  return "green";
}
