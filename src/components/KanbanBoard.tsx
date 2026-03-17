import { useState } from "react";
import { Task } from "../types/task";
import { getAllDescendantIds, getSignalStatus, isLeaf, computeProgress, getAncestorNames, toInputDate, genId } from "../utils/taskUtils";
import MemoWithToggle from "./MemoWithToggle";
import TaskEditModal from "./TaskEditModal";

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
}

// ── ヘルパー ─────────────────────────────────────────────

function formatDateShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

// ── カラム定義 ────────────────────────────────────────────

interface Column {
  id: "todo" | "doing" | "done";
  label: string;
  accentColor: string;
  match: (progress: number) => boolean;
  /** ドロップ時に設定する進捗のデフォルト値 */
  dropProgress: (current: number) => number;
}

const COLUMNS: Column[] = [
  {
    id:           "todo",
    label:        "未着手",
    accentColor:  "#9e9e9e",
    match:        (p) => p === 0,
    dropProgress: ()  => 0,
  },
  {
    id:           "doing",
    label:        "進行中",
    accentColor:  "#4A90D9",
    match:        (p) => p > 0 && p < 100,
    dropProgress: (current) => (current === 0 || current === 100 ? 50 : current),
  },
  {
    id:           "done",
    label:        "完了",
    accentColor:  "#43a047",
    match:        (p) => p === 100,
    dropProgress: ()  => 100,
  },
];

// ── 追加用ステート型 ──────────────────────────────────────

interface AddState {
  columnId: Column["id"];
  name: string;
  startDate: string;
  endDate: string;
  color: string;
  parentId?: string;
}

// ── コンポーネント ────────────────────────────────────────

