/**
 * UpdateNotifier
 * 起動から数秒後に GitHub Releases を確認し、新バージョンがあれば
 * ヘッダー直下にバナーを表示する。
 * ダウンロード・インストール完了後にアプリを再起動する。
 */
import { useState, useEffect } from "react";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch }        from "@tauri-apps/plugin-process";

type Phase = "idle" | "downloading" | "done" | "error";

export default function UpdateNotifier() {
  const [update,    setUpdate]    = useState<Update | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [phase,     setPhase]     = useState<Phase>("idle");
  const [progress,  setProgress]  = useState(0);
  const [errMsg,    setErrMsg]    = useState("");

  // 起動 3 秒後にアップデートチェック（サイレントフェール）
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const u = await check();
        if (u) setUpdate(u);
      } catch {
        // ネットワーク未接続・設定未完了時は無視
      }
    }, 3000);
    return () => clearTimeout(timer);
  }, []);

  if (!update || dismissed) return null;

  async function handleInstall() {
    if (!update) return;
    setPhase("downloading");
    setProgress(0);
    setErrMsg("");

    try {
      let downloaded = 0;
      let total      = 0;

      await update.downloadAndInstall((event) => {
        switch (event.event) {
          case "Started":
            total = event.data.contentLength ?? 0;
            break;
          case "Progress":
            downloaded += event.data.chunkLength;
            if (total > 0) setProgress(Math.round((downloaded / total) * 100));
            break;
          case "Finished":
            setProgress(100);
            setPhase("done");
            break;
        }
      });

      await relaunch();
    } catch (e) {
      setErrMsg(String(e));
      setPhase("error");
    }
  }

  return (
    <div className="update-banner">
      <span className="update-banner-icon">🔄</span>

      <span className="update-banner-text">
        新しいバージョン <strong>v{update.version}</strong> が利用可能です
        {update.body && (
          <span className="update-banner-notes"> — {update.body}</span>
        )}
      </span>

      {phase === "idle" && (
        <div className="update-banner-actions">
          <button className="update-btn-install" onClick={handleInstall}>
            今すぐ更新
          </button>
          <button className="update-btn-dismiss" onClick={() => setDismissed(true)}>
            後で
          </button>
        </div>
      )}

      {phase === "downloading" && (
        <div className="update-banner-progress">
          <span className="update-progress-label">
            {progress > 0 ? `ダウンロード中 ${progress}%` : "準備中..."}
          </span>
          {progress > 0 && (
            <div className="update-progress-bar">
              <div
                className="update-progress-fill"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}
        </div>
      )}

      {phase === "done" && (
        <span className="update-banner-done">インストール完了 — 再起動中...</span>
      )}

      {phase === "error" && (
        <span className="update-banner-error">
          エラー: {errMsg}
          <button className="update-btn-dismiss" onClick={() => setDismissed(true)}>
            閉じる
          </button>
        </span>
      )}
    </div>
  );
}
