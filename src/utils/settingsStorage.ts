export interface AppSettings {
  defaultChildTaskNames: string[];
}

const KEY = "app_settings";
const DEFAULT: AppSettings = { defaultChildTaskNames: [] };

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
