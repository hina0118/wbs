import { Task } from "../types/task";
import { toHolidayKey } from "../utils/holidays";
import { computeProgress } from "../utils/taskUtils";
import { DragPreview } from "../hooks/useDragHandler";
import React from "react";

const DAY_WIDTH = 28;
const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 90;
const HANDLE_WIDTH = 6;

function getLuminance(hexColor: string): number {
  const r = parseInt(hexColor.slice(1, 3), 16) / 255;
  const g = parseInt(hexColor.slice(3, 5), 16) / 255;
  const b = parseInt(hexColor.slice(5, 7), 16) / 255;
  const toLinear = (c: number) =>
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** CSS brightness(factor) フィルターを近似してRGB各チャンネルを乗算した16進カラーを返す */
function applyBrightness(hexColor: string, factor: number): string {
  const clamp = (v: number) => Math.min(255, Math.max(0, Math.round(v)));
  const r = clamp(parseInt(hexColor.slice(1, 3), 16) * factor);
  const g = clamp(parseInt(hexColor.slice(3, 5), 16) * factor);
  const b = clamp(parseInt(hexColor.slice(5, 7), 16) * factor);
  return `#${r.toString(16).padStart(2, "0")}${g.toString(16).padStart(2, "0")}${b.toString(16).padStart(2, "0")}`;
}

/**
 * バー上のテキスト色を返す。
 * 進捗オーバーレイ（brightness 0.75）と素のバー背景の
 * 両方に対してコントラストが取れるよう、暗い方の色で判定する。
 */
function getContrastTextColor(baseColor: string): string {
  const progressColor = applyBrightness(baseColor, 0.75);
  // 進捗部分の方が常に暗いため、そちらで判定すれば非進捗部分も担保される
  const luminance = getLuminance(progressColor);
  return luminance > 0.179 ? "#000000" : "#ffffff";
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function getDaysArray(start: Date, end: Date): Date[] {
  const days: Date[] = [];
  const cur = new Date(start);
  while (cur <= end) {
    days.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return days;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function formatDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function formatMonth(d: Date): string {
  return `${d.getFullYear()}年${d.getMonth() + 1}月`;
}

function isSunday(d: Date)    { return d.getDay() === 0; }
function isSaturday(d: Date)  { return d.getDay() === 6; }
function isMonthStart(d: Date){ return d.getDate() === 1; }
function isHoliday(d: Date, holidays: Map<string, string>)     { return holidays.has(toHolidayKey(d)); }
function getHolidayName(d: Date, holidays: Map<string, string>){ return holidays.get(toHolidayKey(d)) ?? ""; }

function getDepth(taskId: string, tasks: Task[]): number {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return 0;
  return 1 + getDepth(task.parentId, tasks);
}

function barOpacity(depth: number): string {
  const opacities = ["ff", "cc", "99", "77"];
  return opacities[Math.min(depth, opacities.length - 1)];
}

interface Props {
  tasks: Task[];
  visibleTasks: Task[];
  dragPreview: DragPreview | null;
  holidays: Map<string, string>;
  timelineRef: React.RefObject<HTMLDivElement>;
  didDragRef: React.RefObject<boolean>;
  onTimelineScroll: () => void;
  onStartDrag: (e: React.MouseEvent, task: Task, type: "start" | "end" | "move") => void;
  onOpenEdit: (task: Task) => void;
  onSetTooltip: (tooltip: { task: Task; progress: number; x: number; y: number } | null) => void;
}

export default function GanttTimeline({
  tasks,
  visibleTasks,
  dragPreview,
  holidays,
  timelineRef,
  didDragRef,
  onTimelineScroll,
  onStartDrag,
  onOpenEdit,
  onSetTooltip,
}: Props) {
  const allDates = tasks.flatMap((t) => [t.startDate, t.endDate]);
  if (dragPreview) allDates.push(dragPreview.startDate, dragPreview.endDate);

  if (allDates.length === 0) {
    return (
      <div className="gantt-timeline-wrapper gantt-timeline-empty">
        <span>表示するタスクがありません</span>
      </div>
    );
  }

  const minDate    = allDates.reduce((m, d) => (d < m ? d : m));
  const maxDate    = allDates.reduce((m, d) => (d > m ? d : m));
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

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayOffset = diffDays(rangeStart, today);

  return (
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
                  isSunday(d)     ? "day-sunday"      : "",
                  isSaturday(d)   ? "day-saturday"    : "",
                  isMonthStart(d) ? "day-month-start" : "",
                  holiday         ? "day-holiday"     : "",
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
        onScroll={onTimelineScroll}
        style={{ width: totalDays * DAY_WIDTH, maxHeight: `calc(100vh - ${HEADER_HEIGHT + 80}px)`, overflowY: "auto" }}
      >
        {visibleTasks.map((task) => {
          const depth    = getDepth(task.id, tasks);
          const preview  = dragPreview?.taskId === task.id ? dragPreview : null;
          const barStart = preview ? preview.startDate : task.startDate;
          const barEnd   = preview ? preview.endDate   : task.endDate;

          const barLeft  = diffDays(rangeStart, barStart) * DAY_WIDTH;
          const barWidth = Math.max((diffDays(barStart, barEnd) + 1) * DAY_WIDTH, DAY_WIDTH);
          const effectiveProg = computeProgress(task.id, tasks);
          const done          = effectiveProg === 100;
          const baseColor = done ? "#999" : (task.color ?? "#4A90D9");
          const barColor  = `${baseColor}${barOpacity(depth)}`;
          const textColor = getContrastTextColor(baseColor);
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
                onMouseDown={(e) => onStartDrag(e, task, "move")}
                onClick={() => { if (!didDragRef.current) onOpenEdit(task); }}
                onMouseEnter={(e) => { if (!dragPreview) onSetTooltip({ task, progress: effectiveProg, x: e.clientX, y: e.clientY }); }}
                onMouseMove={(e)  => { if (!dragPreview) onSetTooltip({ task, progress: effectiveProg, x: e.clientX, y: e.clientY }); }}
                onMouseLeave={() => onSetTooltip(null)}
              >
                <div className="gantt-bar-handle gantt-bar-handle--left" style={{ width: HANDLE_WIDTH }} onMouseDown={(e) => onStartDrag(e, task, "start")} />
                <div className="gantt-bar-progress" style={{ width: `${effectiveProg}%`, background: baseColor, filter: "brightness(0.75)" }} />
                <span className="gantt-bar-label" style={{ color: textColor }}>{task.name}</span>
                <div className="gantt-bar-handle gantt-bar-handle--right" style={{ width: HANDLE_WIDTH }} onMouseDown={(e) => onStartDrag(e, task, "end")} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
