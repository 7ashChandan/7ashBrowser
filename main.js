const {
  app,
  BrowserWindow,
  WebContentsView,
  ipcMain,
  Menu,
  screen,
  session,
  dialog,
  shell,
  safeStorage,
} = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');
const { resolveSiteShortcut, resolveDirectNavigation } = require('./src/site-shortcuts');
const { enableAdBlocker } = require('./src/adblocker');
const { ElectronBlocker } = require('@ghostery/adblocker-electron');

const HOME = pathToFileURL(path.join(__dirname, 'src', 'home.html')).href;
const SEARCH_URL = 'https://duckduckgo.com/?q=';
const TRACKER_DOMAINS = [
  'adnxs.com',
  'bat.bing.com',
  'clarity.ms',
  'doubleclick.net',
  'google-analytics.com',
  'googleadservices.com',
  'googlesyndication.com',
  'googletagmanager.com',
  'hotjar.com',
  'hotjar.io',
  'quantserve.com',
  'scorecardresearch.com',
  'segment.io',
  'connect.facebook.net',
  'analytics.tiktok.com',
  'analytics-sg.tiktok.com',
];
const BACKGROUND_IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'avif'];
const AD_BLOCKER_CACHE_MAX_AGE = 24 * 60 * 60 * 1000;
const DUCK_LOGO_DATA_URL = `data:image/jpeg;base64,${fs.readFileSync(
  path.join(__dirname, 'src', 'duck-logo.jpeg')
).toString('base64')}`;
const SIDEBAR_EXPANDED_WIDTH = 272;
const SIDEBAR_COMPACT_WIDTH = 72;
const CHROME_TOOLBAR_HEIGHT = 96;

let win = null;
let sidebarWidth = SIDEBAR_EXPANDED_WIDTH;
let panelOpen = false;
let nextId = 1;
let activeId = null;
let splitId = null;
const tabs = new Map();
const history = [];
const downloads = [];
let settings = {};
let bookmarks = [];
let extensions = [];
let adBlocker = null;
let adBlockerStatus = 'loading';
let adBlockerGeneration = 0;
let zenSidebarExpanded = false;
let zenSidebarSurfaceHovered = false;
let zenSidebarHoverTimer = null;
let sidebarAnimationTimer = null;

function settingsPath() {
  return path.join(app.getPath('userData'), 'him-settings.json');
}

function geminiApiKeyPath() {
  return path.join(app.getPath('userData'), 'gemini-api-key.bin');
}

function loadSettings() {
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath(), 'utf8'));
  } catch {
    settings = {};
  }
  bookmarks = settings.bookmarks || [];
  const hadApiKeySettings = 'geminiApiKey' in settings || 'geminiModel' in settings;
  const hadSavedTabs = 'tabs' in settings;
  delete settings.geminiApiKey;
  delete settings.geminiModel;
  delete settings.tabs;
  if (hadApiKeySettings || hadSavedTabs) saveSettings();
}

function saveSettings() {
  settings.bookmarks = bookmarks;
  fs.mkdirSync(path.dirname(settingsPath()), { recursive: true });
  fs.writeFileSync(settingsPath(), JSON.stringify(settings, null, 2));
}

function isKnownTracker(requestUrl) {
  try {
    const url = new URL(requestUrl);
    const hostname = url.hostname.toLowerCase();
    return TRACKER_DOMAINS.some((domain) => (
      hostname === domain || hostname.endsWith(`.${domain}`)
    )) || (
      (hostname === 'facebook.com' || hostname === 'www.facebook.com') &&
      url.pathname === '/tr'
    );
  } catch {
    return false;
  }
}

function configurePrivacy() {
  const browserSession = session.defaultSession;

  browserSession.webRequest.onBeforeRequest({ urls: ['<all_urls>'] }, (details, callback) => {
    if (settings.blockKnownTrackers !== false && isKnownTracker(details.url)) {
      callback({ cancel: true });
      return;
    }
    callback({});
  });

  browserSession.webRequest.onBeforeSendHeaders({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    Object.keys(requestHeaders).forEach((name) => {
      if (name.toLowerCase() === 'dnt' || name.toLowerCase() === 'sec-gpc') {
        delete requestHeaders[name];
      }
    });
    if (settings.sendPrivacySignals !== false) {
      requestHeaders.DNT = '1';
      requestHeaders['Sec-GPC'] = '1';
    }
    callback({ requestHeaders });
  });

  browserSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });
  browserSession.setPermissionCheckHandler(() => false);
}

function publishAdBlockerStatus(status) {
  adBlockerStatus = status;
  broadcast();
}

