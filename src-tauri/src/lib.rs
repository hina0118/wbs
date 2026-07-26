use log::{debug, info, trace, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write;
use std::sync::Mutex;
use tauri::Manager;

// ── アプリ状態（メモリ上のタスクデータ）────────────────────

/// タスクデータをメモリに保持する。
/// フロントエンドへは memo フィールドを除いたサマリーを渡し、
/// 必要時に個別取得することで初期読み込みの JSON サイズを削減する。
struct AppState {
    tasks: Mutex<Vec<serde_json::Value>>,
    current_project_id: Mutex<Option<String>>,
}

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

// ── プロジェクト管理 ──────────────────────────────────────
//
// タスクデータを「プロジェクト」単位（app_data_dir/projects/<id>/tasks.json 他）に
// 分割し、1ファイルの肥大化を防ぐ。旧形式（app_data_dir/tasks.json 直下）で
// 運用していたユーザーは初回起動時に自動で「メインプロジェクト」へ移行する。

#[derive(Serialize, Deserialize, Clone)]
struct ProjectMeta {
    id: String,
    name: String,
    #[serde(rename = "createdAt")]
    created_at: String,
    #[serde(rename = "updatedAt")]
    updated_at: String,
}

#[derive(Serialize, Deserialize, Clone)]
struct ProjectsManifest {
    projects: Vec<ProjectMeta>,
    #[serde(rename = "activeProjectId")]
    active_project_id: String,
}

fn manifest_path(app: &tauri::AppHandle) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("projects.json"))
        .map_err(|e| e.to_string())
}

fn project_dir(app: &tauri::AppHandle, id: &str) -> Result<std::path::PathBuf, String> {
    app.path()
        .app_data_dir()
        .map(|d| d.join("projects").join(id))
        .map_err(|e| e.to_string())
}

fn write_manifest(app: &tauri::AppHandle, manifest: &ProjectsManifest) -> Result<(), String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let json = serde_json::to_string_pretty(manifest).map_err(|e| e.to_string())?;
    fs::write(manifest_path(app)?, json).map_err(|e| e.to_string())
}

