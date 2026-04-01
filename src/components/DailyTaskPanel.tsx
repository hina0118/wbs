/**
 * DailyTaskPanel – ドラッグ・リサイズ可能なデイリーTODOフローティングパネル
 */
import { useEffect, useRef, useState } from "react";
import { Rnd } from "react-rnd";

interface DailyTask {
  id: string;
  text: string;
  done: boolean;
}

const STORAGE_KEY = "dailyTasks";

function loadTasks(): DailyTask[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as DailyTask[];
  } catch {
    return [];
  }
}

function saveTasks(tasks: DailyTask[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
}

interface Props {
  onClose: () => void;
}

export default function DailyTaskPanel({ onClose }: Props) {
  const [tasks, setTasks] = useState<DailyTask[]>(loadTasks);
  const [inputText, setInputText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    saveTasks(tasks);
  }, [tasks]);

  function handleAdd() {
    const text = inputText.trim();
    if (!text) return;
    setTasks((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random()}`, text, done: false },
    ]);
    setInputText("");
    inputRef.current?.focus();
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") handleAdd();
  }

  function toggleDone(id: string) {
    setTasks((prev) =>
      prev.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
    );
  }

  function deleteTask(id: string) {
    setTasks((prev) => prev.filter((t) => t.id !== id));
  }

  return (
    <Rnd
      default={{
        x: Math.max(0, window.innerWidth - 320),
        y: 60,
        width: 300,
        height: 400,
      }}
      minWidth={220}
      minHeight={200}
      bounds="window"
      dragHandleClassName="daily-panel-titlebar"
      className="daily-panel"
    >
      <div className="daily-panel-titlebar">
        <span className="daily-panel-title">📋 今日のTODO</span>
        <button className="daily-panel-close" onClick={onClose} title="閉じる">
          ✕
        </button>
      </div>

      <div className="daily-panel-body">
        <ul className="daily-panel-list">
          {tasks.length === 0 && (
            <li className="daily-panel-empty">タスクがありません</li>
          )}
          {tasks.map((task) => (
            <li key={task.id} className={`daily-panel-item${task.done ? " daily-panel-item--done" : ""}`}>
              <input
                type="checkbox"
                className="daily-panel-checkbox"
                checked={task.done}
                onChange={() => toggleDone(task.id)}
              />
              <span className="daily-panel-text">{task.text}</span>
              <button
                className="daily-panel-delete"
                onClick={() => deleteTask(task.id)}
                title="削除"
                aria-label="タスクを削除"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="daily-panel-footer">
        <input
          ref={inputRef}
          type="text"
          className="daily-panel-input"
          placeholder="タスクを追加... (Enter)"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button className="daily-panel-add" onClick={handleAdd} title="追加">
          ＋
        </button>
      </div>
    </Rnd>
  );
}