async function initializeAdBlocker() {
  const generation = ++adBlockerGeneration;
  const browserSession = session.defaultSession;
  const cachePath = path.join(app.getPath('userData'), 'adblocker-cache.bin');
  let cachedBlockerLoaded = false;

  if (settings.blockKnownTrackers === false) {
    publishAdBlockerStatus('disabled');
    return;
  }
  publishAdBlockerStatus('loading');

  try {
    const [cacheInfo, cachedData] = await Promise.all([
      fs.promises.stat(cachePath),
      fs.promises.readFile(cachePath),
    ]);
    const cachedBlocker = ElectronBlocker.deserialize(cachedData);
    if (generation !== adBlockerGeneration || settings.blockKnownTrackers === false) return;

    if (adBlocker && adBlocker.isBlockingEnabled(browserSession)) {
      adBlocker.disableBlockingInSession(browserSession);
    }
    enableAdBlocker(cachedBlocker, browserSession);
    adBlocker = cachedBlocker;
    cachedBlockerLoaded = true;

    if (Date.now() - cacheInfo.mtimeMs < AD_BLOCKER_CACHE_MAX_AGE) {
      publishAdBlockerStatus('active');
      return;
    }
    publishAdBlockerStatus('updating');
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('Could not load cached ad and tracker filters:', error);
    }
  }

  if (generation !== adBlockerGeneration || settings.blockKnownTrackers === false) return;
  if (!cachedBlockerLoaded) publishAdBlockerStatus('loading');

  try {
    if (typeof globalThis.fetch !== 'function') {
      throw new Error('Fetch is unavailable; cannot download ad and tracker filters.');
    }
    const updatedBlocker = await ElectronBlocker.fromPrebuiltAdsAndTracking(globalThis.fetch);
    if (generation !== adBlockerGeneration || settings.blockKnownTrackers === false) return;

    try {
      await fs.promises.writeFile(cachePath, updatedBlocker.serialize());
    } catch (error) {
      console.error('Could not cache ad and tracker filters:', error);
    }

    if (adBlocker && adBlocker.isBlockingEnabled(browserSession)) {
      adBlocker.disableBlockingInSession(browserSession);
    }
    enableAdBlocker(updatedBlocker, browserSession);
    adBlocker = updatedBlocker;
    publishAdBlockerStatus('active');
  } catch (error) {
    if (generation !== adBlockerGeneration) return;
    console.error('Could not initialize ad and tracker filters:', error);
    const hasActiveBlocker = adBlocker && adBlocker.isBlockingEnabled(browserSession);
    publishAdBlockerStatus(hasActiveBlocker ? 'cached' : 'fallback');
  }
}

function setAdBlockerEnabled(enabled) {
  const browserSession = session.defaultSession;
  if (enabled) {
    if (adBlocker && adBlocker.isBlockingEnabled(browserSession)) {
      publishAdBlockerStatus('active');
      return;
    }
    void initializeAdBlocker();
    return;
  }

  adBlockerGeneration += 1;
  if (adBlocker && adBlocker.isBlockingEnabled(browserSession)) {
    adBlocker.disableBlockingInSession(browserSession);
  }
  adBlocker = null;
  configurePrivacy();
  publishAdBlockerStatus('disabled');
}

function contentOffset() {
  if (settings.layoutStyle === 'chrome') return CHROME_TOOLBAR_HEIGHT;
  if (settings.layoutStyle === 'zen') return sidebarWidth;
  return panelOpen ? Math.max(sidebarWidth, SIDEBAR_EXPANDED_WIDTH) : sidebarWidth;
}

function stopSidebarWidthAnimation() {
  if (!sidebarAnimationTimer) return;
  clearInterval(sidebarAnimationTimer);
  sidebarAnimationTimer = null;
}

function animateSidebarWidth(targetWidth) {
  stopSidebarWidthAnimation();
  const startWidth = sidebarWidth;
  const startTime = Date.now();
  const duration = 180;
  const tick = () => {
    if (!win || win.isDestroyed()) {
      stopSidebarWidthAnimation();
      return;
    }
    const progress = Math.min(1, (Date.now() - startTime) / duration);
    const eased = 1 - ((1 - progress) ** 3);
    sidebarWidth = Math.round(startWidth + ((targetWidth - startWidth) * eased));
    layout();
    if (progress === 1) {
      sidebarWidth = targetWidth;
      stopSidebarWidthAnimation();
      layout();
    }
  };
  sidebarAnimationTimer = setInterval(tick, 16);
  tick();
}

function setZenSidebarExpanded(expanded) {
  if (settings.layoutStyle !== 'zen') return;
  const nextExpanded = Boolean(expanded);
  if (zenSidebarExpanded === nextExpanded) return;
  zenSidebarExpanded = nextExpanded;
  if (win && !win.isDestroyed()) {
    win.webContents.send('zen-sidebar-hover', zenSidebarExpanded);
  }
  animateSidebarWidth(zenSidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COMPACT_WIDTH);
}

function checkZenSidebarHover() {
  if (!win || win.isDestroyed()) return;
  if (
    settings.layoutStyle !== 'zen' ||
    win.isMinimized() ||
    (!win.isFocused() && !zenSidebarSurfaceHovered)
  ) {
    zenSidebarSurfaceHovered = false;
    setZenSidebarExpanded(false);
    return;
  }
  const bounds = win.getContentBounds();
  const cursor = screen.getCursorScreenPoint();
  const x = cursor.x - bounds.x;
  const y = cursor.y - bounds.y;
  const isInsideWindow = x >= 0 && y >= 0 && x < bounds.width && y < bounds.height;
  const edgeWidth = SIDEBAR_COMPACT_WIDTH + 20;
  setZenSidebarExpanded(isInsideWindow && (zenSidebarSurfaceHovered || x <= edgeWidth));
}