export default function KanbanBoard({ tasks, onTasksChange }: Props) {
  const [editingId,    setEditingId]    = useState<string | null>(null);
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());

  const [addState, setAddState] = useState<AddState | null>(null);

  const [filterParentId, setFilterParentId] = useState<string | "all">("all");
  const [filterAssignee, setFilterAssignee] = useState<string | "all">("all");

  function toggleMemo(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedMemos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column["id"] | null>(null);

  // リーフタスクのみ対象
  const leafTasks = tasks.filter((t) => isLeaf(t.id, tasks));

  // ルートタスク一覧（親タスクフィルタ用）
  const rootTasks = tasks.filter((t) => !t.parentId);

  // 担当者一覧（重複除去）
  const assignees = [...new Set(tasks.map((t) => t.assignee).filter(Boolean))] as string[];

  // フィルタ適用
  const filteredByParent = filterParentId === "all"
    ? leafTasks
    : leafTasks.filter((t) => getAllDescendantIds(filterParentId, tasks).includes(t.id));

  const visibleTasks = filteredByParent.filter((t) =>
    filterAssignee === "all" || t.assignee === filterAssignee
  );

  function openEdit(task: Task) {
    setEditingId(task.id);
  }

  function openAdd(columnId: Column["id"]) {
    const today = new Date();
    setAddState({
      columnId,
      name:      "",
      startDate: toInputDate(today),
      endDate:   toInputDate(addDays(today, 6)),
      color:     "#4A90D9",
      parentId:  filterParentId === "all" ? undefined : filterParentId,
    });
  }

  function confirmAdd() {
    if (!addState || !addState.name.trim()) return;
    const newStart = new Date(addState.startDate);
    const newEnd   = new Date(addState.endDate);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;

    const col      = COLUMNS.find((c) => c.id === addState.columnId)!;
    const initProg = col.dropProgress(0);
    const newTask: Task = {
      id:        genId(),
      name:      addState.name.trim(),
      startDate: newStart,
      endDate:   newEnd,
      progress:  initProg,
      color:     addState.color,
      ...(addState.parentId ? { parentId: addState.parentId } : {}),
    };
    onTasksChange([...tasks, newTask]);
    setAddState(null);
  }

  // ── ドラッグ & ドロップ（列間移動 → 進捗更新）──

  function handleDragStart(taskId: string) {
    setDraggingId(taskId);
  }

  function handleDrop(col: Column) {
    if (!draggingId) return;
    const task = tasks.find((t) => t.id === draggingId);
    if (!task) return;

    const newProgress = col.dropProgress(task.progress);
    if (newProgress === task.progress) { setDraggingId(null); setDragOverCol(null); return; }

    const updated = tasks.map((t) =>
      t.id === draggingId ? { ...t, progress: newProgress } : t
    );
    onTasksChange(updated);
    setDraggingId(null);
    setDragOverCol(null);
  }

  // ── レンダリング ──────────────────────────────────────

  return (
    <div className="kanban-wrapper">
      {/* フィルタバー */}
      <div className="kanban-filter-bar">
        <div className="kanban-filter-item">
          <label className="kanban-filter-label">親タスク:</label>
          <select
            className="kanban-filter-select"
            value={filterParentId}
            onChange={(e) => setFilterParentId(e.target.value)}
          >
            <option value="all">全て</option>
            {rootTasks.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        </div>
        <div className="kanban-filter-item">
          <label className="kanban-filter-label">担当者:</label>
          <select
            className="kanban-filter-select"
            value={filterAssignee}
            onChange={(e) => setFilterAssignee(e.target.value)}
          >
            <option value="all">全員</option>
            {assignees.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="kanban-columns">
      {COLUMNS.map((col) => {
        const colTasks = visibleTasks.filter((t) => col.match(computeProgress(t.id, tasks)));
        const isOver   = dragOverCol === col.id;

        return (
          <div
            key={col.id}
            className={`kanban-column${isOver ? " kanban-column--dragover" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.id); }}
            onDragLeave={() => setDragOverCol(null)}
            onDrop={() => handleDrop(col)}
          >
            {/* 列ヘッダー */}
            <div className="kanban-col-header" style={{ borderTopColor: col.accentColor }}>
              <span className="kanban-col-title" style={{ color: col.accentColor }}>{col.label}</span>
              <span className="kanban-col-count">{colTasks.length}</span>
              <button className="kanban-add-btn" onClick={() => openAdd(col.id)} title="タスクを追加">＋</button>
            </div>

            {/* カード一覧 */}
            <div className="kanban-cards">
              {colTasks.map((task) => {
                const progress    = computeProgress(task.id, tasks);
                const ancestors   = getAncestorNames(task.id, tasks);
                const isDragging  = draggingId === task.id;

                return (
                  <div
                    key={task.id}
                    className={`kanban-card${isDragging ? " kanban-card--dragging" : ""}`}
                    draggable
                    onDragStart={() => handleDragStart(task.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverCol(null); }}
                    onClick={() => openEdit(task)}
                    style={{ borderLeftColor: task.color ?? "#4A90D9" }}
                  >
                    {/* 信号機インジケーター */}
                    {(() => {
                      const sig = getSignalStatus(task.id, tasks);
                      if (sig === "none") return null;
                      const title = sig === "red" ? "遅延" : sig === "yellow" ? "着手遅れ" : "正常";
                      return <span className={`status-signal status-signal--${sig} kanban-card-signal`} title={title} />;
                    })()}
                    {/* 祖先パス */}
                    {ancestors.length > 0 && (
                      <div className="kanban-card-path">
                        {ancestors.join(" › ")}
                      </div>
                    )}

                    {/* タスク名 */}
                    <div className="kanban-card-name">{task.name}</div>

                    {/* 進捗バー */}
                    <div className="kanban-progress-bar">
                      <div
                        className="kanban-progress-fill"
                        style={{ width: `${progress}%`, background: task.color ?? "#4A90D9" }}
                      />
                    </div>

                    {/* メモプレビュー（Markdown・展開可） */}
                    {task.memo && (
                      <MemoWithToggle
                        memo={task.memo}
                        expanded={expandedMemos.has(task.id)}
                        onToggle={(e) => toggleMemo(task.id, e)}
                        className="kanban-card-memo"
                      />
                    )}

                    {/* フッター */}
                    <div className="kanban-card-footer">
                      <span className="kanban-card-dates">
                        {formatDateShort(task.startDate)} – {formatDateShort(task.endDate)}
                      </span>
                      {task.assignee && (
                        <span className="kanban-card-assignee">{task.assignee}</span>
                      )}
                      <span className="kanban-card-pct">{progress}%</span>
                    </div>
                  </div>
                );
              })}

              {colTasks.length === 0 && (
                <div className="kanban-empty">タスクなし</div>
              )}
            </div>
          </div>
        );
      })}
      </div>

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
      {addState !== null && (
        <div className="gantt-modal-overlay" onClick={() => setAddState(null)}>
          <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
            <h3>タスクを追加</h3>
            <p className="modal-parent-info">
              列: {COLUMNS.find((c) => c.id === addState.columnId)?.label}
            </p>

            <label className="modal-label">親タスク</label>
            <select
              className="assignee-input"
              value={addState.parentId ?? ""}
              onChange={(e) => setAddState({ ...addState, parentId: e.target.value || undefined })}
            >
              <option value="">なし（ルートタスク）</option>
              {tasks
                .filter((t) => !isLeaf(t.id, tasks))
                .map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
            </select>

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
      )}
    </div>
  );
}
