import { useState } from "react";
import { Task } from "../types/task";
import { getAllDescendantIds } from "../utils/taskUtils";

export function useGanttFilter(tasks: Task[]) {
  const [filterParentId, setFilterParentId] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");

  // アーカイブ済みタスクは常に除外
  const activeTasks = tasks.filter((t) => !t.archived);

  const assignees = [
    ...new Set(
      activeTasks.flatMap((t) => [t.assignee, ...(t.subMembers ?? [])]).filter(Boolean)
    ),
  ] as string[];

  const filteredByParent =
    filterParentId === "all"
      ? activeTasks
      : filterParentId === "__floating__"
      ? activeTasks.filter((t) => t.isFloating)
      : [
          activeTasks.find((t) => t.id === filterParentId)!,
          ...getAllDescendantIds(filterParentId, activeTasks)
            .slice(1)
            .map((id) => activeTasks.find((t) => t.id === id)!),
        ].filter(Boolean);

  const filteredTasks =
    filterAssignee === "all"
      ? filteredByParent
      : filteredByParent.filter(
          (t) =>
            t.assignee === filterAssignee ||
            (t.subMembers ?? []).includes(filterAssignee) ||
            getAllDescendantIds(t.id, activeTasks)
              .slice(1)
              .some((id) => {
                const c = activeTasks.find((c) => c.id === id);
                return c?.assignee === filterAssignee || (c?.subMembers ?? []).includes(filterAssignee);
              })
        );

  function resetParentFilter(value: string) {
    setFilterParentId(value);
  }

  return {
    filterParentId,
    filterAssignee,
    assignees,
    filteredTasks,
    setFilterParentId: resetParentFilter,
    setFilterAssignee,
  };
}
