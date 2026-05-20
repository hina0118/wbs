import { useEffect, useRef, useState } from "react";
import { Task } from "../types/task";
import { DailyLog, TestBook } from "../types/testBook";

interface Props {
  tasks: Task[];
  testBooks: TestBook[];
  onTestBooksChange: (books: TestBook[]) => void;
  onTasksChange: (tasks: Task[]) => void;
  holidays?: Map<string, string>;
}

function AssigneeCombobox({
  value,
  onChange,
  suggestions,
}: {
  value: string;
  onChange: (v: string) => void;
  suggestions: string[];
}) {
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = suggestions.filter((s) => s.toLowerCase().includes(value.toLowerCase()));

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="combobox-wrapper" ref={containerRef}>
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActiveIndex(-1);
        }}
        onFocus={() => setOpen(true)}
        placeholder="-"
        className="tpt-input assignee-input"
        autoComplete="off"
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActiveIndex((i) => Math.max(i - 1, -1));
          } else if (e.key === "Enter" && activeIndex >= 0) {
            e.preventDefault();
            onChange(filtered[activeIndex]);
            setOpen(false);
            setActiveIndex(-1);
          } else if (e.key === "Escape") {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <ul className="combobox-dropdown">
          {filtered.map((s, i) => (
            <li
              key={s}
              className={`combobox-option${i === activeIndex ? " active" : ""}`}
              onMouseDown={() => {
                onChange(s);
                setOpen(false);
                setActiveIndex(-1);
              }}
            >
              {s}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

function getDayOfWeek(dateStr: string): { label: string; isSaturday: boolean; isSunday: boolean } {
  const [y, m, d] = dateStr.split("-").map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return { label: WEEKDAYS[day], isSaturday: day === 6, isSunday: day === 0 };
}

function getHolidayName(dateStr: string, holidays: Map<string, string>): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return holidays.get(`${y}/${m}/${d}`) ?? "";
}

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function newBook(): TestBook {
  return {
    id: crypto.randomUUID(),
    name: "",
    totalCount: 0,
    dailyLogs: [],
  };
}

function buildLogsFromTask(task: Task): DailyLog[] {
  const logs: DailyLog[] = [];
  const cur = new Date(task.startDate);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(task.endDate);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const d = String(cur.getDate()).padStart(2, "0");
    logs.push({ date: `${y}-${m}-${d}`, passCount: 0, failCount: 0 });
    cur.setDate(cur.getDate() + 1);
  }
  return logs;
}

function sumPass(logs: DailyLog[]): number {
  return logs.reduce((s, l) => s + l.passCount, 0);
}

function sumFail(logs: DailyLog[]): number {
  return logs.reduce((s, l) => s + l.failCount, 0);
}

function getTaskDepth(taskId: string, tasks: Task[]): number {
  const task = tasks.find((t) => t.id === taskId);
  if (!task?.parentId) return 0;
  return 1 + getTaskDepth(task.parentId, tasks);
}

function getRootTask(taskId: string, tasks: Task[]): Task | undefined {
  const task = tasks.find((t) => t.id === taskId);
  if (!task) return undefined;
  if (!task.parentId) return task;
  return getRootTask(task.parentId, tasks);
}

export default function TestProgressView({
  tasks,
  testBooks,
  onTestBooksChange,
  onTasksChange,
  holidays = new Map(),
}: Props) {
  const [filterTaskId, setFilterTaskId] = useState<string>("");
  const [showBulkInput, setShowBulkInput] = useState(false);
  const [bulkText, setBulkText] = useState("");

  const childIds = new Set(tasks.map((t) => t.parentId).filter((id): id is string => !!id));
  const selectableTasks = tasks.filter((t) => !t.archived && !childIds.has(t.id));

  const allMembers = [
    ...new Set(
      tasks.flatMap((t) => [t.assignee, ...(t.subMembers ?? [])]).filter((m): m is string => !!m),
    ),
  ];

  const visibleBooks = filterTaskId
    ? testBooks.filter((b) => b.taskId === filterTaskId)
    : testBooks;

  const totalCount = visibleBooks.reduce((s, b) => s + b.totalCount, 0);
  const passCount = visibleBooks.reduce((s, b) => s + sumPass(b.dailyLogs), 0);
  const failCount = visibleBooks.reduce((s, b) => s + sumFail(b.dailyLogs), 0);
  const notExecuted = visibleBooks.reduce(
    (s, b) => s + Math.max(0, b.totalCount - sumPass(b.dailyLogs) - sumFail(b.dailyLogs)),
    0,
  );
  const executedRate =
    totalCount > 0 ? Math.round(((passCount + failCount) / totalCount) * 100) : 0;
  const passRate = totalCount > 0 ? Math.round((passCount / totalCount) * 100) : 0;

  function updateBook(id: string, patch: Partial<TestBook>) {
    onTestBooksChange(testBooks.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  }

  function addBooks(names: string[]) {
    const linked = tasks.find((t) => t.id === filterTaskId);
    const added: TestBook[] = names.map((name) => ({
      ...newBook(),
      name,
      taskId: filterTaskId || undefined,
      assignee: linked?.assignee,
      dueDate: linked ? linked.endDate.toISOString().slice(0, 10) : undefined,
      dailyLogs: linked ? buildLogsFromTask(linked) : [],
    }));
    onTestBooksChange([...testBooks, ...added]);
  }

  function confirmBulkAdd() {
    const names = bulkText
      .split("\n")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (names.length > 0) addBooks(names);
    setBulkText("");
    setShowBulkInput(false);
  }

  function deleteBook(id: string) {
    onTestBooksChange(testBooks.filter((b) => b.id !== id));
  }

  function addLogRow(book: TestBook) {
    const date = today();
    if (book.dailyLogs.some((l) => l.date === date)) return;
    const logs = [...book.dailyLogs, { date, passCount: 0, failCount: 0 }].sort((a, b) =>
      a.date.localeCompare(b.date),
    );
    updateBook(book.id, { dailyLogs: logs });
  }

  function updateLogRow(book: TestBook, date: string, patch: Partial<DailyLog>) {
    const logs = book.dailyLogs.map((l) => (l.date === date ? { ...l, ...patch } : l));
    updateBook(book.id, { dailyLogs: logs });
  }

  function deleteLogRow(book: TestBook, date: string) {
    updateBook(book.id, { dailyLogs: book.dailyLogs.filter((l) => l.date !== date) });
  }

  return (
    <div className="test-progress-view">
      {/* ヘッダー */}
      <div className="test-progress-header">
        <div className="test-progress-title">
          <span className="test-progress-icon">🧪</span>
          <h2>テスト進捗</h2>
          <span className="test-progress-count">{visibleBooks.length} ブック</span>
        </div>
        <div className="test-progress-controls">
          <select
            className="test-progress-filter"
            value={filterTaskId}
            onChange={(e) => setFilterTaskId(e.target.value)}
          >
            <option value="">すべてのタスク</option>
            {Object.entries(
              selectableTasks.reduce<Record<string, Task[]>>((acc, t) => {
                const root = getRootTask(t.id, tasks);
                const key = root ? root.id : t.id;
                (acc[key] ??= []).push(t);
                return acc;
              }, {}),
            ).map(([rootId, leaves]) => {
              const rootName = tasks.find((t) => t.id === rootId)?.name ?? "";
              return (
                <optgroup key={rootId} label={rootName}>
                  {leaves.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
          <button
            className="test-progress-add-btn"
            onClick={() => {
              setBulkText("");
              setShowBulkInput((v) => !v);
            }}
          >
            + ブック追加
          </button>
        </div>

        {/* 一括入力エリア */}
        {showBulkInput && (
          <div className="test-progress-bulk-area">
            <p className="test-progress-bulk-hint">1行につき1ブック名を入力してください</p>
            <textarea
              className="test-progress-bulk-textarea"
              value={bulkText}
              onChange={(e) => setBulkText(e.target.value)}
              placeholder={"例:\n結合テスト_画面A\n結合テスト_画面B\n性能テスト"}
              rows={5}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) confirmBulkAdd();
                if (e.key === "Escape") setShowBulkInput(false);
              }}
            />
            <div className="test-progress-bulk-actions">
              <button className="btn-cancel" onClick={() => setShowBulkInput(false)}>
                キャンセル
              </button>
              <button className="btn-save" onClick={confirmBulkAdd} disabled={!bulkText.trim()}>
                追加 (Ctrl+Enter)
              </button>
            </div>
          </div>
        )}
      </div>

      {/* サマリーバー */}
      {totalCount > 0 && (
        <div className="test-progress-summary">
          <div className="test-progress-summary-stats">
            <span className="test-summary-total">総件数: {totalCount}</span>
            <span className="test-summary-pass">合格: {passCount}</span>
            <span className="test-summary-fail">不合格: {failCount}</span>
            <span className="test-summary-not">未実施: {notExecuted}</span>
            <span className="test-summary-rate">
              実施率: {executedRate}% / 合格率: {passRate}%
            </span>
          </div>
          <div className="test-progress-summary-bar">
            <div className="test-summary-bar-pass" style={{ width: `${passRate}%` }} />
            <div
              className="test-summary-bar-fail"
              style={{ width: `${Math.round((failCount / totalCount) * 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* テーブル */}
      {visibleBooks.length === 0 ? (
        <div className="test-progress-empty">
          <span className="test-progress-empty-icon">📋</span>
          <p>テストブックがありません</p>
          <p className="test-progress-empty-hint">「+ ブック追加」からブックを登録してください</p>
        </div>
      ) : (
        <div className="test-progress-table-wrap">
          <table className="test-progress-table">
            <thead>
              <tr>
                <th className="tpt-info-col">ブック情報</th>
                <th className="tpt-log-col">日次ログ</th>
              </tr>
            </thead>
            <tbody>
              {visibleBooks.map((book) => {
                const pass = sumPass(book.dailyLogs);
                const fail = sumFail(book.dailyLogs);
                const notEx = Math.max(0, book.totalCount - pass - fail);
                const rate =
                  book.totalCount > 0 ? Math.round(((pass + fail) / book.totalCount) * 100) : 0;
                const passRateBook =
                  book.totalCount > 0 ? Math.round((pass / book.totalCount) * 100) : 0;

                return (
                  <tr key={book.id} className="test-progress-row">
                    {/* ブック情報カード */}
                    <td className="tpt-info-col">
                      <div className="tpt-info-card">
                        {/* 行1: ブック名 + 削除 */}
                        <div className="tpt-info-row tpt-info-row--name">
                          <input
                            className="tpt-input tpt-input--name"
                            value={book.name}
                            placeholder="ブック名"
                            onChange={(e) => updateBook(book.id, { name: e.target.value })}
                          />
                          <button
                            className="tpt-del-btn"
                            onClick={() => deleteBook(book.id)}
                            title="削除"
                          >
                            🗑
                          </button>
                        </div>
                        {/* 行2: WBSタスク */}
                        <select
                          className="tpt-select tpt-select--full"
                          value={book.taskId ?? ""}
                          onChange={(e) => {
                            const taskId = e.target.value || undefined;
                            const linked = tasks.find((t) => t.id === taskId);
                            updateBook(book.id, {
                              taskId,
                              ...(linked?.assignee && !book.assignee
                                ? { assignee: linked.assignee }
                                : {}),
                              ...(linked?.endDate && !book.dueDate
                                ? { dueDate: linked.endDate.toISOString().slice(0, 10) }
                                : {}),
                              ...(linked && book.dailyLogs.length === 0
                                ? { dailyLogs: buildLogsFromTask(linked) }
                                : {}),
                            });
                          }}
                        >
                          <option value="">- WBSタスク未選択 -</option>
                          {Object.entries(
                            selectableTasks.reduce<Record<string, Task[]>>((acc, t) => {
                              const root = getRootTask(t.id, tasks);
                              const key = root ? root.id : t.id;
                              (acc[key] ??= []).push(t);
                              return acc;
                            }, {}),
                          ).map(([rootId, leaves]) => {
                            const rootName = tasks.find((t) => t.id === rootId)?.name ?? "";
                            return (
                              <optgroup key={rootId} label={rootName}>
                                {leaves.map((t) => (
                                  <option key={t.id} value={t.id}>
                                    {t.name}
                                  </option>
                                ))}
                              </optgroup>
                            );
                          })}
                        </select>
                        {/* 行3: 担当者 + 期限 */}
                        <div className="tpt-info-row">
                          <AssigneeCombobox
                            value={book.assignee ?? ""}
                            onChange={(v) => updateBook(book.id, { assignee: v || undefined })}
                            suggestions={allMembers}
                          />
                          <input
                            type="date"
                            className="tpt-input tpt-input--date"
                            value={book.dueDate ?? ""}
                            onChange={(e) =>
                              updateBook(book.id, { dueDate: e.target.value || undefined })
                            }
                          />
                        </div>
                        {/* 行4: 総件数 + 集計 */}
                        <div className="tpt-info-row tpt-info-row--counts">
                          <span className="tpt-count-label">総件数</span>
                          <input
                            type="number"
                            className="tpt-input tpt-input--num"
                            value={book.totalCount || ""}
                            min={0}
                            placeholder="0"
                            onChange={(e) =>
                              updateBook(book.id, {
                                totalCount: parseInt(e.target.value, 10) || 0,
                              })
                            }
                          />
                          <span className="tpt-count-pass">合格 {pass}</span>
                          <span className="tpt-count-fail">不合格 {fail}</span>
                          <span className="tpt-count-not">未実施 {notEx}</span>
                        </div>
                        {/* 行5: 進捗バー + 反映 */}
                        <div className="tpt-info-row tpt-info-row--footer">
                          <div className="tpt-bar-wrap">
                            <div className="tpt-bar-track">
                              <div className="tpt-bar-pass" style={{ width: `${passRateBook}%` }} />
                              <div
                                className="tpt-bar-fail"
                                style={{
                                  width: `${book.totalCount > 0 ? Math.round((fail / book.totalCount) * 100) : 0}%`,
                                }}
                              />
                            </div>
                            <span className="tpt-bar-pct">{rate}%</span>
                          </div>
                          {book.taskId && (
                            <button
                              className="tpt-sync-btn"
                              onClick={() => {
                                onTasksChange(
                                  tasks.map((t) =>
                                    t.id === book.taskId ? { ...t, progress: rate } : t,
                                  ),
                                );
                              }}
                              title={`実施率 ${rate}% をタスクの進捗率に反映`}
                            >
                              ↑ 反映
                            </button>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="tpt-log-col">
                      <div className="tpt-log-col-inner">
                        <div className="tpt-log-scroll">
                          <table className="tpt-log-table">
                            <thead>
                              <tr>
                                <th className="tpt-log-label-col"></th>
                                {book.dailyLogs.map((log) => {
                                  const { label, isSaturday, isSunday } = getDayOfWeek(log.date);
                                  const holidayName = getHolidayName(log.date, holidays);
                                  const isRed = isSunday || !!holidayName;
                                  const [, m, d] = log.date.split("-");
                                  return (
                                    <th
                                      key={log.date}
                                      className={`tpt-log-date-col${isRed ? " tpt-log-date-col--sunday" : isSaturday ? " tpt-log-date-col--saturday" : ""}`}
                                      title={holidayName || undefined}
                                    >
                                      <div className="tpt-log-date-head">
                                        <span className="tpt-log-date-num">
                                          {Number(m)}/{Number(d)}
                                        </span>
                                        <span
                                          className={`tpt-log-weekday${isRed ? " tpt-log-weekday--sunday" : isSaturday ? " tpt-log-weekday--saturday" : ""}`}
                                        >
                                          {holidayName ? "祝" : label}
                                        </span>
                                        <button
                                          className="tpt-log-del-btn"
                                          onClick={() => deleteLogRow(book, log.date)}
                                          title="この列を削除"
                                        >
                                          ✕
                                        </button>
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              <tr>
                                <td className="tpt-log-row-label tpt-log-row-label--pass">
                                  合格数
                                </td>
                                {book.dailyLogs.map((log) => {
                                  const { isSaturday, isSunday } = getDayOfWeek(log.date);
                                  const isRed = isSunday || !!getHolidayName(log.date, holidays);
                                  return (
                                    <td
                                      key={log.date}
                                      className={
                                        isRed
                                          ? "tpt-log-cell--sunday"
                                          : isSaturday
                                            ? "tpt-log-cell--saturday"
                                            : ""
                                      }
                                    >
                                      <input
                                        type="number"
                                        className="tpt-log-input-cell tpt-log-input--pass"
                                        value={log.passCount || ""}
                                        min={0}
                                        placeholder="0"
                                        onChange={(e) =>
                                          updateLogRow(book, log.date, {
                                            passCount: parseInt(e.target.value, 10) || 0,
                                          })
                                        }
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                              <tr>
                                <td className="tpt-log-row-label tpt-log-row-label--fail">
                                  不合格数
                                </td>
                                {book.dailyLogs.map((log) => {
                                  const { isSaturday, isSunday } = getDayOfWeek(log.date);
                                  const isRed = isSunday || !!getHolidayName(log.date, holidays);
                                  return (
                                    <td
                                      key={log.date}
                                      className={
                                        isRed
                                          ? "tpt-log-cell--sunday"
                                          : isSaturday
                                            ? "tpt-log-cell--saturday"
                                            : ""
                                      }
                                    >
                                      <input
                                        type="number"
                                        className="tpt-log-input-cell tpt-log-input--fail"
                                        value={log.failCount || ""}
                                        min={0}
                                        placeholder="0"
                                        onChange={(e) =>
                                          updateLogRow(book, log.date, {
                                            failCount: parseInt(e.target.value, 10) || 0,
                                          })
                                        }
                                      />
                                    </td>
                                  );
                                })}
                              </tr>
                            </tbody>
                          </table>
                        </div>
                        <button className="tpt-log-add-row" onClick={() => addLogRow(book)}>
                          + 今日の列を追加
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
