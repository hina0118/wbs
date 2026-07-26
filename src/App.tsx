import { useCallback, useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";
import GanttChart from "./components/GanttChart";
import KanbanBoard from "./components/KanbanBoard";
import SearchView from "./components/SearchView";
import AnalysisView from "./components/AnalysisView";
import ArchiveView from "./components/ArchiveView";
import NoteView from "./components/NoteView";
import TestProgressView from "./components/TestProgressView";
import SettingsModal from "./components/SettingsModal";
import UpdateNotifier from "./components/UpdateNotifier";
import DailyTaskPanel from "./components/DailyTaskPanel";
import { Task } from "./types/task";
import { TestBook } from "./types/testBook";
import { ProjectMeta } from "./types/project";
import { loadTasks, saveTasks } from "./utils/taskStorage";
import { loadTestBooks, saveTestBooks } from "./utils/testBookStorage";
import { loadHolidays } from "./utils/holidays";
import { sortByTree } from "./utils/taskUtils";
import { exportToExcel } from "./utils/exportToExcel";
import { useReminder } from "./hooks/useReminder";
import { loadAppSettings } from "./utils/settingsStorage";
import {
  listProjects,
  createProject,
  renameProject,
  deleteProject,
  setActiveProject,
  importProject,
} from "./utils/projectStorage";

type ViewMode = "gantt" | "kanban" | "analysis" | "archive" | "note" | "test";

// カスタムプロジェクト切替ドロップダウン
// ヘッダーが常に暗色背景のため、ネイティブ <select> のポップアップ（OS依存で白背景になる）は使わず自前で描画する
function ProjectSwitcher({
  projects,
  activeProjectId,
  onSwitch,
}: {
  projects: ProjectMeta[];
  activeProjectId: string | null;
  onSwitch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const activeName = projects.find((p) => p.id === activeProjectId)?.name ?? "";

  return (
    <div className="project-dropdown-wrapper" ref={containerRef}>
      <button
        type="button"
        className="project-dropdown-trigger"
        onClick={() => setOpen((v) => !v)}
        disabled={projects.length === 0}
        aria-label="プロジェクトを切替"
      >
        <span className="project-dropdown-label">{activeName}</span>
        <span className="project-dropdown-arrow">▾</span>
      </button>
      {open && (
        <ul className="project-dropdown-list">
          {projects.map((p) => (
            <li
              key={p.id}
              className={`project-dropdown-option${p.id === activeProjectId ? " project-dropdown-option--active" : ""}`}
              onMouseDown={() => {
                setOpen(false);
                if (p.id !== activeProjectId) onSwitch(p.id);
              }}
            >
              {p.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [testBooks, setTestBooks] = useState<TestBook[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [holidayError, setHolidayError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gantt");
  const [searchQuery, setSearchQuery] = useState("");
  const [showProxy, setShowProxy] = useState(false);
  const [defaultChildTaskNames, setDefaultChildTaskNames] = useState<string[]>(
    () => loadAppSettings().defaultChildTaskNames,
  );
  const [exportMsg, setExportMsg] = useState<{ text: string; isError: boolean } | null>(null);
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem("theme") === "dark");
  const [showDailyPanel, setShowDailyPanel] = useState(false);
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [showNewProjectInput, setShowNewProjectInput] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const exportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 起動時: ウィンドウタイトルにバージョンを表示
  useEffect(() => {
    getVersion().then((version) => {
      getCurrentWindow().setTitle(`WBS 進捗管理 ${version}`);
    });
  }, []);

  // ダークモード: data-theme 属性を html 要素に適用して永続化
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", darkMode ? "dark" : "light");
    localStorage.setItem("theme", darkMode ? "dark" : "light");
  }, [darkMode]);

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

  function handleTasksChange(updated: Task[]) {
    const sorted = sortByTree(updated);
    setTasks(sorted);
    void saveTasks(sorted).catch((e) => {
      console.error("タスクの保存に失敗:", e);
      showExportMsg({ text: `タスクの保存に失敗しました: ${e}`, isError: true }, 6000);
    });
  }

  function handleTestBooksChange(updated: TestBook[]) {
    if (!activeProjectId) return;
    setTestBooks(updated);
    void saveTestBooks(activeProjectId, updated).catch((e) => {
      console.error("テストブックの保存に失敗:", e);
      showExportMsg({ text: `テストブックの保存に失敗しました: ${e}`, isError: true }, 6000);
    });
  }

  /** 指定プロジェクトのタスク・テストブックを読み込み、表示中のデータを差し替える */
  const applyProjectData = useCallback(
    async (id: string) => {
      const [loadedTasks, books] = await Promise.all([
        loadTasks(id, (reason) =>
          showExportMsg(
            {
              text: `タスクの読み込みに失敗しました。サンプルデータを表示しています: ${reason}`,
              isError: true,
            },
            8000,
          ),
        ),
        loadTestBooks(id),
      ]);
      setActiveProjectId(id);
      setTasks(sortByTree(loadedTasks));
      setTestBooks(books);
    },
    [showExportMsg],
  );

  async function handleSwitchProject(id: string) {
    if (id === activeProjectId) return;
    setLoading(true);
    try {
      await setActiveProject(id);
      await applyProjectData(id);
    } catch (e) {
      showExportMsg({ text: `プロジェクトの切り替えに失敗しました: ${e}`, isError: true }, 6000);
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateProject(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const manifest = await createProject(trimmed);
      setProjects(manifest.projects);
      const created = manifest.projects[manifest.projects.length - 1];
      await handleSwitchProject(created.id);
    } catch (e) {
      showExportMsg({ text: `プロジェクトの作成に失敗しました: ${e}`, isError: true }, 6000);
    }
  }

  async function handleRenameProject(id: string, name: string) {
    try {
      const manifest = await renameProject(id, name);
      setProjects(manifest.projects);
    } catch (e) {
      showExportMsg({ text: `プロジェクト名の変更に失敗しました: ${e}`, isError: true }, 6000);
    }
  }

  async function handleImportProject(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      const manifest = await importProject(trimmed);
      if (!manifest) return; // ファイル選択ダイアログをキャンセル
      setProjects(manifest.projects);
      const imported = manifest.projects[manifest.projects.length - 1];
      await handleSwitchProject(imported.id);
      setShowProxy(false);
      showExportMsg({ text: `プロジェクト「${imported.name}」をインポートしました`, isError: false }, 5000);
    } catch (e) {
      showExportMsg({ text: `プロジェクトのインポートに失敗しました: ${e}`, isError: true }, 6000);
    }
  }

  async function handleDeleteProject(id: string) {
    try {
      const manifest = await deleteProject(id);
      setProjects(manifest.projects);
      if (manifest.activeProjectId !== activeProjectId) {
        setLoading(true);
        try {
          await applyProjectData(manifest.activeProjectId);
        } finally {
          setLoading(false);
        }
      }
    } catch (e) {
      showExportMsg({ text: `プロジェクトの削除に失敗しました: ${e}`, isError: true }, 6000);
    }
  }

  /** リマインダー到達時のアプリ内トースト */
  const showReminderToast = useCallback(
    (message: string) => {
      showExportMsg({ text: message, isError: false }, 8000);
    },
    [showExportMsg],
  );

  // 起動時: タスク・テストブック・祝日を並列ロード
  // setLoading(false) でアプリシェルを先に描画し、setTimeout(0) でタスク描画を分離する
  useEffect(() => {
    void (async () => {
      let loadedTasks: Task[] = [];
      try {
        const manifest = await listProjects();
        setProjects(manifest.projects);
        setActiveProjectId(manifest.activeProjectId);
        const [tasks, books, holidayMap] = await Promise.all([
          loadTasks(manifest.activeProjectId, (reason) =>
            showExportMsg(
              {
                text: `タスクの読み込みに失敗しました。サンプルデータを表示しています: ${reason}`,
                isError: true,
              },
              8000,
            ),
          ),
          loadTestBooks(manifest.activeProjectId),
          Promise.race([
            loadHolidays(),
            new Promise<never>((_, reject) =>
              setTimeout(() => reject(new Error("祝日取得タイムアウト（20秒）")), 20_000),
            ),
          ]).catch((e) => {
            setHolidayError(e instanceof Error ? e.message : String(e));
            return new Map<string, string>();
          }),
        ]);
        loadedTasks = tasks;
        setTestBooks(books);
        setHolidays(holidayMap);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        // アプリシェルを先に描画してからタスクを設定（GanttChart の重い初期描画を分離）
        setLoading(false);
        setTimeout(() => setTasks(sortByTree(loadedTasks)), 0);
      }
    })();
  }, [showExportMsg]);

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

        {/* プロジェクト切替 */}
        <div className="project-switcher">
          <ProjectSwitcher
            projects={projects}
            activeProjectId={activeProjectId}
            onSwitch={(id) => void handleSwitchProject(id)}
          />
          {showNewProjectInput ? (
            <input
              autoFocus
              className="project-new-input"
              value={newProjectName}
              placeholder="新規プロジェクト名"
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  void handleCreateProject(newProjectName);
                  setNewProjectName("");
                  setShowNewProjectInput(false);
                } else if (e.key === "Escape") {
                  setNewProjectName("");
                  setShowNewProjectInput(false);
                }
              }}
              onBlur={() => {
                setNewProjectName("");
                setShowNewProjectInput(false);
              }}
            />
          ) : (
            <button
              className="project-add-btn"
              onClick={() => setShowNewProjectInput(true)}
              title="新規プロジェクト"
              aria-label="新規プロジェクトを作成"
            >
              ＋
            </button>
          )}
        </div>

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
          <button
            className={`view-toggle-btn${viewMode === "test" ? " view-toggle-btn--active" : ""}`}
            onClick={() => {
              setViewMode("test");
              setSearchQuery("");
            }}
            title="テスト進捗"
          >
            🧪 テスト進捗
          </button>
        </div>

        {/* デイリーTODOパネル切替ボタン */}
        <button
          className={`app-daily-btn${showDailyPanel ? " app-daily-btn--active" : ""}`}
          onClick={() => setShowDailyPanel((v) => !v)}
          title="今日のTODO"
          aria-label="今日のTODOパネルを開く"
        >
          📋 TODO
        </button>

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

      {showProxy && (
        <SettingsModal
          onClose={() => setShowProxy(false)}
          onChildTaskNamesChange={setDefaultChildTaskNames}
          projects={projects}
          onRenameProject={handleRenameProject}
          onDeleteProject={handleDeleteProject}
          onImportProject={handleImportProject}
        />
      )}
      {showDailyPanel && <DailyTaskPanel onClose={() => setShowDailyPanel(false)} />}

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
              <GanttChart
                tasks={tasks}
                onTasksChange={handleTasksChange}
                holidays={holidays}
                defaultChildTaskNames={defaultChildTaskNames}
              />
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
            {!isSearching && viewMode === "test" && (
              <TestProgressView
                tasks={tasks}
                testBooks={testBooks}
                onTestBooksChange={handleTestBooksChange}
                onTasksChange={handleTasksChange}
                holidays={holidays}
              />
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default App;
