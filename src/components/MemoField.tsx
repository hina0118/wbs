/**
 * MemoField – モーダル内のメモ欄
 * 「編集」「プレビュー」タブで textarea と Markdown レンダリングを切替
 */
import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function MemoField({ value, onChange }: Props) {
  const [preview, setPreview] = useState(false);

  return (
    <div className="memo-field">
      <div className="memo-field-header">
        <span className="modal-label">メモ</span>
        <div className="memo-tab-group">
          <button
            type="button"
            className={`memo-tab${!preview ? " memo-tab--active" : ""}`}
            onClick={() => setPreview(false)}
          >
            ✏️ 編集
          </button>
          <button
            type="button"
            className={`memo-tab${preview ? " memo-tab--active" : ""}`}
            onClick={() => setPreview(true)}
          >
            👁 プレビュー
          </button>
        </div>
      </div>

      {preview ? (
        <div className="memo-preview markdown-body">
          {value.trim() ? (
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{value}</ReactMarkdown>
          ) : (
            <span className="memo-preview-empty">メモなし</span>
          )}
        </div>
      ) : (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={"Markdown 形式で入力できます\n例: **太字** `コード` - リスト"}
          className="memo-input"
          rows={5}
        />
      )}
    </div>
  );
}
