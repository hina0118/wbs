import { Task } from "../types/task";
import { TaskType } from "./settingsStorage";

export function calcPersonMonths(quantity: number, productivity: number): number {
  if (productivity <= 0) return 0;
  return quantity / productivity;
}

export function getTaskEstimation(
  task: Task,
  taskTypes: TaskType[],
): { quantity: number; productivity: number; personMonths: number; unit: string; typeName: string } | null {
  if (task.quantity == null || !task.taskTypeId) return null;
  const type = taskTypes.find((t) => t.id === task.taskTypeId);
  if (!type) return null;
  return {
    quantity: task.quantity,
    productivity: type.productivity,
    personMonths: calcPersonMonths(task.quantity, type.productivity),
    unit: type.unit,
    typeName: type.name,
  };
}
