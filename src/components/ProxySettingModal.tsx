/**
 * ProxySettingModal – HTTP プロキシ設定ダイアログ
 * 設定は Tauri バックエンドの proxy.json に保存される
 */
import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface Props {
  onClose: () => void;
}

export default function ProxySettingModal({ onClose }: Props) {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [errMsg, setErrMsg] = useState("");

  // 保存済みプロキシ URL を読み込む
  useEffect(() => {
    invoke<string | null>("get_proxy_setting")
      .then((v) => setUrl(v ?? ""))
      .catch(() => {});
  }, []);

  async function handleSave() {
    setStatus("saving");
    setErrMsg("");
    try {
      await invoke("save_proxy_setting", { url: url.trim() || null });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e) {
      setErrMsg(String(e));
      setStatus("error");
    }
  }

  async function handleClear() {
    setUrl("");
    setStatus("saving");
    try {
      await invoke("save_proxy_setting", { url: null });
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch (e) {
      setErrMsg(String(e));
      setStatus("error");
    }
  }

  return (
    <div className="gantt-modal-overlay" onClick={onClose}>
      <div className="gantt-modal proxy-modal" onClick={(e) => e.stopPropagation()}>
        <h3>HTTP プロキシ設定</h3>
        <p className="proxy-modal-desc">
          祝日データ取得時に使用するプロキシを設定します。
          <br />
          空欄にすると直接接続（プロキシなし）になります。
        </p>

        <label className="modal-label">プロキシ URL</label>
        <input
          type="text"
          className="assignee-input"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="例: http://proxy.example.com:8080"
          onKeyDown={(e) => {
            if (e.key === "Enter") handleSave();
          }}
          autoFocus
        />
        <p className="proxy-modal-hint">
          認証が必要な場合: <code>http://user:pass@proxy.example.com:8080</code>
        </p>

        {status === "error" && <p className="proxy-modal-error">{errMsg}</p>}
        {status === "saved" && <p className="proxy-modal-ok">✓ 保存しました</p>}

        <div className="gantt-modal-actions">
          <button className="btn-cancel" onClick={handleClear}>
            プロキシを無効化
          </button>
          <button className="btn-cancel" onClick={onClose}>
            キャンセル
          </button>
          <button className="btn-save" onClick={handleSave} disabled={status === "saving"}>
            {status === "saving" ? "保存中…" : "保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
