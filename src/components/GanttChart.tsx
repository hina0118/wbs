import { useRef, useState } from "react";
import { Task } from "../types/task";
import {
  toInputDate,
  genId,
  propagateDates,
  sortByTree,
  copyTaskFields,
  getAncestorNames,
  addDays,
} from "../utils/taskUtils";
import { useDragHandler } from "../hooks/useDragHandler";
import { useGanttFilter } from "../hooks/useGanttFilter";
import GanttLeftPanel from "./GanttLeftPanel";
import GanttTimeline from "./GanttTimeline";
import TaskEditModal from "./TaskEditModal";
import GanttTooltip from "./GanttTooltip";
import MemoFloatingPanel from "./MemoFloatingPanel";

const PRESET_COLORS = [
  "#4A90D9",
  "#7B68EE",
  "#50C878",
  "#FF7F50",
  "#F5A623",
  "#E74C3C",
  "#1ABC9C",
  "#95A5A6",
];

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
  holidays?: Map<string, string>;
}

interface AddState {
  parentId?: string;
  name: string;
  startDate: string;
  endDate: string;
  color: string;
  copySourceId?: string;
  isFloating?: boolean;
}

function isVisible(task: Task, tasks: Task[], collapsedIds: Set<string>): boolean {
  if (!task.parentId) return true;
  if (collapsedIds.has(task.parentId)) return false;
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return true;
  return isVisible(parent, tasks, collapsedIds);
}

