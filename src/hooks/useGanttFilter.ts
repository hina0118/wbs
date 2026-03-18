import { useState } from "react";
import { Task } from "../types/task";
import { getAllDescendantIds } from "../utils/taskUtils";

export function useGanttFilter(tasks: Task[]) {
  const [filterParentId, setFilterParentId] = useState<string>("all");
  const [filterAssignee, setFilterAssignee] = useState<string>("all");

  const assignees = [
    ...new Set(
      tasks.flatMap((t) => [t.assignee, ...(t.subMembers ?? [])]).filter(Boolean)
    ),
  ] as string[];

  const filteredByParent =
    filterParentId === "all"
      ? tasks
      : [
          tasks.find((t) => t.id === filterParentId)!,
          ...getAllDescendantIds(filterParentId, tasks)
            .slice(1)
            .map((id) => tasks.find((t) => t.id === id)!),
        ].filter(Boolean);

  const filteredTasks =
    filterAssignee === "all"
      ? filteredByParent
      : filteredByParent.filter(
          (t) =>
            t.assignee === filterAssignee ||
            (t.subMembers ?? []).includes(filterAssignee) ||
            getAllDescendantIds(t.id, tasks)
              .slice(1)
              .some((id) => {
                const c = tasks.find((c) => c.id === id);
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
