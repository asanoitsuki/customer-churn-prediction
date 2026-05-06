'use strict';

/**
 * popup.js — 拡張機能のポップアップ画面
 *
 * 処理フロー:
 *  1. サーバー死活確認（GET /health）
 *  2. タブ一覧取得 + アクティブ状態を background.js から取得
 *  3. タブをリスト表示
 *  4. クリック → 注入 or 解除
 */

const SERVER_URL = 'http://localhost:3000';

// ── DOM参照 ───────────────────────────────────────────────────────────────────
const tabsContainer  = document.getElementById('tabs-container');
const serverBadge    = document.getElementById('server-badge');
const serverText     = document.getElementById('server-status-text');
const tabCountEl     = document.getElementById('tab-count');
const guideEl        = document.getElementById('guide-text');
const toastEl        = document.getElementById('toast');

// ── ユーティリティ ────────────────────────────────────────────────────────────
function showToast(msg, durationMs = 2200) {
  toastEl.textContent = msg;
  toastEl.classList.add('show');
  setTimeout(() => toastEl.classList.remove('show'), durationMs);
}

// ── サーバーヘルスチェック ────────────────────────────────────────────────────
async function checkServer() {
  try {
    const resp = await fetch(`${SERVER_URL}/health`, {
      signal: AbortSignal.timeout ? AbortSignal.timeout(3000) : undefined,
    });
    if (resp.ok) {
      serverBadge.classList.remove('error');
      serverBadge.classList.add('connected');
      serverText.textContent = 'サーバー接続中';
      return true;
    }
  } catch {
    // fall through
  }
  serverBadge.classList.add('error');
  serverText.textContent = '未接続';
  guideEl.textContent = '⚠ サーバー未起動: cd webapp && npm start';
  return false;
}

// ── タブリスト描画 ────────────────────────────────────────────────────────────
async function renderTabs() {
  // background.js からアクティブタブ一覧を取得
  const { tabs: activeTabs } = await chrome.runtime.sendMessage({ action: 'getActiveTabs' });
  const activeSet = new Set(activeTabs);

  // すべてのタブを取得（内部ページを除外）
  const allTabs = (await chrome.tabs.query({})).filter(t =>
    t.url &&
    !t.url.startsWith('chrome://') &&
    !t.url.startsWith('chrome-extension://') &&
    !t.url.startsWith('about:')
  );

  tabCountEl.textContent = `${allTabs.length} タブ`;

  if (allTabs.length === 0) {
    tabsContainer.innerHTML = '<div class="empty">解析可能なタブがありません</div>';
    return;
  }

  tabsContainer.innerHTML = '';

  for (const tab of allTabs) {
    const isActive = activeSet.has(tab.id);
    const item = document.createElement('div');
    item.className = 'tab-item' + (isActive ? ' active' : '');
    item.dataset.tabId = tab.id;

    // ファビコン
    const faviconHTML = tab.favIconUrl
      ? `<img class="tab-favicon" src="${escapeAttr(tab.favIconUrl)}" alt="" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'">`
        + `<div class="favicon-fallback" style="display:none">🌐</div>`
      : `<div class="favicon-fallback">🌐</div>`;

    // タブバッジ
    const badgeHTML = isActive
      ? `<span class="tab-badge active-badge">ON</span>`
      : `<span class="tab-badge inject-badge">解析</span>`;

    item.innerHTML = `
      ${faviconHTML}
      <div class="tab-info">
        <div class="tab-title">${escapeHtml(tab.title || '(無題)')}</div>
        <div class="tab-url">${escapeHtml(tryHostname(tab.url))}</div>
      </div>
      ${badgeHTML}
    `;

    item.addEventListener('click', () => handleTabClick(tab.id, isActive, item));
    tabsContainer.appendChild(item);
  }
}

// ── タブクリック処理 ──────────────────────────────────────────────────────────
async function handleTabClick(tabId, isCurrentlyActive, itemEl) {
  if (isCurrentlyActive) {
    // オーバーレイを非表示
    const resp = await chrome.runtime.sendMessage({ action: 'removeOverlay', tabId });
    if (resp.success) {
      itemEl.classList.remove('active');
      itemEl.querySelector('.tab-badge').className = 'tab-badge inject-badge';
      itemEl.querySelector('.tab-badge').textContent = '解析';
      showToast('オーバーレイを非表示にしました');
    }
  } else {
    // オーバーレイを注入
    itemEl.style.opacity = '.5';
    const resp = await chrome.runtime.sendMessage({ action: 'injectTab', tabId });
    itemEl.style.opacity = '1';

    if (resp.success) {
      itemEl.classList.add('active');
      itemEl.querySelector('.tab-badge').className = 'tab-badge active-badge';
      itemEl.querySelector('.tab-badge').textContent = 'ON';
      showToast(resp.reactivated ? 'オーバーレイを再表示しました ✓' : 'AI解析を開始しました ✓');
    } else {
      showToast(`⚠ ${resp.error || '注入に失敗しました'}`);
    }
  }
}

// ── エスケープヘルパー ────────────────────────────────────────────────────────
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeAttr(str) {
  return String(str).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function tryHostname(url) {
  try { return new URL(url).hostname; } catch { return url; }
}

// ── エントリポイント ──────────────────────────────────────────────────────────
(async () => {
  await checkServer();
  await renderTabs();
})();
