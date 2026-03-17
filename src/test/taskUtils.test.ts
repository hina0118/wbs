import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  isLeaf,
  computeProgress,
  propagateDates,
  getAllDescendantIds,
  sortByTree,
  getAncestorNames,
  toInputDate,
  genId,
  getSignalStatus,
} from "../utils/taskUtils";
import type { Task } from "../types/task";

// テスト用タスクファクトリ
function makeTask(overrides: Partial<Task> & { id: string }): Task {
  return {
    name: overrides.id,
    startDate: new Date(2025, 0, 1),
    endDate: new Date(2025, 11, 31),
    progress: 0,
    ...overrides,
  };
}

const root = makeTask({ id: "root" });
const child1 = makeTask({ id: "child1", parentId: "root", progress: 50 });
const child2 = makeTask({ id: "child2", parentId: "root", progress: 100 });
const grandchild = makeTask({ id: "grandchild", parentId: "child1", progress: 80 });

const flatTasks: Task[] = [root, child1, child2, grandchild];

// ─── isLeaf ──────────────────────────────────────────────────
describe("isLeaf", () => {
  it("子を持たないタスクは true", () => {
    expect(isLeaf("child2", flatTasks)).toBe(true);
    expect(isLeaf("grandchild", flatTasks)).toBe(true);
  });

  it("子を持つタスクは false", () => {
    expect(isLeaf("root", flatTasks)).toBe(false);
    expect(isLeaf("child1", flatTasks)).toBe(false);
  });
});

// ─── computeProgress ─────────────────────────────────────────
describe("computeProgress", () => {
  it("リーフタスクは自身の progress を返す", () => {
    expect(computeProgress("grandchild", flatTasks)).toBe(80);
    expect(computeProgress("child2", flatTasks)).toBe(100);
  });

  it("親タスクは子の平均進捗を返す", () => {
    // child1 の子: grandchild(80) → child1 の実効進捗は 80
    expect(computeProgress("child1", flatTasks)).toBe(80);
  });

  it("root は全子孫の平均を再帰計算する", () => {
    // child1(80) + child2(100) = 90
    expect(computeProgress("root", flatTasks)).toBe(90);
  });

  it("存在しない id は 0 を返す", () => {
    expect(computeProgress("nonexistent", flatTasks)).toBe(0);
  });
});

// ─── propagateDates ──────────────────────────────────────────
describe("propagateDates", () => {
  it("親の日程が子の最小 start / 最大 end に更新される", () => {
    const t1 = makeTask({ id: "p", startDate: new Date(2025, 0, 1), endDate: new Date(2025, 11, 31) });
    const t2 = makeTask({ id: "c1", parentId: "p", startDate: new Date(2025, 1, 1), endDate: new Date(2025, 5, 30) });
    const t3 = makeTask({ id: "c2", parentId: "p", startDate: new Date(2025, 3, 1), endDate: new Date(2025, 9, 31) });

    const result = propagateDates("c1", [t1, t2, t3]);
    const parent = result.find((t) => t.id === "p")!;
    expect(parent.startDate).toEqual(new Date(2025, 1, 1));
    expect(parent.endDate).toEqual(new Date(2025, 9, 31));
  });

  it("親が存在しない（ルート）タスクはそのまま返す", () => {
    const tasks = [root, child1];
    const result = propagateDates("root", tasks);
    expect(result).toEqual(tasks);
  });
});

// ─── getAllDescendantIds ──────────────────────────────────────
describe("getAllDescendantIds", () => {
  it("リーフタスクは自身の id のみ", () => {
    expect(getAllDescendantIds("grandchild", flatTasks)).toEqual(["grandchild"]);
  });

  it("root は全子孫 id を含む", () => {
    const ids = getAllDescendantIds("root", flatTasks);
    expect(ids).toContain("root");
    expect(ids).toContain("child1");
    expect(ids).toContain("child2");
    expect(ids).toContain("grandchild");
    expect(ids).toHaveLength(4);
  });
});

