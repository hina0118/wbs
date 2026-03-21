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
  copyTaskFields,
  archiveTask,
  unarchiveTask,
  addDays,
  formatDateShort,
  formatDateYMD,
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

// ─── addDays ──────────────────────────────────────────────────
describe("addDays", () => {
  it("正の値で指定日数分加算される", () => {
    const d = new Date(2025, 0, 1); // 2025-01-01
    expect(addDays(d, 7)).toEqual(new Date(2025, 0, 8));
  });

  it("負の値で指定日数分減算される", () => {
    const d = new Date(2025, 0, 10); // 2025-01-10
    expect(addDays(d, -3)).toEqual(new Date(2025, 0, 7));
  });

  it("元の Date オブジェクトを変更しない（immutable）", () => {
    const d = new Date(2025, 0, 1);
    addDays(d, 5);
    expect(d).toEqual(new Date(2025, 0, 1));
  });

  it("月をまたぐ加算が正しい", () => {
    const d = new Date(2025, 0, 30); // 2025-01-30
    expect(addDays(d, 3)).toEqual(new Date(2025, 1, 2)); // 2025-02-02
  });
});

// ─── formatDateShort ──────────────────────────────────────────
describe("formatDateShort", () => {
  it("M/D 形式で返す（月・日ゼロ埋めなし）", () => {
    expect(formatDateShort(new Date(2025, 0, 1))).toBe("1/1");
    expect(formatDateShort(new Date(2025, 11, 31))).toBe("12/31");
  });

  it("1 桁の月・日はゼロ埋めしない", () => {
    expect(formatDateShort(new Date(2025, 5, 9))).toBe("6/9");
  });
});

// ─── formatDateYMD ────────────────────────────────────────────
describe("formatDateYMD", () => {
  it("YYYY/M/D 形式で返す（月・日ゼロ埋めなし）", () => {
    expect(formatDateYMD(new Date(2025, 0, 1))).toBe("2025/1/1");
    expect(formatDateYMD(new Date(2025, 11, 31))).toBe("2025/12/31");
  });

  it("1 桁の月・日はゼロ埋めしない", () => {
    expect(formatDateYMD(new Date(2025, 5, 9))).toBe("2025/6/9");
  });
});

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

// ─── copyTaskFields ───────────────────────────────────────────
describe("copyTaskFields", () => {
  it("名前に「のコピー」が付く", () => {
    const src = makeTask({ id: "src", name: "タスクA" });
    const result = copyTaskFields(src);
    expect(result.name).toBe("タスクA のコピー");
  });

  it("進捗は 0 にリセットされる", () => {
    const src = makeTask({ id: "src", progress: 80 });
    const result = copyTaskFields(src);
    expect(result.progress).toBe(0);
  });

  it("色・担当者・メモがコピーされる", () => {
    const src = makeTask({ id: "src", color: "#ff0000", assignee: "Alice", memo: "メモ内容" });
    const result = copyTaskFields(src);
    expect(result.color).toBe("#ff0000");
    expect(result.assignee).toBe("Alice");
    expect(result.memo).toBe("メモ内容");
  });

  it("subMembers がある場合はコピーされる（元配列とは別インスタンス）", () => {
    const src = makeTask({ id: "src", subMembers: ["Bob", "Carol"] });
    const result = copyTaskFields(src);
    expect(result.subMembers).toEqual(["Bob", "Carol"]);
    expect(result.subMembers).not.toBe(src.subMembers);
  });

  it("subMembers がない場合は undefined", () => {
    const src = makeTask({ id: "src" });
    const result = copyTaskFields(src);
    expect(result.subMembers).toBeUndefined();
  });

  it("progressCount がある場合は done=0 でリセットされ total はコピーされる", () => {
    const src = makeTask({ id: "src", progressCount: { done: 5, total: 10 } });
    const result = copyTaskFields(src);
    expect(result.progressCount).toEqual({ done: 0, total: 10 });
  });

  it("progressCount がない場合は undefined", () => {
    const src = makeTask({ id: "src" });
    const result = copyTaskFields(src);
    expect(result.progressCount).toBeUndefined();
  });

  it("overrides で日付を上書きできる", () => {
    const src = makeTask({ id: "src" });
    const start = new Date(2026, 0, 1);
    const end   = new Date(2026, 0, 7);
    const result = copyTaskFields(src, { startDate: start, endDate: end });
    expect(result.startDate).toEqual(start);
    expect(result.endDate).toEqual(end);
  });
});

// ─── archiveTask / unarchiveTask ──────────────────────────────
describe("archiveTask", () => {
  it("ルートタスクと全子孫が archived:true になる", () => {
    const result = archiveTask("root", flatTasks);
    expect(result.find((t) => t.id === "root")?.archived).toBe(true);
    expect(result.find((t) => t.id === "child1")?.archived).toBe(true);
    expect(result.find((t) => t.id === "child2")?.archived).toBe(true);
    expect(result.find((t) => t.id === "grandchild")?.archived).toBe(true);
  });

  it("対象外のタスクは変更されない", () => {
    const other = makeTask({ id: "other" });
    const result = archiveTask("child2", [root, child1, child2, other]);
    expect(result.find((t) => t.id === "other")?.archived).toBeUndefined();
    expect(result.find((t) => t.id === "root")?.archived).toBeUndefined();
  });

  it("リーフタスク単体もアーカイブできる", () => {
    const result = archiveTask("grandchild", flatTasks);
    expect(result.find((t) => t.id === "grandchild")?.archived).toBe(true);
    expect(result.find((t) => t.id === "child1")?.archived).toBeUndefined();
  });
});

describe("unarchiveTask", () => {
  it("archived:true のタスクと全子孫が archived:false になる", () => {
    const archived = flatTasks.map((t) => ({ ...t, archived: true as const }));
    const result = unarchiveTask("root", archived);
    expect(result.find((t) => t.id === "root")?.archived).toBe(false);
    expect(result.find((t) => t.id === "child1")?.archived).toBe(false);
    expect(result.find((t) => t.id === "grandchild")?.archived).toBe(false);
  });

  it("対象外のタスクは変更されない", () => {
    const archived = flatTasks.map((t) => ({ ...t, archived: true as const }));
    const result = unarchiveTask("child2", archived);
    expect(result.find((t) => t.id === "child2")?.archived).toBe(false);
    expect(result.find((t) => t.id === "root")?.archived).toBe(true);
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
