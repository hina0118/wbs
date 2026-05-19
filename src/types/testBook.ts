export interface DailyLog {
  date: string; // "YYYY-MM-DD"
  passCount: number;
  failCount: number;
}

export interface TestBook {
  id: string;
  name: string;
  taskId?: string;
  assignee?: string;
  dueDate?: string; // "YYYY-MM-DD"
  totalCount: number;
  dailyLogs: DailyLog[];
}
