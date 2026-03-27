/**
 * GanttTooltip – ガントバーのホバーツールチップ（Markdownメモ対応）
 */
import { useRef, useLayoutEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./MarkdownComponents";
import { Task } from "../types/task";

interface Props {
  task: Task;
  progress: number;
  x: number;
  y: number;
}

function fmtDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export default function GanttTooltip({ task, progress, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  // レンダリング後、DOM の高さを読んで直接スタイルを調整する（setState 不要）
  useLayoutEffect(() => {
    if (!ref.current) return;
    const height = ref.current.offsetHeight;
    const overflow = y + 18 + height > window.innerHeight;
    ref.current.style.top = `${overflow ? Math.max(y - height - 8, 4) : y + 18}px`;
  }, [y, task]);

  // 画面右端に近い場合は左側に表示
  const left = Math.min(x + 14, window.innerWidth - 340);

  return (
    <div ref={ref} className="gantt-tooltip" style={{ left, top: y + 18 }}>
      {/* ヘッダー */}
      <div className="gantt-tooltip-header">
        <span className="gantt-tooltip-name">{task.name}</span>
        <span className="gantt-tooltip-pct">{progress}%</span>
      </div>

      {/* メタ情報 */}
      {task.assignee && <div className="gantt-tooltip-meta">👤 {task.assignee}</div>}
      <div className="gantt-tooltip-meta">
        📅 {fmtDate(task.startDate)} – {fmtDate(task.endDate)}
      </div>

      {/* メモ（Markdown） */}
      {task.memo && (
        <>
          <div className="gantt-tooltip-divider" />
          <div className="gantt-tooltip-memo markdown-body">
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {task.memo}
            </ReactMarkdown>
          </div>
        </>
      )}
    </div>
  );
}
