import { useEffect, useState } from "react";
import GanttChart from "./components/GanttChart";
import { sampleTasks } from "./data/sampleData";
import { Task } from "./types/task";
import { loadHolidays } from "./utils/holidays";

function App() {
  const [tasks, setTasks] = useState<Task[]>(sampleTasks);
  const [holidays, setHolidays] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    loadHolidays().then(setHolidays);
  }, []);

  const totalTasks = tasks.length;
  const avgProgress = Math.round(
    tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks
  );

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
      </header>
      <main className="app-main">
        <GanttChart tasks={tasks} onTasksChange={setTasks} holidays={holidays} />
      </main>
    </div>
  );
}

export default App;
