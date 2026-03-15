use std::fs;
use tauri::Manager;

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
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?;

    fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    fs::write(dir.join("tasks.json"), json).map_err(|e| e.to_string())
}

/// 内閣府が公開している祝日CSVを取得してパースする。
/// URL: https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
/// エンコーディング: Shift-JIS
#[tauri::command]
async fn fetch_holidays() -> Result<Vec<(String, String)>, String> {
    let url = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";

    let bytes = reqwest::get(url)
        .await
        .map_err(|e| format!("取得エラー: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("読み込みエラー: {e}"))?;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            load_saved_tasks,
            save_tasks,
            fetch_holidays
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
