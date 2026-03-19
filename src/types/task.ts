export interface Task {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  progress: number; // 0-100
  color?: string;
  parentId?: string;
  collapsed?: boolean;
  assignee?: string;
  subMembers?: string[];
  memo?: string;
  progressCount?: { done: number; total: number };
  order?: number;
  isFloating?: boolean; // 開始時期不明の単発タスク（日付なし）
  archived?: boolean;   // アーカイブ済み（非表示、データは保持）
}
