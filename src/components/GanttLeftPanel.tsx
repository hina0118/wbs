import { Task } from "../types/task";
import { getSignalStatus, computeProgress } from "../utils/taskUtils";

const ROW_HEIGHT = 40;
const HEADER_HEIGHT = 90;
const LEFT_PANEL_WIDTH = 260;
const ASSIGNEE_COL_WIDTH = 80;
const PROGRESS_COL_WIDTH = 70;
const INDENT_PER_LEVEL = 16;

const SIGNAL_TITLE: Record<string, string> = {
  red: "遅延",
  yellow: "着手遅れ",
  green: "正常",
};

function SignalDot({ status }: { status: SignalStatus }) {
  if (status === "none") return null;
  return (
    <span
      className={`status-signal status-signal--${status}`}
      title={SIGNAL_TITLE[status]}
    />
  );
}

function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
}

function expectedProgress(task: Task, today: Date): number {
  if (today <= task.startDate) return 0;
  if (today >= task.endDate) return 100;
  const total   = diffDays(task.startDate, task.endDate);
  const elapsed = diffDays(task.startDate, today);
  return Math.round((elapsed / total) * 100);
}

function getDepth(taskId: string, tasks: Task[]): number {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return 0;
  return 1 + getDepth(task.parentId, tasks);
}

interface Props {
  tasks: Task[];
  visibleTasks: Task[];
  collapsedIds: Set<string>;
  filterParentId: string;
  filterAssignee: string;
  assignees: string[];
  today: Date;
  editingNameId: string | null;
  leftScrollRef: React.RefObject<HTMLDivElement>;
  onToggleCollapse: (id: string) => void;
  onOpenEdit: (task: Task) => void;
  onOpenAdd: (parentId?: string) => void;
  onCommitRename: (taskId: string, newName: string) => void;
  onSetEditingNameId: (id: string | null) => void;
  onFilterParentChange: (value: string) => void;
  onFilterAssigneeChange: (value: string) => void;
  onLeftScroll: () => void;
}

export default function GanttLeftPanel({
  tasks,
  visibleTasks,
  collapsedIds,
  filterParentId,
  filterAssignee,
  assignees,
  today,
  editingNameId,
  leftScrollRef,
  onToggleCollapse,
  onOpenEdit,
  onOpenAdd,
  onCommitRename,
  onSetEditingNameId,
  onFilterParentChange,
  onFilterAssigneeChange,
  onLeftScroll,
}: Props) {
  return (
    <div className="gantt-left" style={{ width: LEFT_PANEL_WIDTH + ASSIGNEE_COL_WIDTH + PROGRESS_COL_WIDTH }}>
      <div className="gantt-left-header" style={{ height: HEADER_HEIGHT }}>
        <div className="gantt-header-top-row">
          <span className="gantt-col-task">
            タスク名
            <button className="gantt-add-top-btn" onClick={() => onOpenAdd()} title="ルートタスクを追加">＋</button>
          </span>
          <span className="gantt-col-assignee">担当者</span>
          <span className="gantt-col-progress">進捗</span>
        </div>
        <div className="gantt-filter-bar">
          <div className="gantt-filter-item">
            <span className="gantt-filter-label">親タスク:</span>
            <select
              className="gantt-filter-select"
              value={filterParentId}
              onChange={(e) => onFilterParentChange(e.target.value)}
            >
              <option value="all">すべて表示</option>
              {tasks.filter((t) => !t.parentId).map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div className="gantt-filter-item">
            <span className="gantt-filter-label">担当者:</span>
            <select
              className="gantt-filter-select"
              value={filterAssignee}
              onChange={(e) => onFilterAssigneeChange(e.target.value)}
            >
              <option value="all">全員</option>
              {assignees.map((a) => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div
        className="gantt-left-body"
        ref={leftScrollRef}
        onScroll={onLeftScroll}
        style={{ maxHeight: `calc(100vh - ${HEADER_HEIGHT + 80}px)`, overflowY: "auto" }}
      >
        {visibleTasks.map((task) => {
          const depth         = getDepth(task.id, tasks);
          const hasChildren   = tasks.some((t) => t.parentId === task.id);
          const isCollapsed   = collapsedIds.has(task.id);
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
                  <button className="gantt-collapse-btn" onClick={() => onToggleCollapse(task.id)}>
                    {isCollapsed ? "▶" : "▼"}
                  </button>
                ) : (
                  <span className="gantt-leaf-icon">─</span>
                )}
                <SignalDot status={getSignalStatus(task.id, tasks)} />
                {editingNameId === task.id ? (
                  <input
                    className="gantt-task-name-input"
                    defaultValue={task.name}
                    autoFocus
                    onBlur={(e) => onCommitRename(task.id, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") onCommitRename(task.id, e.currentTarget.value);
                      if (e.key === "Escape") onSetEditingNameId(null);
                    }}
                  />
                ) : (
                  <span
                    className="gantt-task-name"
                    title={task.name}
                    onDoubleClick={() => onSetEditingNameId(task.id)}
                  >{task.name}</span>
                )}
              </span>
              <button
                className="gantt-add-subtask-btn"
                onClick={(e) => { e.stopPropagation(); onOpenAdd(task.id); }}
                title="サブタスクを追加"
              >＋</button>

              <span
                className={`gantt-col-assignee${!hasChildren ? " gantt-col-assignee--leaf" : ""}`}
                onClick={!hasChildren ? () => onOpenEdit(task) : undefined}
                title={!hasChildren ? (task.assignee ? `担当: ${task.assignee}` : "クリックで担当者を設定") : undefined}
              >
                {!hasChildren ? (
                  task.assignee
                    ? <span className="assignee-badge">{task.assignee}</span>
                    : <span className="assignee-empty">未設定</span>
                ) : (
                  <span className="assignee-empty">─</span>
                )}
              </span>

              <span className="gantt-col-progress" style={{ cursor: "pointer" }} onClick={() => onOpenEdit(task)} title="クリックで編集">
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
  );
}
