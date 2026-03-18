import { useEffect, useRef, useState } from "react";
import GanttChart        from "./components/GanttChart";
import KanbanBoard       from "./components/KanbanBoard";
import SearchView        from "./components/SearchView";
import AnalysisView      from "./components/AnalysisView";
import ProxySettingModal from "./components/ProxySettingModal";
import UpdateNotifier    from "./components/UpdateNotifier";
import { Task }       from "./types/task";
import { loadTasks, saveTasks, importTasksFromFile } from "./utils/taskStorage";
import { loadHolidays }         from "./utils/holidays";
import { sortByTree }           from "./utils/taskUtils";
import { exportToExcel }        from "./utils/exportToExcel";

type ViewMode = "gantt" | "kanban" | "analysis";

function App() {
  const [tasks,        setTasks]        = useState<Task[]>([]);
  const [holidays,     setHolidays]     = useState<Map<string, string>>(new Map());
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [viewMode,    setViewMode]    = useState<ViewMode>("gantt");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProxy,    setShowProxy]    = useState(false);
  const [exportMsg,    setExportMsg]    = useState<{ text: string; isError: boolean } | null>(null);
  const [importMsg,    setImportMsg]    = useState<{ text: string; isError: boolean } | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // 起動時: タスク（保存済み or デフォルト）と祝日を並列ロード
  useEffect(() => {
    Promise.all([
      loadTasks(),
      loadHolidays().catch((e) => {
        setHolidayError(String(e));
        return new Map<string, string>();
      }),
    ])
      .then(([loadedTasks, loadedHolidays]) => {
        setTasks(sortByTree(loadedTasks));
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
    const sorted = sortByTree(updated);
    setTasks(sorted);
    saveTasks(sorted).catch((e) => console.error("タスクの保存に失敗:", e));
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
          <button
            className={`view-toggle-btn${viewMode === "analysis" ? " view-toggle-btn--active" : ""}`}
            onClick={() => { setViewMode("analysis"); setSearchQuery(""); }}
            title="分析"
          >
            📊 分析
          </button>
        </div>

        {/* JSON インポートボタン */}
        <button
          className="app-import-btn"
          onClick={() => {
            importTasksFromFile()
              .then((imported) => {
                if (imported === null) return; // キャンセル
                const importedMap = new Map(imported.map((t) => [t.id, t]));
                // 既存タスクを上書き更新 → 新規タスクを末尾に追加
                const merged = [
                  ...tasks.map((t) => importedMap.get(t.id) ?? t),
                  ...imported.filter((t) => !tasks.some((cur) => cur.id === t.id)),
                ];
                handleTasksChange(merged);
                setImportMsg({ text: `${imported.length} 件のタスクをマージしました`, isError: false });
                setTimeout(() => setImportMsg(null), 5000);
              })
              .catch((e) => {
                setImportMsg({ text: `インポート失敗: ${e}`, isError: true });
                setTimeout(() => setImportMsg(null), 6000);
              });
          }}
          title="tasks.json を取り込む"
        >
          📂 取り込み
        </button>

        {/* Excel エクスポートボタン */}
        <button
          className="app-excel-btn"
          onClick={() => {
            exportToExcel(tasks)
              .then((path) => {
                if (path === null) return; // キャンセル
                setExportMsg({ text: `保存しました: ${path}`, isError: false });
                setTimeout(() => setExportMsg(null), 5000);
              })
              .catch((e) => {
                setExportMsg({ text: `エクスポート失敗: ${e}`, isError: true });
                setTimeout(() => setExportMsg(null), 6000);
              });
          }}
          title="Excelにエクスポート"
          disabled={tasks.length === 0}
        >
          📥 Excel
        </button>

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

      {importMsg && (
        <div className={`toast ${importMsg.isError ? "toast--warn" : "toast--ok"}`}>
          {importMsg.isError ? "⚠️" : "✅"} {importMsg.text}
          <button className="toast-close" onClick={() => setImportMsg(null)}>✕</button>
        </div>
      )}

      {exportMsg && (
        <div className={`toast ${exportMsg.isError ? "toast--warn" : "toast--ok"}`}>
          {exportMsg.isError ? "⚠️" : "✅"} {exportMsg.text}
          <button className="toast-close" onClick={() => setExportMsg(null)}>✕</button>
        </div>
      )}

      {holidayError && (
        <div className="toast toast--warn">
          ⚠️ 祝日データの取得に失敗しました（{holidayError}）
          <button className="toast-close" onClick={() => setHolidayError(null)}>✕</button>
        </div>
      )}

      <UpdateNotifier />

      <main className="app-main">
        {loading && <div className="app-loading">読み込み中...</div>}
        {error   && <div className="app-error">エラー: {error}</div>}

        {!loading && !error && (
          <>
            {isSearching && <SearchView tasks={tasks} query={searchQuery} />}
            {!isSearching && viewMode === "gantt"     && <GanttChart tasks={tasks} onTasksChange={handleTasksChange} holidays={holidays} />}
            {!isSearching && viewMode === "kanban"    && <KanbanBoard tasks={tasks} onTasksChange={handleTasksChange} />}
            {!isSearching && viewMode === "analysis"  && <AnalysisView tasks={tasks} />}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
