import { useState } from "react";
import { Task } from "../types/task";
import { isLeaf, toInputDate, genId } from "../utils/taskUtils";

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

interface Props {
  parentTask?: Task;
  initialProgress?: number;
  defaultParentId?: string;
  allTasks: Task[];
  onConfirm: (task: Task) => void;
  onClose: () => void;
}

export default function TaskAddModal({
  parentTask,
  initialProgress = 0,
  defaultParentId,
  allTasks,
  onConfirm,
  onClose,
}: Props) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [name,      setName]      = useState("");
  const [startDate, setStartDate] = useState(toInputDate(today));
  const [endDate,   setEndDate]   = useState(toInputDate(addDays(today, 6)));
  const [color,     setColor]     = useState(parentTask?.color ?? "#4A90D9");
  const [parentId,  setParentId]  = useState<string | undefined>(
    parentTask?.id ?? defaultParentId
  );

  function handleConfirm() {
    if (!name.trim()) return;
    const newStart = new Date(startDate);
    const newEnd   = new Date(endDate);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;

    const newTask: Task = {
      id:        genId(),
      name:      name.trim(),
      startDate: newStart,
      endDate:   newEnd,
      progress:  initialProgress,
      color,
      ...(parentId ? { parentId } : {}),
    };
    onConfirm(newTask);
  }

  const title = parentTask ? "サブタスクを追加" : "タスクを追加";
  const nonLeafTasks = allTasks.filter((t) => !isLeaf(t.id, allTasks));

  return (
    <div className="gantt-modal-overlay" onClick={onClose}>
      <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {parentTask && <p className="modal-parent-info">親タスク: {parentTask.name}</p>}

        {!parentTask && (
          <>
            <label className="modal-label">親タスク</label>
            <select
              className="assignee-input"
              value={parentId ?? ""}
              onChange={(e) => setParentId(e.target.value || undefined)}
            >
              <option value="">なし（ルートタスク）</option>
              {nonLeafTasks.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </>
        )}

        <label className="modal-label">タスク名 <span className="modal-required">*</span></label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="タスク名を入力"
          className="assignee-input"
          autoFocus
          onKeyDown={(e) => { if (e.key === "Enter") handleConfirm(); }}
        />

        <div className="modal-date-row">
          <div className="modal-date-field">
            <label className="modal-label">開始日</label>
            <input type="date" value={startDate} max={endDate} onChange={(e) => setStartDate(e.target.value)} className="date-input" />
          </div>
          <div className="modal-date-field">
            <label className="modal-label">終了日</label>
            <input type="date" value={endDate} min={startDate} onChange={(e) => setEndDate(e.target.value)} className="date-input" />
          </div>
        </div>

        <div className="modal-color-row">
          <label className="modal-label">カラー</label>
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="color-input" />
          <span className="modal-color-preview" style={{ background: color }} />
        </div>

        <div className="gantt-modal-actions">
          <button className="btn-cancel" onClick={onClose}>キャンセル</button>
          <button className="btn-save" onClick={handleConfirm} disabled={!name.trim()}>追加</button>
        </div>
      </div>
    </div>
  );
}
