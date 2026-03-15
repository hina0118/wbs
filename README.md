# WBS 進捗管理

Tauri 2 + React 18 + TypeScript で構築したデスクトップ向け WBS（Work Breakdown Structure）進捗管理アプリ。

---

## 主な機能

### ガントチャート
- 階層構造のタスクをガントバーで表示
- バーのドラッグ＆ドロップで日程変更
- 親タスクの日程は子タスクの範囲に自動追従
- 親タスクの進捗は子タスクの平均を自動計算（読み取り専用）
- タスクの追加（ルート・サブタスク）／削除
- バーホバーで Markdown 対応ツールチップを表示
- 行の折りたたみ（子タスクの表示/非表示）

### カンバンボード
- リーフタスクを「未着手 / 進行中 / 完了」の 3 列に分類
- カードのドラッグ＆ドロップで列間移動（進捗を自動更新）
- 各列からタスクを追加
- Markdown メモをカード内で展開／折りたたみ

### タスク横断検索
- ヘッダーの検索ボックス（`Ctrl+F` でフォーカス、`ESC` でクリア）
- タスク名・担当者・メモを横断検索（大文字小文字無視）
- 検索結果をリスト形式で全幅表示
  - タスクカラー・階層パス・進捗バー・担当者・日程を一覧表示
  - メモにマッチしたタスクは「📝 メモに一致」バッジを表示し、メモを自動展開
  - メモは「▼ メモを見る / ▲ 閉じる」で手動トグルも可能
  - タスク名・担当者マッチ箇所をハイライト（黄色）

### プロキシ設定
- ヘッダー右端の `⚙` ボタンから設定ダイアログを開く
- プロキシ URL を入力して保存すると、祝日データ取得時に適用される
- 「プロキシを無効化」ボタンで直接接続に戻す
- 設定は `%APPDATA%\com.wbs.app\proxy.json` に保存される

### タスク編集モーダル
- タスク名・開始日・終了日・担当者の編集
- リーフタスク：進捗スライダー（0〜100%）
- 親タスク：子タスクから集計した進捗バー（読み取り専用）
- Markdown メモの編集（編集 / プレビュータブ切り替え）
- タスク削除（2 ステップ確認）

---

## 技術スタック

| レイヤー | 技術 |
|---------|------|
| デスクトップ | Tauri 2 (Rust + WebView) |
| UI フレームワーク | React 18 + TypeScript |
| ビルドツール | Vite 5 |
| Markdown | react-markdown + remark-gfm (GFM 対応) |

---

## プロジェクト構成

```
src/
├── App.tsx                  # ルートコンポーネント・ビュー切り替え
├── types/
│   └── task.ts              # Task インターフェース定義
├── utils/
│   ├── taskUtils.ts         # 共有ヘルパー（進捗計算・日程伝播など）
│   ├── taskStorage.ts       # Tauri invoke 経由の永続化（tasks.json）
│   └── holidays.ts          # 祝日データロード
├── components/
│   ├── GanttChart.tsx       # ガントチャートビュー
│   ├── GanttTooltip.tsx     # ガントバーホバーツールチップ
│   ├── KanbanBoard.tsx      # カンバンボードビュー
│   ├── SearchView.tsx       # タスク横断検索ビュー（リスト表示）
│   ├── TaskEditModal.tsx    # タスク編集モーダル（共通）
│   ├── MemoField.tsx        # メモ入力（編集/プレビュータブ）
│   ├── MemoView.tsx         # Markdown レンダリング表示
│   ├── MemoWithToggle.tsx   # メモの展開/折りたたみトグル
│   └── ProxySettingModal.tsx # HTTP プロキシ設定ダイアログ
└── styles.css               # 全スタイル
```

---

## データモデル

```typescript
interface Task {
  id:         string;
  name:       string;
  startDate:  Date;
  endDate:    Date;
  progress:   number;    // 0〜100（リーフのみ手動設定、親は自動計算）
  color?:     string;    // カラーコード（例: "#4A90D9"）
  parentId?:  string;    // 親タスクの id（ルートは undefined）
  collapsed?: boolean;   // ガントチャートでの折りたたみ状態
  assignee?:  string;    // 担当者名
  memo?:      string;    // Markdown 形式のメモ
}
```

---

## データ永続化

| ファイル | 保存先（Windows） | 内容 |
|---------|-----------------|------|
| `tasks.json` | `%APPDATA%\com.wbs.app\tasks.json` | タスクデータ（変更時に自動保存） |
| `proxy.json` | `%APPDATA%\com.wbs.app\proxy.json` | プロキシ設定 |

