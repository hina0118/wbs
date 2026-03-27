use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use tauri::Manager;

// ── エラーログ ────────────────────────────────────────────

/// エラー内容とスタックトレースを app_data_dir()/app.log に追記する。
fn write_error_log(app: &tauri::AppHandle, context: &str, error: &str) {
    let Ok(dir) = app.path().app_data_dir() else {
        return;
    };
    let _ = fs::create_dir_all(&dir);
    let log_path = dir.join("app.log");

    let bt = backtrace::Backtrace::new();
    let timestamp = chrono::Local::now().format("%Y-%m-%d %H:%M:%S");
    let entry = format!("[{timestamp}] ERROR {context}\n  {error}\n{bt:?}\n\n");
    if let Ok(mut f) = fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        let _ = f.write_all(entry.as_bytes());
    }
}

// ── プロキシ設定 ──────────────────────────────────────────

#[derive(Serialize, Deserialize, Default)]
struct ProxyConfig {
    url: Option<String>,
}

fn proxy_config_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("proxy.json"))
        .map_err(|e| e.to_string())
}

/// 保存済みのプロキシ URL を返す（未設定なら None）
#[tauri::command]
fn get_proxy_setting(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = proxy_config_path(&app)?;
    if !path.exists() {
        return Ok(None);
    }
    let json = fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let config: ProxyConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    Ok(config.url)
}

/// プロキシ URL を保存する（None または空文字でプロキシ無効化）
#[tauri::command]
fn save_proxy_setting(app: tauri::AppHandle, url: Option<String>) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    // 空文字は None として扱う
    let url = url.filter(|s| !s.trim().is_empty());
    let config = ProxyConfig { url };
    let json = serde_json::to_string(&config).map_err(|e| e.to_string())?;
    fs::write(dir.join("proxy.json"), json).map_err(|e| e.to_string())
}

// ── タスク保存 ────────────────────────────────────────────

/// アプリデータディレクトリの tasks.json を読む。
/// ファイルがなければ None を返す（初回起動 = デフォルトデータをフロントで使う）。
#[tauri::command]
fn load_saved_tasks(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let path = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("tasks.json");

    if path.exists() {
        fs::read_to_string(&path)
            .map(Some)
            .map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

/// タスク JSON をアプリデータディレクトリの tasks.json に保存する。
#[tauri::command]
fn save_tasks(app: tauri::AppHandle, json: String) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("tasks.json"), json).map_err(|e| e.to_string())
}

// ── 祝日取得 ──────────────────────────────────────────────

/// 内閣府が公開している祝日CSVを取得してパースする。
/// URL: https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
/// エンコーディング: Shift-JIS
/// 保存済みのプロキシ設定があれば自動適用する。
#[tauri::command]
async fn fetch_holidays(app: tauri::AppHandle) -> Result<Vec<(String, String)>, String> {
    // プロキシ設定を読み込んで reqwest クライアントを構築
    let proxy_url = get_proxy_setting(app.clone())?;
    let client = build_client(proxy_url)?;

    let url = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";

    let send_result = client
        .get(url)
        .send()
        .await
        .map_err(|e| format!("取得エラー: {e}"));
    if let Err(ref e) = send_result {
        write_error_log(&app, "fetch_holidays", e);
    }
    let bytes = send_result?.bytes().await.map_err(|e| {
        let msg = format!("読み込みエラー: {e}");
        write_error_log(&app, "fetch_holidays", &msg);
        msg
    })?;

    let (decoded, _, _) = encoding_rs::SHIFT_JIS.decode(&bytes);
    let text = decoded.into_owned();

    let mut holidays = Vec::new();
    for line in text.lines().skip(1) {
        let mut parts = line.splitn(2, ',');
        if let (Some(date), Some(name)) = (parts.next(), parts.next()) {
            let date = date.trim().to_string();
            let name = name.trim().to_string();
            if !date.is_empty() && !name.is_empty() {
                holidays.push((date, name));
            }
        }
    }

    Ok(holidays)
}

/// プロキシ URL を受け取って reqwest クライアントを構築する
fn build_client(proxy_url: Option<String>) -> Result<reqwest::Client, String> {
    let mut builder = reqwest::Client::builder()
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36");
    if let Some(url) = proxy_url {
        let proxy = reqwest::Proxy::all(&url).map_err(|e| format!("プロキシ設定エラー: {e}"))?;
        builder = builder.proxy(proxy);
    }
    builder.build().map_err(|e| e.to_string())
}

// ── Excel ファイル保存 ────────────────────────────────────

/// 名前を付けて保存ダイアログを表示し、選択されたパスに Excel バイト列を書き込む。
/// キャンセル時は Ok(None) を返す。
#[tauri::command]
async fn save_excel_file(
    app: tauri::AppHandle,
    filename: String,
    data: Vec<u8>,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    // デフォルト保存先（デスクトップ）を取得
    let default_dir = app
        .path()
        .desktop_dir()
        .or_else(|_| app.path().document_dir())
        .ok();

    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("Excel ファイル", &["xlsx"]);

    if let Some(dir) = default_dir {
        dialog = dialog.set_directory(dir);
    }

    let path = dialog.blocking_save_file();

    match path {
        None => Ok(None), // キャンセル
        Some(p) => {
            let path_str = p.to_string();
            fs::write(&path_str, &data).map_err(|e| format!("ファイルの書き込みに失敗: {e}"))?;
            Ok(Some(path_str))
        }
    }
}

// ── デスクトップ通知 ──────────────────────────────────────

/// OS ネイティブ通知を表示する（リマインダー機能で利用）
#[tauri::command]
fn show_notification(app: tauri::AppHandle, title: String, body: String) -> Result<(), String> {
    use tauri_plugin_notification::NotificationExt;
    app.notification()
        .builder()
        .title(&title)
        .body(&body)
        .show()
        .map_err(|e| e.to_string())
}

// ── エントリポイント ──────────────────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(tauri_plugin_log::Builder::new().build())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .setup(|app| {
            setup_tray(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            load_saved_tasks,
            save_tasks,
            fetch_holidays,
            get_proxy_setting,
            save_proxy_setting,
            save_excel_file,
            show_notification,
        ])
        .run(tauri::generate_context!())
        .unwrap_or_else(|e| eprintln!("Tauri アプリケーションの起動に失敗しました: {e}"));
}

// ── システムトレイ ────────────────────────────────────────

fn setup_tray(app: &mut tauri::App) -> Result<(), Box<dyn std::error::Error>> {
    use tauri::{
        menu::{Menu, MenuItem},
        tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    };

    let show_item = MenuItem::with_id(app, "show", "開く", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "終了", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let _tray = TrayIconBuilder::new()
        .icon(app.default_window_icon().ok_or("ウィンドウアイコンが設定されていません")?.clone())
        .menu(&menu)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => {
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
            "quit" => {
                app.exit(0);
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                let app = tray.app_handle();
                if let Some(window) = app.get_webview_window("main") {
                    let _ = window.show();
                    let _ = window.set_focus();
                }
            }
        })
        .build(app)?;

    // ウィンドウの × ボタンでアプリを終了せず非表示にする
    let Some(window) = app.get_webview_window("main") else {
        return Err("メインウィンドウが見つかりません".into());
    };
    let window_clone = window.clone();
    window.on_window_event(move |event| {
        if let tauri::WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = window_clone.hide();
        }
    });

    Ok(())
}
