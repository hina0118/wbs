import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useDragHandler } from "../hooks/useDragHandler";
import type { Task } from "../types/task";

const DAY_WIDTH = 28;

function makeTask(id: string, start: Date, end: Date, parentId?: string): Task {
  return { id, name: id, startDate: start, endDate: end, progress: 0, parentId };
}

function makeMoveEvent(clientX: number): MouseEvent {
  return new MouseEvent("mousemove", { bubbles: true, clientX });
}

function makeUpEvent(): MouseEvent {
  return new MouseEvent("mouseup", { bubbles: true });
}

const start2025 = new Date(2025, 0, 1);
const end2025 = new Date(2025, 11, 31);

const task = makeTask("t1", start2025, end2025);
const tasks = [task];

// ─── startDrag ────────────────────────────────────────────────
describe("useDragHandler - startDrag", () => {
  it("startDrag を呼ぶと dragRef にドラッグ状態がセットされる", () => {
    const onTasksChange = vi.fn();
    const { result } = renderHook(() => useDragHandler(tasks, onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 100,
        } as unknown as React.MouseEvent,
        task,
        "move",
      );
    });

    expect(result.current.dragRef.current).toMatchObject({
      taskId: "t1",
      type: "move",
      startX: 100,
    });
    expect(result.current.didDragRef.current).toBe(false);
  });

  it("onDragStart コールバックが呼ばれる", () => {
    const onTasksChange = vi.fn();
    const onDragStart = vi.fn();
    const { result } = renderHook(() => useDragHandler(tasks, onTasksChange, onDragStart));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        task,
        "move",
      );
    });

    expect(onDragStart).toHaveBeenCalledOnce();
  });
});

// ─── mousemove / mouseup (move) ───────────────────────────────
describe("useDragHandler - move ドラッグ", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("3日分移動すると dragPreview が更新される", async () => {
    const onTasksChange = vi.fn();
    const { result } = renderHook(() => useDragHandler(tasks, onTasksChange));

    // ドラッグ開始
    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        task,
        "move",
      );
    });

    // 3日分右へ移動（3 * 28 px）
    act(() => {
      window.dispatchEvent(makeMoveEvent(DAY_WIDTH * 3));
    });

    expect(result.current.dragPreview).not.toBeNull();
    const preview = result.current.dragPreview!;
    const expectedStart = new Date(2025, 0, 4); // 1/1 + 3 days
    const expectedEnd = new Date(2026, 0, 3); // 12/31 + 3 days
    expect(preview.startDate).toEqual(expectedStart);
    expect(preview.endDate).toEqual(expectedEnd);
  });

  it("mouseup でタスクが更新され dragPreview がリセットされる", () => {
    const onTasksChange = vi.fn();
    const { result } = renderHook(() => useDragHandler(tasks, onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        task,
        "move",
      );
    });

    act(() => {
      window.dispatchEvent(makeMoveEvent(DAY_WIDTH * 5));
    });
    act(() => {
      window.dispatchEvent(makeUpEvent());
    });

    expect(onTasksChange).toHaveBeenCalledOnce();
    expect(result.current.dragPreview).toBeNull();
  });

  it("delta=0 のまま mouseup しても onTasksChange は呼ばれない", () => {
    const onTasksChange = vi.fn();
    const { result } = renderHook(() => useDragHandler(tasks, onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        task,
        "move",
      );
    });

    // 移動なし → mouseup
    act(() => {
      window.dispatchEvent(makeUpEvent());
    });

    expect(onTasksChange).not.toHaveBeenCalled();
    expect(result.current.dragPreview).toBeNull();
  });
});

// ─── start ハンドル ───────────────────────────────────────────
describe("useDragHandler - start ハンドル", () => {
  it("開始日が終了日以上になる場合は終了日-1日にクランプされる", () => {
    const onTasksChange = vi.fn();
    // start=2025-01-01, end=2025-01-03
    const shortTask = makeTask("s", new Date(2025, 0, 1), new Date(2025, 0, 3));
    const { result } = renderHook(() => useDragHandler([shortTask], onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        shortTask,
        "start",
      );
    });

    // +10日分右に動かすと start > end になる → クランプ
    act(() => {
      window.dispatchEvent(makeMoveEvent(DAY_WIDTH * 10));
    });

    const preview = result.current.dragPreview!;
    expect(preview.startDate < preview.endDate).toBe(true);
  });
});

