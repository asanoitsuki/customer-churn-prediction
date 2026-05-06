# Tab Solver AI

AIがWebページの問題を自動検出・解答するChrome拡張機能です。

**対応ページ**: Googleフォーム / PDF / LeetCode / オンライン講義 / Web問題集 / 英語問題 / 数式問題

---

## 動作イメージ

```
① 拡張アイコンをクリック
② タブ一覧から解析したいタブを選ぶ
③ そのタブ右下にAI小窓が出現
④ 問題を自動検出 → 解答・解説を表示
⑤ ページが変わると自動再解析
```

---

## セットアップ（3ステップ）

### 1. サーバーを起動する

```bash
cd webapp
cp .env.example .env          # .env を作成
# .env を開いて OPENAI_API_KEY=sk-xxx... を記入

npm install                   # 依存パッケージ + アイコン自動生成
npm start                     # サーバー起動 (http://localhost:3000)
```

> **OpenAI APIキー取得先**: https://platform.openai.com/api-keys
> 費用を抑えたい場合は `.env` の `OPENAI_MODEL=gpt-4o-mini` のままで。

### 2. Chrome拡張を読み込む

1. Chrome で `chrome://extensions` を開く
2. 右上の **「デベロッパーモード」をON**
3. 「**パッケージ化されていない拡張機能を読み込む**」をクリック
4. `extension/` フォルダを選択

### 3. 使う

1. 拡張アイコン（🤖）をクリック
2. 解析したいタブをクリック → **「AI解析を開始しました ✓」**
3. タブ内にAI小窓が表示され、問題が自動解析される

---

## 使い方

| 操作 | 説明 |
|------|------|
| タブをクリック（ポップアップ） | オーバーレイON / OFF切替 |
| 🔄 再解析ボタン | 強制的に現在のページを解析 |
| ヘッダをドラッグ | 小窓を好きな位置に移動 |
| − / + ボタン | 小窓を最小化 / 展開 |
| 🌓 スライダー | 小窓の透明度を調整 |
| × ボタン | オーバーレイを閉じる |

---

## ファイル構成

```
extension/          Chrome拡張
  manifest.json     拡張の設定（Manifest V3）
  background.js     サービスワーカー（タブ注入管理）
  content.js        ページ内オーバーレイ本体
  popup.html/js     拡張アイコンのポップアップ
  styles.css        オーバーレイのスタイル
  icons/            自動生成されるアイコン画像

webapp/             Node.js APIサーバー
  server.js         Express + OpenAI APIプロキシ
  package.json      依存パッケージ定義
  .env              APIキー設定（gitignore済み）

generate-icons.js   PNG アイコン自動生成スクリプト
```

---

## アーキテクチャ

```
[Chrome拡張]                    [Webサーバー]         [OpenAI]
popup.js ──sendMessage──► background.js
                                   │
                          executeScript/insertCSS
                                   │
                                   ▼
                             content.js           POST /solve
                          (ページ内スクリプト) ──────────────► server.js ──► GPT
                          MutationObserver                          │
                          オーバーレイUI                    ◄────────┘
```

- **APIキーはサーバー側のみに存在**。拡張機能はlocalhostのプロキシ経由でのみOpenAIと通信します。
- **MutationObserver** がDOMの変化（SPA遷移・問題切替）を検知して自動再解析します（1.5秒デバウンス）。
- **問題検出** は `document.body.innerText` から「問」「solve」「calculate」等のキーワードを検索します。

---

## カスタマイズ

| ファイル | 設定 | 説明 |
|----------|------|------|
| `webapp/.env` | `OPENAI_MODEL` | `gpt-4o`（高精度）や `gpt-4o-mini`（低コスト） |
| `webapp/.env` | `PORT` | デフォルト `3000`（変更時は `content.js` の `API_URL` も変更） |
| `extension/content.js` | `DEBOUNCE_MS` | DOM変化後の待機時間（デフォルト1500ms） |
| `extension/content.js` | `KEYWORDS` | 問題検出キーワードの追加・変更 |
| `extension/content.js` | `MAX_CHARS` | 送信する最大文字数（デフォルト8000字） |

---

## トラブルシューティング

| 症状 | 原因 | 対処 |
|------|------|------|
| ポップアップが「未接続」表示 | サーバー未起動 | `cd webapp && npm start` |
| 「注入できません」エラー | chrome:// などの内部ページ | 通常のWebページで試す |
| 解析結果が出ない | APIキー未設定 | `.env` の `OPENAI_API_KEY` を確認 |
| アイコンが表示されない | `npm install` 未実行 | `cd webapp && npm install` でアイコン自動生成 |
| 解析が止まらない | ページ変化が激しい | `DEBOUNCE_MS` を増やす（例: 3000） |

---

## 動作環境

- **Chrome** 103以上（Manifest V3 対応）
- **Node.js** 18以上
- **OpenAI API** アカウント
