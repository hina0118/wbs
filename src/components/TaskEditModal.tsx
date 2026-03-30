/**
 * TaskEditModal – タスク編集モーダル（共有コンポーネント）
 * GanttChart / KanbanBoard / SearchView で共通利用
 */
import { useState, useRef, useEffect } from "react";
import { Task, ReminderRepeat } from "../types/task";
import {
  isLeaf,
  computeProgress,
  propagateDates,
  getAllDescendantIds,
  toInputDate,
  archiveTask,
} from "../utils/taskUtils";

// カスタムコンボボックス（担当者候補をテーマに合わせて表示）
function MemberCombobox({
  value,
  onChange,
  suggestions,
  placeholder,
  className,
  onKeyDown,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
  placeholder?: string;
  className?: string;
  onKeyDown?: (e: React.KeyboardEvent<HTMLInputElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="combobox-wrapper" ref={containerRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
        className={`assignee-input${className ? ` ${className}` : ""}`}
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            onChange(filtered[activeIndex]);
            setOpen(false);
            setActiveIndex(-1);
          } else if (e.key === "Escape") {
            setOpen(false);
          } else {
            onKeyDown?.(e);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="combobox-dropdown">
          {filtered.map((s, i) => (
            <li
              key={s}
              className={`combobox-option${i === activeIndex ? " active" : ""}`}
              onMouseDown={() => {
                onChange(s);
                setOpen(false);
                setActiveIndex(-1);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  task: Task;
  tasks: Task[];
  onSave: (updatedTasks: Task[]) => void;
  onDelete: (updatedTasks: Task[]) => void;
  onArchive: (updatedTasks: Task[]) => void;
  onClose: () => void;
  onOpenMemoPanel?: () => void;
}

export default function TaskEditModal({
  task,
  tasks,
  onSave,
  onDelete,
  onArchive,
  onClose,
  onOpenMemoPanel,
}: Props) {
  const leaf = isLeaf(task.id, tasks);

  // 既存タスクから全メンバー名を収集（候補リスト用）
  const allMembers = [
    ...new Set(
      tasks.flatMap((t) => [t.assignee, ...(t.subMembers ?? [])]).filter((m): m is string => !!m),
    ),
  ];

  const [editName, setEditName] = useState(task.name);
  const [editProgress, setEditProgress] = useState(task.progress);
  const [editAssignee, setEditAssignee] = useState(task.assignee ?? "");
  const [editSubMembers, setEditSubMembers] = useState<string[]>(task.subMembers ?? []);
  const [newSubMember, setNewSubMember] = useState("");
  const [editStartDate, setEditStartDate] = useState(toInputDate(task.startDate));
  const [editEndDate, setEditEndDate] = useState(toInputDate(task.endDate));
  const [editIsFloating, setEditIsFloating] = useState(task.isFloating ?? false);
  const [editReminderDatetime, setEditReminderDatetime] = useState(task.reminder?.datetime ?? "");
  const [editReminderRepeat, setEditReminderRepeat] = useState<ReminderRepeat>(
    task.reminder?.repeat ?? "none",
  );
  const [confirmDelete, setConfirmDelete] = useState(false);
  const initialMode = task.progressCount ? "count" : "percent";
  const [progressMode, setProgressMode] = useState<"percent" | "count">(initialMode);
  const [doneCount, setDoneCount] = useState(task.progressCount?.done ?? 0);
  const [totalCount, setTotalCount] = useState(task.progressCount?.total ?? 0);

  const effectiveProgress = leaf ? editProgress : computeProgress(task.id, tasks);

  function switchToCount() {
    setProgressMode("count");
  }

  function switchToPercent() {
    setProgressMode("percent");
  }

  function handleDoneChange(val: number) {
    const done = Math.max(0, val);
    const total = Math.max(done, totalCount);
    setDoneCount(done);
    setTotalCount(total);
    setEditProgress(total > 0 ? Math.round((done / total) * 100) : 0);
  }

  function handleTotalChange(val: number) {
    const total = Math.max(0, val);
    const done = Math.min(doneCount, total);
    setTotalCount(total);
    setDoneCount(done);
    setEditProgress(total > 0 ? Math.round((done / total) * 100) : 0);
  }

  function handleSave() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let newStart = today;
    let newEnd = today;
    if (!editIsFloating) {
      newStart = new Date(editStartDate);
      newEnd = new Date(editEndDate);
      if (isNaN(newStart.getTime()) || isNaN(newEnd.getTime()) || newStart > newEnd) return;
    }

    const progressCount =
      progressMode === "count" && totalCount > 0
        ? { done: doneCount, total: totalCount }
        : undefined;

    // リマインダー: 日時が変わった場合は notified をリセット
    const reminderChanged = editReminderDatetime !== (task.reminder?.datetime ?? "");
    const reminder = editReminderDatetime
      ? {
          datetime: editReminderDatetime,
          notified: reminderChanged ? false : (task.reminder?.notified ?? false),
          repeat: editReminderRepeat,
        }
      : undefined;

    const updated = tasks.map((t) =>
      t.id === task.id
        ? {
            ...t,
            name: editName.trim() || task.name,
            progress: editProgress,
            assignee: editAssignee || undefined,
            subMembers: editSubMembers.length > 0 ? editSubMembers : undefined,
            startDate: newStart,
            endDate: newEnd,
            memo: task.memo,
            progressCount,
            isFloating: editIsFloating || undefined,
            reminder,
          }
        : t,
    );
    onSave(editIsFloating ? updated : propagateDates(task.id, updated));
  }

  function handleDelete() {
    const removeIds = new Set(getAllDescendantIds(task.id, tasks));
    const filtered = tasks.filter((t) => !removeIds.has(t.id));
    onDelete(task.parentId ? propagateDates(task.parentId, filtered) : filtered);
  }

  // ルートタスク（parentId なし）のみアーカイブ可能
  const canArchive = !task.parentId;

  function handleArchive() {
    onArchive(archiveTask(task.id, tasks));
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
              <input
                type="date"
                value={editStartDate}
                max={editEndDate}
                onChange={(e) => setEditStartDate(e.target.value)}
                className="date-input"
              />
            </div>
            <div className="modal-date-field">
              <label className="modal-label">終了日</label>
              <input
                type="date"
                value={editEndDate}
                min={editStartDate}
                onChange={(e) => setEditEndDate(e.target.value)}
                className="date-input"
              />
            </div>
          </div>
        )}

        {/* リマインダー */}
        <div className="modal-reminder-row">
          <label className="modal-label">🔔 リマインダー日時</label>
          <div className="modal-reminder-input-wrap">
            <input
              type="datetime-local"
              value={editReminderDatetime}
              onChange={(e) => setEditReminderDatetime(e.target.value)}
              className="date-input"
            />
            {editReminderDatetime && (
              <button
                type="button"
                className="btn-clear-reminder"
                onClick={() => {
                  setEditReminderDatetime("");
                  setEditReminderRepeat("none");
                }}
                title="リマインダーを削除"
                aria-label="リマインダーを削除"
              >
                ✕
              </button>
            )}
          </div>
          {editReminderDatetime && (
            <div className="modal-reminder-repeat-row">
              <label className="modal-label-inline">繰り返し</label>
              <select
                value={editReminderRepeat}
                onChange={(e) => setEditReminderRepeat(e.target.value as ReminderRepeat)}
                className="reminder-repeat-select"
              >
                <option value="none">なし</option>
                <option value="daily">毎日</option>
                <option value="weekly">毎週</option>
                <option value="monthly">毎月</option>
              </select>
            </div>
          )}
          {task.reminder?.notified && editReminderDatetime === task.reminder.datetime && (
            <span className="reminder-notified-label">✅ 通知済み</span>
          )}
        </div>

        {/* 担当者（リーフのみ） */}
        {leaf && (
          <>
            <label className="modal-label">担当者（主）</label>
            <MemberCombobox
              value={editAssignee}
              onChange={setEditAssignee}
              suggestions={allMembers}
              placeholder="担当者名を入力"
            />

            <label className="modal-label">サブメンバー</label>
            {editSubMembers.length > 0 && (
              <div className="sub-members-list">
                {editSubMembers.map((member, idx) => (
                  // 同名メンバーが複数存在しうるため idx を組み合わせて一意性を確保
                  <div key={`${member}-${idx}`} className="sub-member-item">
                    <span className="sub-member-name">{member}</span>
                    <button
                      className="sub-member-remove"
                      onClick={() => setEditSubMembers(editSubMembers.filter((_, i) => i !== idx))}
                      title="削除"
                      aria-label={`${member} を削除`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="sub-member-add-row">
              <MemberCombobox
                value={newSubMember}
                onChange={setNewSubMember}
                suggestions={allMembers}
                placeholder="メンバー名を入力"
                className="sub-member-input"
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
              >
                ＋ 追加
              </button>
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
              >
                ％
              </button>
              <button
                className={progressMode === "count" ? "toggle-btn active" : "toggle-btn"}
                onClick={switchToCount}
              >
                実施数
              </button>
            </div>
          )}
        </div>
        {leaf ? (
          progressMode === "percent" ? (
            <input
              type="range"
              min={0}
              max={100}
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
            <div
              className="progress-bar-readonly-fill"
              style={{ width: `${effectiveProgress}%` }}
            />
          </div>
        )}

        {/* メモ */}
        {onOpenMemoPanel && (
          <button
            type="button"
            className="btn-open-memo-panel"
            onClick={onOpenMemoPanel}
            title="フローティングパネルでメモを編集"
          >
            ✏️ メモを編集（別ウィンドウ）
          </button>
        )}

        {/* アクション */}
        <div className="gantt-modal-actions">
          {confirmDelete ? (
            <>
              <span className="modal-delete-confirm">
                {!leaf ? "子タスクも全て削除します。よろしいですか？" : "削除しますか？"}
              </span>
              <button className="btn-cancel" onClick={() => setConfirmDelete(false)}>
                いいえ
              </button>
              <button className="btn-delete" onClick={handleDelete}>
                削除する
              </button>
            </>
          ) : (
            <>
              <button className="btn-delete-outline" onClick={() => setConfirmDelete(true)}>
                削除
              </button>
              {canArchive && (
                <button
                  className="btn-archive-outline"
                  onClick={handleArchive}
                  title="このタスクと配下を全てアーカイブします"
                >
                  🗄 アーカイブ
                </button>
              )}
              <button className="btn-cancel" onClick={onClose}>
                キャンセル
              </button>
              <button className="btn-save" onClick={handleSave}>
                保存
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
