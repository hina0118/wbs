import { describe, it, expect } from "vitest";
import { calcPersonMonths, getTaskEstimation } from "../utils/estimationUtils";
import type { Task } from "../types/task";
import type { TaskType } from "../utils/settingsStorage";

const taskTypes: TaskType[] = [
  { id: "t1", name: "画面開発", unit: "画面", productivity: 4 },
  { id: "t2", name: "API開発", unit: "本", productivity: 10 },
];

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: "task1",
    name: "テスト",
    startDate: new Date(2025, 0, 1),
    endDate: new Date(2025, 0, 31),
    progress: 0,
    ...overrides,
  };
}

describe("calcPersonMonths", () => {
  it("quantity / productivity を返す", () => {
    expect(calcPersonMonths(8, 4)).toBe(2);
  });

  it("productivity が 0 のとき 0 を返す", () => {
    expect(calcPersonMonths(8, 0)).toBe(0);
  });

  it("productivity が負のとき 0 を返す", () => {
    expect(calcPersonMonths(8, -1)).toBe(0);
  });
});

describe("getTaskEstimation", () => {
  it("taskTypeId と quantity がある場合に見積もりを返す", () => {
    const task = makeTask({ taskTypeId: "t1", quantity: 8 });
    const result = getTaskEstimation(task, taskTypes);
    expect(result).toEqual({
      quantity: 8,
      productivity: 4,
      personMonths: 2,
      unit: "画面",
      typeName: "画面開発",
    });
  });

  it("quantity が未設定の場合 null を返す", () => {
    const task = makeTask({ taskTypeId: "t1" });
    expect(getTaskEstimation(task, taskTypes)).toBeNull();
  });

  it("taskTypeId が未設定の場合 null を返す", () => {
    const task = makeTask({ quantity: 8 });
    expect(getTaskEstimation(task, taskTypes)).toBeNull();
  });

  it("taskTypeId に対応する種別が存在しない場合 null を返す", () => {
    const task = makeTask({ taskTypeId: "unknown", quantity: 8 });
    expect(getTaskEstimation(task, taskTypes)).toBeNull();
  });
});
