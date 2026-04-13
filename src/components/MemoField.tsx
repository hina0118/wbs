/**
 * MemoField – メモ欄（左: 編集 / 右: リアルタイムプレビュー）
 */
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import TurndownService from "turndown";
import { markdownComponents } from "./MarkdownComponents";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

const turndownService = new TurndownService({ headingStyle: "atx", codeBlockStyle: "fenced" });
turndownService.addRule("lineBreak", {
  filter: "br",
  replacement: () => "  \n",
});

export default function MemoField({ value, onChange }: Props) {
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const html = e.clipboardData.getData("text/html");
    if (!html) return;
    e.preventDefault();
    const markdown = turndownService.turndown(html);
    const textarea = e.currentTarget;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    onChange(value.slice(0, start) + markdown + value.slice(end));
  };

  return (
    <div className="memo-field">
      <span className="modal-label">メモ</span>
      <div className="memo-split">
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onPaste={handlePaste}
          placeholder={"Markdown 形式で入力できます\n例: **太字** `コード` - リスト"}
          className="memo-input memo-split-editor"
        />
        <div className="memo-split-divider" />
        <div className="memo-preview markdown-body">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
              {value}
            </ReactMarkdown>
          ) : (
            <span className="memo-preview-empty">メモなし</span>
          )}
        </div>
      </div>
    </div>
  );
}
