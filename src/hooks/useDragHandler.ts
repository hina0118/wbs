import { useEffect, useRef, useState } from "react";
import { Task } from "../types/task";
import { propagateDates, addDays } from "../utils/taskUtils";

const DAY_WIDTH = 28;

export interface DragState {
  taskId: string;
  type: "start" | "end" | "move";
  startX: number;
  originalStart: Date;
  originalEnd: Date;
}

export interface DragPreview {
  taskId: string;
  startDate: Date;
  endDate: Date;
}

export function useDragHandler(
  tasks: Task[],
  onTasksChange: (tasks: Task[]) => void,
  onDragStart?: () => void,
) {
  const dragRef    = useRef<DragState | null>(null);
  const didDragRef = useRef(false);
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null);

  function startDrag(e: React.MouseEvent, task: Task, type: DragState["type"]) {
    e.preventDefault();
    e.stopPropagation();
    onDragStart?.();
    dragRef.current = {
      taskId: task.id,
      type,
      startX: e.clientX,
      originalStart: task.startDate,
      originalEnd: task.endDate,
    };
    didDragRef.current = false;
  }

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      const drag = dragRef.current;
      if (!drag) return;

      const delta = Math.round((e.clientX - drag.startX) / DAY_WIDTH);
      if (delta !== 0) didDragRef.current = true;

      let newStart = drag.originalStart;
      let newEnd   = drag.originalEnd;

      if (drag.type === "move") {
        newStart = addDays(drag.originalStart, delta);
        newEnd   = addDays(drag.originalEnd,   delta);
      } else if (drag.type === "start") {
        newStart = addDays(drag.originalStart, delta);
        if (newStart >= drag.originalEnd) newStart = addDays(drag.originalEnd, -1);
      } else {
        newEnd = addDays(drag.originalEnd, delta);
        if (newEnd <= drag.originalStart) newEnd = addDays(drag.originalStart, 1);
      }

      setDragPreview({ taskId: drag.taskId, startDate: newStart, endDate: newEnd });
    }

    function onMouseUp() {
      const drag    = dragRef.current;
      dragRef.current = null;

      if (!drag || !didDragRef.current) {
        setDragPreview(null);
        return;
      }

      setDragPreview((preview) => {
        if (!preview) return null;
        const updated = tasks.map((t) =>
          t.id === drag.taskId
            ? { ...t, startDate: preview.startDate, endDate: preview.endDate }
            : t
        );
        onTasksChange(propagateDates(drag.taskId, updated));
        return null;
      });
    }

    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup",   onMouseUp);
    return () => {
      window.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("mouseup",   onMouseUp);
    };
  }, [tasks, onTasksChange]);

  return { dragRef, didDragRef, dragPreview, startDrag };
}
