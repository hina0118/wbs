/**
 * MemoView – カンバンカード内の Markdown レンダリング（折り畳み表示）
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { markdownComponents } from "./MarkdownComponents";

interface Props {
  children: string;
  /** true: カード用（最大3行クランプ）  false: フル表示 */
  compact?: boolean;
}

export default function MemoView({ children, compact = false }: Props) {
  return (
    <div className={`markdown-body${compact ? " markdown-body--compact" : ""}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {children}
      </ReactMarkdown>
    </div>
  );
}
