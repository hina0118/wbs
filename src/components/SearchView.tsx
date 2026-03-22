/**
 * SearchView – タスク横断検索（リスト表示）
 * メモにマッチしたタスクは自動展開して内容を表示する
 */
import { useEffect, useState } from "react";
import { Task } from "../types/task";
import MemoWithToggle from "./MemoWithToggle";
import { computeProgress, getAncestorNames, formatDateYMD } from "../utils/taskUtils";

interface Props {
  tasks: Task[];
  query: string;
}

// ── ヘルパー ──────────────────────────────────────────────

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const parts = text.split(new RegExp(`(${escapeRegex(query)})`, "gi"));
  return (
    <>
      {parts.map((part, i) =>
        part.toLowerCase() === query.toLowerCase() ? (
          <mark key={i} className="search-highlight">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

function matchesQuery(task: Task, q: string): boolean {
  const lower = q.toLowerCase();
  return (
    task.name.toLowerCase().includes(lower) ||
    (task.assignee ?? "").toLowerCase().includes(lower) ||
    (task.memo ?? "").toLowerCase().includes(lower)
  );
}

function matchFields(task: Task, q: string) {
  const lower = q.toLowerCase();
  return {
    name: task.name.toLowerCase().includes(lower),
    assignee: (task.assignee ?? "").toLowerCase().includes(lower),
    memo: (task.memo ?? "").toLowerCase().includes(lower),
  };
}

// ── コンポーネント ────────────────────────────────────────

export default function SearchView({ tasks, query }: Props) {
  const [expandedMemos, setExpandedMemos] = useState<Set<string>>(new Set());

  const q = query.trim();
  const results = q ? tasks.filter((t) => !t.archived && matchesQuery(t, q)) : [];

  // クエリが変わったら、メモにマッチしたタスクを自動展開
  useEffect(() => {
    const lower = q.toLowerCase();
    const autoIds = q
      ? tasks
          .filter((t) => !t.archived && (t.memo ?? "").toLowerCase().includes(lower))
          .map((t) => t.id)
      : [];
    setExpandedMemos(new Set(autoIds));
    // tasks を依存配列に含めると「タスク追加時にもメモ展開がリセットされる」副作用が生じるため意図的に除外
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function toggleMemo(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    setExpandedMemos((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

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

      {/* 結果リスト */}
      <div className="search-list">
        {results.length === 0 && q && (
          <div className="search-no-results">
            <span>🔍</span>
            <p>一致するタスクが見つかりませんでした</p>
          </div>
        )}

        {results.map((task) => {
          const progress = computeProgress(task.id, tasks);
          const ancestors = getAncestorNames(task.id, tasks);
          const matched = matchFields(task, q);

          return (
            <div
              key={task.id}
              className="search-item"
              style={{ borderLeftColor: task.color ?? "#4A90D9" }}
            >
              {/* パス + 進捗% */}
              <div className="search-item-top">
                {ancestors.length > 0 && (
                  <span className="search-item-path">{ancestors.join(" › ")}</span>
                )}
                <span className="search-item-pct" style={{ color: task.color ?? "#4A90D9" }}>
                  {progress}%
                </span>
              </div>

              {/* タスク名 */}
              <div className="search-item-name">
                <Highlight text={task.name} query={matched.name ? q : ""} />
              </div>

              {/* 進捗バー */}
              <div className="search-item-bar">
                <div
                  className="search-item-bar-fill"
                  style={{ width: `${progress}%`, background: task.color ?? "#4A90D9" }}
                />
              </div>

              {/* メタ情報 */}
              <div className="search-item-meta">
                {task.assignee && (
                  <span className="search-item-assignee">
                    👤 <Highlight text={task.assignee} query={matched.assignee ? q : ""} />
                  </span>
                )}
                <span className="search-item-dates">
                  📅 {formatDateYMD(task.startDate)} – {formatDateYMD(task.endDate)}
                </span>
                {matched.memo && task.memo && (
                  <span className="search-item-memo-badge">📝 メモに一致</span>
                )}
              </div>

              {/* メモ（Markdown・展開トグル） */}
              {task.memo && (
                <MemoWithToggle
                  memo={task.memo}
                  expanded={expandedMemos.has(task.id)}
                  onToggle={(e) => toggleMemo(task.id, e)}
                  className="search-item-memo"
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
