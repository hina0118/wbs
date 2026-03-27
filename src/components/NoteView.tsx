/**
 * NoteView – Obsidian 風のメモビュー
 * 左: タスクツリー / 右: 選択タスクのメモ（閲覧・編集）
 */
import { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
import { markdownComponents } from "./MarkdownComponents";
import { Task } from "../types/task";
import { computeProgress, getSignalStatus } from "../utils/taskUtils";

const INDENT_PER_LEVEL = 16;

const turndownService = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });

function getDepth(taskId: string, tasks: Task[]): number {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return 0;
  return 1 + getDepth(task.parentId, tasks);
}

function getAncestors(taskId: string, tasks: Task[]): Task[] {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return [];
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return [];
  return [...getAncestors(parent.id, tasks), parent];
}

function isVisibleInTree(task: Task, tasks: Task[], collapsedIds: Set<string>): boolean {
  if (!task.parentId) return true;
  if (collapsedIds.has(task.parentId)) return false;
  const parent = tasks.find((t) => t.id === task.parentId);
  if (!parent) return true;
  return isVisibleInTree(parent, tasks, collapsedIds);
}

interface Props {
  tasks: Task[];
  onTasksChange: (tasks: Task[]) => void;
}

export default function NoteView({ tasks, onTasksChange }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(new Set());
  const [treeSearch, setTreeSearch] = useState("");
  const [isEditing, setIsEditing] = useState(false);
  const [draftMemo, setDraftMemo] = useState("");

  const activeTasks = useMemo(() => tasks.filter((t) => !t.archived), [tasks]);

  const searchLower = treeSearch.toLowerCase().trim();

  const matchingIds = useMemo(() => {
    if (!searchLower) return null;
    return new Set(
      activeTasks.filter((t) => t.name.toLowerCase().includes(searchLower)).map((t) => t.id),
    );
  }, [activeTasks, searchLower]);

  const visibleTreeTasks = useMemo(() => {
    if (searchLower) {
      return activeTasks.filter((t) => matchingIds?.has(t.id));
    }
    // ガントチャートと同様: スケジュール済みタスク（ツリー順）→ 未スケジュールタスクを末尾に
    const scheduled = activeTasks.filter(
      (t) => !t.isFloating && isVisibleInTree(t, activeTasks, collapsedIds),
    );
    const floating = activeTasks.filter((t) => t.isFloating);
    return [...scheduled, ...floating];
  }, [activeTasks, collapsedIds, searchLower, matchingIds]);

  const selectedTask = selectedId ? (activeTasks.find((t) => t.id === selectedId) ?? null) : null;
  const ancestors = selectedTask ? getAncestors(selectedTask.id, activeTasks) : [];

  function handleToggleCollapse(taskId: string) {
    setCollapsedIds((prev) => {
      const next = new Set(prev);
      if (next.has(taskId)) next.delete(taskId);
      else next.add(taskId);
      return next;
    });
  }

  function handleSelectTask(task: Task) {
    if (isEditing) return;
    setSelectedId(task.id);
  }

  function handleStartEdit() {
    setDraftMemo(selectedTask?.memo ?? "");
    setIsEditing(true);
  }

  function handleSave() {
    if (!selectedTask) return;
    const updated = tasks.map((t) => (t.id === selectedTask.id ? { ...t, memo: draftMemo } : t));
    onTasksChange(updated);
    setIsEditing(false);
  }

  function handleCancel() {
    setIsEditing(false);
    setDraftMemo("");
  }

  function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const html = e.clipboardData.getData("text/html");
    if (!html) return;
    e.preventDefault();
    const markdown = turndownService.turndown(html);
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setDraftMemo((v) => v.slice(0, start) + markdown + v.slice(end));
  }

  return (
    <div className="note-view">
      {/* ── 左: タスクツリー ── */}
      <div className="note-tree-panel">
        <div className="note-tree-header">タスク一覧</div>

        <div className="note-tree-search-wrap">
          <input
            type="text"
            className="note-tree-search"
            placeholder="タスクを検索..."
            value={treeSearch}
            onChange={(e) => setTreeSearch(e.target.value)}
          />
          {treeSearch && (
            <button className="note-tree-search-clear" onClick={() => setTreeSearch("")}>
              ✕
            </button>
          )}
        </div>

        <div className="note-tree-body">
          {visibleTreeTasks.length === 0 && (
            <div className="note-tree-empty">
              {searchLower ? "一致するタスクがありません" : "タスクがありません"}
            </div>
          )}
          {visibleTreeTasks.map((task) => {
            const depth = searchLower || task.isFloating ? 0 : getDepth(task.id, activeTasks);
            const hasChildren = activeTasks.some((t) => t.parentId === task.id);
            const isCollapsed = collapsedIds.has(task.id);
            const isSelected = task.id === selectedId;
            const hasMemo = !!(task.memo && task.memo.trim());
            const signal = getSignalStatus(task.id, activeTasks);

            return (
              <div
                key={task.id}
                className={`note-tree-item${isSelected ? " note-tree-item--selected" : ""}`}
                style={{ paddingLeft: depth * INDENT_PER_LEVEL + 8 }}
                onClick={() => handleSelectTask(task)}
                title={task.name}
              >
                {hasChildren && !searchLower ? (
                  <button
                    className="note-tree-collapse-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleToggleCollapse(task.id);
                    }}
                  >
                    {isCollapsed ? "▶" : "▼"}
                  </button>
                ) : (
                  <span className="note-tree-leaf-icon">─</span>
                )}
                {signal !== "none" && <span className={`status-signal status-signal--${signal}`} />}
                <span className="note-tree-item-name">{task.name}</span>
                {hasMemo && <span className="note-tree-memo-dot" title="メモあり" />}
              </div>
            );
          })}
        </div>
      </div>

      {/* ── 右: メモコンテンツ ── */}
      <div className="note-content-panel">
        {!selectedTask ? (
          <div className="note-content-empty">
            <span className="note-content-empty-icon">📝</span>
            <p>左のツリーからタスクを選択してください</p>
          </div>
        ) : (
          <div className="note-content-inner">
            {/* パンくずリスト */}
            {ancestors.length > 0 && (
              <div className="note-breadcrumb">
                {ancestors.map((a, i) => (
                  <span key={a.id}>
                    <span
                      className="note-breadcrumb-item"
                      onClick={() => handleSelectTask(a)}
                      title={a.name}
                    >
                      {a.name}
                    </span>
                    <span className="note-breadcrumb-sep">{i < ancestors.length ? " / " : ""}</span>
                  </span>
                ))}
              </div>
            )}

            {/* タスク名 */}
            <h1 className="note-task-title">{selectedTask.name}</h1>

            {/* メタ情報 */}
            <div className="note-meta">
              {!selectedTask.isFloating && (
                <span className="note-meta-item">
                  📅 {selectedTask.startDate.toLocaleDateString("ja-JP")} ～{" "}
                  {selectedTask.endDate.toLocaleDateString("ja-JP")}
                </span>
              )}
              {selectedTask.assignee && (
                <span className="note-meta-item">👤 {selectedTask.assignee}</span>
              )}
              <span className="note-meta-item">
                <span
                  className="note-meta-progress"
                  style={{ background: selectedTask.color || "#4A90D9" }}
                >
                  {computeProgress(selectedTask.id, activeTasks)}%
                </span>
              </span>
            </div>

            <div className="note-divider" />

            {/* ツールバー */}
            <div className="note-toolbar">
              {!isEditing ? (
                <button className="note-btn note-btn--edit" onClick={handleStartEdit}>
                  ✏️ 編集
                </button>
              ) : (
                <>
                  <button className="note-btn note-btn--save" onClick={handleSave}>
                    💾 保存
                  </button>
                  <button className="note-btn note-btn--cancel" onClick={handleCancel}>
                    キャンセル
                  </button>
                </>
              )}
            </div>

            {/* メモ表示 / 編集 */}
            {!isEditing ? (
              <div className="note-memo-view">
                {selectedTask.memo && selectedTask.memo.trim() ? (
                  <div className="markdown-body">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {selectedTask.memo}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="note-memo-empty">
                    メモがありません。「✏️ 編集」ボタンをクリックして追加してください。
                  </div>
                )}
              </div>
            ) : (
              <div className="note-editor-split">
                <textarea
                  className="note-editor-textarea"
                  value={draftMemo}
                  onChange={(e) => setDraftMemo(e.target.value)}
                  onPaste={handlePaste}
                  placeholder={"Markdown 形式で入力できます\n例: **太字** `コード` - リスト"}
                  autoFocus
                />
                <div className="note-editor-divider" />
                <div className="note-editor-preview markdown-body">
                  {draftMemo.trim() ? (
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                      {draftMemo}
                    </ReactMarkdown>
                  ) : (
                    <span className="memo-preview-empty">プレビュー</span>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
