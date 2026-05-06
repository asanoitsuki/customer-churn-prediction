'use strict';

/**
 * content.js — ページに注入されるコンテンツスクリプト
 *
 * 責務:
 *  1. ページ右下にドラッグ可能なAIオーバーレイを生成
 *  2. innerText から問題テキストを抽出して /solve API に送信
 *  3. MutationObserver でDOMの変化を監視し自動再解析
 *  4. background.js のメッセージ（表示/非表示/ping）に応答
 */

(function () {
  // ── 二重注入防止 ──────────────────────────────────────────
  if (window.__tabSolverAIActive) {
    const existing = document.getElementById('tab-solver-ai-overlay');
    if (existing) existing.style.display = 'flex';
    chrome.runtime.sendMessage({ action: 'contentReady' });
    return;
  }
  window.__tabSolverAIActive = true;

  // ── 設定 ──────────────────────────────────────────────────
  const API_URL      = 'http://localhost:3000/solve';
  const DEBOUNCE_MS  = 1500;  // DOM変化後の待機時間（ms）
  const MAX_CHARS    = 8000;  // 送信する最大文字数

  // 問題と判断するキーワード
  const KEYWORDS = [
    '問', '問題', '次の問い', '設問', '求めよ', '答えよ', '選べ',
    '正しいものを', '解け', '証明せよ', '計算せよ',
    'Q.', 'Question', 'Exercise', 'Problem',
    'solve', 'find', 'calculate', 'choose', 'determine',
    'what is', 'which', 'how many', 'prove',
  ];

  let lastSentText = '';
  let debounceTimer = null;
  let observer = null;
  let isAnalyzing = false;

  // ── オーバーレイHTML生成 ──────────────────────────────────
  function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'tab-solver-ai-overlay';
    el.innerHTML = /* html */`
      <div id="tsa-header">
        <div id="tsa-title">
          <span id="tsa-icon">🤖</span>
          <span>Tab Solver AI</span>
        </div>
        <div id="tsa-controls">
          <div id="tsa-opacity-wrap" title="透明度">
            <span>🌓</span>
            <input type="range" id="tsa-opacity-slider" min="20" max="100" value="96" step="4">
          </div>
          <button class="tsa-btn" id="tsa-refresh-btn"  title="再解析">🔄</button>
          <button class="tsa-btn" id="tsa-minimize-btn" title="最小化">−</button>
          <button class="tsa-btn" id="tsa-close-btn"    title="閉じる">×</button>
        </div>
      </div>

      <div id="tsa-body">
        <div id="tsa-status-bar">
          <span class="tsa-dot tsa-dot-idle" id="tsa-dot"></span>
          <span id="tsa-status-text">初期化中...</span>
        </div>

        <div id="tsa-content">
          <!-- ローディング -->
          <div id="tsa-loading" style="display:none">
            <div class="tsa-spinner"></div>
            <span>AIが解析中...</span>
          </div>

          <!-- エラー -->
          <div id="tsa-error" style="display:none">
            <span>⚠️</span>
            <span id="tsa-error-msg"></span>
          </div>

          <!-- 問題なし -->
          <div id="tsa-no-problem" style="display:none">
            📭 このページに問題が検出されませんでした。<br>
            「🔄 再解析」で強制解析できます。
          </div>

          <!-- 解答結果 -->
          <div id="tsa-result" style="display:none">
            <div class="tsa-card" id="tsa-problem-card">
              <div class="tsa-card-label">📌 問題</div>
              <div class="tsa-card-body" id="tsa-problem-body"></div>
            </div>
            <div class="tsa-card" id="tsa-answer-card">
              <div class="tsa-card-label">✅ 解答</div>
              <div class="tsa-card-body" id="tsa-answer-body"></div>
            </div>
            <div class="tsa-card" id="tsa-explain-card">
              <div class="tsa-card-label">💡 解説</div>
              <div class="tsa-card-body" id="tsa-explain-body"></div>
            </div>
          </div>
        </div>

        <div id="tsa-footer">
          <span id="tsa-info-text">監視中</span>
          <button id="tsa-refresh-footer-btn">🔄 再解析</button>
        </div>
      </div>
    `;
    return el;
  }

  // ── ドラッグ ──────────────────────────────────────────────
  function enableDrag(overlay) {
    const header = overlay.querySelector('#tsa-header');
    let dragging = false;
    let ox = 0, oy = 0, startL = 0, startT = 0;

    header.addEventListener('mousedown', e => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      dragging = true;
      const r = overlay.getBoundingClientRect();
      ox = e.clientX; oy = e.clientY;
      startL = r.left; startT = r.top;
      overlay.style.setProperty('right',  'auto', 'important');
      overlay.style.setProperty('bottom', 'auto', 'important');
      overlay.style.setProperty('left', startL + 'px', 'important');
      overlay.style.setProperty('top',  startT + 'px', 'important');
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (!dragging) return;
      overlay.style.setProperty('left', (startL + e.clientX - ox) + 'px', 'important');
      overlay.style.setProperty('top',  (startT + e.clientY - oy) + 'px', 'important');
    });

    document.addEventListener('mouseup', () => { dragging = false; });
  }

  // ── コントロール配線 ──────────────────────────────────────
  function setupControls(overlay) {
    let minimized = false;
    const body = overlay.querySelector('#tsa-body');

    overlay.querySelector('#tsa-minimize-btn').addEventListener('click', () => {
      minimized = !minimized;
      body.style.setProperty('display', minimized ? 'none' : 'flex', 'important');
      overlay.querySelector('#tsa-minimize-btn').textContent = minimized ? '+' : '−';
    });

    overlay.querySelector('#tsa-close-btn').addEventListener('click', () => {
      overlay.style.setProperty('display', 'none', 'important');
      stopObserver();
      window.__tabSolverAIActive = false;
      chrome.runtime.sendMessage({ action: 'contentClosed' });
    });

    const forceAnalyze = () => {
      const text = extractText();
      if (text) analyzeText(text, true);
    };
    overlay.querySelector('#tsa-refresh-btn').addEventListener('click', forceAnalyze);
    overlay.querySelector('#tsa-refresh-footer-btn').addEventListener('click', forceAnalyze);

    overlay.querySelector('#tsa-opacity-slider').addEventListener('input', e => {
      overlay.style.setProperty('opacity', String(+e.target.value / 100), 'important');
    });
  }

  // ── テキスト抽出 ──────────────────────────────────────────
  function extractText() {
    try {
      return (document.body.innerText || '').trim().slice(0, MAX_CHARS);
    } catch {
      return '';
    }
  }

  // ── 問題キーワード検出 ────────────────────────────────────
  function looksLikeProblem(text) {
    const lower = text.toLowerCase();
    return KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
  }

  // ── UI状態更新ヘルパー ────────────────────────────────────
  function setStatus(text, type = 'idle') {
    const dot  = document.getElementById('tsa-dot');
    const span = document.getElementById('tsa-status-text');
    if (!dot || !span) return;
    dot.className = `tsa-dot tsa-dot-${type}`;
    span.textContent = text;
  }

  function showSection(id) {
    ['tsa-loading','tsa-error','tsa-no-problem','tsa-result'].forEach(s => {
      const el = document.getElementById(s);
      if (el) el.style.setProperty('display', s === id ? (s === 'tsa-result' ? 'flex' : s === 'tsa-loading' ? 'flex' : 'block') : 'none', 'important');
    });
  }

  // ── API呼び出し ───────────────────────────────────────────
  async function analyzeText(text, force = false) {
    if (isAnalyzing) return;
    if (!force && text === lastSentText) return;

    if (!force && !looksLikeProblem(text)) {
      showSection('tsa-no-problem');
      setStatus('問題未検出', 'idle');
      lastSentText = text;
      return;
    }

    isAnalyzing  = true;
    lastSentText = text;

    showSection('tsa-loading');
    setStatus('解析中...', 'active');

    const controller = new AbortController();
    const tid = setTimeout(() => controller.abort(), 30000);

    try {
      const resp = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageText: text }),
        signal: controller.signal,
      });
      clearTimeout(tid);

      if (!resp.ok) {
        const errData = await resp.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${resp.status}`);
      }

      const { result } = await resp.json();
      renderResult(result);
      setStatus('解析完了 ✓', 'success');

    } catch (err) {
      clearTimeout(tid);
      const msg = err.name === 'AbortError'
        ? 'タイムアウト（30秒）。サーバーが重いか停止しています。'
        : err.message.toLowerCase().includes('fetch')
          ? '接続失敗。webapp/ で npm start を実行してください。'
          : err.message;

      const el = document.getElementById('tsa-error-msg');
      if (el) el.textContent = msg;
      showSection('tsa-error');
      setStatus('エラー', 'error');
    } finally {
      isAnalyzing = false;
    }
  }

  // ── 結果レンダリング ──────────────────────────────────────
  function renderResult(raw) {
    const get = (label) => {
      const m = raw.match(new RegExp(`【${label}】\\s*([\\s\\S]*?)(?=【|$)`));
      return m ? m[1].trim() : '';
    };
    const problem     = get('問題');
    const answer      = get('解答');
    const explanation = get('解説');

    // パース失敗時はフルテキストを問題欄に
    const setBody = (id, txt) => {
      const el = document.getElementById(id);
      if (el) el.textContent = txt || '—';
    };
    setBody('tsa-problem-body',  problem     || raw);
    setBody('tsa-answer-body',   answer);
    setBody('tsa-explain-body',  explanation);

    showSection('tsa-result');
  }

  // ── MutationObserver ──────────────────────────────────────
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const text = extractText();
        analyzeText(text);
      }, DEBOUNCE_MS);
    });
    observer.observe(document.body, {
      childList: true, subtree: true, characterData: true,
    });
    const info = document.getElementById('tsa-info-text');
    if (info) info.textContent = '🔍 ページ監視中';
  }

  function stopObserver() {
    if (observer) { observer.disconnect(); observer = null; }
    clearTimeout(debounceTimer);
  }

  // ── background.js メッセージ受信 ─────────────────────────
  chrome.runtime.onMessage.addListener((msg, _sender, sendResp) => {
    const overlay = document.getElementById('tab-solver-ai-overlay');
    if (msg.action === 'ping') {
      sendResp({ alive: true });
      return false;
    }
    if (msg.action === 'showOverlay' && overlay) {
      overlay.style.setProperty('display', 'flex', 'important');
      sendResp({ ok: true });
      return false;
    }
    if (msg.action === 'hideOverlay' && overlay) {
      overlay.style.setProperty('display', 'none', 'important');
      stopObserver();
      window.__tabSolverAIActive = false;
      sendResp({ ok: true });
      return false;
    }
  });

  // ── 初期化 ────────────────────────────────────────────────
  function init() {
    if (document.getElementById('tab-solver-ai-overlay')) return;

    const overlay = buildOverlay();
    document.body.appendChild(overlay);
    enableDrag(overlay);
    setupControls(overlay);
    startObserver();

    // 初回解析
    setStatus('初回解析中...', 'active');
    const text = extractText();
    if (text) {
      analyzeText(text);
    } else {
      setStatus('テキストなし', 'idle');
      showSection('tsa-no-problem');
    }

    chrome.runtime.sendMessage({ action: 'contentReady' });
  }

  if (document.body) {
    init();
  } else {
    document.addEventListener('DOMContentLoaded', init);
  }

})();
