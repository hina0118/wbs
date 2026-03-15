import { useState } from "react";
import { Task } from "../types/task";

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
}

// ── ヘルパー ─────────────────────────────────────────────

function isLeaf(taskId: string, tasks: Task[]): boolean {
  return !tasks.some((t) => t.parentId === taskId);
}

function computeProgress(taskId: string, tasks: Task[]): number {
  const children = tasks.filter((t) => t.parentId === taskId);
  if (children.length === 0) return tasks.find((t) => t.id === taskId)?.progress ?? 0;
  const avg = children.reduce((sum, c) => sum + computeProgress(c.id, tasks), 0) / children.length;
  return Math.round(avg);
}

function propagateDates(changedId: string, tasks: Task[]): Task[] {
  const task = tasks.find((t) => t.id === changedId);
  if (!task?.parentId) return tasks;
  const siblings  = tasks.filter((t) => t.parentId === task.parentId);
  const newStart  = siblings.reduce((m, t) => (t.startDate < m ? t.startDate : m), siblings[0].startDate);
  const newEnd    = siblings.reduce((m, t) => (t.endDate   > m ? t.endDate   : m), siblings[0].endDate);
  const updated   = tasks.map((t) => t.id === task.parentId ? { ...t, startDate: newStart, endDate: newEnd } : t);
  return propagateDates(task.parentId, updated);
}

function getAllDescendantIds(taskId: string, tasks: Task[]): string[] {
  const children = tasks.filter((t) => t.parentId === taskId);
  return [taskId, ...children.flatMap((c) => getAllDescendantIds(c.id, tasks))];
}

/** ルートから対象タスクまでの祖先名を配列で返す（自身は含まない） */
function getAncestorNames(taskId: string, tasks: Task[]): string[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return [];
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return [];
  return [...getAncestorNames(parent.id, tasks), parent.name];
}

function toInputDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateShort(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function genId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
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
}

// ── コンポーネント ────────────────────────────────────────

export default function KanbanBoard({ tasks, onTasksChange }: Props) {
  const [editingId,        setEditingId]        = useState<string | null>(null);
  const [editingProgress,  setEditingProgress]  = useState(0);
  const [editingAssignee,  setEditingAssignee]  = useState("");
  const [editingStartDate, setEditingStartDate] = useState("");
  const [editingEndDate,   setEditingEndDate]   = useState("");
  const [confirmDelete,    setConfirmDelete]    = useState(false);

  const [addState, setAddState] = useState<AddState | null>(null);

  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<Column["id"] | null>(null);

  // リーフタスクのみ対象
  const leafTasks = tasks.filter((t) => isLeaf(t.id, tasks));

  function openEdit(task: Task) {
    setEditingId(task.id);
    setEditingProgress(task.progress);
    setEditingAssignee(task.assignee ?? "");
    setEditingStartDate(toInputDate(task.startDate));
    setEditingEndDate(toInputDate(task.endDate));
    setConfirmDelete(false);
  }

  function saveEdit() {
    if (!editingId) return;
    const newStart = new Date(editingStartDate);
    const newEnd   = new Date(editingEndDate);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;

    const updated = tasks.map((t) =>
      t.id === editingId
        ? { ...t, progress: editingProgress, assignee: editingAssignee || undefined, startDate: newStart, endDate: newEnd }
        : t
    );
    onTasksChange(propagateDates(editingId, updated));
    setEditingId(null);
  }

  function deleteTask(id: string) {
    const removeIds = new Set(getAllDescendantIds(id, tasks));
    const task      = tasks.find((t) => t.id === id);
    const filtered  = tasks.filter((t) => !removeIds.has(t.id));
    onTasksChange(task?.parentId ? propagateDates(task.parentId, filtered) : filtered);
    setEditingId(null);
  }

  function openAdd(columnId: Column["id"]) {
    const today = new Date();
    setAddState({
      columnId,
      name:      "",
      startDate: toInputDate(today),
      endDate:   toInputDate(new Date(today.getTime() + 6 * 86400000)),
      color:     "#4A90D9",
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
      {COLUMNS.map((col) => {
        const colTasks = leafTasks.filter((t) => col.match(computeProgress(t.id, tasks)));
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

      {/* ── 編集モーダル ── */}
      {editingId !== null && (() => {
        const task      = tasks.find((t) => t.id === editingId)!;
        const hasChildren = tasks.some((t) => t.parentId === task.id);
        return (
          <div className="gantt-modal-overlay" onClick={saveEdit}>
            <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
              <h3>{task.name}</h3>

              <div className="modal-date-row">
                <div className="modal-date-field">
                  <label className="modal-label">開始日</label>
                  <input type="date" value={editingStartDate} max={editingEndDate} onChange={(e) => setEditingStartDate(e.target.value)} className="date-input" />
                </div>
                <div className="modal-date-field">
                  <label className="modal-label">終了日</label>
                  <input type="date" value={editingEndDate} min={editingStartDate} onChange={(e) => setEditingEndDate(e.target.value)} className="date-input" />
                </div>
              </div>

              <label className="modal-label">担当者</label>
              <input type="text" value={editingAssignee} onChange={(e) => setEditingAssignee(e.target.value)} placeholder="担当者名を入力" className="assignee-input" />

              <label className="modal-label">進捗: <strong>{editingProgress}%</strong></label>
              <input type="range" min={0} max={100} value={editingProgress} onChange={(e) => setEditingProgress(Number(e.target.value))} className="progress-slider" />

              <div className="gantt-modal-actions">
                {confirmDelete ? (
                  <>
                    <span className="modal-delete-confirm">
                      {hasChildren ? "子タスクも全て削除します。よろしいですか？" : "削除しますか？"}
                    </span>
                    <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>いいえ</button>
                    <button className="btn-delete" onClick={() => deleteTask(editingId)}>削除する</button>
                  </>
                ) : (
                  <>
                    <button className="btn-delete-outline" onClick={() => setConfirmDelete(true)}>削除</button>
                    <button className="btn-cancel" onClick={() => setEditingId(null)}>キャンセル</button>
                    <button className="btn-save" onClick={saveEdit}>保存</button>
                  </>
                )}
              </div>
            </div>
          </div>
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
