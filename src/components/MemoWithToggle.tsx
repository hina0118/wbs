/**
 * MemoWithToggle
 * ボタンでメモ全体の表示 / 非表示をシンプルにトグルする
 */
import MemoView from "./MemoView";

interface Props {
  memo: string;
  expanded: boolean;
  onToggle: (e: React.MouseEvent) => void;
  className?: string;
}

export default function MemoWithToggle({ memo, expanded, onToggle, className }: Props) {
  return (
    <div className={className}>
      {expanded && <MemoView>{memo}</MemoView>}
      <button className="memo-toggle-btn" onClick={onToggle}>
        {expanded ? "▲ 閉じる" : "▼ メモを見る"}
      </button>
    </div>
  );
}
