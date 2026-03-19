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

  const [editName,        setEditName]        = useState(task.name);
  const [editProgress,    setEditProgress]    = useState(task.progress);
  const [editAssignee,    setEditAssignee]    = useState(task.assignee    ?? "");
  const [editSubMembers,  setEditSubMembers]  = useState<string[]>(task.subMembers ?? []);
  const [newSubMember,    setNewSubMember]    = useState("");
  const [editStartDate,   setEditStartDate]   = useState(toInputDate(task.startDate));
  const [editEndDate,     setEditEndDate]     = useState(toInputDate(task.endDate));
  const [editMemo,        setEditMemo]        = useState(task.memo ?? "");
  const [editIsFloating,  setEditIsFloating]  = useState(task.isFloating ?? false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initialMode = task.progressCount ? "count" : "percent";
  const [progressMode,  setProgressMode]  = useState<"percent" | "count">(initialMode);
  const [doneCount,     setDoneCount]     = useState(task.progressCount?.done  ?? 0);
  const [totalCount,    setTotalCount]    = useState(task.progressCount?.total ?? 0);

  const effectiveProgress = leaf ? editProgress : computeProgress(task.id, tasks);

  function switchToCount() {
    setProgressMode("count");
  }

  function switchToPercent() {
    setProgressMode("percent");
  }

  function handleDoneChange(val: number) {
    const done  = Math.max(0, val);
    const total = Math.max(done, totalCount);
    setDoneCount(done);
    setTotalCount(total);
    setEditProgress(total > 0 ? Math.round((done / total) * 100) : 0);
  }

  function handleTotalChange(val: number) {
    const total = Math.max(0, val);
    const done  = Math.min(doneCount, total);
    setTotalCount(total);
    setDoneCount(done);
    setEditProgress(total > 0 ? Math.round((done / total) * 100) : 0);
  }

  function handleSave() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStart = today;
    let newEnd   = today;
    if (!editIsFloating) {
      newStart = new Date(editStartDate);
      newEnd   = new Date(editEndDate);
      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;
    }

    const progressCount =
      progressMode === "count" && totalCount > 0
        ? { done: doneCount, total: totalCount }
        : undefined;

    const updated = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            name:          editName.trim() || task.name,
            progress:      editProgress,
            assignee:      editAssignee  || undefined,
            subMembers:    editSubMembers.length > 0 ? editSubMembers : undefined,
            startDate:     newStart,
            endDate:       newEnd,
            memo:          editMemo      || undefined,
            progressCount,
            isFloating:    editIsFloating || undefined,
          }
        : t
    );
    onSave(editIsFloating ? updated : propagateDates(task.id, updated));
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

        {/* 単発タスク（日付未定）チェックボックス */}
        <label className="modal-floating-label">
          <input
            type="checkbox"
            checked={editIsFloating}
            onChange={(e) => setEditIsFloating(e.target.checked)}
            className="modal-floating-checkbox"
          />
          単発タスク（開始時期未定）
        </label>

        {/* 期間 */}
        {!editIsFloating && (
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
        )}

        {/* 担当者（リーフのみ） */}
        {leaf && (
          <>
            <label className="modal-label">担当者（主）</label>
            <input
              type="text"
              value={editAssignee}
              onChange={(e) => setEditAssignee(e.target.value)}
              placeholder="担当者名を入力"
              className="assignee-input"
            />

            <label className="modal-label">サブメンバー</label>
            {editSubMembers.length > 0 && (
              <div className="sub-members-list">
                {editSubMembers.map((member, idx) => (
                  <div key={idx} className="sub-member-item">
                    <span className="sub-member-name">{member}</span>
                    <button
                      className="sub-member-remove"
                      onClick={() => setEditSubMembers(editSubMembers.filter((_, i) => i !== idx))}
                      title="削除"
                    >×</button>
                  </div>
                ))}
              </div>
            )}
            <div className="sub-member-add-row">
              <input
                type="text"
                value={newSubMember}
                onChange={(e) => setNewSubMember(e.target.value)}
                placeholder="メンバー名を入力"
                className="assignee-input sub-member-input"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newSubMember.trim()) {
                    setEditSubMembers([...editSubMembers, newSubMember.trim()]);
                    setNewSubMember("");
                  }
                }}
              />
              <button
                className="btn-add-member"
                onClick={() => {
                  if (newSubMember.trim()) {
                    setEditSubMembers([...editSubMembers, newSubMember.trim()]);
                    setNewSubMember("");
                  }
                }}
                disabled={!newSubMember.trim()}
              >＋ 追加</button>
            </div>
          </>
        )}

        {/* 進捗 */}
        <div className="modal-progress-header">
          <label className="modal-label">
            進捗: <strong>{effectiveProgress}%</strong>
            {!leaf && <span className="modal-label-sub">（子タスクの平均）</span>}
          </label>
          {leaf && (
            <div className="progress-mode-toggle">
              <button
                className={progressMode === "percent" ? "toggle-btn active" : "toggle-btn"}
                onClick={switchToPercent}
              >％</button>
              <button
                className={progressMode === "count" ? "toggle-btn active" : "toggle-btn"}
                onClick={switchToCount}
              >実施数</button>
            </div>
          )}
        </div>
        {leaf ? (
          progressMode === "percent" ? (
            <input
              type="range"
              min={0} max={100}
              value={editProgress}
              onChange={(e) => setEditProgress(Number(e.target.value))}
              className="progress-slider"
            />
          ) : (
            <div className="progress-count-row">
              <input
                type="number"
                min={0}
                value={doneCount}
                onChange={(e) => handleDoneChange(Number(e.target.value))}
                className="count-input"
                placeholder="実施数"
              />
              <span className="count-separator">/</span>
              <input
                type="number"
                min={0}
                value={totalCount}
                onChange={(e) => handleTotalChange(Number(e.target.value))}
                className="count-input"
                placeholder="全体数"
              />
            </div>
          )
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
