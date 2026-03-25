/**
 * MemoFloatingPanel – ドラッグ・リサイズ可能なフローティングメモ編集パネル
 */
import { useState } from "react";
import { Rnd } from "react-rnd";
import { Task } from "../types/task";
import MemoField from "./MemoField";

interface Props {
  task: Task;
  tasks: Task[];
  onSave: (updatedTasks: Task[]) => void;
  onClose: () => void;
}

export default function MemoFloatingPanel({ task, tasks, onSave, onClose }: Props) {
  const [memo, setMemo] = useState(task.memo ?? "");

  function handleSave() {
    const updated = tasks.map((t) => (t.id === task.id ? { ...t, memo: memo || undefined } : t));
    onSave(updated);
    onClose();
  }

  function handleCancel() {
    onClose();
  }

  return (
    <Rnd
      default={{
        x: Math.max(0, window.innerWidth / 2 - 300),
        y: Math.max(0, window.innerHeight / 2 - 220),
        width: 600,
        height: 440,
      }}
      minWidth={320}
      minHeight={280}
      bounds="window"
      dragHandleClassName="memo-floating-titlebar"
      className="memo-floating-panel"
    >
      <div className="memo-floating-titlebar">
        <span className="memo-floating-title" title={task.name}>
          {task.name}
        </span>
        <button className="memo-floating-close" onClick={handleCancel} title="閉じる">
          ✕
        </button>
      </div>

      <div className="memo-floating-body">
        <MemoField value={memo} onChange={setMemo} />
      </div>

      <div className="memo-floating-footer">
        <button className="btn-cancel" onClick={handleCancel}>
          キャンセル
        </button>
        <button className="btn-save" onClick={handleSave}>
          保存
        </button>
      </div>
    </Rnd>
  );
}
