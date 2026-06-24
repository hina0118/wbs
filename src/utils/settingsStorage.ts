export interface TaskType {
  id: string;
  name: string;       // 例: "画面開発"
  unit: string;       // 例: "画面"
  productivity: number; // 単位/月
}

export interface AppSettings {
  defaultChildTaskNames: string[];
  taskTypes: TaskType[];
}

const KEY = "app_settings";
const DEFAULT: AppSettings = { defaultChildTaskNames: [], taskTypes: [] };

export function loadAppSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveAppSettings(settings: AppSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