// ─── end ハンドル ─────────────────────────────────────────────
describe("useDragHandler - end ハンドル", () => {
  it("終了日が開始日以下になる場合は開始日+1日にクランプされる", () => {
    const onTasksChange = vi.fn();
    const shortTask = makeTask("e", new Date(2025, 0, 5), new Date(2025, 0, 10));
    const { result } = renderHook(() => useDragHandler([shortTask], onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        shortTask,
        "end",
      );
    });

    // 大きく左へ → end < start になる → クランプ
    act(() => {
      window.dispatchEvent(makeMoveEvent(-DAY_WIDTH * 20));
    });

    const preview = result.current.dragPreview!;
    expect(preview.endDate > preview.startDate).toBe(true);
  });
});

// ─── ドラッグなし状態での mouseup / mousemove ─────────────────
describe("useDragHandler - ドラッグ未開始時の mouseup", () => {
  it("dragRef が null のまま mouseup しても onTasksChange は呼ばれない", () => {
    const onTasksChange = vi.fn();
    renderHook(() => useDragHandler(tasks, onTasksChange));

    act(() => {
      window.dispatchEvent(makeUpEvent());
    });

    expect(onTasksChange).not.toHaveBeenCalled();
  });

  it("dragStart なしで mousemove が発火しても dragPreview は null のまま", () => {
    const onTasksChange = vi.fn();
    const { result } = renderHook(() => useDragHandler(tasks, onTasksChange));

    act(() => {
      window.dispatchEvent(makeMoveEvent(DAY_WIDTH * 5));
    });

    expect(result.current.dragPreview).toBeNull();
    expect(onTasksChange).not.toHaveBeenCalled();
  });
});

// ─── delta=0 の mousemove ─────────────────────────────────────
describe("useDragHandler - delta=0 の mousemove", () => {
  it("delta=0 の mousemove では didDragRef が false のまま", () => {
    const onTasksChange = vi.fn();
    const { result } = renderHook(() => useDragHandler(tasks, onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        task,
        "move",
      );
    });

    // clientX=0 のまま動かさない → delta=0
    act(() => {
      window.dispatchEvent(makeMoveEvent(0));
    });

    expect(result.current.didDragRef.current).toBe(false);
  });
});

// ─── start ハンドル（クランプなし） ──────────────────────────
describe("useDragHandler - start ハンドル（クランプなし）", () => {
  it("start を左に移動してもクランプが発生しない場合は素直に更新される", () => {
    const onTasksChange = vi.fn();
    // start=2025-01-10, end=2025-01-20 の余裕あるタスク
    const wideTask = makeTask("w", new Date(2025, 0, 10), new Date(2025, 0, 20));
    const { result } = renderHook(() => useDragHandler([wideTask], onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        wideTask,
        "start",
      );
    });

    // 左へ 3 日分移動（start が前に移動、clamp は発生しない）
    act(() => {
      window.dispatchEvent(makeMoveEvent(-DAY_WIDTH * 3));
    });

    const preview = result.current.dragPreview!;
    expect(preview.startDate).toEqual(new Date(2025, 0, 7)); // 10 - 3 = 7
    expect(preview.endDate).toEqual(new Date(2025, 0, 20)); // 変わらず
  });
});

// ─── end ハンドル（クランプなし） ────────────────────────────
describe("useDragHandler - end ハンドル（クランプなし）", () => {
  it("end を右に移動してもクランプが発生しない場合は素直に更新される", () => {
    const onTasksChange = vi.fn();
    const wideTask = makeTask("w", new Date(2025, 0, 5), new Date(2025, 0, 10));
    const { result } = renderHook(() => useDragHandler([wideTask], onTasksChange));

    act(() => {
      result.current.startDrag(
        {
          preventDefault: vi.fn(),
          stopPropagation: vi.fn(),
          clientX: 0,
        } as unknown as React.MouseEvent,
        wideTask,
        "end",
      );
    });

    // 右へ 5 日分移動（end が後ろに移動、clamp は発生しない）
    act(() => {
      window.dispatchEvent(makeMoveEvent(DAY_WIDTH * 5));
    });

    const preview = result.current.dragPreview!;
    expect(preview.startDate).toEqual(new Date(2025, 0, 5)); // 変わらず
    expect(preview.endDate).toEqual(new Date(2025, 0, 15)); // 10 + 5 = 15
  });
});
