'use strict';

/**
 * background.js — Manifest V3 サービスワーカー
 *
 * 責務:
 *  - ポップアップからの「注入」「削除」リクエストを処理する
 *  - どのタブにオーバーレイが注入済みかを管理する（chrome.storage.session を利用）
 *  - タブのクローズ/更新時にアクティブ状態をクリーンアップする
 */

// ── アクティブタブ管理 ────────────────────────────────────────────────────────
// storage.session はサービスワーカーが再起動しても同セッション内で維持される

async function getActiveTabs() {
  const { activeTabs = [] } = await chrome.storage.session.get('activeTabs');
  return new Set(activeTabs);
}

async function setActiveTabs(set) {
  await chrome.storage.session.set({ activeTabs: [...set] });
}

async function addActiveTab(tabId) {
  const set = await getActiveTabs();
  set.add(tabId);
  await setActiveTabs(set);
}

async function removeActiveTab(tabId) {
  const set = await getActiveTabs();
  set.delete(tabId);
  await setActiveTabs(set);
}

// ── コンテンツスクリプトが生きているか確認 ────────────────────────────────────
async function pingTab(tabId) {
  try {
    const resp = await chrome.tabs.sendMessage(tabId, { action: 'ping' });
    return resp?.alive === true;
  } catch {
    return false;
  }
}

// ── メッセージハンドラ ─────────────────────────────────────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.action) {

    // ポップアップ → タブへオーバーレイ注入
    case 'injectTab':
      handleInjectTab(message.tabId).then(sendResponse);
      return true; // 非同期レスポンスを使うため true を返す

    // ポップアップ → タブからオーバーレイ除去
    case 'removeOverlay':
      handleRemoveOverlay(message.tabId).then(sendResponse);
      return true;

    // ポップアップ → アクティブタブ一覧取得
    case 'getActiveTabs':
      getActiveTabs().then(set => sendResponse({ tabs: [...set] }));
      return true;

    // コンテンツスクリプト → 注入完了通知
    case 'contentReady':
      if (sender.tab?.id) addActiveTab(sender.tab.id);
      return false;

    // コンテンツスクリプト → オーバーレイ閉鎖通知
    case 'contentClosed':
      if (sender.tab?.id) removeActiveTab(sender.tab.id);
      return false;
  }
});

// ── タブクローズ時クリーンアップ ──────────────────────────────────────────────
chrome.tabs.onRemoved.addListener(tabId => removeActiveTab(tabId));

// ── ページ遷移時クリーンアップ ────────────────────────────────────────────────
// ハードナビゲーションでは content script が破棄されるため除去
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') removeActiveTab(tabId);
});

// ── 注入処理 ──────────────────────────────────────────────────────────────────
async function handleInjectTab(tabId) {
  try {
    // 既に注入済みで生きているか確認
    const alive = await pingTab(tabId);
    if (alive) {
      // オーバーレイを再表示するだけ
      await chrome.tabs.sendMessage(tabId, { action: 'showOverlay' });
      return { success: true, reactivated: true };
    }

    // content.js と styles.css を注入
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['content.js'],
    });
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ['styles.css'],
    });

    await addActiveTab(tabId);
    return { success: true };

  } catch (err) {
    console.error('[injectTab] error:', err.message);
    // chrome:// ページや chrome-extension:// ページには注入不可
    if (err.message.includes('Cannot access') || err.message.includes('chrome://')) {
      return { success: false, error: 'このページには注入できません（chrome:// など制限あり）。' };
    }
    return { success: false, error: err.message };
  }
}

// ── 除去処理 ──────────────────────────────────────────────────────────────────
async function handleRemoveOverlay(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { action: 'hideOverlay' });
  } catch {
    // タブがすでにない場合は無視
  }
  await removeActiveTab(tabId);
  return { success: true };
}
