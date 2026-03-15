import { useEffect, useRef, useState } from "react";
import { Task } from "../types/task";
import { toHolidayKey } from "../utils/holidays";
import TaskEditModal  from "./TaskEditModal";
import GanttTooltip  from "./GanttTooltip";

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  holidays?: Map<string, string>;
}

const DAY_WIDTH = 28;
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 60;
const LEFT_PANEL_WIDTH = 260;
const ASSIGNEE_COL_WIDTH = 80;
const PROGRESS_COL_WIDTH = 70;
const INDENT_PER_LEVEL = 16;
const HANDLE_WIDTH = 6;

interface DragState {
  taskId: string;
  type: "start" | "end" | "move";
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

interface AddState {
  parentId?: string;
  name: string;
  startDate: string;
  endDate: string;
  color: string;
}

// ── ヘルパー関数 ────────────────────────────────────────────

function getDaysArray(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonth(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function isSunday(d: Date) { return d.getDay() === 0; }
function isSaturday(d: Date) { return d.getDay() === 6; }
function isMonthStart(d: Date) { return d.getDate() === 1; }
function isHoliday(d: Date, holidays: Map<string, string>) { return holidays.has(toHolidayKey(d)); }
function getHolidayName(d: Date, holidays: Map<string, string>) { return holidays.get(toHolidayKey(d)) ?? ""; }

function getDepth(taskId: string, tasks: Task[]): number {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return 0;
  return 1 + getDepth(task.parentId, tasks);
}

function isVisible(task: Task, tasks: Task[], collapsedIds: Set<string>): boolean {
  if (!task.parentId) return true;
  if (collapsedIds.has(task.parentId)) return false;
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return true;
  return isVisible(parent, tasks, collapsedIds);
}

function isLeaf(taskId: string, tasks: Task[]): boolean {
  return !tasks.some((t) => t.parentId === taskId);
}

function computeProgress(taskId: string, tasks: Task[]): number {
  const children = tasks.filter((t) => t.parentId === taskId);
  if (children.length === 0) {
    return tasks.find((t) => t.id === taskId)?.progress ?? 0;
  }
  const avg = children.reduce((sum, c) => sum + computeProgress(c.id, tasks), 0) / children.length;
  return Math.round(avg);
}

function expectedProgress(task: Task, today: Date): number {
  if (today <= task.startDate) return 0;
  if (today >= task.endDate) return 100;
  const total = diffDays(task.startDate, task.endDate);
  const elapsed = diffDays(task.startDate, today);
  return Math.round((elapsed / total) * 100);
}

function propagateDates(changedId: string, tasks: Task[]): Task[] {
  const task = tasks.find((t) => t.id === changedId);
  if (!task?.parentId) return tasks;

  const parentId = task.parentId;
  const siblings = tasks.filter((t) => t.parentId === parentId);
  const newStart = siblings.reduce((m, t) => (t.startDate < m ? t.startDate : m), siblings[0].startDate);
  const newEnd   = siblings.reduce((m, t) => (t.endDate   > m ? t.endDate   : m), siblings[0].endDate);

  const updated = tasks.map((t) =>
    t.id === parentId ? { ...t, startDate: newStart, endDate: newEnd } : t
  );
  return propagateDates(parentId, updated);
}


function barOpacity(depth: number): string {
  const opacities = ["ff", "cc", "99", "77"];
  return opacities[Math.min(depth, opacities.length - 1)];
}

// ── コンポーネント ──────────────────────────────────────────

export default function GanttChart({ tasks, onTasksChange, holidays = new Map() }: Props) {
  const timelineRef   = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());

  // 編集モーダル
  const [editingId, setEditingId] = useState<string | null>(null);

  // 追加モーダル
  const [addState, setAddState] = useState<AddState | null>(null);

  // ドラッグ
  const dragRef    = useRef<DragState | null>(null);
  const didDragRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<{ taskId: string; startDate: Date; endDate: Date } | null>(null);

  // ツールチップ
  const [tooltip, setTooltip] = useState<{ task: Task; progress: number; x: number; y: number } | null>(null);

  // ── タイムライン範囲 ──
  const allDates = tasks.flatMap((t) => [t.startDate, t.endDate]);
  if (dragPreview) allDates.push(dragPreview.startDate, dragPreview.endDate);

  const minDate = allDates.reduce((m, d) => (d < m ? d : m));
  const maxDate = allDates.reduce((m, d) => (d > m ? d : m));
  const rangeStart = addDays(minDate, -1);
  const rangeEnd   = addDays(maxDate,  1);

  const days      = getDaysArray(rangeStart, rangeEnd);
  const totalDays = days.length;

  const monthGroups: { label: string; count: number }[] = [];
  days.forEach((d) => {
    const label = formatMonth(d);
    const last  = monthGroups[monthGroups.length - 1];
    if (!last || last.label !== label) monthGroups.push({ label, count: 1 });
    else last.count++;
  });

  const visibleTasks = tasks.filter((t) => isVisible(t, tasks, collapsedIds));

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = diffDays(rangeStart, today);

  // ── 操作 ──

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function openEdit(task: Task) {
    setEditingId(task.id);
  }

  function openAdd(parentId?: string) {
    const parent = parentId ? tasks.find((t) => t.id === parentId) : undefined;
    const defaultColor = parent?.color ?? "#4A90D9";
    const start = toInputDate(today);
    const end   = toInputDate(addDays(today, 6));
    setAddState({ parentId, name: "", startDate: start, endDate: end, color: defaultColor });
  }

  function confirmAdd() {
    if (!addState || !addState.name.trim()) return;
    const newStart = new Date(addState.startDate);
    const newEnd   = new Date(addState.endDate);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;

    const newTask: Task = {
      id:        genId(),
      name:      addState.name.trim(),
      startDate: newStart,
      endDate:   newEnd,
      progress:  0,
      color:     addState.color,
      parentId:  addState.parentId,
    };

    const appended = [...tasks, newTask];
    const propagated = newTask.parentId ? propagateDates(newTask.id, appended) : appended;
    onTasksChange(propagated);
    setAddState(null);
  }

  // ── スクロール同期 ──

  function handleTimelineScroll() {
    if (leftScrollRef.current && timelineRef.current)
      leftScrollRef.current.scrollTop = timelineRef.current.scrollTop;
  }
  function handleLeftScroll() {
    if (leftScrollRef.current && timelineRef.current)
      timelineRef.current.scrollTop = leftScrollRef.current.scrollTop;
  }

  // ── ドラッグ ──

  function startDrag(e: React.MouseEvent, task: Task, type: DragState["type"]) {
    e.preventDefault();
    e.stopPropagation();
    setTooltip(null);
    dragRef.current = { taskId: task.id, type, startX: e.clientX, originalStart: task.startDate, originalEnd: task.endDate };
    didDragRef.current = false;
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const delta = Math.round((e.clientX - drag.startX) / DAY_WIDTH);
      if (delta !== 0) didDragRef.current = true;

      let newStart = drag.originalStart;
      let newEnd   = drag.originalEnd;

      if (drag.type === "move") {
        newStart = addDays(drag.originalStart, delta);
        newEnd   = addDays(drag.originalEnd,   delta);
      } else if (drag.type === "start") {
        newStart = addDays(drag.originalStart, delta);
        if (newStart >= drag.originalEnd) newStart = addDays(drag.originalEnd, -1);
      } else {
        newEnd = addDays(drag.originalEnd, delta);
        if (newEnd <= drag.originalStart) newEnd = addDays(drag.originalStart, 1);
      }

      setDragPreview({ taskId: drag.taskId, startDate: newStart, endDate: newEnd });
    }

    function onMouseUp() {
      const drag    = dragRef.current;
      const preview = dragPreview;
      dragRef.current = null;

      if (!drag || !preview || !didDragRef.current) {
        setDragPreview(null);
        return;
      }

      const updated = tasks.map((t) =>
        t.id === drag.taskId ? { ...t, startDate: preview.startDate, endDate: preview.endDate } : t
      );
      onTasksChange(propagateDates(drag.taskId, updated));
      setDragPreview(null);
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  }, [tasks, dragPreview, onTasksChange]);

  // ── レンダリング ──────────────────────────────────────────

  return (
    <div className="gantt-wrapper">

      {/* ── 左パネル ── */}
      <div className="gantt-left" style={{ width: LEFT_PANEL_WIDTH + ASSIGNEE_COL_WIDTH + PROGRESS_COL_WIDTH }}>
        <div className="gantt-left-header" style={{ height: HEADER_HEIGHT }}>
          <span className="gantt-col-task">
            タスク名
            <button className="gantt-add-top-btn" onClick={() => openAdd()} title="ルートタスクを追加">＋</button>
          </span>
          <span className="gantt-col-assignee">担当者</span>
          <span className="gantt-col-progress">進捗</span>
        </div>

        <div
          className="gantt-left-body"
          ref={leftScrollRef}
          onScroll={handleLeftScroll}
          style={{ maxHeight: `calc(100vh - ${HEADER_HEIGHT + 80}px)`, overflowY: "auto" }}
        >
          {visibleTasks.map((task) => {
            const depth     = getDepth(task.id, tasks);
            const hasChildren   = tasks.some((t) => t.parentId === task.id);
            const isCollapsed   = collapsedIds.has(task.id);
            const leaf          = isLeaf(task.id, tasks);
            const effectiveProg = computeProgress(task.id, tasks);
            const expected      = expectedProgress(task, today);
            const isBehind      = effectiveProg < expected;

            return (
              <div
                key={task.id}
                className={`gantt-row gantt-row-depth-${Math.min(depth, 3)}${effectiveProg === 100 ? " gantt-row--done" : ""}`}
                style={{ height: ROW_HEIGHT }}
              >
                <span className="gantt-col-task" style={{ paddingLeft: depth * INDENT_PER_LEVEL + 8 }}>
                  {hasChildren ? (
                    <button className="gantt-collapse-btn" onClick={() => toggleCollapse(task.id)}>
                      {isCollapsed ? "▶" : "▼"}
                    </button>
                  ) : (
                    <span className="gantt-leaf-icon">─</span>
                  )}
                  {task.name}
                  <button
                    className="gantt-add-subtask-btn"
                    onClick={(e) => { e.stopPropagation(); openAdd(task.id); }}
                    title="サブタスクを追加"
                  >＋</button>
                </span>

                <span
                  className={`gantt-col-assignee${leaf ? " gantt-col-assignee--leaf" : ""}`}
                  onClick={leaf ? () => openEdit(task) : undefined}
                  title={leaf ? (task.assignee ? `担当: ${task.assignee}` : "クリックで担当者を設定") : undefined}
                >
                  {leaf ? (
                    task.assignee
                      ? <span className="assignee-badge">{task.assignee}</span>
                      : <span className="assignee-empty">未設定</span>
                  ) : (
                    <span className="assignee-empty">─</span>
                  )}
                </span>

                <span className="gantt-col-progress" style={{ cursor: "pointer" }} onClick={() => openEdit(task)} title="クリックで編集">
                  <span
                    className={`progress-badge${isBehind ? " progress-badge--behind" : ""}`}
                    style={{ background: isBehind ? "#e53935" : (task.color || "#4A90D9") }}
                  >
                    {effectiveProg}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 右タイムラインパネル ── */}
      <div className="gantt-timeline-wrapper">
        <div className="gantt-timeline-header" style={{ height: HEADER_HEIGHT, width: totalDays * DAY_WIDTH }}>
          <div className="gantt-month-row">
            {monthGroups.map((m) => (
              <div key={m.label} className="gantt-month-cell" style={{ width: m.count * DAY_WIDTH }}>
                {m.label}
              </div>
            ))}
          </div>
          <div className="gantt-day-row">
            {days.map((d, i) => {
              const holiday     = isHoliday(d, holidays);
              const holidayName = holiday ? getHolidayName(d, holidays) : "";
              return (
                <div
                  key={i}
                  className={[
                    "gantt-day-cell",
                    isSunday(d)   ? "day-sunday"      : "",
                    isSaturday(d) ? "day-saturday"    : "",
                    isMonthStart(d) ? "day-month-start" : "",
                    holiday       ? "day-holiday"     : "",
                  ].join(" ")}
                  style={{ width: DAY_WIDTH }}
                  title={holidayName}
                >
                  {formatDate(d)}
                </div>
              );
            })}
          </div>
        </div>

        <div
          className="gantt-timeline-body"
          ref={timelineRef}
          onScroll={handleTimelineScroll}
          style={{ width: totalDays * DAY_WIDTH, maxHeight: `calc(100vh - ${HEADER_HEIGHT + 80}px)`, overflowY: "auto" }}
        >
          {visibleTasks.map((task) => {
            const depth    = getDepth(task.id, tasks);
            const preview  = dragPreview?.taskId === task.id ? dragPreview : null;
            const barStart = preview ? preview.startDate : task.startDate;
            const barEnd   = preview ? preview.endDate   : task.endDate;

            const barLeft  = diffDays(rangeStart, barStart) * DAY_WIDTH;
            const barWidth = Math.max((diffDays(barStart, barEnd) + 1) * DAY_WIDTH, DAY_WIDTH);
            const ep        = computeProgress(task.id, tasks);
            const done      = ep === 100;
            const baseColor = done ? "#999" : (task.color ?? "#4A90D9");
            const barColor  = `${baseColor}${barOpacity(depth)}`;
            const barHeight = Math.max(14, ROW_HEIGHT - depth * 4 - 18);

            return (
              <div key={task.id} className="gantt-timeline-row" style={{ height: ROW_HEIGHT }}>
                {days.map((d, i) => {
                  const holiday     = isHoliday(d, holidays);
                  const holidayName = holiday ? getHolidayName(d, holidays) : "";
                  return (
                    <div
                      key={i}
                      className={[
                        "gantt-grid-cell",
                        isSunday(d) || isSaturday(d) ? "grid-weekend"    : "",
                        isMonthStart(d)              ? "grid-month-start" : "",
                        holiday                      ? "grid-holiday"     : "",
                      ].join(" ")}
                      style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                      title={holidayName}
                    />
                  );
                })}

                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div className="gantt-today-line" style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }} />
                )}

                <div
                  className="gantt-bar"
                  style={{ left: barLeft, width: barWidth, height: barHeight, background: barColor, cursor: "grab", userSelect: "none" }}
                  onMouseDown={(e) => startDrag(e, task, "move")}
                  onClick={() => { if (!didDragRef.current) openEdit(task); }}
                  onMouseEnter={(e) => { if (!dragRef.current) setTooltip({ task, progress: ep, x: e.clientX, y: e.clientY }); }}
                  onMouseMove={(e)  => { if (!dragRef.current) setTooltip((prev) => prev ? { ...prev, x: e.clientX, y: e.clientY } : null); }}
                  onMouseLeave={() => setTooltip(null)}
                >
                  <div className="gantt-bar-handle gantt-bar-handle--left" style={{ width: HANDLE_WIDTH }} onMouseDown={(e) => startDrag(e, task, "start")} />
                  <div className="gantt-bar-progress" style={{ width: `${ep}%`, background: baseColor, filter: "brightness(0.75)" }} />
                  <span className="gantt-bar-label">{task.name}</span>
                  <div className="gantt-bar-handle gantt-bar-handle--right" style={{ width: HANDLE_WIDTH }} onMouseDown={(e) => startDrag(e, task, "end")} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ── ツールチップ ── */}
      {tooltip && <GanttTooltip {...tooltip} />}

      {/* ── 編集モーダル ── */}
      {editingId !== null && (() => {
        const task = tasks.find((t) => t.id === editingId)!;
        return (
          <TaskEditModal
            task={task}
            tasks={tasks}
            onSave={(updated)   => { onTasksChange(updated); setEditingId(null); }}
            onDelete={(updated) => { onTasksChange(updated); setEditingId(null); }}
            onClose={() => setEditingId(null)}
          />
        );
      })()}

      {/* ── 追加モーダル ── */}
      {addState !== null && (() => {
        const parent = addState.parentId ? tasks.find((t) => t.id === addState.parentId) : undefined;
        return (
          <div className="gantt-modal-overlay" onClick={() => setAddState(null)}>
            <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{parent ? "サブタスクを追加" : "タスクを追加"}</h3>
              {parent && <p className="modal-parent-info">親タスク: {parent.name}</p>}

              <label className="modal-label">タスク名 <span className="modal-required">*</span></label>
              <input
                type="text"
                value={addState.name}
                onChange={(e) => setAddState({ ...addState, name: e.target.value })}
                placeholder="タスク名を入力"
                className="assignee-input"
                autoFocus
                onKeyDown={(e) => { if (e.key === "Enter") confirmAdd(); }}
              />

              <div className="modal-date-row">
                <div className="modal-date-field">
                  <label className="modal-label">開始日</label>
                  <input type="date" value={addState.startDate} max={addState.endDate} onChange={(e) => setAddState({ ...addState, startDate: e.target.value })} className="date-input" />
                </div>
                <div className="modal-date-field">
                  <label className="modal-label">終了日</label>
                  <input type="date" value={addState.endDate} min={addState.startDate} onChange={(e) => setAddState({ ...addState, endDate: e.target.value })} className="date-input" />
                </div>
              </div>

              <div className="modal-color-row">
                <label className="modal-label">カラー</label>
                <input type="color" value={addState.color} onChange={(e) => setAddState({ ...addState, color: e.target.value })} className="color-input" />
                <span className="modal-color-preview" style={{ background: addState.color }} />
              </div>

              <div className="gantt-modal-actions">
                <button className="btn-cancel" onClick={() => setAddState(null)}>キャンセル</button>
                <button className="btn-save" onClick={confirmAdd} disabled={!addState.name.trim()}>追加</button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
