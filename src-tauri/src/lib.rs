/// 内閣府が公開している祝日CSVを取得してパースする。
/// URL: https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv
/// エンコーディング: Shift-JIS
/// フォーマット: "YYYY/M/D,祝日名" (1行目はヘッダ)
#[tauri::command]
async fn fetch_holidays() -> Result<Vec<(String, String)>, String> {
    let url = "https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv";

    let bytes = reqwest::get(url)
        .await
        .map_err(|e| format!("取得エラー: {e}"))?
        .bytes()
        .await
        .map_err(|e| format!("読み込みエラー: {e}"))?;

    // Shift-JIS → UTF-8
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
        .invoke_handler(tauri::generate_handler![fetch_holidays])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
