import { describe, it, expect } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useGanttFilter } from "../hooks/useGanttFilter";
import type { Task } from "../types/task";

function makeTask(id: string, parentId?: string, assignee?: string): Task {
  return {
    id,
    name: id,
    startDate: new Date(2025, 0, 1),
    endDate: new Date(2025, 11, 31),
    progress: 0,
    parentId,
    assignee,
  };
}

const root = makeTask("root", undefined, "Alice");
const child1 = makeTask("child1", "root", "Bob");
const child2 = makeTask("child2", "root", "Alice");
const grandchild = makeTask("grandchild", "child1", "Carol");

const tasks: Task[] = [root, child1, child2, grandchild];

// ─── 初期状態 ─────────────────────────────────────────────────
describe("useGanttFilter - 初期状態", () => {
  it("filteredTasks は全タスクを返す", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));
    expect(result.current.filteredTasks).toHaveLength(4);
  });

  it("assignees はタスクの担当者一覧（重複なし）を返す", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));
    expect(result.current.assignees).toEqual(expect.arrayContaining(["Alice", "Bob", "Carol"]));
    expect(result.current.assignees).toHaveLength(3);
  });

  it("filterParentId の初期値は 'all'", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));
    expect(result.current.filterParentId).toBe("all");
  });

  it("filterAssignee の初期値は 'all'", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));
    expect(result.current.filterAssignee).toBe("all");
  });
});

// ─── 親フィルター ─────────────────────────────────────────────
describe("useGanttFilter - 親フィルター", () => {
  it("filterParentId を設定すると対象タスクとその子孫のみ返す", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));

    act(() => result.current.setFilterParentId("root"));

    const ids = result.current.filteredTasks.map((t) => t.id);
    expect(ids).toContain("root");
    expect(ids).toContain("child1");
    expect(ids).toContain("child2");
    expect(ids).toContain("grandchild");
    expect(ids).toHaveLength(4);
  });

  it("filterParentId を child1 にすると child1 とその子孫のみ", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));

    act(() => result.current.setFilterParentId("child1"));

    const ids = result.current.filteredTasks.map((t) => t.id);
    expect(ids).toContain("child1");
    expect(ids).toContain("grandchild");
    expect(ids).not.toContain("root");
    expect(ids).not.toContain("child2");
  });

  it("'all' に戻すと全タスクを返す", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));

    act(() => result.current.setFilterParentId("child1"));
    act(() => result.current.setFilterParentId("all"));

    expect(result.current.filteredTasks).toHaveLength(4);
  });
});

// ─── 担当者フィルター ─────────────────────────────────────────
describe("useGanttFilter - 担当者フィルター", () => {
  it("filterAssignee を設定すると対象担当者のタスクまたはその子孫に対象担当者を持つタスクを返す", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));

    act(() => result.current.setFilterAssignee("Carol"));

    const ids = result.current.filteredTasks.map((t) => t.id);
    // Carol は grandchild の担当 → child1 も含まれる（子孫に Carol がいるため）
    expect(ids).toContain("grandchild");
    expect(ids).toContain("child1");
  });

  it("filterAssignee='Alice' は Alice 担当タスクを返す", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));

    act(() => result.current.setFilterAssignee("Alice"));

    const ids = result.current.filteredTasks.map((t) => t.id);
    expect(ids).toContain("root");
    expect(ids).toContain("child2");
  });

  it("'all' に戻すと全タスクを返す", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));

    act(() => result.current.setFilterAssignee("Bob"));
    act(() => result.current.setFilterAssignee("all"));

    expect(result.current.filteredTasks).toHaveLength(4);
  });
});

// ─── 複合フィルター ───────────────────────────────────────────
describe("useGanttFilter - 親 × 担当者の複合フィルター", () => {
  it("親フィルター + 担当者フィルターを同時に適用できる", () => {
    const { result } = renderHook(() => useGanttFilter(tasks));

    act(() => result.current.setFilterParentId("root"));
    act(() => result.current.setFilterAssignee("Bob"));

    const ids = result.current.filteredTasks.map((t) => t.id);
    // root: Alice担当だが子孫に Bob(child1) がいるため含まれる
    expect(ids).toContain("root");
    // child1: Bob 担当のため含まれる
    expect(ids).toContain("child1");
    // child2: Alice 担当で子孫に Bob がいないため除外
    expect(ids).not.toContain("child2");
    // grandchild: Carol 担当で子孫に Bob がいないため除外
    expect(ids).not.toContain("grandchild");
  });
});

// ─── assignee 未設定タスクの除外 ─────────────────────────────
describe("useGanttFilter - assignee なしタスク", () => {
  it("assignee が undefined のタスクは assignees リストに含まれない", () => {
    const t = makeTask("noAssignee");
    const { result } = renderHook(() => useGanttFilter([t]));
    expect(result.current.assignees).toHaveLength(0);
  });
});

// ─── アーカイブ除外 ───────────────────────────────────────────
describe("useGanttFilter - アーカイブ除外", () => {
  it("archived:true のタスクは filteredTasks に含まれない", () => {
    const archivedRoot = { ...root, archived: true };
    const archivedChild = { ...child1, archived: true };
    const archivedGrand = { ...grandchild, archived: true };
    const tasksWithArchived: Task[] = [archivedRoot, archivedChild, child2, archivedGrand];

    const { result } = renderHook(() => useGanttFilter(tasksWithArchived));

    const ids = result.current.filteredTasks.map((t) => t.id);
    expect(ids).toContain("child2");
    expect(ids).not.toContain("root");
    expect(ids).not.toContain("child1");
    expect(ids).not.toContain("grandchild");
  });

  it("archived:true のタスクの担当者は assignees に含まれない", () => {
    const archivedChild = { ...child1, archived: true }; // 担当: Bob
    const tasksWithArchived: Task[] = [root, archivedChild, child2, grandchild];

    const { result } = renderHook(() => useGanttFilter(tasksWithArchived));

    // Bob(child1) はアーカイブ済みなので担当者一覧から除外される
    expect(result.current.assignees).not.toContain("Bob");
  });

  it("全タスクがアーカイブ済みなら filteredTasks は空", () => {
    const allArchived = tasks.map((t) => ({ ...t, archived: true }));
    const { result } = renderHook(() => useGanttFilter(allArchived));
    expect(result.current.filteredTasks).toHaveLength(0);
  });
});

// ─── __floating__ フィルター ──────────────────────────────────
describe("useGanttFilter - __floating__ フィルター", () => {
  it("filterParentId='__floating__' は isFloating:true のタスクのみ返す", () => {
    const floating = { ...makeTask("floating"), isFloating: true };
    const tasksWithFloating: Task[] = [...tasks, floating];

    const { result } = renderHook(() => useGanttFilter(tasksWithFloating));
    act(() => result.current.setFilterParentId("__floating__"));

    const ids = result.current.filteredTasks.map((t) => t.id);
    expect(ids).toEqual(["floating"]);
  });
});
