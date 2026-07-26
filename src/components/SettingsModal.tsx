/**
 * SettingsModal – アプリ全体の設定ダイアログ
 * - デフォルト子タスク設定（親タスク追加時に自動追加される子タスク名リスト）
 * - HTTP プロキシ設定
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings, saveAppSettings, TaskType } from "../utils/settingsStorage";
import { exportProjectTasksJson } from "../utils/projectStorage";
import { ProjectMeta } from "../types/project";

/** 保存ダイアログを表示し、選択された場所に JSON を書き出す。キャンセル時は null を返す。 */
function saveJsonFile(json: string, filenamePrefix: string): Promise<string | null> {
  const now = new Date();
  const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  return invoke<string | null>("save_json_file", {
    filename: `${filenamePrefix}_${ts}.json`,
    content: json,
  });
}

type Tab = "children" | "taskTypes" | "projects" | "proxy";

interface Props {
  onClose: () => void;
  onChildTaskNamesChange: (names: string[]) => void;
  projects: ProjectMeta[];
  onRenameProject: (id: string, name: string) => void;
  onDeleteProject: (id: string) => void;
  onImportProject: (name: string) => void | Promise<void>;
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function SettingsModal({
  onClose,
  onChildTaskNamesChange,
  projects,
  onRenameProject,
  onDeleteProject,
  onImportProject,
}: Props) {
  const [tab, setTab] = useState<Tab>("children");

  // ── プロジェクトインポート ──
  const [importProjectName, setImportProjectName] = useState("");
  const [isImporting, setIsImporting] = useState(false);

  async function handleImportClick() {
    const trimmed = importProjectName.trim();
    if (!trimmed || isImporting) return;
    setIsImporting(true);
    try {
      await onImportProject(trimmed);
      setImportProjectName("");
    } finally {
      setIsImporting(false);
    }
  }

  // ── プロジェクト管理 ──
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [editingProjectName, setEditingProjectName] = useState("");
  const [exportingProjectId, setExportingProjectId] = useState<string | null>(null);
  const [exportErrorId, setExportErrorId] = useState<string | null>(null);
  const exportErrorTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function startEditProject(p: ProjectMeta) {
    setEditingProjectId(p.id);
    setEditingProjectName(p.name);
  }

  async function handleExportProject(p: ProjectMeta) {
    if (exportingProjectId) return;
    setExportingProjectId(p.id);
    try {
      const json = await exportProjectTasksJson(p.id);
      await saveJsonFile(json, `tasks_${p.name}`);
    } catch {
      setExportErrorId(p.id);
      if (exportErrorTimerRef.current !== null) clearTimeout(exportErrorTimerRef.current);
      exportErrorTimerRef.current = setTimeout(() => {
        setExportErrorId(null);
        exportErrorTimerRef.current = null;
      }, 3000);
    } finally {
      setExportingProjectId(null);
    }
  }

  function commitEditProject() {
    const trimmed = editingProjectName.trim();
    if (editingProjectId && trimmed) {
      onRenameProject(editingProjectId, trimmed);
    }
    setEditingProjectId(null);
    setEditingProjectName("");
  }

  // ── 子タスクテンプレート ──
  const [childNames, setChildNames] = useState<string[]>(
    () => loadAppSettings().defaultChildTaskNames,
  );
  const [newName, setNewName] = useState("");
  const [childSaved, setChildSaved] = useState(false);
  const childTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);

  // ── タスク種別 ──
  const [taskTypes, setTaskTypes] = useState<TaskType[]>(() => loadAppSettings().taskTypes);
  const [newTypeName, setNewTypeName] = useState("");
  const [newTypeUnit, setNewTypeUnit] = useState("");
  const [newTypeProductivity, setNewTypeProductivity] = useState("");
  const [taskTypeSaved, setTaskTypeSaved] = useState(false);
  const taskTypeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function addTaskType() {
    const name = newTypeName.trim();
    const unit = newTypeUnit.trim();
    const productivity = parseFloat(newTypeProductivity);
    if (!name || !unit || isNaN(productivity) || productivity <= 0) return;
    const newType: TaskType = { id: crypto.randomUUID(), name, unit, productivity };
    setTaskTypes((prev) => [...prev, newType]);
    setNewTypeName("");
    setNewTypeUnit("");
    setNewTypeProductivity("");
  }