function syncZenSidebarHoverTracking() {
  if (settings.layoutStyle === 'zen') {
    if (!zenSidebarHoverTimer) {
      zenSidebarHoverTimer = setInterval(checkZenSidebarHover, 50);
    }
    return;
  }
  if (zenSidebarHoverTimer) {
    clearInterval(zenSidebarHoverTimer);
    zenSidebarHoverTimer = null;
  }
}

function updateSidebarWidth() {
  stopSidebarWidthAnimation();
  if (settings.layoutStyle !== 'zen') {
    const wasExpanded = zenSidebarExpanded;
    zenSidebarExpanded = false;
    zenSidebarSurfaceHovered = false;
    if (wasExpanded && win && !win.isDestroyed()) {
      win.webContents.send('zen-sidebar-hover', false);
    }
  }
  if (settings.layoutStyle === 'chrome') {
    sidebarWidth = 0;
  } else if (settings.layoutStyle === 'zen') {
    sidebarWidth = zenSidebarExpanded ? SIDEBAR_EXPANDED_WIDTH : SIDEBAR_COMPACT_WIDTH;
  } else {
    sidebarWidth = settings.compactMode === true
      ? SIDEBAR_COMPACT_WIDTH
      : SIDEBAR_EXPANDED_WIDTH;
  }
}

function activeTab() {
  return activeId ? tabs.get(activeId) : undefined;
}

function canGoBack(wc) {
  const history = wc.navigationHistory;
  if (history && typeof history.canGoBack === 'function') return history.canGoBack();
  return wc.canGoBack();
}

function canGoForward(wc) {
  const history = wc.navigationHistory;
  if (history && typeof history.canGoForward === 'function') return history.canGoForward();
  return wc.canGoForward();
}

function goBack(wc) {
  const history = wc.navigationHistory;
  if (history && typeof history.canGoBack === 'function') {
    if (history.canGoBack() && typeof history.goBack === 'function') history.goBack();
    else load(wc, HOME);
    return;
  }
  if (wc.canGoBack()) {
    wc.goBack();
    return;
  }
  load(wc, HOME);
}

function goForward(wc) {
  const history = wc.navigationHistory;
  if (history && typeof history.canGoForward === 'function') {
    if (history.canGoForward() && typeof history.goForward === 'function') history.goForward();
    return;
  }
  if (wc.canGoForward()) wc.goForward();
}

function load(wc, url) {
  wc.loadURL(url).catch(() => {});
}

function toURL(input) {
  const s = (input || '').trim();
  if (!s) return HOME;
  const shortcutUrl = resolveSiteShortcut(s);
  if (shortcutUrl) return shortcutUrl;
  const directUrl = resolveDirectNavigation(s);
  if (directUrl) return directUrl;
  return SEARCH_URL + encodeURIComponent(s);
}

