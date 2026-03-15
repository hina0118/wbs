/**
 * SearchView – タスク横断メモ検索ビュー
 * タスク名 / 担当者 / メモ を横断検索して結果一覧を表示する
 */
import { useState } from "react";
import { Task } from "../types/task";
import TaskEditModal from "./TaskEditModal";
import { computeProgress, getAncestorNames } from "../utils/taskUtils";

interface Props {
  tasks:          Task[];
  query:          string;
  onTasksChange:  (tasks: Task[]) => void;
}

// ── ヘルパー ──────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** クエリに一致する部分を <mark> でハイライトした React ノード列を返す */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase()
          ? <mark key={i} className="search-highlight">{part}</mark>
          : part
      )}
    </>
  );
}


function formatDate(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

/** タスクがクエリにマッチするか（大文字小文字無視）*/
function matchesQuery(task: Task, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    task.name.toLowerCase().includes(lower) ||
    (task.assignee ?? "").toLowerCase().includes(lower) ||
    (task.memo ?? "").toLowerCase().includes(lower)
  );
}

/** どのフィールドがマッチしたかを返す */
function matchFields(task: Task, q: string): { name: boolean; assignee: boolean; memo: boolean } {
  const lower = q.toLowerCase();
  return {
    name:     task.name.toLowerCase().includes(lower),
    assignee: (task.assignee ?? "").toLowerCase().includes(lower),
    memo:     (task.memo     ?? "").toLowerCase().includes(lower),
  };
}

// ── コンポーネント ────────────────────────────────────────

export default function SearchView({ tasks, query, onTasksChange }: Props) {
  const [editingId,     setEditingId]     = useState<string | null>(null);
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());

  function toggleMemo(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedMemos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  const q       = query.trim();
  const results = q ? tasks.filter((t) => matchesQuery(t, q)) : [];

  return (
    <div className="search-view">
      {/* ヘッダー */}
      <div className="search-view-header">
        {q ? (
          <span className="search-view-count">
            「<strong>{q}</strong>」の検索結果: <strong>{results.length}</strong> 件
          </span>
        ) : (
          <span className="search-view-hint">上の検索ボックスにキーワードを入力してください</span>
        )}
      </div>

      {/* 結果一覧 */}
      <div className="search-results">
        {results.length === 0 && q && (
          <div className="search-no-results">
            <span>🔍</span>
            <p>一致するタスクが見つかりませんでした</p>
          </div>
        )}

        {results.map((task) => {
          const progress  = computeProgress(task.id, tasks);
          const ancestors = getAncestorNames(task.id, tasks);
          const matched   = matchFields(task, q);

          return (
            <div
              key={task.id}
              className="search-card"
              style={{ borderLeftColor: task.color ?? "#4A90D9" }}
              onClick={() => setEditingId(task.id)}
            >
              {/* 祖先パス */}
              {ancestors.length > 0 && (
                <div className="search-card-path">{ancestors.join(" › ")}</div>
              )}

              {/* タスク名 */}
              <div className="search-card-name">
                <Highlight text={task.name} query={matched.name ? q : ""} />
              </div>

              {/* メタ情報行 */}
              <div className="search-card-meta">
                {task.assignee && (
                  <span className="search-card-assignee">
                    👤 <Highlight text={task.assignee} query={matched.assignee ? q : ""} />
                  </span>
                )}
                <span className="search-card-dates">
                  📅 {formatDate(task.startDate)} – {formatDate(task.endDate)}
                </span>
                <span className="search-card-progress" style={{ color: task.color ?? "#4A90D9" }}>
                  {progress}%
                </span>
              </div>

              {/* 進捗バー */}
              <div className="search-progress-bar">
                <div
                  className="search-progress-fill"
                  style={{ width: `${progress}%`, background: task.color ?? "#4A90D9" }}
                />
              </div>

              {/* メモ（展開トグル付き） */}
              {task.memo && (
                <div className={`search-card-memo${matched.memo ? "" : " search-card-memo--plain"}`}>
                  {expandedMemos.has(task.id) && (
                    matched.memo
                      ? <Highlight text={task.memo} query={q} />
                      : task.memo
                  )}
                  <button
                    className="memo-toggle-btn memo-toggle-btn--search"
                    onClick={(e) => toggleMemo(task.id, e)}
                  >
                    {expandedMemos.has(task.id) ? "▲ 閉じる" : "▼ メモを見る"}
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>

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
    </div>
  );
}