  function removeTaskType(id: string) {
    setTaskTypes((prev) => prev.filter((t) => t.id !== id));
  }

  function saveTaskTypeSettings() {
    const settings = loadAppSettings();
    saveAppSettings({ ...settings, taskTypes });
    setTaskTypeSaved(true);
    if (taskTypeTimerRef.current !== null) clearTimeout(taskTypeTimerRef.current);
    taskTypeTimerRef.current = setTimeout(() => {
      setTaskTypeSaved(false);
      taskTypeTimerRef.current = null;
    }, 1500);
  }

  // ── プロキシ設定 ──
  const [proxyUrl, setProxyUrl] = useState("");
  const [proxyStatus, setProxyStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [proxyErrMsg, setProxyErrMsg] = useState("");
  const proxyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    invoke<string | null>("get_proxy_setting")
      .then((v) => setProxyUrl(v ?? ""))
      .catch((e) => console.warn("プロキシ設定の読み込みに失敗:", e));
  }, []);

  useEffect(() => {
    return () => {
      if (childTimerRef.current !== null) clearTimeout(childTimerRef.current);
      if (proxyTimerRef.current !== null) clearTimeout(proxyTimerRef.current);
      if (taskTypeTimerRef.current !== null) clearTimeout(taskTypeTimerRef.current);
    };
  }, []);

  // ── 子タスク操作 ──

  function addChildName() {
    const trimmed = newName.trim();
    if (!trimmed || childNames.includes(trimmed)) return;
    setChildNames((prev) => [...prev, trimmed]);
    setNewName("");
    newNameInputRef.current?.focus();
  }

  function removeChildName(index: number) {
    setChildNames((prev) => prev.filter((_, i) => i !== index));
  }

  function moveUp(index: number) {
    if (index === 0) return;
    setChildNames((prev) => {
      const next = [...prev];
      [next[index - 1], next[index]] = [next[index], next[index - 1]];
      return next;
    });
  }

  function moveDown(index: number) {
    setChildNames((prev) => {
      if (index >= prev.length - 1) return prev;
      const next = [...prev];
      [next[index], next[index + 1]] = [next[index + 1], next[index]];
      return next;
    });
  }

  function saveChildSettings() {
    const settings = loadAppSettings();
    saveAppSettings({ ...settings, defaultChildTaskNames: childNames });
    onChildTaskNamesChange(childNames);
    setChildSaved(true);
    if (childTimerRef.current !== null) clearTimeout(childTimerRef.current);
    childTimerRef.current = setTimeout(() => {
      setChildSaved(false);
      childTimerRef.current = null;
    }, 1500);
  }

  // ── プロキシ操作 ──

  function scheduleProxyReset() {
    if (proxyTimerRef.current !== null) clearTimeout(proxyTimerRef.current);
    proxyTimerRef.current = setTimeout(() => {
      setProxyStatus("idle");
      proxyTimerRef.current = null;
    }, 1500);
  }

  async function handleProxySave() {
    setProxyStatus("saving");
    setProxyErrMsg("");
    try {
      await invoke("save_proxy_setting", { url: proxyUrl.trim() || null });
      setProxyStatus("saved");
      scheduleProxyReset();
    } catch (e) {
      setProxyErrMsg(getErrorMessage(e));
      setProxyStatus("error");
    }
  }

  async function handleProxyClear() {
    setProxyUrl("");
    setProxyStatus("saving");
    try {
      await invoke("save_proxy_setting", { url: null });
      setProxyStatus("saved");
      scheduleProxyReset();
    } catch (e) {
      setProxyErrMsg(getErrorMessage(e));
      setProxyStatus("error");
    }
  }

  return (
    <div className="gantt-modal-overlay" onClick={onClose}>
      <div className="gantt-modal settings-modal" onClick={(e) => e.stopPropagation()}>
        <h3>設定</h3>

        {/* タブ */}
        <div className="settings-tabs">
          <button
            className={`settings-tab-btn${tab === "children" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setTab("children")}
          >
            子タスクテンプレート
          </button>
          <button
            className={`settings-tab-btn${tab === "taskTypes" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setTab("taskTypes")}
          >
            タスク種別
          </button>
          <button
            className={`settings-tab-btn${tab === "projects" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setTab("projects")}
          >
            プロジェクト
          </button>
          <button
            className={`settings-tab-btn${tab === "proxy" ? " settings-tab-btn--active" : ""}`}
            onClick={() => setTab("proxy")}
          >
            プロキシ設定
          </button>
        </div>

        {/* ── 子タスクテンプレート タブ ── */}
        {tab === "children" && (
          <div className="settings-tab-content">
            <p className="settings-desc">
              親タスク（単発以外）を追加したとき、以下の名前の子タスクを自動で追加します。
              <br />
              色は親タスクと同じになります。不要な場合はリストを空にしてください。
            </p>

            {/* 追加フォーム */}
            <div className="settings-child-add-row">
              <input
                ref={newNameInputRef}
                type="text"
                className="assignee-input settings-child-input"
                placeholder="子タスク名を入力"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addChildName();
                }}
              />
              <button
                className="settings-child-add-btn"
                onClick={addChildName}
                disabled={!newName.trim()}
              >
                追加
              </button>
            </div>

            {/* リスト */}
            {childNames.length === 0 ? (
              <p className="settings-child-empty">テンプレートなし（自動追加しない）</p>
            ) : (
              <ul className="settings-child-list">
                {childNames.map((name, i) => (
                  <li key={i} className="settings-child-item">
                    <span className="settings-child-name">{name}</span>
                    <div className="settings-child-actions">
                      <button
                        className="settings-child-move-btn"
                        onClick={() => moveUp(i)}
                        disabled={i === 0}
                        title="上へ"
                      >
                        ▲
                      </button>
                      <button
                        className="settings-child-move-btn"
                        onClick={() => moveDown(i)}
                        disabled={i === childNames.length - 1}
                        title="下へ"
                      >
                        ▼
                      </button>
                      <button
                        className="settings-child-remove-btn"
                        onClick={() => removeChildName(i)}
                        title="削除"
                      >
                        ✕
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {childSaved && <p className="proxy-modal-ok">✓ 保存しました</p>}

            <div className="gantt-modal-actions">
              <button className="btn-cancel" onClick={onClose}>
                キャンセル
              </button>
              <button className="btn-save" onClick={saveChildSettings}>
                保存
              </button>
            </div>
          </div>
        )}

        {/* ── タスク種別 タブ ── */}
        {tab === "taskTypes" && (
          <div className="settings-tab-content">
            <p className="settings-desc">
              タスク種別と生産性（単位/月）を定義します。タスク編集時に種別と実装数を入力すると人月を自動計算します。
            </p>

            {/* 追加フォーム */}
            <div className="task-type-add-row">
              <input
                type="text"
                className="assignee-input task-type-input"
                placeholder="種別名（例: 画面開発）"
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
              />
              <input
                type="text"
                className="assignee-input task-type-input"
                placeholder="単位（例: 画面）"
                value={newTypeUnit}
                onChange={(e) => setNewTypeUnit(e.target.value)}
              />
              <input
                type="number"
                className="assignee-input task-type-input task-type-productivity-input"
                placeholder="生産性（単位/月）"
                value={newTypeProductivity}
                min={0.01}
                step={0.1}
                onChange={(e) => setNewTypeProductivity(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addTaskType();
                }}
              />
              <button
                className="settings-child-add-btn"
                onClick={addTaskType}
                disabled={!newTypeName.trim() || !newTypeUnit.trim() || !newTypeProductivity}
              >
                追加
              </button>
            </div>

            {/* リスト */}
            {taskTypes.length === 0 ? (
              <p className="settings-child-empty">タスク種別が未登録です</p>
            ) : (
              <table className="task-type-table">
                <thead>
                  <tr>
                    <th>種別名</th>
                    <th>単位</th>
                    <th>生産性（単位/月）</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {taskTypes.map((t) => (
                    <tr key={t.id}>
                      <td>{t.name}</td>
                      <td>{t.unit}</td>
                      <td>{t.productivity}</td>
                      <td>
                        <button
                          className="settings-child-remove-btn"
                          onClick={() => removeTaskType(t.id)}
                          title="削除"
                        >
                          ✕
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}

            {taskTypeSaved && <p className="proxy-modal-ok">✓ 保存しました</p>}

            <div className="gantt-modal-actions">
              <button className="btn-cancel" onClick={onClose}>
                キャンセル
              </button>
              <button className="btn-save" onClick={saveTaskTypeSettings}>
                保存
              </button>
            </div>
          </div>
        )}

        {/* ── プロジェクト タブ ── */}
        {tab === "projects" && (
          <div className="settings-tab-content">
            <p className="settings-desc">
              タスクデータをプロジェクト単位で分けて管理します。1ファイルの肥大化を防ぐため、
              用途ごとにプロジェクトを分けることをお勧めします。
            </p>

            <ul className="settings-child-list">
              {projects.map((p) => (
                <li key={p.id} className="settings-child-item">
                  {editingProjectId === p.id ? (
                    <input
                      autoFocus
                      type="text"
                      className="assignee-input settings-child-input"
                      value={editingProjectName}
                      onChange={(e) => setEditingProjectName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitEditProject();
                        if (e.key === "Escape") {
                          setEditingProjectId(null);
                          setEditingProjectName("");
                        }
                      }}
                      onBlur={commitEditProject}
                    />
                  ) : (
                    <span className="settings-child-name">{p.name}</span>
                  )}
                  <div className="settings-child-actions">
                    <button
                      className="settings-child-move-btn"
                      onClick={() => void handleExportProject(p)}
                      disabled={exportingProjectId === p.id}
                      title={
                        exportErrorId === p.id
                          ? "ダウンロードに失敗しました"
                          : "tasks.json をダウンロード（メンバーへの共有用）"
                      }
                    >
                      {exportErrorId === p.id ? "⚠" : "⬇"}
                    </button>
                    <button
                      className="settings-child-move-btn"
                      onClick={() => startEditProject(p)}
                      title="名前を変更"
                    >
                      ✎
                    </button>
                    <button
                      className="settings-child-remove-btn"
                      onClick={() => onDeleteProject(p.id)}
                      disabled={projects.length <= 1}
                      title={projects.length <= 1 ? "最後のプロジェクトは削除できません" : "削除"}
                    >
                      ✕
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <hr className="settings-divider" />

            <p className="settings-desc">
              他のメンバーから受け取った tasks.json を、新規プロジェクトとしてインポートします。
              <br />
              既存のプロジェクトのデータは変更されません。
            </p>
            <label className="modal-label">プロジェクト名</label>
            <input
              type="text"
              className="assignee-input"
              value={importProjectName}
              onChange={(e) => setImportProjectName(e.target.value)}
              placeholder="例: 田中さんのタスク"
              onKeyDown={(e) => {
                if (e.key === "Enter") void handleImportClick();
              }}
            />
            <div className="gantt-modal-actions">
              <button className="btn-cancel" onClick={onClose}>
                閉じる
              </button>
              <button
                className="btn-save"
                onClick={() => void handleImportClick()}
                disabled={!importProjectName.trim() || isImporting}
                title={!importProjectName.trim() ? "プロジェクト名を入力してください" : undefined}
              >
                {isImporting ? "インポート中…" : "ファイルを選択してインポート"}
              </button>
            </div>
          </div>
        )}

        {/* ── プロキシ設定 タブ ── */}
        {tab === "proxy" && (
          <div className="settings-tab-content">
            <p className="proxy-modal-desc">
              祝日データ取得時に使用するプロキシを設定します。
              <br />
              空欄にすると直接接続（プロキシなし）になります。
            </p>

            <label className="modal-label">プロキシ URL</label>
            <input
              type="text"
              className="assignee-input"
              value={proxyUrl}
              onChange={(e) => setProxyUrl(e.target.value)}
              placeholder="例: http://proxy.example.com:8080"
              onKeyDown={(e) => {
                if (e.key === "Enter") handleProxySave();
              }}
              autoFocus
            />
            <p className="proxy-modal-hint">
              認証が必要な場合: <code>http://user:pass@proxy.example.com:8080</code>
            </p>

            {proxyStatus === "error" && <p className="proxy-modal-error">{proxyErrMsg}</p>}
            {proxyStatus === "saved" && <p className="proxy-modal-ok">✓ 保存しました</p>}

            <div className="gantt-modal-actions">
              <button className="btn-cancel" onClick={handleProxyClear}>
                プロキシを無効化
              </button>
              <button className="btn-cancel" onClick={onClose}>
                キャンセル
              </button>
              <button
                className="btn-save"
                onClick={handleProxySave}
                disabled={proxyStatus === "saving"}
              >
                {proxyStatus === "saving" ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