/// projects.json が無ければ、旧形式の app_data_dir/tasks.json・testBooks.json を
/// 「メインプロジェクト」(id: "default") へ移行してから返す。冪等。
fn ensure_migrated(app: &tauri::AppHandle) -> Result<ProjectsManifest, String> {
    let manifest_file = manifest_path(app)?;
    if manifest_file.exists() {
        let json = fs::read_to_string(&manifest_file).map_err(|e| e.to_string())?;
        return serde_json::from_str(&json).map_err(|e| e.to_string());
    }

    let app_data_dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    let default_id = "default".to_string();
    let dir = project_dir(app, &default_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;

    let legacy_tasks = app_data_dir.join("tasks.json");
    if legacy_tasks.exists() {
        fs::rename(&legacy_tasks, dir.join("tasks.json")).map_err(|e| e.to_string())?;
    }
    let legacy_test_books = app_data_dir.join("testBooks.json");
    if legacy_test_books.exists() {
        fs::rename(&legacy_test_books, dir.join("testBooks.json")).map_err(|e| e.to_string())?;
    }

    let now = chrono::Local::now().to_rfc3339();
    let manifest = ProjectsManifest {
        projects: vec![ProjectMeta {
            id: default_id.clone(),
            name: "メインプロジェクト".to_string(),
            created_at: now.clone(),
            updated_at: now,
        }],
        active_project_id: default_id,
    };
    write_manifest(app, &manifest)?;
    Ok(manifest)
}

/// プロジェクト一覧とアクティブIDを返す（未移行なら移行してから返す）。
#[tauri::command]
fn list_projects(app: tauri::AppHandle) -> Result<ProjectsManifest, String> {
    ensure_migrated(&app)
}

/// 新規プロジェクトを作成する。id はフロントエンドが生成して渡す。
#[tauri::command]
fn create_project(
    app: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<ProjectsManifest, String> {
    let mut manifest = ensure_migrated(&app)?;
    if manifest.projects.iter().any(|p| p.id == id) {
        return Err("同じIDのプロジェクトが既に存在します".to_string());
    }
    fs::create_dir_all(project_dir(&app, &id)?).map_err(|e| e.to_string())?;
    let now = chrono::Local::now().to_rfc3339();
    manifest.projects.push(ProjectMeta {
        id,
        name,
        created_at: now.clone(),
        updated_at: now,
    });
    write_manifest(&app, &manifest)?;
    Ok(manifest)
}

/// プロジェクト名を変更する。
#[tauri::command]
fn rename_project(
    app: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<ProjectsManifest, String> {
    let mut manifest = ensure_migrated(&app)?;
    let project = manifest
        .projects
        .iter_mut()
        .find(|p| p.id == id)
        .ok_or_else(|| "プロジェクトが見つかりません".to_string())?;
    project.name = name;
    project.updated_at = chrono::Local::now().to_rfc3339();
    write_manifest(&app, &manifest)?;
    Ok(manifest)
}

/// プロジェクトを削除する。最後の1件は削除できない。
/// アクティブなプロジェクトを削除する場合は、残りの先頭プロジェクトへ切り替える。
#[tauri::command]
fn delete_project(app: tauri::AppHandle, id: String) -> Result<ProjectsManifest, String> {
    let mut manifest = ensure_migrated(&app)?;
    if manifest.projects.len() <= 1 {
        return Err("最後のプロジェクトは削除できません".to_string());
    }
    if !manifest.projects.iter().any(|p| p.id == id) {
        return Err("プロジェクトが見つかりません".to_string());
    }
    manifest.projects.retain(|p| p.id != id);
    if manifest.active_project_id == id {
        manifest.active_project_id = manifest.projects[0].id.clone();
    }
    write_manifest(&app, &manifest)?;

    if let Ok(dir) = project_dir(&app, &id) {
        let _ = fs::remove_dir_all(dir);
    }
    Ok(manifest)
}

/// アクティブなプロジェクトを切り替える。
#[tauri::command]
fn set_active_project(app: tauri::AppHandle, id: String) -> Result<(), String> {
    let mut manifest = ensure_migrated(&app)?;
    if !manifest.projects.iter().any(|p| p.id == id) {
        return Err("プロジェクトが見つかりません".to_string());
    }
    manifest.active_project_id = id;
    write_manifest(&app, &manifest)
}

/// 指定したプロジェクトの tasks.json をディスクから直接読み込んで返す（エクスポート用）。
/// AppState に依存しないため、非アクティブなプロジェクトでも取得できる。
#[tauri::command]
fn export_project_tasks(
    app: tauri::AppHandle,
    project_id: String,
) -> Result<tauri::ipc::Response, String> {
    let path = project_dir(&app, &project_id)?.join("tasks.json");
    if !path.exists() {
        return Ok(tauri::ipc::Response::new(b"[]".to_vec()));
    }
    let bytes = fs::read(&path).map_err(|e| e.to_string())?;
    Ok(tauri::ipc::Response::new(bytes))
}

/// 他メンバーからエクスポートされた tasks.json をファイル選択ダイアログで選ばせ、
/// その内容で新規プロジェクトを作成する（既存プロジェクトには影響しない）。
/// ダイアログでキャンセルした場合は Ok(None) を返す。
#[tauri::command]
async fn import_project(
    app: tauri::AppHandle,
    id: String,
    name: String,
) -> Result<Option<ProjectsManifest>, String> {
    use tauri_plugin_dialog::DialogExt;

    let path = app
        .dialog()
        .file()
        .add_filter("JSON ファイル", &["json"])
        .blocking_pick_file();

    let Some(path) = path else {
        return Ok(None); // キャンセル
    };

    let path_str = path.to_string();
    let content =
        fs::read_to_string(&path_str).map_err(|e| format!("ファイルの読み込みに失敗しました: {e}"))?;

    let tasks: Vec<serde_json::Value> = serde_json::from_str(&content).map_err(|_| {
        "tasks.json の形式が正しくありません（タスク配列の JSON である必要があります）".to_string()
    })?;
    let valid = tasks.iter().all(|t| {
        t.get("id").and_then(|v| v.as_str()).is_some()
            && t.get("name").and_then(|v| v.as_str()).is_some()
    });
    if !valid {
        return Err(
            "tasks.json の形式が正しくありません（id・name を持つタスクの配列である必要があります）"
                .to_string(),
        );
    }

    let mut manifest = ensure_migrated(&app)?;
    if manifest.projects.iter().any(|p| p.id == id) {
        return Err("同じIDのプロジェクトが既に存在します".to_string());
    }

    let dir = project_dir(&app, &id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let out = serde_json::to_string(&tasks).map_err(|e| e.to_string())?;
    fs::write(dir.join("tasks.json"), out).map_err(|e| e.to_string())?;

    let now = chrono::Local::now().to_rfc3339();
    manifest.projects.push(ProjectMeta {
        id,
        name,
        created_at: now.clone(),
        updated_at: now,
    });
    write_manifest(&app, &manifest)?;
    Ok(Some(manifest))
}

// ── タスク保存 ────────────────────────────────────────────

/// タスクを読み込み、memo フィールドを除いたサマリーを返す。
/// 読み込んだフルデータは AppState に保持し、get_task_memo で個別取得できる。
/// tauri::ipc::Response で HTTP ボディ経由送信することで WebView2 IPC の 64KB 制限を回避。
#[tauri::command]
fn load_tasks_without_memo(
    app: tauri::AppHandle,
    project_id: String,
    state: tauri::State<'_, AppState>,
) -> Result<tauri::ipc::Response, String> {
    info!("[load_tasks_without_memo] 開始 (project_id: {project_id})");

    let path = project_dir(&app, &project_id)?.join("tasks.json");
    trace!("[load_tasks_without_memo] ファイルパス: {:?}", path);

    *state.current_project_id.lock().unwrap() = Some(project_id.clone());

    if !path.exists() {
        info!("[load_tasks_without_memo] ファイルなし → 空レスポンスを返す");
        *state.tasks.lock().unwrap() = Vec::new();
        return Ok(tauri::ipc::Response::new(Vec::<u8>::new()));
    }

    trace!("[load_tasks_without_memo] fs::read 開始");
    let bytes = fs::read(&path).map_err(|e| {
        warn!("[load_tasks_without_memo] fs::read 失敗: {e}");
        e.to_string()
    })?;
    info!(
        "[load_tasks_without_memo] fs::read 完了 ({} bytes / {:.1} KB)",
        bytes.len(),
        bytes.len() as f64 / 1024.0
    );

    trace!("[load_tasks_without_memo] JSON パース開始");
    let tasks: Vec<serde_json::Value> = serde_json::from_slice(&bytes).map_err(|e| {
        warn!("[load_tasks_without_memo] JSON パース失敗: {e}");
        e.to_string()
    })?;
    info!(
        "[load_tasks_without_memo] JSON パース完了 (タスク数: {})",
        tasks.len()
    );

    trace!("[load_tasks_without_memo] AppState へ格納開始");
    *state.tasks.lock().unwrap() = tasks.clone();
    debug!("[load_tasks_without_memo] AppState 格納完了");

    trace!("[load_tasks_without_memo] サマリー生成開始 (memo 除去 + hasMemo フラグ付与)");
    let summary: Vec<serde_json::Value> = tasks
        .into_iter()
        .map(|mut t| {
            let has_memo = t
                .get("memo")
                .and_then(|m| m.as_str())
                .is_some_and(|s| !s.trim().is_empty());
            if let Some(obj) = t.as_object_mut() {
                obj.remove("memo");
                if has_memo {
                    obj.insert("hasMemo".to_string(), serde_json::Value::Bool(true));
                }
            }
            t
        })
        .collect();
    debug!(
        "[load_tasks_without_memo] サマリー生成完了 (hasMemo あり: {})",
        summary.iter().filter(|t| t.get("hasMemo").is_some()).count()
    );

    trace!("[load_tasks_without_memo] JSON シリアライズ開始");
    let json_bytes = serde_json::to_vec(&summary).map_err(|e| e.to_string())?;
    info!(
        "[load_tasks_without_memo] 完了 → レスポンス送信 ({} bytes / {:.1} KB)",
        json_bytes.len(),
        json_bytes.len() as f64 / 1024.0
    );

    Ok(tauri::ipc::Response::new(json_bytes))
}

/// 特定タスクの memo を AppState から返す。
#[tauri::command]
fn get_task_memo(id: String, state: tauri::State<'_, AppState>) -> Option<String> {
    let tasks = state.tasks.lock().unwrap();
    tasks
        .iter()
        .find(|t| t["id"].as_str() == Some(&id))
        .and_then(|t| t["memo"].as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// 特定タスクの memo を更新し、ファイルに保存する。
#[tauri::command]
fn save_task_memo(
    app: tauri::AppHandle,
    id: String,
    memo: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    {
        let mut tasks = state.tasks.lock().unwrap();
        if let Some(task) = tasks.iter_mut().find(|t| t["id"].as_str() == Some(&id)) {
            if memo.is_empty() {
                task.as_object_mut().map(|o| o.remove("memo"));
            } else {
                task["memo"] = serde_json::Value::String(memo);
            }
        }
    }

    let json = {
        let tasks = state.tasks.lock().unwrap();
        serde_json::to_string(&*tasks).map_err(|e| e.to_string())?
    };

    let project_id = state
        .current_project_id
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "プロジェクトが読み込まれていません".to_string())?;
    let dir = project_dir(&app, &project_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("tasks.json"), json).map_err(|e| e.to_string())
}

/// タスク一覧（memo なし）を受け取り、AppState の memo をマージしてファイルに保存する。
#[tauri::command]
fn save_tasks(
    app: tauri::AppHandle,
    json: String,
    state: tauri::State<'_, AppState>,
) -> Result<(), String> {
    trace!("[save_tasks] 開始 (受信 JSON {} bytes)", json.len());
    let mut new_tasks: Vec<serde_json::Value> =
        serde_json::from_str(&json).map_err(|e| e.to_string())?;
    debug!("[save_tasks] パース完了 (タスク数: {})", new_tasks.len());

    // AppState から memo をコピーし、hasMemo（フロントエンド専用フラグ）を除去
    {
        let stored = state.tasks.lock().unwrap();
        for task in &mut new_tasks {
            let id = task["id"].as_str().unwrap_or("").to_string();
            if let Some(st) = stored.iter().find(|t| t["id"].as_str() == Some(&id)) {
                if let Some(memo) = st.get("memo").and_then(|m| m.as_str()) {
                    if !memo.is_empty() {
                        task["memo"] = serde_json::Value::String(memo.to_string());
                    }
                }
            }
            // hasMemo はフロントエンド専用フラグなので保存しない
            task.as_object_mut().map(|o| o.remove("hasMemo"));
        }
    }

    // AppState を更新
    *state.tasks.lock().unwrap() = new_tasks.clone();

    let out = serde_json::to_string(&new_tasks).map_err(|e| e.to_string())?;
    let project_id = state
        .current_project_id
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| "プロジェクトが読み込まれていません".to_string())?;
    let dir = project_dir(&app, &project_id)?;
    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("tasks.json"), out).map_err(|e| e.to_string())
}

// ── テストブック保存 ──────────────────────────────────────

/// プロジェクトディレクトリの testBooks.json を読む。
#[tauri::command]
fn load_test_books(app: tauri::AppHandle, project_id: String) -> Result<Option<String>, String> {
    let path = project_dir(&app, &project_id)?.join("testBooks.json");

    if path.exists() {
        fs::read_to_string(&path)
            .map(Some)
            .map_err(|e| e.to_string())
    } else {
        Ok(None)
    }
}

/// テストブック JSON をプロジェクトディレクトリの testBooks.json に保存する。
#[tauri::command]
fn save_test_books(app: tauri::AppHandle, project_id: String, json: String) -> Result<(), String> {
    let dir = project_dir(&app, &project_id)?;

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("testBooks.json"), json).map_err(|e| e.to_string())
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
        .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
        .timeout(std::time::Duration::from_secs(15))
        .connect_timeout(std::time::Duration::from_secs(10));
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

// ── JSON ファイル保存 ─────────────────────────────────────

/// 名前を付けて保存ダイアログを表示し、選択されたパスに JSON テキストを書き込む。
/// tasks.json のエクスポート（プロジェクト個別ダウンロード等）に使う。
/// キャンセル時は Ok(None) を返す。
#[tauri::command]
async fn save_json_file(
    app: tauri::AppHandle,
    filename: String,
    content: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;

    let default_dir = app
        .path()
        .desktop_dir()
        .or_else(|_| app.path().document_dir())
        .ok();

    let mut dialog = app
        .dialog()
        .file()
        .set_file_name(&filename)
        .add_filter("JSON ファイル", &["json"]);

    if let Some(dir) = default_dir {
        dialog = dialog.set_directory(dir);
    }

    let path = dialog.blocking_save_file();

    match path {
        None => Ok(None), // キャンセル
        Some(p) => {
            let path_str = p.to_string();
            fs::write(&path_str, &content).map_err(|e| format!("ファイルの書き込みに失敗: {e}"))?;
            Ok(Some(path_str))
        }
    }
}

// ── DevTools ──────────────────────────────────────────────

#[tauri::command]
fn open_devtools(app: tauri::AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        window.open_devtools();
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
        .manage(AppState {
            tasks: Mutex::new(Vec::new()),
            current_project_id: Mutex::new(None),
        })
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .level(log::LevelFilter::Trace)
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::LogDir {
                        file_name: Some("wbs".to_string()),
                    },
                ))
                .target(tauri_plugin_log::Target::new(
                    tauri_plugin_log::TargetKind::Stderr,
                ))
                .build(),
        )
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
            open_devtools,
            list_projects,
            create_project,
            rename_project,
            delete_project,
            set_active_project,
            import_project,
            export_project_tasks,
            load_tasks_without_memo,
            get_task_memo,
            save_task_memo,
            save_tasks,
            load_test_books,
            save_test_books,
            fetch_holidays,
            get_proxy_setting,
            save_proxy_setting,
            save_excel_file,
            save_json_file,
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
        .icon(
            app.default_window_icon()
                .ok_or("ウィンドウアイコンが設定されていません")?
                .clone(),
        )
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
