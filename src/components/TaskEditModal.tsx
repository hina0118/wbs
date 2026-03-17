/**
 * TaskEditModal – タスク編集モーダル（共有コンポーネント）
 * GanttChart / KanbanBoard / SearchView で共通利用
 */
import { useState } from "react";
import { Task } from "../types/task";
import MemoField from "./MemoField";
import {
  isLeaf,
  computeProgress,
  propagateDates,
  getAllDescendantIds,
  toInputDate,
} from "../utils/taskUtils";

interface Props {
  task: Task;
  tasks: Task[];
  onSave:   (updatedTasks: Task[]) => void;
  onDelete: (updatedTasks: Task[]) => void;
  onClose:  () => void;
}

export default function TaskEditModal({ task, tasks, onSave, onDelete, onClose }: Props) {
  const leaf = isLeaf(task.id, tasks);

  const [editName,      setEditName]      = useState(task.name);
  const [editProgress,  setEditProgress]  = useState(task.progress);
  const [editAssignee,  setEditAssignee]  = useState(task.assignee  ?? "");
  const [editStartDate, setEditStartDate] = useState(toInputDate(task.startDate));
  const [editEndDate,   setEditEndDate]   = useState(toInputDate(task.endDate));
  const [editMemo,      setEditMemo]      = useState(task.memo ?? "");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const effectiveProgress = leaf ? editProgress : computeProgress(task.id, tasks);

  function handleSave() {
    const newStart = new Date(editStartDate);
    const newEnd   = new Date(editEndDate);
    if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;

    const updated = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            name:      editName.trim() || task.name,
            progress:  editProgress,
            assignee:  editAssignee  || undefined,
            startDate: newStart,
            endDate:   newEnd,
            memo:      editMemo      || undefined,
          }
        : t
    );
    onSave(propagateDates(task.id, updated));
  }

  function handleDelete() {
    const removeIds = new Set(getAllDescendantIds(task.id, tasks));
    const filtered  = tasks.filter((t) => !removeIds.has(t.id));
    onDelete(task.parentId ? propagateDates(task.parentId, filtered) : filtered);
  }

  return (
    <div className="gantt-modal-overlay" onClick={onClose}>
      <div className="gantt-modal" onClick={(e) => e.stopPropagation()}>
        <input
          type="text"
          value={editName}
          onChange={(e) => setEditName(e.target.value)}
          className="task-name-input"
          placeholder="タスク名を入力"
        />

        {/* 期間 */}
        <div className="modal-date-row">
          <div className="modal-date-field">
            <label className="modal-label">開始日</label>
            <input type="date" value={editStartDate} max={editEndDate}   onChange={(e) => setEditStartDate(e.target.value)} className="date-input" />
          </div>
          <div className="modal-date-field">
            <label className="modal-label">終了日</label>
            <input type="date" value={editEndDate}   min={editStartDate} onChange={(e) => setEditEndDate(e.target.value)}   className="date-input" />
          </div>
        </div>

        {/* 担当者（リーフのみ） */}
        {leaf && (
          <>
            <label className="modal-label">担当者</label>
            <input
              type="text"
              value={editAssignee}
              onChange={(e) => setEditAssignee(e.target.value)}
              placeholder="担当者名を入力"
              className="assignee-input"
            />
          </>
        )}

        {/* 進捗 */}
        <label className="modal-label">
          進捗: <strong>{effectiveProgress}%</strong>
          {!leaf && <span className="modal-label-sub">（子タスクの平均）</span>}
        </label>
        {leaf ? (
          <input
            type="range"
            min={0} max={100}
            value={editProgress}
            onChange={(e) => setEditProgress(Number(e.target.value))}
            className="progress-slider"
          />
        ) : (
          <div className="progress-bar-readonly">
            <div className="progress-bar-readonly-fill" style={{ width: `${effectiveProgress}%` }} />
          </div>
        )}

        {/* メモ（Markdown） */}
        <MemoField value={editMemo} onChange={setEditMemo} />

        {/* アクション */}
        <div className="gantt-modal-actions">
          {confirmDelete ? (
            <>
              <span className="modal-delete-confirm">
                {!leaf ? "子タスクも全て削除します。よろしいですか？" : "削除しますか？"}
              </span>
              <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>いいえ</button>
              <button className="btn-delete" onClick={handleDelete}>削除する</button>
            </>
          ) : (
            <>
              <button className="btn-delete-outline" onClick={() => setConfirmDelete(true)}>削除</button>
              <button className="btn-cancel" onClick={onClose}>キャンセル</button>
              <button className="btn-save" onClick={handleSave}>保存</button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
