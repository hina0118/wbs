import { describe, it, expect, vi, beforeEach } from "vitest";

// @tauri-apps/api/core の invoke をモック
vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

// sampleData もモック（Tauri 非依存だが fetch を使うため）
vi.mock("../data/sampleData", () => ({
  loadSampleTasks: vi.fn(() => []),
}));

import { invoke } from "@tauri-apps/api/core";
import { loadTasks, saveTasks } from "../utils/taskStorage";
import type { Task } from "../types/task";

const mockInvoke = vi.mocked(invoke);

function makeTask(id: string, start: string, end: string, progress = 0): Task {
  return {
    id,
    name: id,
    startDate: new Date(start),
    endDate: new Date(end),
    progress,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── loadTasks ────────────────────────────────────────────────
describe("loadTasks", () => {
  it("保存済みデータがある場合はパースして返す", async () => {
    const raw = JSON.stringify([
      { id: "t1", name: "Task1", startDate: "2025-01-01", endDate: "2025-03-31", progress: 50 },
    ]);
    mockInvoke.mockResolvedValueOnce(raw);

    const tasks = await loadTasks();
    expect(tasks).toHaveLength(1);
    expect(tasks[0].id).toBe("t1");
    expect(tasks[0].startDate).toEqual(new Date(2025, 0, 1));
    expect(tasks[0].endDate).toEqual(new Date(2025, 2, 31));
    expect(tasks[0].progress).toBe(50);
  });

  it("保存済みデータが null の場合はサンプルタスクを返す", async () => {
    mockInvoke.mockResolvedValueOnce(null);
    const tasks = await loadTasks();
    expect(tasks).toEqual([]);
  });

  it("invoke が失敗した場合はサンプルタスクにフォールバック", async () => {
    mockInvoke.mockRejectedValueOnce(new Error("File not found"));
    const tasks = await loadTasks();
    expect(tasks).toEqual([]);
  });
});

// ─── saveTasks ────────────────────────────────────────────────
describe("saveTasks", () => {
  it("タスクを JSON 文字列に変換して invoke を呼び出す", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const tasks = [makeTask("t1", "2025-01-01", "2025-03-31", 75)];
    await saveTasks(tasks);

    expect(mockInvoke).toHaveBeenCalledOnce();
    const [cmd, args] = mockInvoke.mock.calls[0] as [string, { json: string }];
    expect(cmd).toBe("save_tasks");

    const parsed = JSON.parse(args.json);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].startDate).toBe("2025-01-01");
    expect(parsed[0].endDate).toBe("2025-03-31");
    expect(parsed[0].progress).toBe(75);
  });

  it("日付が正しく YYYY-MM-DD 形式にシリアライズされる", async () => {
    mockInvoke.mockResolvedValueOnce(undefined);

    const tasks = [makeTask("t2", "2025-06-09", "2025-12-31")];
    await saveTasks(tasks);

    const [, args] = mockInvoke.mock.calls[0] as [string, { json: string }];
    const parsed = JSON.parse(args.json);
    expect(parsed[0].startDate).toBe("2025-06-09");
    expect(parsed[0].endDate).toBe("2025-12-31");
  });
});
