import { describe, it, expect, beforeEach } from "vitest";
import { loadAppSettings, saveAppSettings } from "../utils/settingsStorage";

beforeEach(() => {
  localStorage.clear();
});

describe("loadAppSettings", () => {
  it("未保存のときデフォルト値を返す", () => {
    const settings = loadAppSettings();
    expect(settings.defaultChildTaskNames).toEqual([]);
    expect(settings.taskTypes).toEqual([]);
  });

  it("保存済みの値を返す", () => {
    localStorage.setItem(
      "app_settings",
      JSON.stringify({ defaultChildTaskNames: ["設計", "実装"], taskTypes: [] }),
    );
    const settings = loadAppSettings();
    expect(settings.defaultChildTaskNames).toEqual(["設計", "実装"]);
  });

  it("不正な JSON のときデフォルト値を返す", () => {
    localStorage.setItem("app_settings", "invalid json");
    const settings = loadAppSettings();
    expect(settings.defaultChildTaskNames).toEqual([]);
  });

  it("taskTypes が未定義の古いデータにデフォルトをマージする", () => {
    localStorage.setItem(
      "app_settings",
      JSON.stringify({ defaultChildTaskNames: ["設計"] }),
    );
    const settings = loadAppSettings();
    expect(settings.taskTypes).toEqual([]);
    expect(settings.defaultChildTaskNames).toEqual(["設計"]);
  });
});

describe("saveAppSettings", () => {
  it("設定を保存して再読込できる", () => {
    saveAppSettings({
      defaultChildTaskNames: ["A", "B"],
      taskTypes: [{ id: "1", name: "画面", unit: "画面", productivity: 4 }],
    });
    const settings = loadAppSettings();
    expect(settings.defaultChildTaskNames).toEqual(["A", "B"]);
    expect(settings.taskTypes).toHaveLength(1);
    expect(settings.taskTypes[0].name).toBe("画面");
  });
});
