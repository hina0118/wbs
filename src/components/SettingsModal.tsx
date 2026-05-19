/**
 * SettingsModal – アプリ全体の設定ダイアログ
 * - デフォルト子タスク設定（親タスク追加時に自動追加される子タスク名リスト）
 * - HTTP プロキシ設定
 */
import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { loadAppSettings, saveAppSettings } from "../utils/settingsStorage";

type Tab = "children" | "proxy";

interface Props {
  onClose: () => void;
  onChildTaskNamesChange: (names: string[]) => void;
}

function getErrorMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export default function SettingsModal({ onClose, onChildTaskNamesChange }: Props) {
  const [tab, setTab] = useState<Tab>("children");

  // ── 子タスクテンプレート ──
  const [childNames, setChildNames] = useState<string[]>(
    () => loadAppSettings().defaultChildTaskNames,
  );
  const [newName, setNewName] = useState("");
  const [childSaved, setChildSaved] = useState(false);
  const childTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const newNameInputRef = useRef<HTMLInputElement>(null);

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