function isAllowedWebUrl(value) {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function isAllowedTabNavigation(value) {
  return value === HOME || isAllowedWebUrl(value);
}

function findExternalUrl(args) {
  return args.find(isAllowedWebUrl) || null;
}

let pendingExternalUrl = findExternalUrl(process.argv.slice(1));

function openExternalUrl(url) {
  if (!isAllowedWebUrl(url)) return;
  if (!win || tabs.size === 0) {
    pendingExternalUrl = url;
    return;
  }
  createTab(url, activeTab()?.spaceId || 'home');
}

function customizeDuckDuckGoPage(webContents) {
  const hostname = new URL(webContents.getURL()).hostname;
  if (hostname !== 'duckduckgo.com' && hostname !== 'www.duckduckgo.com') return;
  const logoDataUrl = JSON.stringify(DUCK_LOGO_DATA_URL);
  webContents.insertCSS(`
    #header-logo-wrapper {
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      width: 58px !important;
      height: 48px !important;
      cursor: default !important;
    }
    #header-logo-wrapper .header__logo-icon,
    #header-logo-wrapper .header__logo-wordmark { display: none !important; }
    #header-logo-wrapper img[data-him-logo] {
      display: block !important;
      width: 34px !important;
      height: 34px !important;
      border-radius: 50% !important;
      object-fit: cover !important;
    }
    #react-browser-update-info { display: none !important; }
  `).catch((error) => {
    console.error('Could not style DuckDuckGo page logo:', error);
  });

  webContents.executeJavaScript(`(() => {
    const replaceLogo = () => {
      const wrapper = document.querySelector('#header-logo-wrapper');
      if (!wrapper) return;
      wrapper.removeAttribute('href');
      wrapper.removeAttribute('target');
      wrapper.setAttribute('role', 'img');
      wrapper.setAttribute('aria-label', 'Browser logo');
      wrapper.tabIndex = -1;
      wrapper.style.setProperty('cursor', 'default', 'important');
      wrapper.style.setProperty('visibility', 'visible', 'important');
      if (!wrapper.dataset.himNonInteractive) {
        wrapper.addEventListener('click', (event) => {
          event.preventDefault();
          event.stopPropagation();
        }, true);
        wrapper.dataset.himNonInteractive = 'true';
      }
      if (wrapper.querySelector('img[data-him-logo]')) return;
      const image = document.createElement('img');
      image.dataset.himLogo = 'true';
      image.alt = '';
      image.src = ${logoDataUrl};
      wrapper.replaceChildren(image);
    };

    const hideRightSide = () => {
      replaceLogo();
      const width = document.documentElement.clientWidth;
      for (const section of document.querySelectorAll(
        '#react-layout section, #react-layout aside, #react-layout [role="complementary"]'
      )) {
        const rect = section.getBoundingClientRect();
        if (rect.left > width * 0.55 && rect.width > 180 && rect.height > 120) {
          section.style.setProperty('display', 'none', 'important');
        }
      }

      const promo = [...document.querySelectorAll('body *')].find((element) =>
        element.childElementCount === 0 &&
        /upgrade to our browser|try the duckduckgo browser/i.test(element.textContent || '')
      );
      if (promo) {
        let panel = promo;
        while (panel.parentElement && panel !== document.body) {
          const rect = panel.getBoundingClientRect();
          if (rect.left > width * 0.5 && rect.width > 180 && rect.height > 100) break;
          panel = panel.parentElement;
        }
        if (panel !== document.body) panel.style.setProperty('display', 'none', 'important');
      }
    };

    hideRightSide();
    let cleanupTimer;
    const observer = new MutationObserver(() => {
      clearTimeout(cleanupTimer);
      cleanupTimer = setTimeout(hideRightSide, 120);
    });
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['href'],
      childList: true,
      subtree: true
    });
    setTimeout(() => {
      clearTimeout(cleanupTimer);
      observer.disconnect();
    }, 5000);
  })()`).catch((error) => {
    console.error('Could not hide DuckDuckGo right-side content:', error);
  });
}

function layout() {
  const t = activeTab();
  if (!win || !t) return;
  const [w, h] = win.getContentSize();
  const offset = contentOffset();
  const horizontal = settings.layoutStyle === 'chrome';
  const x = horizontal ? 0 : offset;
  const y = horizontal ? offset : 0;
  const contentWidth = Math.max(0, w - x);
  const contentHeight = Math.max(0, h - y);
  const split = splitId ? tabs.get(splitId) : null;
  if (horizontal && panelOpen) {
    t.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    if (split && split.id !== t.id) {
      split.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    return;
  }
  if (split && split.id !== t.id) {
    const leftWidth = Math.floor(contentWidth / 2);
    t.view.setBounds({ x, y, width: leftWidth, height: contentHeight });
    split.view.setBounds({ x: x + leftWidth, y, width: contentWidth - leftWidth, height: contentHeight });
  } else {
    t.view.setBounds({ x, y, width: contentWidth, height: contentHeight });
  }
}

function getState() {
  return {
    activeId,
    splitId,
    adBlockerStatus,
    bookmarks,
    history,
    downloads,
    settings,
    extensions,
    tabs: [...tabs.values()].map(t => ({
      id: t.id,
      title: t.title,
      url: t.url,
      space: t.spaceId,
      pinned: t.pinned,
      canGoBack: canGoBack(t.view.webContents),
      canGoForward: canGoForward(t.view.webContents),
    })),
  };
}

function broadcast() {
  if (!win || win.isDestroyed()) return;
  win.webContents.send('state', getState());
}

function updateHomeBackgrounds() {
  const backgroundUrl = Object.prototype.hasOwnProperty.call(settings, 'panelBackgroundImageUrl')
    ? settings.panelBackgroundImageUrl || null
    : settings.backgroundImageUrl || null;
  tabs.forEach((tab) => {
    const webContents = tab.view.webContents;
    if (webContents.getURL() === HOME) {
      webContents.send('appearance:background', backgroundUrl);
    }
  });
}

function activate(id) {
  const t = tabs.get(id);
  if (!t) return;
  const prev = activeTab();
  if (splitId === id && prev && prev.id !== id) splitId = prev.id;
  const split = splitId ? tabs.get(splitId) : null;
  if (split && split.id !== id) win.contentView.removeChildView(split.view);
  if (prev && prev.id !== id && (!split || prev.id !== split.id)) {
    win.contentView.removeChildView(prev.view);
  }
  if (!prev || prev.id !== id) win.contentView.addChildView(t.view);
  if (split && split.id !== id) {
    win.contentView.addChildView(split.view);
  }
  activeId = id;
  layout();
  broadcast();
}

function createTab(url = HOME, spaceId = 'home') {
  const id = nextId++;
  const view = new WebContentsView({
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
      preload: path.join(__dirname, '7ash-preload.js'),
    },
  });
  const wc = view.webContents;
  const tab = { id, view, spaceId, pinned: false, title: 'New Tab', url };
  tabs.set(id, tab);

  const blockUnsupportedNavigation = (event, targetUrl) => {
    if (isAllowedTabNavigation(targetUrl)) return;
    event.preventDefault();
    console.warn('Blocked unsupported tab navigation:', targetUrl);
  };
  wc.on('will-navigate', blockUnsupportedNavigation);
  wc.on('will-redirect', blockUnsupportedNavigation);

  wc.on('page-title-updated', (_e, title) => {
    tab.title = title;
    broadcast();
  });

  const sync = () => {
    tab.url = wc.getURL();
    broadcast();
  };
  wc.on('did-navigate', sync);
  wc.on('did-navigate-in-page', sync);
  wc.on('dom-ready', () => customizeDuckDuckGoPage(wc));
  wc.on('did-navigate', () => {
    const currentUrl = wc.getURL();
    if (!currentUrl || currentUrl.startsWith('chrome://') || currentUrl.startsWith('file://')) return;
    const query = (() => {
      try { return new URL(currentUrl).searchParams.get('q'); } catch { return ''; }
    })();
    history.unshift({ id: `${Date.now()}-${id}`, title: query || tab.title || currentUrl, url: currentUrl, at: Date.now() });
    history.splice(100);
  });

  // Links that try to open a new window become new tabs in the same space
  wc.setWindowOpenHandler(({ url: newUrl }) => {
    if (!isAllowedWebUrl(newUrl)) {
      console.warn('Blocked unsupported popup navigation:', newUrl);
      return { action: 'deny' };
    }
    createTab(newUrl, tab.spaceId);
    return { action: 'deny' };
  });

  wc.on('context-menu', (_event, params) => {
    if (!params.linkURL) return;
    let targetUrl;
    try {
      targetUrl = new URL(params.linkURL);
    } catch {
      return;
    }
    if (!['http:', 'https:'].includes(targetUrl.protocol)) return;
    Menu.buildFromTemplate([
      {
        label: 'Peek / Glance link',
        click: () => previewLink(targetUrl.href, tab.spaceId),
      },
      {
        label: 'Open link in new tab',
        click: () => createTab(targetUrl.href, tab.spaceId),
      },
    ]).popup({ window: win });
  });

  load(wc, url);
  activate(id);
  return id;
}

function previewLink(url, spaceId) {
  let targetUrl;
  try {
    targetUrl = new URL(url);
  } catch {
    return;
  }
  if (!['http:', 'https:'].includes(targetUrl.protocol)) return;

  const current = activeTab();
  if (!current) {
    createTab(targetUrl.href, spaceId);
    return;
  }

  if (splitId && tabs.has(splitId)) {
    win.contentView.removeChildView(tabs.get(splitId).view);
  }
  splitId = null;
  const currentId = current.id;
  const previewId = createTab(targetUrl.href, current.spaceId || spaceId);
  splitId = previewId;
  activate(currentId);
}

function closeTab(id) {
  const t = tabs.get(id);
  if (!t) return;
  const wasActive = activeId === id;
  const wasSplit = splitId === id;
  const remainingSplitId = !wasSplit && splitId && tabs.has(splitId) ? splitId : null;

  if (wasActive || wasSplit) win.contentView.removeChildView(t.view);
  if (wasSplit || wasActive) splitId = null;
  tabs.delete(id);
  t.view.webContents.close();

  if (wasActive) {
    activeId = null;
    const next = (remainingSplitId && tabs.get(remainingSplitId))
      || [...tabs.values()].find(x => x.spaceId === t.spaceId);
    if (next) activate(next.id);
    else createTab(HOME, t.spaceId);
  } else {
    broadcast();
  }
  saveSettings();
}

function createWindow() {
  panelOpen = false;
  win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 720,
    minHeight: 500,
    title: '7ash Browser',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webSecurity: true,
    },
  });
  win.maximize();
  syncZenSidebarHoverTracking();

  win.on('resize', layout);
  win.on('blur', () => {
    zenSidebarSurfaceHovered = false;
    setZenSidebarExpanded(false);
  });
  win.on('closed', () => {
    if (zenSidebarHoverTimer) clearInterval(zenSidebarHoverTimer);
    zenSidebarHoverTimer = null;
    stopSidebarWidthAnimation();
    zenSidebarSurfaceHovered = false;
    win = null;
    panelOpen = false;
    tabs.clear();
    activeId = null;
    splitId = null;
  });

  const sidebarUrl = pathToFileURL(path.join(__dirname, 'src', 'index.html')).href;
  const blockExternalSidebarNavigation = (event, targetUrl) => {
    if (targetUrl === sidebarUrl) return;
    event.preventDefault();
    console.warn('Blocked navigation away from the browser interface:', targetUrl);
  };
  win.webContents.on('will-navigate', blockExternalSidebarNavigation);
  win.webContents.on('will-redirect', blockExternalSidebarNavigation);
  win.webContents.setWindowOpenHandler(({ url }) => {
    console.warn('Blocked popup from the browser interface:', url);
    return { action: 'deny' };
  });

  // Create the first tab only after the sidebar UI has loaded
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('zen-sidebar-hover', zenSidebarExpanded);
    if (tabs.size === 0) {
      const url = pendingExternalUrl || HOME;
      pendingExternalUrl = null;
      createTab(url, 'home');
    } else if (pendingExternalUrl) {
      const url = pendingExternalUrl;
      pendingExternalUrl = null;
      openExternalUrl(url);
    } else broadcast();
  });

  win.loadFile(path.join(__dirname, 'src', 'index.html'));
}

