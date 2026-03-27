import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { invoke } from "@tauri-apps/api/core";
import { useReminder } from "../hooks/useReminder";
import type { Task } from "../types/task";

const mockInvoke = vi.mocked(invoke);

function makeTask(id: string, reminderDatetime?: string, notified = false): Task {
  return {
    id,
    name: `タスク${id}`,
    startDate: new Date(2026, 0, 1),
    endDate: new Date(2026, 11, 31),
    progress: 0,
    reminder: reminderDatetime ? { datetime: reminderDatetime, notified } : undefined,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// ─── リマインダーなし ─────────────────────────────────────────
describe("useReminder - リマインダーなし", () => {
  it("reminder がないタスクでは invoke も onTasksChange も呼ばれない", () => {
    const task = makeTask("t1");
    const onTasksChange = vi.fn();
    const onInAppNotify = vi.fn();

    renderHook(() => useReminder([task], onTasksChange, onInAppNotify));

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
    expect(onInAppNotify).not.toHaveBeenCalled();
  });

  it("タスクが空配列でもエラーにならない", () => {
    renderHook(() => useReminder([], vi.fn(), vi.fn()));
    expect(mockInvoke).not.toHaveBeenCalled();
  });
});

// ─── 未到達リマインダー ───────────────────────────────────────
describe("useReminder - 未到達リマインダー", () => {
  it("未来のリマインダーは通知しない", () => {
    vi.setSystemTime(new Date("2026-03-27T10:00:00"));
    const task = makeTask("t1", "2026-03-27T11:00:00"); // 1時間後
    const onTasksChange = vi.fn();

    renderHook(() => useReminder([task], onTasksChange, vi.fn()));

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
  });
});

// ─── 到達済みリマインダー ─────────────────────────────────────
describe("useReminder - 到達済みリマインダー", () => {
  it("期限到達の未通知リマインダーで show_notification を呼ぶ", () => {
    vi.setSystemTime(new Date("2026-03-27T10:00:00"));
    const task = makeTask("t1", "2026-03-27T09:00:00"); // 1時間前
    const onTasksChange = vi.fn();
    const onInAppNotify = vi.fn();

    renderHook(() => useReminder([task], onTasksChange, onInAppNotify));

    expect(mockInvoke).toHaveBeenCalledWith("show_notification", {
      title: "WBS リマインダー",
      body: "タスクt1",
    });
    expect(onInAppNotify).toHaveBeenCalledWith("🔔 タスクt1");
  });

  it("到達済みリマインダーで onTasksChange が notified:true のタスクで呼ばれる", () => {
    vi.setSystemTime(new Date("2026-03-27T10:00:00"));
    const task = makeTask("t1", "2026-03-27T09:00:00");
    const onTasksChange = vi.fn();

    renderHook(() => useReminder([task], onTasksChange, vi.fn()));

    expect(onTasksChange).toHaveBeenCalledOnce();
    const updatedTasks = onTasksChange.mock.calls[0][0] as Task[];
    expect(updatedTasks[0].reminder?.notified).toBe(true);
  });

  it("notified:true のリマインダーは再通知しない", () => {
    vi.setSystemTime(new Date("2026-03-27T10:00:00"));
    const task = makeTask("t1", "2026-03-27T09:00:00", true); // 通知済み
    const onTasksChange = vi.fn();

    renderHook(() => useReminder([task], onTasksChange, vi.fn()));

    expect(mockInvoke).not.toHaveBeenCalled();
    expect(onTasksChange).not.toHaveBeenCalled();
  });
});

// ─── 複数タスク ───────────────────────────────────────────────
describe("useReminder - 複数タスク", () => {
  it("到達済みのタスクのみ通知し、他のタスクは変更しない", () => {
    vi.setSystemTime(new Date("2026-03-27T10:00:00"));
    const past = makeTask("past", "2026-03-27T09:00:00"); // 到達済み
    const future = makeTask("future", "2026-03-27T11:00:00"); // 未到達
    const noReminder = makeTask("none"); // リマインダーなし
    const onTasksChange = vi.fn();
    const onInAppNotify = vi.fn();

    renderHook(() => useReminder([past, future, noReminder], onTasksChange, onInAppNotify));

    expect(mockInvoke).toHaveBeenCalledOnce();
    expect(onInAppNotify).toHaveBeenCalledOnce();

    const updated = onTasksChange.mock.calls[0][0] as Task[];
    expect(updated.find((t) => t.id === "past")?.reminder?.notified).toBe(true);
    expect(updated.find((t) => t.id === "future")?.reminder?.notified).toBe(false);
    expect(updated.find((t) => t.id === "none")?.reminder).toBeUndefined();
  });

  it("到達済みが複数ある場合は全て通知する", () => {
    vi.setSystemTime(new Date("2026-03-27T10:00:00"));
    const t1 = makeTask("t1", "2026-03-27T08:00:00");
    const t2 = makeTask("t2", "2026-03-27T09:00:00");
    const onInAppNotify = vi.fn();

    renderHook(() => useReminder([t1, t2], vi.fn(), onInAppNotify));

    expect(mockInvoke).toHaveBeenCalledTimes(2);
    expect(onInAppNotify).toHaveBeenCalledTimes(2);
  });
});

// ─── インターバル ─────────────────────────────────────────────
describe("useReminder - インターバル", () => {
  it("60秒後に新たに到達したリマインダーを通知する", () => {
    vi.setSystemTime(new Date("2026-03-27T10:00:00"));
    const task = makeTask("t1", "2026-03-27T10:00:30"); // 30秒後
    const onTasksChange = vi.fn();

    renderHook(() => useReminder([task], onTasksChange, vi.fn()));

    // 初回チェック時はまだ未到達
    expect(mockInvoke).not.toHaveBeenCalled();

    // 60秒経過させ、時刻も進める
    act(() => {
      vi.setSystemTime(new Date("2026-03-27T10:01:00"));
      vi.advanceTimersByTime(60_000);
    });

    expect(mockInvoke).toHaveBeenCalledWith("show_notification", {
      title: "WBS リマインダー",
      body: "タスクt1",
    });
  });

  it("アンマウント時にインターバルをクリアする", () => {
    const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval");
    const task = makeTask("t1");

    const { unmount } = renderHook(() => useReminder([task], vi.fn(), vi.fn()));
    unmount();

    expect(clearIntervalSpy).toHaveBeenCalled();
  });
});
