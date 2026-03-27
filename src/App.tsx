import { useCallback, useEffect, useRef, useState } from "react";
import GanttChart from "./components/GanttChart";
import KanbanBoard from "./components/KanbanBoard";
import SearchView from "./components/SearchView";
import AnalysisView from "./components/AnalysisView";
import ArchiveView from "./components/ArchiveView";
import NoteView from "./components/NoteView";
import ProxySettingModal from "./components/ProxySettingModal";
import UpdateNotifier from "./components/UpdateNotifier";
import { Task } from "./types/task";
import { loadTasks, saveTasks } from "./utils/taskStorage";
import { loadHolidays } from "./utils/holidays";
import { sortByTree } from "./utils/taskUtils";
import { exportToExcel } from "./utils/exportToExcel";
import { useReminder } from "./hooks/useReminder";

type ViewMode = "gantt" | "kanban" | "analysis" | "archive" | "note";

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gantt");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProxy, setShowProxy] = useState(false);
  const [exportMsg, setExportMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const searchRef = useRef<HTMLInputElement>(null);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ダークモード: data-theme 属性を html 要素に適用して永続化
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  // 起動時: タスク（保存済み or デフォルト）と祝日を並列ロード
  useEffect(() => {
    Promise.all([
      loadTasks(),
      loadHolidays().catch((e) => {
        setHolidayError(e instanceof Error ? e.message : String(e));
        return new Map<string, string>();
      }),
    ])
      .then(([loadedTasks, loadedHolidays]) => {
        setTasks(sortByTree(loadedTasks));
        setHolidays(loadedHolidays);
      })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
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
    void saveTasks(sorted).catch((e) => console.error("タスクの保存に失敗:", e));
  }

  /** エクスポート結果トーストを表示し、指定 ms 後に自動で閉じる */
  const showExportMsg = useCallback(
    (msg: { text: string; isError: boolean }, durationMs: number) => {
      if (exportTimerRef.current !== null) clearTimeout(exportTimerRef.current);
      setExportMsg(msg);
      exportTimerRef.current = setTimeout(() => {
        setExportMsg(null);
        exportTimerRef.current = null;
      }, durationMs);
    },
    [],
  );

  /** リマインダー到達時のアプリ内トースト */
  const showReminderToast = useCallback(
    (message: string) => {
      showExportMsg({ text: message, isError: false }, 8000);
    },
    [showExportMsg],
  );

  useReminder(tasks, handleTasksChange, showReminderToast);

  // アーカイブ済みを除いたアクティブタスクで集計
  const activeTasks = tasks.filter((t) => !t.archived);
  const totalTasks = activeTasks.length;
  const avgProgress =
    totalTasks > 0
      ? Math.round(activeTasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks)
      : 0;

  const isSearching = searchQuery.trim().length > 0;
  const archivedRootCount = tasks.filter((t) => t.archived && !t.parentId).length;

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
            <button
              className="search-box-clear"
              onClick={() => setSearchQuery("")}
              title="クリア"
              aria-label="検索をクリア"
            >
              ✕
            </button>
          )}
        </div>

        {/* ビュー切替（検索中は淡色） */}
        <div className={`view-toggle${isSearching ? " view-toggle--disabled" : ""}`}>
          <button
            className={`view-toggle-btn${viewMode === "gantt" ? " view-toggle-btn--active" : ""}`}
            onClick={() => {
              setViewMode("gantt");
              setSearchQuery("");
            }}
            title="ガントチャート"
          >
            📊 ガント
          </button>
          <button
            className={`view-toggle-btn${viewMode === "kanban" ? " view-toggle-btn--active" : ""}`}
            onClick={() => {
              setViewMode("kanban");
              setSearchQuery("");
            }}
            title="カンバンボード"
          >
            🗂 カンバン
          </button>
          <button
            className={`view-toggle-btn${viewMode === "analysis" ? " view-toggle-btn--active" : ""}`}
            onClick={() => {
              setViewMode("analysis");
              setSearchQuery("");
            }}
            title="分析"
          >
            📊 分析
          </button>
          <button
            className={`view-toggle-btn view-toggle-btn--archive${viewMode === "archive" ? " view-toggle-btn--active" : ""}`}
            onClick={() => {
              setViewMode("archive");
              setSearchQuery("");
            }}
            title="アーカイブ"
          >
            🗄 アーカイブ
            {archivedRootCount > 0 && <span className="archive-badge">{archivedRootCount}</span>}
          </button>
          <button
            className={`view-toggle-btn${viewMode === "note" ? " view-toggle-btn--active" : ""}`}
            onClick={() => {
              setViewMode("note");
              setSearchQuery("");
            }}
            title="ノート"
          >
            📝 ノート
          </button>
        </div>

        {/* Excel エクスポートボタン */}
        <button
          className="app-excel-btn"
          onClick={() => {
            exportToExcel(tasks)
              .then((path) => {
                if (path === null) return; // キャンセル
                showExportMsg({ text: `保存しました: ${path}`, isError: false }, 5000);
              })
              .catch((e) => {
                showExportMsg({ text: `エクスポート失敗: ${e}`, isError: true }, 6000);
              });
          }}
          title="Excelにエクスポート"
          aria-label="Excelにエクスポート"
          disabled={tasks.length === 0}
        >
          📥 Excel
        </button>

        {/* ダークモード切替ボタン */}
        <button
          className="app-theme-btn"
          onClick={() => setDarkMode((d) => !d)}
          title={darkMode ? "ライトモードに切替" : "ダークモードに切替"}
          aria-label={darkMode ? "ライトモードに切替" : "ダークモードに切替"}
        >
          {darkMode ? "☀️" : "🌙"}
        </button>

        {/* 設定ボタン */}
        <button
          className="app-settings-btn"
          onClick={() => setShowProxy(true)}
          title="プロキシ設定"
          aria-label="プロキシ設定を開く"
        >
          ⚙
        </button>
      </header>

      {showProxy && <ProxySettingModal onClose={() => setShowProxy(false)} />}

      {exportMsg && (
        <div className={`toast ${exportMsg.isError ? "toast--warn" : "toast--ok"}`}>
          {exportMsg.isError ? "⚠️" : "✅"} {exportMsg.text}
          <button className="toast-close" onClick={() => setExportMsg(null)}>
            ✕
          </button>
        </div>
      )}

      {holidayError && (
        <div className="toast toast--warn">
          ⚠️ 祝日データの取得に失敗しました（{holidayError}）
          <button className="toast-close" onClick={() => setHolidayError(null)}>
            ✕
          </button>
        </div>
      )}

      <UpdateNotifier />

      <main className="app-main">
        {loading && <div className="app-loading">読み込み中...</div>}
        {error && <div className="app-error">エラー: {error}</div>}

        {!loading && !error && (
          <>
            {isSearching && <SearchView tasks={tasks} query={searchQuery} />}
            {!isSearching && viewMode === "gantt" && (
              <GanttChart tasks={tasks} onTasksChange={handleTasksChange} holidays={holidays} />
            )}
            {!isSearching && viewMode === "kanban" && (
              <KanbanBoard tasks={tasks} onTasksChange={handleTasksChange} />
            )}
            {!isSearching && viewMode === "analysis" && <AnalysisView tasks={tasks} />}
            {!isSearching && viewMode === "archive" && (
              <ArchiveView tasks={tasks} onTasksChange={handleTasksChange} />
            )}
            {!isSearching && viewMode === "note" && (
              <NoteView tasks={tasks} onTasksChange={handleTasksChange} />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
