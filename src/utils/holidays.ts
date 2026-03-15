import { invoke } from "@tauri-apps/api/core";

/**
 * 内閣府の祝日CSV から祝日マップを返す。
 * key: "YYYY/M/D"（CSVそのままの形式）
 * value: 祝日名
 */
export async function loadHolidays(): Promise<Map<string, string>> {
  try {
    const entries = await invoke<[string, string][]>("fetch_holidays");
    return new Map(entries);
  } catch (e) {
    console.warn("祝日データの取得に失敗しました:", e);
    return new Map();
  }
}

/** Date オブジェクトを "YYYY/M/D" 形式の文字列に変換（祝日Mapのキーと合わせる） */
export function toHolidayKey(d: Date): string {
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}
