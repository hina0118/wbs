/**
 * GanttTooltip – ガントバーのホバーツールチップ（Markdownメモ対応）
 */
import { useRef, useLayoutEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm    from "remark-gfm";
import { Task } from "../types/task";

interface Props {
  task:     Task;
  progress: number;
  x:        number;
  y:        number;
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function GanttTooltip({ task, progress, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(y + 18);

  useLayoutEffect(() => {
    if (!ref.current) return;
    const height = ref.current.offsetHeight;
    const overflow = y + 18 + height > window.innerHeight;
    setTop(overflow ? Math.max(y - height - 8, 4) : y + 18);
  }, [y, task]);

  // 画面右端に近い場合は左側に表示
  const left = Math.min(x + 14, window.innerWidth - 340);

  return (
    <div ref={ref} className="gantt-tooltip" style={{ left, top }}>
      {/* ヘッダー */}
      <div className="gantt-tooltip-header">
        <span className="gantt-tooltip-name">{task.name}</span>
        <span className="gantt-tooltip-pct">{progress}%</span>
      </div>

      {/* メタ情報 */}
      {task.assignee && (
        <div className="gantt-tooltip-meta">👤 {task.assignee}</div>
      )}
      <div className="gantt-tooltip-meta">
        📅 {fmtDate(task.startDate)} – {fmtDate(task.endDate)}
      </div>

      {/* メモ（Markdown） */}
      {task.memo && (
        <>
          <div className="gantt-tooltip-divider" />
          <div className="gantt-tooltip-memo markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.memo}</ReactMarkdown>
          </div>
        </>
      )}
    </div>
  );
}