function buildMenu() {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    { label: app.name, submenu: [{ role: 'quit' }] },
    {
      label: 'File',
      submenu: [
        {
          label: 'New Tab',
          accelerator: 'CmdOrCtrl+T',
          click: () => {
            const t = activeTab();
            createTab(HOME, t ? t.spaceId : 'home');
          },
        },
        {
          label: 'Close Tab',
          accelerator: 'CmdOrCtrl+W',
          click: () => { if (activeId) closeTab(activeId); },
        },
        {
          label: 'Focus Address Bar',
          accelerator: 'CmdOrCtrl+L',
          click: () => { if (win) win.webContents.send('focus-address'); },
        },
      ],
    },
    { role: 'editMenu' },
    { role: 'viewMenu' },
    { role: 'windowMenu' },
  ]));
}

// IPC from the sidebar UI
ipcMain.handle('state:get', () => getState());
ipcMain.handle('ai:save-api-key', async (_event, apiKey) => {
  if (typeof apiKey !== 'string' || apiKey.trim().length < 20) {
    throw new Error('Enter a valid Gemini API key.');
  }
  if (!await safeStorage.isAsyncEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable on this device.');
  }
  await fs.promises.writeFile(
    geminiApiKeyPath(),
    await safeStorage.encryptStringAsync(apiKey.trim()),
  );
  return true;
});
ipcMain.handle('ai:clear-api-key', async () => {
  try {
    await fs.promises.unlink(geminiApiKeyPath());
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return true;
});
ipcMain.handle('ai:has-api-key', async () => {
  try {
    await fs.promises.access(geminiApiKeyPath());
    return true;
  } catch (error) {
    if (error.code === 'ENOENT') return false;
    throw error;
  }
});
ipcMain.handle('ai:ask-about-screen', async (_event, prompt) => {
  if (typeof prompt !== 'string' || !prompt.trim()) {
    throw new Error('Enter a question about the current page.');
  }
  if (prompt.length > 4000) {
    throw new Error('Keep your question under 4,000 characters.');
  }
  if (!await safeStorage.isAsyncEncryptionAvailable()) {
    throw new Error('Secure storage is unavailable on this device.');
  }

  let encryptedApiKey;
  try {
    encryptedApiKey = await fs.promises.readFile(geminiApiKeyPath());
  } catch (error) {
    if (error.code === 'ENOENT') {
      throw new Error('Save your Gemini API key before scanning the page.');
    }
    throw error;
  }
  const { result: apiKey } = await safeStorage.decryptStringAsync(encryptedApiKey);
  const tab = activeTab();
  if (!tab || tab.view.webContents.isDestroyed()) {
    throw new Error('There is no active page to scan.');
  }

  const screenshot = await tab.view.webContents.capturePage();
  const imageData = screenshot.toPNG().toString('base64');
  async function createInteraction(model) {
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/interactions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Api-Revision': '2026-05-20',
          'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
          model,
          store: false,
          input: [
            { type: 'text', text: prompt.trim() },
            { type: 'image', mime_type: 'image/png', data: imageData },
          ],
        }),
        signal: AbortSignal.timeout(12000),
      },
    );
    const result = await response.json();
    if (!response.ok) {
      const error = new Error(
        result.error?.message || `Gemini request failed (${response.status}).`,
      );
      error.statusCode = response.status;
      error.apiStatus = result.error?.status;
      throw error;
    }
    return result;
  }

  const freeModels = [
    'gemini-3.6-flash',
    'gemini-3.5-flash-lite',
    'gemini-3.8-flash',
  ];
  const isTemporarilyUnavailable = (error) => (
    error?.name === 'TimeoutError' ||
    (
      [429, 500, 502, 503, 504].includes(error?.statusCode) &&
      /high demand|overload|temporarily unavailable|try again later|capacity/i.test(error.message)
    )
  );
  let result;
  let lastTemporaryError;
  for (const model of freeModels) {
    try {
      result = await createInteraction(model);
      break;
    } catch (error) {
      if (!isTemporarilyUnavailable(error)) throw error;
      lastTemporaryError = error;
      console.warn(`${model} is busy or timed out; trying the next free Gemini model.`);
    }
  }
  if (!result) {
    throw new Error(
      'All free Gemini models are busy or timed out. Please try again later.',
      { cause: lastTemporaryError },
    );
  }

  const modelOutput = result.steps?.slice().reverse()
    .find((step) => step.type === 'model_output');
  const answer = modelOutput?.content
    ?.map((part) => (part.type === 'text' ? part.text : ''))
    .join('')
    .trim();
  if (!answer) throw new Error('Gemini did not return an answer. Please try again.');
  return answer;
});
ipcMain.on('tab:new', (_e, spaceId = 'home') => createTab(HOME, spaceId));
ipcMain.on('duck-ai:open', () => createTab('https://duck.ai', activeTab()?.spaceId || 'home'));
ipcMain.on('tab:activate', (_e, id) => activate(id));
ipcMain.on('tab:close', (_e, id) => closeTab(id));
ipcMain.on('tab:pin', (_e, id) => {
  const t = tabs.get(id);
  if (t) { t.pinned = !t.pinned; saveSettings(); broadcast(); }
});
ipcMain.on('tab:navigate', (_e, { input, spaceId = 'home' }) => {
  const url = toURL(input);
  const t = activeTab();
  if (t) load(t.view.webContents, url);
  else createTab(url, spaceId);
});
ipcMain.on('nav:back', () => {
  const t = activeTab();
  if (!t) return;
  goBack(t.view.webContents);
});
ipcMain.on('nav:forward', () => {
  const t = activeTab();
  if (t) goForward(t.view.webContents);
});
ipcMain.on('nav:reload', () => {
  const t = activeTab();
  if (t) t.view.webContents.reload();
});
ipcMain.on('panel:state', (_event, isOpen) => {
  panelOpen = Boolean(isOpen);
  if (panelOpen && settings.layoutStyle === 'zen') {
    setZenSidebarExpanded(true);
  }
  layout();
});
ipcMain.on('zen-sidebar-surface-hover', (_event, isHovered) => {
  zenSidebarSurfaceHovered = Boolean(isHovered);
  if (zenSidebarSurfaceHovered && settings.layoutStyle === 'zen') {
    setZenSidebarExpanded(true);
  } else {
    checkZenSidebarHover();
  }
});