// ─── sortByTree ───────────────────────────────────────────────
describe("sortByTree", () => {
  it("DFS 順（親 → 子 → 孫）に並び替える（兄弟は元配列の出現順を維持）", () => {
    // 入力: [grandchild, child2, root, child1]
    // root の子は child2 → child1 の順で出現するため、その順を維持
    const shuffled: Task[] = [grandchild, child2, root, child1];
    const sorted = sortByTree(shuffled);
    expect(sorted.map((t) => t.id)).toEqual(["root", "child2", "child1", "grandchild"]);
  });

  it("ルートが複数ある場合も処理できる", () => {
    const root2 = makeTask({ id: "root2" });
    const tasks: Task[] = [root2, root, child1, child2, grandchild];
    const sorted = sortByTree(tasks);
    expect(sorted[0].id).toBe("root2");
    expect(sorted[1].id).toBe("root");
  });
});

// ─── getAncestorNames ─────────────────────────────────────────
describe("getAncestorNames", () => {
  it("ルートタスクは空配列", () => {
    expect(getAncestorNames("root", flatTasks)).toEqual([]);
  });

  it("孫タスクはルート → 親の名前リストを返す", () => {
    const names = getAncestorNames("grandchild", flatTasks);
    expect(names).toEqual(["root", "child1"]);
  });

  it("親 id が存在するが親タスクが見つからない場合は空配列", () => {
    const orphan = makeTask({ id: "orphan", parentId: "ghost" });
    expect(getAncestorNames("orphan", [orphan])).toEqual([]);
  });
});

// ─── toInputDate ──────────────────────────────────────────────
describe("toInputDate", () => {
  it("Date を YYYY-MM-DD 形式に変換する", () => {
    expect(toInputDate(new Date(2025, 0, 1))).toBe("2025-01-01");
    expect(toInputDate(new Date(2025, 11, 31))).toBe("2025-12-31");
    expect(toInputDate(new Date(2025, 5, 9))).toBe("2025-06-09");
  });
});

// ─── genId ───────────────────────────────────────────────────
describe("genId", () => {
  it("毎回異なる id を生成する", () => {
    const ids = new Set(Array.from({ length: 100 }, () => genId()));
    expect(ids.size).toBe(100);
  });

  it("文字列を返す", () => {
    expect(typeof genId()).toBe("string");
  });
});

// ─── getSignalStatus ─────────────────────────────────────────
describe("getSignalStatus", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 15)); // 2025-06-15
  });

  it("progress 100 は none", () => {
    const task = makeTask({ id: "t", progress: 100, startDate: new Date(2025, 0, 1), endDate: new Date(2025, 11, 31) });
    expect(getSignalStatus("t", [task])).toBe("none");
  });

  it("終了日が過去 → red", () => {
    const task = makeTask({ id: "t", progress: 0, startDate: new Date(2025, 0, 1), endDate: new Date(2025, 4, 1) });
    expect(getSignalStatus("t", [task])).toBe("red");
  });

  it("開始日が過去・progress 0 → yellow", () => {
    const task = makeTask({ id: "t", progress: 0, startDate: new Date(2025, 3, 1), endDate: new Date(2025, 11, 31) });
    expect(getSignalStatus("t", [task])).toBe("yellow");
  });

  it("未来タスク・progress 0 → green", () => {
    const task = makeTask({ id: "t", progress: 0, startDate: new Date(2025, 6, 1), endDate: new Date(2025, 11, 31) });
    expect(getSignalStatus("t", [task])).toBe("green");
  });

  it("存在しない id は none を返す", () => {
    expect(getSignalStatus("nonexistent", [])).toBe("none");
  });

  it("親タスクの progress は子の平均で計算される（シグナル判定にも適用）", () => {
    // child1 の子の grandchild が progress=100 → child1 の実効進捗=100 → none
    const done = makeTask({ id: "grandchild", parentId: "child1", progress: 100, endDate: new Date(2025, 4, 1) });
    const parent = makeTask({ id: "child1", parentId: "root", progress: 0, endDate: new Date(2025, 4, 1) });
    expect(getSignalStatus("child1", [parent, done])).toBe("none");
  });
});
