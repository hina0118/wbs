import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

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
    // ipc::Response により invoke はパース済み配列を返す（JSON文字列ではない）
    mockInvoke.mockResolvedValueOnce([
      { id: "t1", name: "Task1", startDate: "2025-01-01", endDate: "2025-03-31", progress: 50 },
    ]);

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

  it("invoke 失敗時に onFallback コールバックが呼ばれる", async () => {
    const onFallback = vi.fn();
    mockInvoke.mockRejectedValueOnce(new Error("disk full"));
    await loadTasks(onFallback);
    expect(onFallback).toHaveBeenCalledOnce();
    expect(onFallback).toHaveBeenCalledWith("disk full");
  });

  it("invoke が JSON 文字列を返した場合はフォールバックする（旧形式の退行検知）", async () => {
    // ipc::Response を使わない旧コードに戻った場合、invoke が文字列を返すと
    // raws.map が存在せずエラーになりフォールバックする
    const onFallback = vi.fn();
    mockInvoke.mockResolvedValueOnce(
      JSON.stringify([
        { id: "t1", name: "T", startDate: "2025-01-01", endDate: "2025-03-31", progress: 0 },
      ]),
    );
    const tasks = await loadTasks(onFallback);
    expect(onFallback).toHaveBeenCalledOnce();
    expect(tasks).toEqual([]);
  });

  it("リマインダーに有効な repeat がある場合はそのまま保持する", async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: "t1",
        name: "Task1",
        startDate: "2025-01-01",
        endDate: "2025-03-31",
        progress: 0,
        reminder: { datetime: "2026-03-27T09:00", notified: false, repeat: "daily" },
      },
    ]);

    const tasks = await loadTasks();
    expect(tasks[0].reminder?.repeat).toBe("daily");
    expect(tasks[0].reminder?.notified).toBe(false);
  });

  it("order が設定済みのタスクはそのままの order を保持する", async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: "t1",
        name: "A",
        startDate: "2025-01-01",
        endDate: "2025-03-31",
        progress: 0,
        order: 5,
      },
      {
        id: "t2",
        name: "B",
        startDate: "2025-01-01",
        endDate: "2025-03-31",
        progress: 0,
        order: 3,
      },
    ]);

    const tasks = await loadTasks();
    expect(tasks.find((t) => t.id === "t1")?.order).toBe(5);
    expect(tasks.find((t) => t.id === "t2")?.order).toBe(3);
  });

  it("order が未設定のタスクには兄弟内インデックスが自動付与される", async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: "t1", name: "A", startDate: "2025-01-01", endDate: "2025-03-31", progress: 0 },
      { id: "t2", name: "B", startDate: "2025-01-01", endDate: "2025-03-31", progress: 0 },
    ]);

    const tasks = await loadTasks();
    expect(tasks.find((t) => t.id === "t1")?.order).toBe(0);
    expect(tasks.find((t) => t.id === "t2")?.order).toBe(1);
  });

  it("リマインダーに無効な repeat がある場合は undefined になる", async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: "t1",
        name: "Task1",
        startDate: "2025-01-01",
        endDate: "2025-03-31",
        progress: 0,
        reminder: { datetime: "2026-03-27T09:00", notified: false, repeat: "invalid_value" },
      },
    ]);

    const tasks = await loadTasks();
    expect(tasks[0].reminder?.repeat).toBeUndefined();
  });
});

// ─── loadTasks (isFloating) ───────────────────────────────────
describe("loadTasks – isFloating", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15)); // 2025-06-15
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("isFloating タスクの startDate / endDate は今日の日付になる", async () => {
    mockInvoke.mockResolvedValueOnce([
      {
        id: "f1",
        name: "Floating",
        startDate: "2020-01-01",
        endDate: "2020-12-31",
        progress: 0,
        isFloating: true,
      },
    ]);

    const tasks = await loadTasks();
    const today = new Date(2025, 5, 15);
    today.setHours(0, 0, 0, 0);

    expect(tasks[0].startDate).toEqual(today);
    expect(tasks[0].endDate).toEqual(today);
  });

  it("isFloating でない通常タスクは JSON の日付をパースする", async () => {
    mockInvoke.mockResolvedValueOnce([
      { id: "t1", name: "Normal", startDate: "2025-03-01", endDate: "2025-03-31", progress: 0 },
    ]);

    const tasks = await loadTasks();
    expect(tasks[0].startDate).toEqual(new Date(2025, 2, 1));
    expect(tasks[0].endDate).toEqual(new Date(2025, 2, 31));
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

  it("isFloating タスクは今日の日付でシリアライズされる", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15)); // 2025-06-15
    mockInvoke.mockResolvedValueOnce(undefined);

    const task: Task = {
      id: "f1",
      name: "Floating",
      startDate: new Date(2025, 5, 15),
      endDate: new Date(2025, 5, 15),
      progress: 0,
      isFloating: true,
    };
    await saveTasks([task]);

    const [, args] = mockInvoke.mock.calls[0] as [string, { json: string }];
    const parsed = JSON.parse(args.json);
    expect(parsed[0].startDate).toBe("2025-06-15");
    expect(parsed[0].endDate).toBe("2025-06-15");

    vi.useRealTimers();
  });
});
