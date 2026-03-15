import { useEffect, useState } from "react";
import GanttChart from "./components/GanttChart";
import KanbanBoard from "./components/KanbanBoard";
import { Task } from "./types/task";
import { loadTasks, saveTasks } from "./utils/taskStorage";
import { loadHolidays } from "./utils/holidays";

type ViewMode = "gantt" | "kanban";

function App() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("gantt");

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

  // タスク変更時: アプリデータに自動保存
  function handleTasksChange(updated: Task[]) {
    setTasks(updated);
    saveTasks(updated).catch((e) =>
      console.error("タスクの保存に失敗:", e)
    );
  }

  const totalTasks = tasks.length;
  const avgProgress =
    totalTasks > 0
      ? Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks)
      : 0;

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
        <div className="view-toggle">
          <button
            className={`view-toggle-btn${viewMode === "gantt" ? " view-toggle-btn--active" : ""}`}
            onClick={() => setViewMode("gantt")}
            title="ガントチャート"
          >
            📊 ガント
          </button>
          <button
            className={`view-toggle-btn${viewMode === "kanban" ? " view-toggle-btn--active" : ""}`}
            onClick={() => setViewMode("kanban")}
            title="カンバンボード"
          >
            🗂 カンバン
          </button>
        </div>
      </header>
      <main className="app-main">
        {loading && <div className="app-loading">読み込み中...</div>}
        {error && <div className="app-error">エラー: {error}</div>}
        {!loading && !error && viewMode === "gantt" && (
          <GanttChart
            tasks={tasks}
            onTasksChange={handleTasksChange}
            holidays={holidays}
          />
        )}
        {!loading && !error && viewMode === "kanban" && (
          <KanbanBoard
            tasks={tasks}
            onTasksChange={handleTasksChange}
          />
        )}
      </main>
    </div>
  );
}

export default App;