ipcMain.handle('bookmarks:get', () => bookmarks);
ipcMain.on('bookmark:toggle', (_e, url) => {
  const tab = activeTab();
  if (!url && tab) url = tab.url;
  if (!url) return;
  const existing = bookmarks.findIndex((item) => item.url === url);
  if (existing >= 0) bookmarks.splice(existing, 1);
  else bookmarks.unshift({ title: tab?.title || url, url, at: Date.now() });
  saveSettings();
  broadcast();
});

ipcMain.on('history:clear', () => {
  history.splice(0);
  broadcast();
});

ipcMain.handle('privacy:clear-browsing-data', async () => {
  await Promise.all([
    session.defaultSession.clearStorageData(),
    session.defaultSession.clearCache(),
    session.defaultSession.clearAuthCache(),
  ]);
  history.splice(0);
  downloads.splice(0);
  broadcast();
});

ipcMain.handle('settings:get', () => settings);
ipcMain.handle('settings:open-default-apps', async () => {
  if (process.platform !== 'win32') {
    throw new Error('Windows Default apps settings are only available on Windows.');
  }
  await shell.openExternal('ms-settings:defaultapps');
});
ipcMain.handle('settings:set', (_e, patch) => {
  if ('profileName' in patch) {
    const profileName = typeof patch.profileName === 'string' ? patch.profileName.trim() : '';
    if (!profileName || profileName.length > 40) {
      throw new Error('Enter a profile name with 1 to 40 characters.');
    }
    patch = { ...patch, profileName };
  }
  settings = { ...settings, ...patch };
  if ('blockKnownTrackers' in patch) {
    setAdBlockerEnabled(settings.blockKnownTrackers !== false);
  }
  if (Array.isArray(settings.spaces) && settings.spaces.length > 0) {
    const validSpaceIds = new Set(settings.spaces.map((space) => space.id));
    const fallbackSpaceId = settings.spaces[0].id;
    tabs.forEach((tab) => {
      if (!validSpaceIds.has(tab.spaceId)) tab.spaceId = fallbackSpaceId;
    });
  }
  if ('compactMode' in patch || 'layoutStyle' in patch) {
    updateSidebarWidth();
    syncZenSidebarHoverTracking();
    layout();
  }
  saveSettings();
  broadcast();
  return settings;
});