export default function GanttChart({ tasks, onTasksChange, holidays = new Map() }: Props) {
  const timelineRef = useRef<HTMLDivElement>(null);
  const leftScrollRef = useRef<HTMLDivElement>(null);

  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(
    () => new Set(tasks.filter((t) => t.collapsed).map((t) => t.id)),
  );
  const [editingId, setEditingId] = useState<string | null>(null);
  const [memoPanelId, setMemoPanelId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [addState, setAddState] = useState<AddState | null>(null);
  const [tooltip, setTooltip] = useState<{
    task: Task;
    progress: number;
    x: number;
    y: number;
  } | null>(null);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // カスタムフック
  const { didDragRef, dragPreview, startDrag } = useDragHandler(tasks, onTasksChange, () =>
    setTooltip(null),
  );
  const {
    filterParentId,
    filterAssignee,
    assignees,
    filteredTasks,
    setFilterParentId,
    setFilterAssignee,
  } = useGanttFilter(tasks);

  const scheduledVisibleTasks = filteredTasks.filter(
    (t) => !t.isFloating && isVisible(t, filteredTasks, collapsedIds),
  );
  const floatingTasks = filteredTasks.filter((t) => t.isFloating);

  // ── 操作 ──

  function toggleCollapse(id: string) {
    const willBeCollapsed = !collapsedIds.has(id);
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (willBeCollapsed) next.add(id);
      else next.delete(id);
      return next;
    });
    onTasksChange(tasks.map((t) => (t.id === id ? { ...t, collapsed: willBeCollapsed } : t)));
  }

  function commitRename(taskId: string, newName: string) {
    const trimmed = newName.trim();
    if (trimmed) {
      onTasksChange(tasks.map((t) => (t.id === taskId ? { ...t, name: trimmed } : t)));
    }
    setEditingNameId(null);
  }

  function openAdd(parentId?: string) {
    const parent = parentId ? tasks.find((t) => t.id === parentId) : undefined;
    const defaultColor = parent?.color ?? "#4A90D9";
    setAddState({
      parentId,
      name: "",
      startDate: toInputDate(today),
      endDate: toInputDate(addDays(today, 6)),
      color: defaultColor,
    });
  }

  function confirmAdd() {
    if (!addState || !addState.name.trim()) return;

    let newStart = today;
    let newEnd = today;
    if (!addState.isFloating) {
      newStart = new Date(addState.startDate);
      newEnd = new Date(addState.endDate);
      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;
    }

    const copySource = addState.copySourceId
      ? tasks.find((t) => t.id === addState.copySourceId)
      : undefined;
    const copiedFields = copySource
      ? copyTaskFields(copySource, { startDate: newStart, endDate: newEnd })
      : undefined;

    const newTask: Task = {
      id: genId(),
      name: addState.name.trim(),
      startDate: newStart,
      endDate: newEnd,
      progress: 0,
      color: addState.color,
      parentId: addState.parentId,
      isFloating: addState.isFloating || undefined,
      ...(copiedFields
        ? {
            assignee: copiedFields.assignee,
            subMembers: copiedFields.subMembers,
            memo: copiedFields.memo,
            progressCount: copiedFields.progressCount,
          }
        : {}),
    };

    const appended = [...tasks, newTask];
    const propagated =
      newTask.parentId && !newTask.isFloating ? propagateDates(newTask.id, appended) : appended;
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

  // ── 行並び替え ──

  function reorderTasks(draggedId: string, targetId: string, insertAfter = false) {
    const dragged = tasks.find((t) => t.id === draggedId);
    const target = tasks.find((t) => t.id === targetId);
    if (!dragged || !target || dragged.parentId !== target.parentId) return;

    const siblings = tasks
      .filter((t) => t.parentId === dragged.parentId)
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

    const without = siblings.filter((t) => t.id !== draggedId);
    const targetIdx = without.findIndex((t) => t.id === targetId);
    without.splice(insertAfter ? targetIdx + 1 : targetIdx, 0, dragged);

    const updatedOrders = new Map(without.map((t, i) => [t.id, i]));
    const updated = tasks.map((t) =>
      updatedOrders.has(t.id) ? { ...t, order: updatedOrders.get(t.id)! } : t,
    );
    onTasksChange(sortByTree(updated));
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
        visibleTasks={scheduledVisibleTasks}
        floatingTasks={floatingTasks}
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
        onReorderTasks={reorderTasks}
      />

      {/* 右タイムラインパネル */}
      <GanttTimeline
        tasks={tasks}
        visibleTasks={scheduledVisibleTasks}
        floatingTasks={floatingTasks}
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
      {editingId !== null &&
        (() => {
          const task = tasks.find((t) => t.id === editingId)!;
          return (
            <TaskEditModal
              task={task}
              tasks={tasks}
              onSave={(updated) => {
                onTasksChange(updated);
                setEditingId(null);
              }}
              onDelete={(updated) => {
                onTasksChange(updated);
                setEditingId(null);
              }}
              onArchive={(updated) => {
                onTasksChange(updated);
                setEditingId(null);
              }}
              onClose={() => setEditingId(null)}
              onOpenMemoPanel={() => {
                setMemoPanelId(editingId);
                setEditingId(null);
              }}
            />
          );
        })()}

      {/* メモフローティングパネル */}
      {memoPanelId !== null &&
        (() => {
          const task = tasks.find((t) => t.id === memoPanelId);
          if (!task) return null;
          return (
            <MemoFloatingPanel
              task={task}
              tasks={tasks}
              onSave={(updated) => {
                onTasksChange(updated);
                setMemoPanelId(null);
              }}
              onClose={() => setMemoPanelId(null)}
            />
          );
        })()}

      {/* 追加モーダル */}
      {addState !== null &&
        (() => {
          const parent = addState.parentId
            ? tasks.find((t) => t.id === addState.parentId)
            : undefined;
          return (
            <div className="gantt-modal-overlay" onClick={() => setAddState(null)}>
              <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
                <h3>{parent ? "サブタスクを追加" : "タスクを追加"}</h3>
                {parent && <p className="modal-parent-info">親タスク: {parent.name}</p>}

                <label className="modal-label">コピー元タスク</label>
                <select
                  className="assignee-input"
                  value={addState.copySourceId ?? ""}
                  onChange={(e) => {
                    const copySourceId = e.target.value || undefined;
                    const src = copySourceId ? tasks.find((t) => t.id === copySourceId) : undefined;
                    setAddState({
                      ...addState,
                      copySourceId,
                      name: src ? `${src.name} のコピー` : "",
                      color:
                        src?.color ??
                        (addState.parentId
                          ? (tasks.find((t) => t.id === addState.parentId)?.color ?? "#4A90D9")
                          : "#4A90D9"),
                    });
                  }}
                >
                  <option value="">なし（新規作成）</option>
                  {tasks.map((t) => {
                    const ancestors = getAncestorNames(t.id, tasks);
                    const label =
                      ancestors.length > 0 ? `${ancestors.join(" > ")} > ${t.name}` : t.name;
                    return (
                      <option key={t.id} value={t.id}>
                        {label}
                      </option>
                    );
                  })}
                </select>

                <label className="modal-label">
                  タスク名 <span className="modal-required">*</span>
                </label>
                <input
                  type="text"
                  value={addState.name}
                  onChange={(e) => setAddState({ ...addState, name: e.target.value })}
                  placeholder="タスク名を入力"
                  className="assignee-input"
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") confirmAdd();
                  }}
                />

                <label className="modal-floating-label">
                  <input
                    type="checkbox"
                    checked={addState.isFloating ?? false}
                    onChange={(e) => setAddState({ ...addState, isFloating: e.target.checked })}
                    className="modal-floating-checkbox"
                  />
                  単発タスク（開始時期未定）
                </label>

                {!addState.isFloating && (
                  <div className="modal-date-row">
                    <div className="modal-date-field">
                      <label className="modal-label">開始日</label>
                      <input
                        type="date"
                        value={addState.startDate}
                        max={addState.endDate}
                        onChange={(e) => setAddState({ ...addState, startDate: e.target.value })}
                        className="date-input"
                      />
                    </div>
                    <div className="modal-date-field">
                      <label className="modal-label">終了日</label>
                      <input
                        type="date"
                        value={addState.endDate}
                        min={addState.startDate}
                        onChange={(e) => setAddState({ ...addState, endDate: e.target.value })}
                        className="date-input"
                      />
                    </div>
                  </div>
                )}

                <div className="modal-color-row">
                  <label className="modal-label">カラー</label>
                  <div className="color-swatches">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        className={`color-swatch${addState.color === c ? " color-swatch--active" : ""}`}
                        style={{ background: c }}
                        onClick={() => setAddState({ ...addState, color: c })}
                        title={c}
                      />
                    ))}
                  </div>
                  <input
                    type="color"
                    value={addState.color}
                    onChange={(e) => setAddState({ ...addState, color: e.target.value })}
                    className="color-input"
                  />
                </div>

                <div className="gantt-modal-actions">
                  <button className="btn-cancel" onClick={() => setAddState(null)}>
                    キャンセル
                  </button>
                  <button
                    className="btn-save"
                    onClick={confirmAdd}
                    disabled={!addState.name.trim()}
                  >
                    追加
                  </button>
                </div>
              </div>
            </div>
          );
        })()}
    </div>
  );
}
