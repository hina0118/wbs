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
}
