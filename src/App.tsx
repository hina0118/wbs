import { useEffect, useRef, useState } from "react";
import GanttChart        from "./components/GanttChart";
import KanbanBoard       from "./components/KanbanBoard";
import SearchView        from "./components/SearchView";
import ProxySettingModal from "./components/ProxySettingModal";
import UpdateNotifier    from "./components/UpdateNotifier";
import { Task }       from "./types/task";
import { loadTasks, saveTasks } from "./utils/taskStorage";
import { loadHolidays }         from "./utils/holidays";

type ViewMode = "gantt" | "kanban";

function App() {
  const [tasks,    setTasks]    = useState<Task[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [viewMode,    setViewMode]    = useState<ViewMode>("gantt");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProxy,   setShowProxy]   = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // 起動時: タスク（保存済み or デフォルト）と祝日を並列ロード
  useEffect(() => {
    Promise.all([loadTasks(), loadHolidays()])
      .then(([loadedTasks, loadedHolidays]) => {
        setTasks(loadedTasks);
        setHolidays(loadedHolidays);
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  // Ctrl+F で検索バーにフォーカス / ESC でクリア
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
      if (e.key === "Escape" && document.activeElement === searchRef.current) {
        setSearchQuery("");
        searchRef.current?.blur();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function handleTasksChange(updated: Task[]) {
    setTasks(updated);
    saveTasks(updated).catch((e) => console.error("タスクの保存に失敗:", e));
  }

  const totalTasks  = tasks.length;
  const avgProgress = totalTasks > 0
    ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks)
    : 0;

  const isSearching = searchQuery.trim().length > 0;

  return (
    <div className="app">
      <header className="app-header">
        <h1>WBS 進捗管理</h1>

        <div className="app-summary">
          <span>タスク数: {totalTasks}</span>
          <span>平均進捗: {avgProgress}%</span>
          <div className="summary-bar">
            <div className="summary-bar-fill" style={{ width: `${avgProgress}%` }} />
          </div>
        </div>

        {/* 検索ボックス */}
        <div className="search-box-wrapper">
          <span className="search-box-icon">🔍</span>
          <input
            ref={searchRef}
            type="text"
            className={`search-box${isSearching ? " search-box--active" : ""}`}
            placeholder="タスク名・担当者・メモを検索 (Ctrl+F)"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {isSearching && (
            <button className="search-box-clear" onClick={() => setSearchQuery("")} title="クリア">✕</button>
          )}
        </div>

        {/* ビュー切替（検索中は淡色） */}
        <div className={`view-toggle${isSearching ? " view-toggle--disabled" : ""}`}>
          <button
            className={`view-toggle-btn${viewMode === "gantt" ? " view-toggle-btn--active" : ""}`}
            onClick={() => { setViewMode("gantt"); setSearchQuery(""); }}
            title="ガントチャート"
          >
            📊 ガント
          </button>
          <button
            className={`view-toggle-btn${viewMode === "kanban" ? " view-toggle-btn--active" : ""}`}
            onClick={() => { setViewMode("kanban"); setSearchQuery(""); }}
            title="カンバンボード"
          >
            🗂 カンバン
          </button>
        </div>

        {/* 設定ボタン */}
        <button
          className="app-settings-btn"
          onClick={() => setShowProxy(true)}
          title="プロキシ設定"
        >
          ⚙
        </button>
      </header>

      {showProxy && <ProxySettingModal onClose={() => setShowProxy(false)} />}

      <UpdateNotifier />

      <main className="app-main">
        {loading && <div className="app-loading">読み込み中...</div>}
        {error   && <div className="app-error">エラー: {error}</div>}

        {!loading && !error && isSearching && (
          <SearchView
            tasks={tasks}
            query={searchQuery}
          />
        )}
        {!loading && !error && !isSearching && viewMode === "gantt" && (
          <GanttChart tasks={tasks} onTasksChange={handleTasksChange} holidays={holidays} />
        )}
        {!loading && !error && !isSearching && viewMode === "kanban" && (
          <KanbanBoard tasks={tasks} onTasksChange={handleTasksChange} />
        )}
      </main>
    </div>
  );
}

export default App;
