import { useCallback, useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Task } from "../types/task";

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
  tasksRef.current = tasks;
  const onTasksChangeRef = useRef(onTasksChange);
  onTasksChangeRef.current = onTasksChange;
  const onInAppNotifyRef = useRef(onInAppNotify);
  onInAppNotifyRef.current = onInAppNotify;

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
