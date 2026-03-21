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

  // 担当者フィルタ: 各タスク毎に getAllDescendantIds を呼ぶ O(n²) を避けるため
  // 「担当者に一致するタスクの祖先を上方向にたどって keep セットを構築」する O(n×depth) 方式を使用。
  const filteredTasks = (() => {
    if (filterAssignee === "all") return filteredByParent;

    // filterAssignee に直接一致するタスクから祖先をたどって "表示すべきタスク" IDのセットを構築
    const keepIds = new Set<string>();
    for (const t of activeTasks) {
      if (t.assignee !== filterAssignee && !(t.subMembers ?? []).includes(filterAssignee)) continue;
      let cur: Task | undefined = t;
      while (cur) {
        if (keepIds.has(cur.id)) break; // 既にたどり済みの祖先パスはスキップ
        keepIds.add(cur.id);
        cur = cur.parentId ? activeTasks.find((a) => a.id === cur!.parentId) : undefined;
      }
    }

    return filteredByParent.filter((t) => keepIds.has(t.id));
  })();

  return {
    filterParentId,
    filterAssignee,
    assignees,
    filteredTasks,
    setFilterParentId,
    setFilterAssignee,
  };
}