ipcMain.handle('appearance:choose-background', async (_event, target) => {
  const settingKey = target === 'sidebar'
    ? 'sidebarBackgroundImageUrl'
    : target === 'panel'
      ? 'panelBackgroundImageUrl'
      : null;
  if (!settingKey) throw new Error('Choose a valid browser background area.');

  const result = await dialog.showOpenDialog(win, {
    title: 'Choose browser background',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: BACKGROUND_IMAGE_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  if (!BACKGROUND_IMAGE_EXTENSIONS.includes(extension)) {
    throw new Error('Choose a supported image: JPG, PNG, GIF, WebP, BMP, or AVIF.');
  }
  const sourceStats = await fs.promises.stat(sourcePath);
  if (!sourceStats.isFile()) throw new Error('The selected image is not a file.');

  const backgroundDirectory = path.join(app.getPath('userData'), 'backgrounds');
  await fs.promises.mkdir(backgroundDirectory, { recursive: true });
  const destinationPath = path.join(
    backgroundDirectory,
    `him-${target}-background-${Date.now()}.${extension}`,
  );
  await fs.promises.copyFile(sourcePath, destinationPath);
  settings[settingKey] = pathToFileURL(destinationPath).href;
  saveSettings();
  if (target === 'panel') updateHomeBackgrounds();
  broadcast();
  return settings[settingKey];
});

ipcMain.handle('appearance:clear-background', (_event, target) => {
  const settingKey = target === 'sidebar'
    ? 'sidebarBackgroundImageUrl'
    : target === 'panel'
      ? 'panelBackgroundImageUrl'
      : null;
  if (!settingKey) throw new Error('Choose a valid browser background area.');

  settings[settingKey] = null;
  saveSettings();
  if (target === 'panel') updateHomeBackgrounds();
  broadcast();
  return true;
});

ipcMain.handle('profile:choose-avatar', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose profile photo',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: BACKGROUND_IMAGE_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  if (!BACKGROUND_IMAGE_EXTENSIONS.includes(extension)) {
    throw new Error('Choose a supported image: JPG, PNG, GIF, WebP, BMP, or AVIF.');
  }
  const sourceStats = await fs.promises.stat(sourcePath);
  if (!sourceStats.isFile()) throw new Error('The selected photo is not a file.');

  const profileDirectory = path.join(app.getPath('userData'), 'profile');
  await fs.promises.mkdir(profileDirectory, { recursive: true });
  const destinationPath = path.join(profileDirectory, `him-avatar-${Date.now()}.${extension}`);
  await fs.promises.copyFile(sourcePath, destinationPath);
  settings.profileAvatarUrl = pathToFileURL(destinationPath).href;
  saveSettings();
  broadcast();
  return settings.profileAvatarUrl;
});

