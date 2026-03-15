import { Task } from "../types/task";

/** JSON上の生フォーマット（日付は "YYYY-MM-DD" 文字列） */
interface TaskRaw {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  progress: number;
  color?: string;
  parentId?: string;
  assignee?: string;
}

/** "YYYY-MM-DD" をローカル時刻の Date に変換 */
function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toTask(raw: TaskRaw): Task {
  return {
    ...raw,
    startDate: parseLocalDate(raw.startDate),
    endDate: parseLocalDate(raw.endDate),
  };
}

/** public/data/sampleTasks.json を読み込んで Task[] を返す */
export async function loadSampleTasks(): Promise<Task[]> {
  const res = await fetch("./data/sampleTasks.json");
  if (!res.ok) throw new Error(`Failed to load sampleTasks.json: ${res.status}`);
  const raws: TaskRaw[] = await res.json();
  return raws.map(toTask);
}
