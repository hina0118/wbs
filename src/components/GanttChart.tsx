import { useRef, useState } from "react";
import { Task } from "../types/task";
import { propagateDates } from "../utils/taskUtils";
import { useDragHandler } from "../hooks/useDragHandler";
import { useGanttFilter } from "../hooks/useGanttFilter";
import GanttLeftPanel from "./GanttLeftPanel";
import GanttTimeline  from "./GanttTimeline";
import TaskEditModal  from "./TaskEditModal";
import TaskAddModal   from "./TaskAddModal";
import GanttTooltip   from "./GanttTooltip";

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  holidays?: Map<string, string>;
}

function isVisible(task: Task, tasks: Task[], collapsedIds: Set<string>): boolean {
  if (!task.parentId) return true;
  if (collapsedIds.has(task.parentId)) return false;
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return true;
  return isVisible(parent, tasks, collapsedIds);
}

export default function GanttChart({ tasks, onTasksChange, holidays = new Map() }: Props) {
  const timelineRef   = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);

  const [collapsedIds,   setCollapsedIds]   = useState<Set<string>>(new Set());
  const [editingId,      setEditingId]      = useState<string | null>(null);
  const [editingNameId,  setEditingNameId]  = useState<string | null>(null);
  const [addParentId,    setAddParentId]    = useState<string | null | undefined>(undefined);
  const [tooltip, setTooltip] = useState<{ task: Task; progress: number; x: number; y: number } | null>(null);

  // カスタムフック
  const { didDragRef, dragPreview, startDrag } = useDragHandler(tasks, onTasksChange, () => setTooltip(null));
  const {
    filterParentId,
    filterAssignee,
    assignees,
    filteredTasks,
    setFilterParentId,
    setFilterAssignee,
  } = useGanttFilter(tasks);

  const visibleTasks = filteredTasks.filter((t) => isVisible(t, filteredTasks, collapsedIds));

  // ── 操作 ──

  function toggleCollapse(id: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function commitRename(taskId: string, newName: string) {
    const trimmed = newName.trim();
    if (trimmed) {
      onTasksChange(tasks.map((t) => t.id === taskId ? { ...t, name: trimmed } : t));
    }
    setEditingNameId(null);
  }

  function openAdd(parentId?: string) {
    setAddParentId(parentId ?? null);
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

  // ── 親タスクフィルタ変更（折りたたみリセット付き） ──

  function handleFilterParentChange(value: string) {
    setFilterParentId(value);
    setCollapsedIds(new Set());
  }

  // ── レンダリング ──

  return (
    <div className="gantt-wrapper">

      {/* 左パネル */}
      <GanttLeftPanel
        tasks={tasks}
        visibleTasks={visibleTasks}
        collapsedIds={collapsedIds}
        filterParentId={filterParentId}
        filterAssignee={filterAssignee}
        assignees={assignees}
        today={today}
        editingNameId={editingNameId}
        leftScrollRef={leftScrollRef}
        onToggleCollapse={toggleCollapse}
        onOpenEdit={(task) => setEditingId(task.id)}
        onOpenAdd={openAdd}
        onCommitRename={commitRename}
        onSetEditingNameId={setEditingNameId}
        onFilterParentChange={handleFilterParentChange}
        onFilterAssigneeChange={setFilterAssignee}
        onLeftScroll={handleLeftScroll}
      />

      {/* 右タイムラインパネル */}
      <GanttTimeline
        tasks={tasks}
        visibleTasks={visibleTasks}
        dragPreview={dragPreview}
        holidays={holidays}
        timelineRef={timelineRef}
        didDragRef={didDragRef}
        onTimelineScroll={handleTimelineScroll}
        onStartDrag={startDrag}
        onOpenEdit={(task) => setEditingId(task.id)}
        onSetTooltip={setTooltip}
      />

      {/* ツールチップ */}
      {tooltip && <GanttTooltip {...tooltip} />}

      {/* 編集モーダル */}
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

      {/* 追加モーダル */}
      {addParentId !== undefined && (
        <TaskAddModal
          parentTask={addParentId ? tasks.find((t) => t.id === addParentId) : undefined}
          allTasks={tasks}
          onConfirm={(newTask) => {
            const appended   = [...tasks, newTask];
            const propagated = newTask.parentId ? propagateDates(newTask.id, appended) : appended;
            onTasksChange(propagated);
            setAddParentId(undefined);
          }}
          onClose={() => setAddParentId(undefined)}
        />
      )}
    </div>
  );
}
