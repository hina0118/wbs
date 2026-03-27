import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task, ReminderRepeat } from "../types/task";

/** 繰り返し設定に応じて次回の通知日時を計算する */
function nextReminderDatetime(datetime: string, repeat: ReminderRepeat): string {
  const d = new Date(datetime);
  switch (repeat) {
    case "daily":
      d.setDate(d.getDate() + 1);
      break;
    case "weekly":
      d.setDate(d.getDate() + 7);
      break;
    case "monthly":
      d.setMonth(d.getMonth() + 1);
      break;
  }
  // "YYYY-MM-DDTHH:mm" 形式に戻す
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * useReminder – リマインダー監視フック
 *
 * 60秒ごとにタスクのリマインダー日時をチェックし、期限到達時に
 * OS ネイティブ通知（show_notification コマンド経由）と
 * アプリ内トースト通知（onInAppNotify コールバック）を発火する。
 * 通知済みタスクは notified フラグを立てて再通知を防ぐ。
 */
export function useReminder(
  tasks: Task[],
  onTasksChange: (updated: Task[]) => void,
  onInAppNotify: (message: string) => void,
): void {
  // 最新の tasks / コールバックを ref で保持（interval クロージャで常に最新値を参照）
  const tasksRef = useRef(tasks);
  const onTasksChangeRef = useRef(onTasksChange);
  const onInAppNotifyRef = useRef(onInAppNotify);

  // render ではなく effect 内で ref を更新（react-hooks/refs ルール準拠）
  useEffect(() => {
    tasksRef.current = tasks;
  }, [tasks]);

  useEffect(() => {
    onTasksChangeRef.current = onTasksChange;
  }, [onTasksChange]);

  useEffect(() => {
    onInAppNotifyRef.current = onInAppNotify;
  }, [onInAppNotify]);

  const checkReminders = useCallback(() => {
    const now = new Date();
    let changed = false;
    const updated = tasksRef.current.map((task) => {
      if (!task.reminder || task.reminder.notified) return task;
      const reminderTime = new Date(task.reminder.datetime);
      if (reminderTime > now) return task;

      // 期限到達 → 通知発火
      const body = task.name;
      invoke("show_notification", { title: "WBS リマインダー", body }).catch((e) =>
        console.warn("通知送信エラー:", e),
      );
      onInAppNotifyRef.current(`🔔 ${body}`);
      changed = true;

      const repeat = task.reminder.repeat ?? "none";
      if (repeat !== "none") {
        // 繰り返し: 次回日時へ進めて notified をリセット
        return {
          ...task,
          reminder: {
            ...task.reminder,
            datetime: nextReminderDatetime(task.reminder.datetime, repeat),
            notified: false,
          },
        };
      }
      return { ...task, reminder: { ...task.reminder, notified: true } };
    });

    if (changed) {
      onTasksChangeRef.current(updated);
    }
  }, []);

  useEffect(() => {
    checkReminders(); // 起動時に即時チェック
    const id = setInterval(checkReminders, 60_000);
    return () => clearInterval(id);
  }, [checkReminders]);
}
