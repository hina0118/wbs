/**
 * ArchiveView – アーカイブ済みタスクの一覧・復元ビュー
 * アーカイブされたルートタスクを表示し、選択して復元できる
 */
import { useState } from "react";
import { Task } from "../types/task";
import {
  computeProgress,
  getAllDescendantIds,
  unarchiveTask,
  formatDateYMD,
} from "../utils/taskUtils";

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
}

export default function ArchiveView({ tasks, onTasksChange }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // アーカイブ済みのルートタスクのみ表示
  const archivedRoots = tasks.filter((t) => t.archived && !t.parentId);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleUnarchive() {
    if (selected.size === 0) return;
    let updated = tasks;
    for (const id of selected) {
      updated = unarchiveTask(id, updated);
    }
    onTasksChange(updated);
    setSelected(new Set());
  }

  function handleSelectAll() {
    if (selected.size === archivedRoots.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(archivedRoots.map((t) => t.id)));
    }
  }

  return (
    <div className="archive-view">
      <div className="archive-view-header">
        <div className="archive-view-title">
          <span className="archive-view-icon">🗄</span>
          <h2>アーカイブ</h2>
          <span className="archive-view-count">{archivedRoots.length} 件</span>
        </div>
        {archivedRoots.length > 0 && (
          <div className="archive-view-actions">
            <button className="archive-btn-select-all" onClick={handleSelectAll}>
              {selected.size === archivedRoots.length ? "全て解除" : "全て選択"}
            </button>
            <button
              className="archive-btn-restore"
              onClick={handleUnarchive}
              disabled={selected.size === 0}
            >
              ↩ 復元 {selected.size > 0 ? `(${selected.size})` : ""}
            </button>
          </div>
        )}
      </div>

      {archivedRoots.length === 0 ? (
        <div className="archive-empty">
          <span className="archive-empty-icon">📭</span>
          <p>アーカイブされたタスクはありません</p>
          <p className="archive-empty-hint">
            タスク編集モーダルの「🗄 アーカイブ」ボタンでアーカイブできます
          </p>
        </div>
      ) : (
        <div className="archive-list">
          {archivedRoots.map((task) => {
            const progress = computeProgress(task.id, tasks);
            const descendants = getAllDescendantIds(task.id, tasks);
            const childCount = descendants.length - 1; // 自身を除く
            const isSelected = selected.has(task.id);

            return (
              <div
                key={task.id}
                className={`archive-item${isSelected ? " archive-item--selected" : ""}`}
                onClick={() => toggleSelect(task.id)}
              >
                <input
                  type="checkbox"
                  className="archive-item-checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelect(task.id)}
                  onClick={(e) => e.stopPropagation()}
                />

                <div
                  className="archive-item-color"
                  style={{ background: task.color ?? "#4A90D9" }}
                />

                <div className="archive-item-body">
                  <div className="archive-item-name">{task.name}</div>

                  <div className="archive-item-meta">
                    {task.assignee && (
                      <span className="archive-item-assignee">👤 {task.assignee}</span>
                    )}
                    {!task.isFloating && (
                      <span className="archive-item-dates">
                        📅 {formatDateYMD(task.startDate)} – {formatDateYMD(task.endDate)}
                      </span>
                    )}
                    {childCount > 0 && (
                      <span className="archive-item-children">🗂 サブタスク {childCount} 件</span>
                    )}
                  </div>

                  <div className="archive-item-progress-row">
                    <div className="archive-item-bar">
                      <div
                        className="archive-item-bar-fill"
                        style={{ width: `${progress}%`, background: task.color ?? "#4A90D9" }}
                      />
                    </div>
                    <span className="archive-item-pct">{progress}%</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