ipcMain.handle('profile:clear-avatar', () => {
  settings.profileAvatarUrl = null;
  saveSettings();
  broadcast();
  return true;
});

ipcMain.handle('icons:choose-local', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Choose icon image',
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: BACKGROUND_IMAGE_EXTENSIONS }],
  });
  if (result.canceled || result.filePaths.length === 0) return null;

  const sourcePath = result.filePaths[0];
  const extension = path.extname(sourcePath).slice(1).toLowerCase();
  if (!BACKGROUND_IMAGE_EXTENSIONS.includes(extension)) {
    throw new Error('Choose a supported image: JPG, PNG, GIF, WebP, BMP, or AVIF.');
  }
  const sourceStats = await fs.promises.stat(sourcePath);
  if (!sourceStats.isFile()) throw new Error('The selected icon is not a file.');

  const iconDirectory = path.join(app.getPath('userData'), 'custom-icons');
  await fs.promises.mkdir(iconDirectory, { recursive: true });
  const destinationPath = path.join(iconDirectory, `custom-icon-${Date.now()}.${extension}`);
  await fs.promises.copyFile(sourcePath, destinationPath);
  return pathToFileURL(destinationPath).href;
});

ipcMain.on('tab:split', (_e, id) => {
  if (!tabs.has(id)) return;
  if (splitId === id) {
    win.contentView.removeChildView(tabs.get(id).view);
    splitId = null;
  } else {
    if (id === activeId) return;
    if (splitId && tabs.has(splitId)) {
      win.contentView.removeChildView(tabs.get(splitId).view);
    }
    splitId = id;
    win.contentView.addChildView(tabs.get(id).view);
  }
  layout();
  broadcast();
});

ipcMain.on('gemini:open', () => {
  createTab('https://gemini.google.com/app', activeTab()?.spaceId || 'home');
});

ipcMain.on('gemini:key:open', () => {
  createTab('https://aistudio.google.com/apikey', activeTab()?.spaceId || 'home');
});

ipcMain.handle('extensions:load', async () => {
  const result = await dialog.showOpenDialog(win, {
    title: 'Load unpacked extension',
    properties: ['openDirectory'],
  });
  if (result.canceled || result.filePaths.length === 0) return [];
  const loaded = await session.defaultSession.loadExtension(result.filePaths[0], { allowFileAccess: true });
  extensions = session.defaultSession.getAllExtensions
    ? Object.values(session.defaultSession.getAllExtensions())
    : [loaded];
  broadcast();
  return extensions.map((item) => ({ id: item.id, name: item.name, version: item.version, path: item.path }));
});

ipcMain.handle('extensions:list', () => (
  (session.defaultSession.getAllExtensions ? Object.values(session.defaultSession.getAllExtensions()) : extensions)
    .map((item) => ({ id: item.id, name: item.name, version: item.version, path: item.path }))
));

ipcMain.on('extension:open-store', () => createTab('https://chromewebstore.google.com/', activeTab()?.spaceId || 'home'));

const hasSingleInstanceLock = process.platform !== 'win32' || app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) {
  app.quit();
} else if (process.platform === 'win32') {
  app.on('second-instance', (_event, commandLine) => {
    const url = findExternalUrl(commandLine);
    if (url) openExternalUrl(url);
    if (win) {
      if (win.isMinimized()) win.restore();
      win.show();
      win.focus();
    }
  });
}

app.whenReady().then(() => {
  if (!hasSingleInstanceLock) return;
  loadSettings();
  updateSidebarWidth();
  configurePrivacy();
  if (settings.blockKnownTrackers === false) {
    publishAdBlockerStatus('disabled');
  } else {
    void initializeAdBlocker();
  }
  session.defaultSession.on('will-download', (_event, item) => {
    const download = {
      id: `${Date.now()}-${downloads.length}`,
      filename: item.getFilename(),
      url: item.getURL(),
      state: 'progressing',
      received: 0,
      total: item.getTotalBytes(),
    };
    downloads.unshift(download);
    item.on('updated', () => {
      download.received = item.getReceivedBytes();
      download.state = item.isPaused() ? 'paused' : item.getState();
      broadcast();
    });
    item.on('done', () => {
      download.state = item.getState();
      download.received = item.getReceivedBytes();
      download.path = item.getSavePath();
      broadcast();
    });
  });
  buildMenu();
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});