初回起動時（`tasks.json` が存在しない場合）は `public/data/sampleTasks.json` のサンプルデータを使用。

---

## HTTP 通信とプロキシ

アプリが行う外部 HTTP 通信は**祝日データの取得のみ**です。

| 項目 | 内容 |
|------|------|
| 取得先 | 内閣府 `https://www8.cao.go.jp/chosei/shukujitsu/syukujitsu.csv` |
| タイミング | アプリ起動時に 1 回 |
| 通信層 | Rust の `reqwest` クレート（フロントエンドからは通信しない） |

### プロキシの優先順位

プロキシは以下の優先順位で適用されます。

1. **アプリ内設定**（`proxy.json`）
   ヘッダーの `⚙` ボタンから設定。明示的に指定した URL が最優先で使われます。

2. **OS 環境変数**（設定が空の場合）
   `reqwest` は OS の標準的なプロキシ環境変数を自動参照します。

   | 環境変数 | 対象 |
   |---------|------|
   | `HTTPS_PROXY` | HTTPS 通信 |
   | `HTTP_PROXY` | HTTP 通信 |
   | `NO_PROXY` | プロキシを経由しないホスト（カンマ区切り） |

   社内プロキシが環境変数で設定済みの場合、アプリ側の追加設定は不要です。

3. **直接接続**（環境変数も未設定の場合）

### 設定 URL の書式

```
# 認証なし
http://proxy.example.com:8080

# Basic 認証あり
http://user:password@proxy.example.com:8080

# HTTPS プロキシ
https://proxy.example.com:8443
```

---

## 自動更新（GitHub Releases）

アプリ起動から 3 秒後に GitHub Releases の `latest.json` を確認し、新バージョンがあればヘッダー直下に青いバナーを表示します。
「今すぐ更新」をクリックするとダウンロード・インストールが実行され、完了後にアプリが自動再起動します。

### 初回セットアップ手順

#### 1. 署名キーペアの生成

```bash
npx tauri signer generate -w ~/.tauri/wbs.key
```

出力例：
```
Your public key: dW50cnVzdGVkIGNvbW1lbnQ...（長い文字列）
Your private key was saved to ~/.tauri/wbs.key
```

#### 2. tauri.conf.json を更新

`src-tauri/tauri.conf.json` の以下 2 か所をプロジェクトの情報に書き換えてください。

| プレースホルダー | 設定値 |
|----------------|--------|
| `REPLACE_WITH_YOUR_PUBLIC_KEY` | 手順 1 で生成した公開鍵 |
| `YOUR_GITHUB_USERNAME` | GitHub のユーザー名 |
| `YOUR_REPO_NAME` | リポジトリ名 |

```json
"plugins": {
  "updater": {
    "pubkey": "ここに公開鍵",
    "endpoints": [
      "https://github.com/ユーザー名/リポジトリ名/releases/latest/download/latest.json"
    ],
    "dialog": false
  }
}
```

#### 3. GitHub Secrets の登録

リポジトリの **Settings → Secrets and variables → Actions** に以下を追加します。

| Secret 名 | 値 |
|-----------|---|
| `TAURI_SIGNING_PRIVATE_KEY` | `~/.tauri/wbs.key` の内容 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | 生成時に設定したパスワード（なければ空文字） |

#### 4. リリースの発行

```bash
# バージョンを上げてタグをプッシュ
# （tauri.conf.json と package.json の version も合わせて更新）
git tag v1.0.0
git push origin v1.0.0
```

GitHub Actions が自動で以下を実行します：
1. フロントエンドビルド（`npm run build`）
2. Rust バックエンドビルド（`cargo build --release`）
3. インストーラーへの署名
4. GitHub Release（Draft）の作成
5. インストーラー（`*_x64-setup.exe`）と `latest.json` のアップロード

Draft を確認したら **Publish release** をクリックして公開します。

### 更新時のプロキシについて

| 接続方法 | 更新チェック | ダウンロード |
|---------|------------|------------|
| OS 環境変数（`HTTPS_PROXY` 等） | ✅ 自動適用 | ✅ 自動適用 |
| アプリ内プロキシ設定（`proxy.json`） | ❌ 未対応 | ❌ 未対応 |

> アプリ内プロキシ設定は祝日データ取得専用です。自動更新には OS のプロキシ環境変数を設定してください。

---

## 開発・ビルド

```bash
# 依存パッケージのインストール
npm install

# 開発サーバー起動（Tauri ウィンドウ付き）
npm run tauri dev

# リリースビルド
npm run tauri build
```
