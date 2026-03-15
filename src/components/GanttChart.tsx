import { useRef, useState } from "react";
import { Task } from "../types/task";

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
}

const DAY_WIDTH = 28;
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 60;
const LEFT_PANEL_WIDTH = 300;
const PROGRESS_COL_WIDTH = 70;

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

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonth(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function isSunday(d: Date) {
  return d.getDay() === 0;
}
function isSaturday(d: Date) {
  return d.getDay() === 6;
}
function isMonthStart(d: Date) {
  return d.getDate() === 1;
}

export default function GanttChart({ tasks, onTasksChange }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingProgress, setEditingProgress] = useState<number>(0);

  // Compute visible tasks (respect collapsed parent)
  const visibleTasks = tasks.filter((t) => {
    if (!t.parentId) return true;
    return !collapsedIds.has(t.parentId);
  });

  // Timeline range
  const minDate = tasks.reduce(
    (m, t) => (t.startDate < m ? t.startDate : m),
    tasks[0].startDate
  );
  const maxDate = tasks.reduce(
    (m, t) => (t.endDate > m ? t.endDate : m),
    tasks[0].endDate
  );

  // Pad 1 day on each side
  const rangeStart = new Date(minDate);
  rangeStart.setDate(rangeStart.getDate() - 1);
  const rangeEnd = new Date(maxDate);
  rangeEnd.setDate(rangeEnd.getDate() + 1);

  const days = getDaysArray(rangeStart, rangeEnd);
  const totalDays = days.length;

  // Group days by month for header
  const monthGroups: { label: string; start: number; count: number }[] = [];
  days.forEach((d, i) => {
    const label = formatMonth(d);
    const last = monthGroups[monthGroups.length - 1];
    if (!last || last.label !== label) {
      monthGroups.push({ label, start: i, count: 1 });
    } else {
      last.count++;
    }
  });

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function openEdit(task: Task) {
    setEditingId(task.id);
    setEditingProgress(task.progress);
  }

  function saveEdit() {
    if (editingId === null) return;
    onTasksChange(
      tasks.map((t) =>
        t.id === editingId ? { ...t, progress: editingProgress } : t
      )
    );
    setEditingId(null);
  }

  // Sync scroll between left and timeline
  function handleTimelineScroll() {
    if (leftScrollRef.current && timelineRef.current) {
      leftScrollRef.current.scrollTop = timelineRef.current.scrollTop;
    }
  }
  function handleLeftScroll() {
    if (leftScrollRef.current && timelineRef.current) {
      timelineRef.current.scrollTop = leftScrollRef.current.scrollTop;
    }
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = diffDays(rangeStart, today);

  return (
    <div className="gantt-wrapper">
      {/* Left panel */}
      <div className="gantt-left" style={{ width: LEFT_PANEL_WIDTH + PROGRESS_COL_WIDTH }}>
        {/* Header */}
        <div className="gantt-left-header" style={{ height: HEADER_HEIGHT }}>
          <span className="gantt-col-task">タスク名</span>
          <span className="gantt-col-progress">進捗</span>
        </div>
        {/* Task rows */}
        <div
          className="gantt-left-body"
          ref={leftScrollRef}
          onScroll={handleLeftScroll}
          style={{ maxHeight: `calc(100vh - ${HEADER_HEIGHT + 80}px)`, overflowY: "auto" }}
        >
          {visibleTasks.map((task) => {
            const isParent = !task.parentId;
            const hasChildren = tasks.some((t) => t.parentId === task.id);
            const isCollapsed = collapsedIds.has(task.id);

            return (
              <div
                key={task.id}
                className={`gantt-row ${isParent ? "gantt-row-parent" : "gantt-row-child"}`}
                style={{ height: ROW_HEIGHT }}
              >
                <span
                  className="gantt-col-task"
                  style={{ paddingLeft: isParent ? 8 : 24 }}
                >
                  {hasChildren && (
                    <button
                      className="gantt-collapse-btn"
                      onClick={() => toggleCollapse(task.id)}
                    >
                      {isCollapsed ? "▶" : "▼"}
                    </button>
                  )}
                  {task.name}
                </span>
                <span
                  className="gantt-col-progress"
                  style={{ cursor: "pointer" }}
                  onClick={() => openEdit(task)}
                  title="クリックで編集"
                >
                  <span className="progress-badge" style={{ background: task.color || "#4A90D9" }}>
                    {task.progress}%
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right timeline panel */}
      <div className="gantt-timeline-wrapper">
        {/* Timeline header */}
        <div className="gantt-timeline-header" style={{ height: HEADER_HEIGHT, width: totalDays * DAY_WIDTH }}>
          {/* Month row */}
          <div className="gantt-month-row">
            {monthGroups.map((m) => (
              <div
                key={m.label}
                className="gantt-month-cell"
                style={{ width: m.count * DAY_WIDTH }}
              >
                {m.label}
              </div>
            ))}
          </div>
          {/* Day row */}
          <div className="gantt-day-row">
            {days.map((d, i) => (
              <div
                key={i}
                className={`gantt-day-cell ${isSunday(d) ? "day-sunday" : ""} ${isSaturday(d) ? "day-saturday" : ""} ${isMonthStart(d) ? "day-month-start" : ""}`}
                style={{ width: DAY_WIDTH }}
              >
                {formatDate(d)}
              </div>
            ))}
          </div>
        </div>

        {/* Timeline body */}
        <div
          className="gantt-timeline-body"
          ref={timelineRef}
          onScroll={handleTimelineScroll}
          style={{
            width: totalDays * DAY_WIDTH,
            maxHeight: `calc(100vh - ${HEADER_HEIGHT + 80}px)`,
            overflowY: "auto",
          }}
        >
          {visibleTasks.map((task) => {
            const startOffset = diffDays(rangeStart, task.startDate);
            const dur = diffDays(task.startDate, task.endDate) + 1;
            const barLeft = startOffset * DAY_WIDTH;
            const barWidth = dur * DAY_WIDTH;

            return (
              <div
                key={task.id}
                className="gantt-timeline-row"
                style={{ height: ROW_HEIGHT }}
              >
                {/* Grid lines */}
                {days.map((d, i) => (
                  <div
                    key={i}
                    className={`gantt-grid-cell ${isSunday(d) || isSaturday(d) ? "grid-weekend" : ""} ${isMonthStart(d) ? "grid-month-start" : ""}`}
                    style={{ left: i * DAY_WIDTH, width: DAY_WIDTH }}
                  />
                ))}

                {/* Today line */}
                {todayOffset >= 0 && todayOffset < totalDays && (
                  <div
                    className="gantt-today-line"
                    style={{ left: todayOffset * DAY_WIDTH + DAY_WIDTH / 2 }}
                  />
                )}

                {/* Task bar */}
                <div
                  className="gantt-bar"
                  style={{
                    left: barLeft,
                    width: barWidth,
                    background: task.parentId ? `${task.color}99` : task.color || "#4A90D9",
                    cursor: "pointer",
                  }}
                  onClick={() => openEdit(task)}
                  title={`${task.name}: ${task.progress}%`}
                >
                  <div
                    className="gantt-bar-progress"
                    style={{
                      width: `${task.progress}%`,
                      background: task.color || "#4A90D9",
                      filter: "brightness(0.75)",
                    }}
                  />
                  <span className="gantt-bar-label">{task.name}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Edit modal */}
      {editingId !== null && (() => {
        const task = tasks.find((t) => t.id === editingId)!;
        return (
          <div className="gantt-modal-overlay" onClick={saveEdit}>
            <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{task.name}</h3>
              <label>
                進捗: <strong>{editingProgress}%</strong>
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={editingProgress}
                onChange={(e) => setEditingProgress(Number(e.target.value))}
                className="progress-slider"
              />
              <div className="gantt-modal-actions">
                <button className="btn-cancel" onClick={() => setEditingId(null)}>
                  キャンセル
                </button>
                <button className="btn-save" onClick={saveEdit}>
                  保存
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
