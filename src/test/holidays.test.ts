import { describe, it, expect, vi } from "vitest";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

import { invoke } from "@tauri-apps/api/core";
import { loadHolidays, toHolidayKey } from "../utils/holidays";

const mockInvoke = vi.mocked(invoke);

describe("toHolidayKey", () => {
  it("Date を YYYY/M/D 形式に変換する（ゼロパディングなし）", () => {
    expect(toHolidayKey(new Date(2025, 0, 1))).toBe("2025/1/1");
    expect(toHolidayKey(new Date(2025, 11, 31))).toBe("2025/12/31");
    expect(toHolidayKey(new Date(2025, 4, 3))).toBe("2025/5/3");
  });

  it("月・日が 1 桁の場合もゼロパディングしない", () => {
    expect(toHolidayKey(new Date(2025, 0, 9))).toBe("2025/1/9");
    expect(toHolidayKey(new Date(2025, 8, 5))).toBe("2025/9/5");
  });
});

describe("loadHolidays", () => {
  it("invoke の結果を Map<string, string> に変換して返す", async () => {
    mockInvoke.mockResolvedValueOnce([
      ["2025/1/1", "元日"],
      ["2025/2/11", "建国記念の日"],
    ]);

    const map = await loadHolidays();
    expect(map).toBeInstanceOf(Map);
    expect(map.size).toBe(2);
    expect(map.get("2025/1/1")).toBe("元日");
    expect(map.get("2025/2/11")).toBe("建国記念の日");
  });

  it("空配列のとき空の Map を返す", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    const map = await loadHolidays();
    expect(map.size).toBe(0);
  });

  it("invoke に 'fetch_holidays' コマンドを渡す", async () => {
    mockInvoke.mockResolvedValueOnce([]);
    await loadHolidays();
    expect(mockInvoke).toHaveBeenCalledWith("fetch_holidays");
  });
});
