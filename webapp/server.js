'use strict';

const express = require('express');
const cors = require('cors');
const OpenAI = require('openai');
require('dotenv').config();

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

// ── 起動前バリデーション ───────────────────────────────────────────────────────
if (!process.env.OPENAI_API_KEY) {
  console.error('\n[ERROR] OPENAI_API_KEY が設定されていません。');
  console.error('  cp .env.example .env  してから APIキーを記入してください。\n');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// ── ミドルウェア ──────────────────────────────────────────────────────────────
app.use(cors({
  origin: '*',          // Chrome拡張のコンテンツスクリプトからのリクエストを許可
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type'],
}));
app.use(express.json({ limit: '512kb' }));

// ── ヘルスチェック ────────────────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', model: MODEL, ts: new Date().toISOString() });
});

// ── メインAPI ─────────────────────────────────────────────────────────────────
app.post('/solve', async (req, res) => {
  const { pageText } = req.body;

  if (!pageText || typeof pageText !== 'string' || pageText.trim().length === 0) {
    return res.status(400).json({ error: 'pageText が空です。' });
  }

  // APIコスト削減のため先頭 4000 文字に制限
  const truncated = pageText.trim().slice(0, 4000);

  const systemPrompt =
    'あなたは優秀な問題解答AIアシスタントです。' +
    'Webページから抽出されたテキストを読み、問題部分を特定して正確に解答します。' +
    '数学・英語・プログラミング・一般教養・資格試験など幅広いジャンルに対応します。' +
    '出力は必ず指定フォーマットに従ってください。';

  const userPrompt =
    '以下はWebページから抽出したテキストです。\n' +
    '問題と思われる部分を特定し、解答してください。\n\n' +
    '出力フォーマット（必ずこの形式で）:\n' +
    '【問題】\n（問題文をそのまま抜き出す）\n\n' +
    '【解答】\n（簡潔・正確な解答）\n\n' +
    '【解説】\n（初心者にも分かる丁寧な解説）\n\n' +
    `---\n${truncated}`;

  try {
    const completion = await openai.chat.completions.create({
      model: MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user',   content: userPrompt },
      ],
      temperature: 0.2,
      max_tokens: 1500,
    });

    const result = completion.choices[0].message.content;
    return res.json({ result, usage: completion.usage });

  } catch (err) {
    console.error('[OpenAI Error]', err.status, err.message);

    if (err.status === 401) {
      return res.status(401).json({ error: 'OpenAI APIキーが無効です。.env を確認してください。' });
    }
    if (err.status === 429) {
      return res.status(429).json({ error: 'OpenAI レート制限中です。しばらく待ってから再試行してください。' });
    }
    if (err.status === 400) {
      return res.status(400).json({ error: `リクエストが不正です: ${err.message}` });
    }
    return res.status(500).json({ error: `OpenAI APIエラー: ${err.message}` });
  }
});

// ── 404 ──────────────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not Found' }));

// ── 起動 ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\nTab Solver AI サーバー起動中`);
  console.log(`  URL  : http://localhost:${PORT}`);
  console.log(`  モデル: ${MODEL}`);
  console.log('  Ctrl+C で停止\n');
});
