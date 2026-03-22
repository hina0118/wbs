import { useMemo } from "react";
import { Task } from "../types/task";
import { isLeaf, computeProgress, getAncestorNames, getSignalStatus, formatDateYMD } from "../utils/taskUtils";

interface Props {
  tasks: Task[];
}

export default function AnalysisView({ tasks }: Props) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const leafTasks = useMemo(
    () => tasks.filter((t) => !t.isFloating && isLeaf(t.id, tasks)),
    [tasks]
  );

  // 遅延タスク: 終了予定日を過ぎているのに未完了
  const delayedTasks = useMemo(
    () =>
      leafTasks.filter(
        (t) => t.endDate < today && computeProgress(t.id, tasks) < 100
      ),
    [leafTasks, tasks, today]
  );

  // 進捗遅れタスク: 期限内だが計画進捗より10%以上遅れている
  const behindTasks = useMemo(
    () => leafTasks.filter((t) => getSignalStatus(t.id, tasks) === "yellow"),
    [leafTasks, tasks]
  );

  function expectedProgress(t: Task): number {
    const startTime = t.startDate.getTime();
    const endTime = t.endDate.getTime();
    const todayTime = today.getTime();
    const totalDuration = endTime - startTime;
    if (totalDuration <= 0) return 100;
    return Math.min(Math.round((todayTime - startTime) / totalDuration * 100), 100);
  }

  // 未割当タスク: 担当者が設定されていない未完了の葉タスク
  const unassignedTasks = useMemo(
    () => leafTasks.filter((t) => !t.assignee && computeProgress(t.id, tasks) < 100),
    [leafTasks, tasks]
  );

  // 次のタスクがないメンバー
  const idleMembers = useMemo(() => {
    const assignees = [
      ...new Set(leafTasks.map((t) => t.assignee).filter(Boolean) as string[]),
    ];
    return assignees.filter((assignee) => {
      const activeTasks = leafTasks.filter(
        (t) =>
          t.assignee === assignee &&
          computeProgress(t.id, tasks) < 100 &&
          t.endDate >= today
      );
      return activeTasks.length === 0;
    });
  }, [leafTasks, tasks, today]);

  function delayDays(endDate: Date): number {
    return Math.floor((today.getTime() - endDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  return (
    <div className="analysis-view">
      {/* 遅延タスク */}
      <section className="analysis-section">
        <h2 className="analysis-section-title">
          <span className="analysis-icon">⚠️</span>
          遅延タスク
          <span className="analysis-count">{delayedTasks.length}件</span>
        </h2>

        {delayedTasks.length === 0 ? (
          <p className="analysis-empty">遅延タスクはありません</p>
        ) : (
          <div className="analysis-table-wrapper">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>タスク名</th>
                  <th>担当者</th>
                  <th>終了予定日</th>
                  <th>遅延日数</th>
                  <th>進捗</th>
                  <th>パス</th>
                </tr>
              </thead>
              <tbody>
                {delayedTasks.map((t) => {
                  const ancestors = getAncestorNames(t.id, tasks);
                  const progress = computeProgress(t.id, tasks);
                  const late = delayDays(t.endDate);
                  const isNotStarted = progress === 0;
                  return (
                    <tr key={t.id} className={isNotStarted ? "analysis-row--not-started" : ""}>
                      <td className="analysis-task-name">{t.name}</td>
                      <td>{t.assignee || "—"}</td>
                      <td>{formatDateYMD(t.endDate)}</td>
                      <td className="analysis-delay">+{late}日</td>
                      <td>
                        <div className="analysis-progress-bar">
                          <div
                            className="analysis-progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                          <span>{progress}%</span>
                        </div>
                      </td>
                      <td className="analysis-path">
                        {ancestors.length > 0 ? ancestors.join(" > ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 進捗遅れタスク */}
      <section className="analysis-section">
        <h2 className="analysis-section-title">
          <span className="analysis-icon">🟡</span>
          進捗遅れタスク
          <span className="analysis-count">{behindTasks.length}件</span>
        </h2>

        {behindTasks.length === 0 ? (
          <p className="analysis-empty">進捗遅れのタスクはありません</p>
        ) : (
          <div className="analysis-table-wrapper">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>タスク名</th>
                  <th>担当者</th>
                  <th>終了予定日</th>
                  <th>期待進捗</th>
                  <th>実績進捗</th>
                  <th>パス</th>
                </tr>
              </thead>
              <tbody>
                {behindTasks.map((t) => {
                  const ancestors = getAncestorNames(t.id, tasks);
                  const actual = computeProgress(t.id, tasks);
                  const expected = expectedProgress(t);
                  const gap = expected - actual;
                  return (
                    <tr key={t.id}>
                      <td className="analysis-task-name">{t.name}</td>
                      <td>{t.assignee || "—"}</td>
                      <td>{formatDateYMD(t.endDate)}</td>
                      <td>{expected}%</td>
                      <td>
                        <div className="analysis-progress-bar">
                          <div
                            className="analysis-progress-fill analysis-progress-fill--behind"
                            style={{ width: `${actual}%` }}
                          />
                          <span>{actual}% <span className="analysis-gap">(-{gap}%)</span></span>
                        </div>
                      </td>
                      <td className="analysis-path">
                        {ancestors.length > 0 ? ancestors.join(" > ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 未割当タスク */}
      <section className="analysis-section">
        <h2 className="analysis-section-title">
          <span className="analysis-icon">👤</span>
          未割当タスク
          <span className="analysis-count">{unassignedTasks.length}件</span>
        </h2>

        {unassignedTasks.length === 0 ? (
          <p className="analysis-empty">未割当のタスクはありません</p>
        ) : (
          <div className="analysis-table-wrapper">
            <table className="analysis-table">
              <thead>
                <tr>
                  <th>タスク名</th>
                  <th>終了予定日</th>
                  <th>進捗</th>
                  <th>パス</th>
                </tr>
              </thead>
              <tbody>
                {unassignedTasks.map((t) => {
                  const ancestors = getAncestorNames(t.id, tasks);
                  const progress = computeProgress(t.id, tasks);
                  return (
                    <tr key={t.id}>
                      <td className="analysis-task-name">{t.name}</td>
                      <td>{formatDateYMD(t.endDate)}</td>
                      <td>
                        <div className="analysis-progress-bar">
                          <div
                            className="analysis-progress-fill"
                            style={{ width: `${progress}%` }}
                          />
                          <span>{progress}%</span>
                        </div>
                      </td>
                      <td className="analysis-path">
                        {ancestors.length > 0 ? ancestors.join(" > ") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 次のタスクがないメンバー */}
      <section className="analysis-section">
        <h2 className="analysis-section-title">
          <span className="analysis-icon">🕐</span>
          次のタスクがないメンバー
          <span className="analysis-count">{idleMembers.length}人</span>
        </h2>

        {idleMembers.length === 0 ? (
          <p className="analysis-empty">全員に次のタスクがあります</p>
        ) : (
          <div className="analysis-idle-members">
            {idleMembers.map((member) => (
              <span key={member} className="analysis-member-chip">
                {member}
              </span>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
