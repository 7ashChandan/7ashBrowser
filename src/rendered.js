const $ = (id) => document.getElementById(id);

const els = {
  pinned: $('pinned-list'),
  tabs: $('tab-list'),
  spaces: $('space-bar'),
  address: $('address-input'),
  form: $('address-form'),
  btnBack: $('btn-back'),
  btnForward: $('btn-forward'),
  btnReload: $('btn-reload'),
  btnNewTab: $('btn-new-tab'),
  btnAddPinned: $('btn-add-pinned'),
  btnAddFrequentSite: $('btn-add-frequent-site'),
};

const DEFAULT_SPACES = [
  { id: 'home', name: 'Personal', letter: 'P', color: '#7658c8' },
  { id: 'work', name: 'Work', letter: 'W', color: '#4886b8' },
];

const THEME_PRESETS = {
  cloud: { accent: '#7658c8' },
  plain: { accent: '#555b68' },
  dark: { accent: '#a58bff' },
  'arc-light': { accent: '#6f55d9' },
  'arc-dark': { accent: '#a58bff' },
  'zen-sakura': { accent: '#c75f95' },
  'zen-forest': { accent: '#47866b' },
  'zen-midnight': { accent: '#62a6d9' },
};

let currentSpace = 'home';
let browserState = { tabs: [], activeId: null };
let zenSidebarHovered = false;
let panelTabsListenerAttached = false;
let lastActiveTabId = null;
const knownTabIds = new Set();

function themeAccent(theme) {
  return THEME_PRESETS[theme]?.accent || THEME_PRESETS.cloud.accent;
}

function syncMoreMenuSettings(settings) {
  const theme = settings.theme || 'cloud';
  $('menu-theme').value = theme;
  $('menu-accent').value = /^#[0-9a-f]{6}$/i.test(settings.accentColor || '')
    ? settings.accentColor
    : themeAccent(theme);
  const layoutStyle = ['chrome', 'arc', 'zen'].includes(settings.layoutStyle)
    ? settings.layoutStyle
    : 'arc';
  $('menu-compact').checked = layoutStyle === 'zen' ||
    (layoutStyle === 'arc' && settings.compactMode === true);
  $('menu-compact').disabled = layoutStyle !== 'arc';
  $('menu-animations').checked = settings.tabAnimations !== false;
  $('menu-trackers').checked = settings.blockKnownTrackers !== false;
  $('menu-privacy-signals').checked = settings.sendPrivacySignals !== false;
}

function getSpaces() {
  const savedSpaces = browserState.settings?.spaces;
  if (!Array.isArray(savedSpaces)) return DEFAULT_SPACES;
  const validSpaces = savedSpaces.filter((space) => (
    space &&
    typeof space.id === 'string' &&
    typeof space.name === 'string' &&
    typeof space.color === 'string' &&
    /^#[0-9a-f]{6}$/i.test(space.color)
  ));
  return validSpaces.length ? validSpaces : DEFAULT_SPACES;
}

function getSavedBackground(settingKey) {
  const settings = browserState.settings || {};
  return Object.prototype.hasOwnProperty.call(settings, settingKey)
    ? settings[settingKey]
    : settings.backgroundImageUrl;
}

function renderProfile() {
  const settings = browserState.settings || {};
  const savedName = typeof settings.profileName === 'string' ? settings.profileName.trim() : '';
  const displayName = savedName || 'My Browser';
  const avatar = $('profile-avatar');
  const initials = $('profile-initials');
  const avatarUrl = typeof settings.profileAvatarUrl === 'string' &&
    settings.profileAvatarUrl.startsWith('file:')
    ? settings.profileAvatarUrl
    : null;

  $('btn-profile-name').textContent = displayName;
  $('btn-profile-name').title = 'Edit local profile';
  $('btn-profile').title = `Edit local profile for ${displayName}`;
  if (avatarUrl) {
    avatar.src = avatarUrl;
    avatar.hidden = false;
    initials.hidden = true;
  } else if (savedName) {
    avatar.hidden = true;
    initials.textContent = savedName.split(/\s+/).slice(0, 2).map((part) => part.charAt(0)).join('').toUpperCase();
    initials.hidden = false;
  } else {
    avatar.src = 'duck-logo.jpeg';
    avatar.hidden = false;
    initials.hidden = true;
  }
}

function applyBrowserState(newState) {
  browserState = newState;
  renderProfile();
  syncMoreMenuSettings(browserState.settings || {});
  applyTheme(
    browserState.settings?.theme || 'cloud',
    browserState.settings?.accentColor,
    browserState.settings?.tabAnimations !== false,
    getSavedBackground('sidebarBackgroundImageUrl'),
    getSavedBackground('panelBackgroundImageUrl'),
  );
  render();

  const panel = $('feature-panel');
  const backdrop = $('backdrop');
  const panelTitle = $('panel-title');
  const panelContent = $('panel-content');
  const panelTabs = $('panel-tabs');
  const browserMenu = $('browser-menu');
  const menuStatus = $('browser-menu-status');

  function openPanel(name = 'bookmarks', settingsCategory = 'general') {
    browserMenu.classList.add('hidden');
    $('btn-more').setAttribute('aria-expanded', 'false');
    panel.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    window.browser.setPanelOpen(true);
    showPanel(name, settingsCategory);
  }

  $('btn-profile').onclick = () => openPanel('settings', 'profile');
  $('btn-profile-name').onclick = () => openPanel('settings', 'profile');

  function closeMoreMenu() {
    browserMenu.classList.add('hidden');
    backdrop.classList.add('hidden');
    $('btn-more').setAttribute('aria-expanded', 'false');
    window.browser.setPanelOpen(false);
  }

  function openMoreMenu() {
    if (!browserMenu.classList.contains('hidden')) {
      closeMoreMenu();
      return;
    }
    panel.classList.add('hidden');
    syncMoreMenuSettings(browserState.settings || {});
    menuStatus.textContent = '';
    browserMenu.classList.remove('hidden');
    backdrop.classList.remove('hidden');
    $('btn-more').setAttribute('aria-expanded', 'true');
    window.browser.setPanelOpen(true);
  }

  function closePanel() {
    panel.classList.add('hidden');
    browserMenu.classList.add('hidden');
    backdrop.classList.add('hidden');
    $('btn-more').setAttribute('aria-expanded', 'false');
    window.browser.setPanelOpen(false);
  }

  $('btn-more').onclick = openMoreMenu;
  $('btn-library').onclick = () => openPanel('bookmarks');
  $('btn-search-tabs').onclick = () => openPanel('tabs');
  $('btn-manage-spaces').onclick = () => openPanel('spaces');
  $('btn-panel-back').onclick = closePanel;
  document.querySelectorAll('[data-open-panel]').forEach((button) => {
    button.onclick = () => openPanel(button.dataset.openPanel);
  });
  document.querySelectorAll('[data-open-duck-ai]').forEach((button) => {
    button.onclick = () => window.browser.openDuckAI();
  });
  $('btn-close-panel').onclick = closePanel;
  backdrop.onclick = () => {
    if (!browserMenu.classList.contains('hidden')) closeMoreMenu();
    else closePanel();
  };

  async function saveMenuSetting(patch) {
    menuStatus.textContent = 'Saving…';
    try {
      await window.browser.setSettings(patch);
      menuStatus.textContent = 'Saved.';
    } catch (error) {
      console.error('Could not save menu setting:', error);
      menuStatus.textContent = 'Could not save this setting.';
    }
  }

  $('menu-theme').onchange = () => {
    $('menu-accent').value = themeAccent($('menu-theme').value);
    saveMenuSetting({ theme: $('menu-theme').value, accentColor: $('menu-accent').value });
  };
  $('menu-accent').onchange = () => saveMenuSetting({ accentColor: $('menu-accent').value });
  $('menu-compact').onchange = () => saveMenuSetting({ compactMode: $('menu-compact').checked });
  $('menu-animations').onchange = () => saveMenuSetting({ tabAnimations: $('menu-animations').checked });
  $('menu-trackers').onchange = () => saveMenuSetting({ blockKnownTrackers: $('menu-trackers').checked });
  $('menu-privacy-signals').onchange = () => saveMenuSetting({ sendPrivacySignals: $('menu-privacy-signals').checked });

  browserMenu.querySelectorAll('[data-menu-action]').forEach((button) => {
    button.onclick = async () => {
      const action = button.dataset.menuAction;
      if (action === 'new-tab') {
        closeMoreMenu();
        newTab();
      } else if (action === 'command' || action === 'spaces' || action === 'settings') {
        openPanel(action === 'command' ? 'command' : action);
      } else if (action === 'clear-data') {
        if (!window.confirm('Clear cookies, site data, cache, and in-memory history?')) return;
        try {
          await window.browser.clearBrowsingData();
          menuStatus.textContent = 'Browsing data cleared.';
        } catch (error) {
          console.error('Could not clear browsing data:', error);
          menuStatus.textContent = 'Could not clear browsing data.';
        }
      }
    };
  });

  if (!panelTabsListenerAttached) {
    panelTabs.addEventListener('click', (event) => {
      const button = event.target.closest('[data-panel]');
      if (!button) return;
      showPanel(button.dataset.panel);
    });
    panelTabsListenerAttached = true;
  }

  function activatePanelButton(name) {
    panelTabs.querySelectorAll('[data-panel]').forEach((button) => {
      button.classList.toggle('active', button.dataset.panel === name);
    });
  }

  function listItem(title, subtitle, onClick, extraButton) {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.onclick = onClick;

    const copy = document.createElement('div');
    copy.className = 'library-item-copy';
    copy.innerHTML = `<strong></strong><small></small>`;
    copy.querySelector('strong').textContent = title;
    copy.querySelector('small').textContent = subtitle;
    item.appendChild(copy);

    if (extraButton) item.appendChild(extraButton);
    return item;
  }

  function renderBookmarks() {
    panelContent.innerHTML = '';
    if (!browserState.bookmarks?.length) {
      panelContent.innerHTML = '<div class="panel-empty">No bookmarks yet.</div>';
      return;
    }
    browserState.bookmarks.forEach((bookmark) => {
      panelContent.appendChild(listItem(bookmark.title, bookmark.url, () => {
        window.browser.navigate({ input: bookmark.url, spaceId: currentSpace });
        closePanel();
      }));
    });
  }

  function renderHistory() {
    panelContent.innerHTML = '';
    const clear = document.createElement('button');
    clear.className = 'action-button';
    clear.textContent = 'Clear history';
    clear.onclick = () => window.browser.clearHistory();
    panelContent.appendChild(clear);

    if (!browserState.history?.length) {
      panelContent.innerHTML += '<div class="panel-empty">No recent history.</div>';
      return;
    }
    browserState.history.forEach((entry) => {
      panelContent.appendChild(listItem(entry.title, entry.url, () => {
        window.browser.navigate({ input: entry.url, spaceId: currentSpace });
        closePanel();
      }));
    });
  }

  function renderDownloads() {
    panelContent.innerHTML = '';
    if (!browserState.downloads?.length) {
      panelContent.innerHTML = '<div class="panel-empty">No downloads yet.</div>';
      return;
    }
    browserState.downloads.forEach((download) => {
      panelContent.appendChild(listItem(download.filename, `${download.state} · ${download.path || download.url}`));
    });
  }

  function renderTabSearch() {
    panelContent.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'tab-search';
    input.placeholder = 'Search tabs';

    const results = document.createElement('div');
    results.style.marginTop = '8px';

    function update() {
      results.innerHTML = '';
      const query = input.value.toLowerCase();
      browserState.tabs
        .filter((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(query))
        .forEach((tab) => {
          let displayTitle = tab.title || 'New Tab';
          try {
            const url = new URL(tab.url);
            const searchQuery = url.searchParams.get('q');
            if (searchQuery) displayTitle = `Search: ${searchQuery}`;
          } catch {}
          const split = document.createElement('button');
          split.className = 'action-button';
          split.textContent = browserState.splitId === tab.id ? 'Unsplit' : 'Split';
          split.onclick = (event) => {
            event.stopPropagation();
            window.browser.splitTab(tab.id);
          };
          results.appendChild(listItem(displayTitle, tab.url || '', () => {
            window.browser.activateTab(tab.id);
            closePanel();
          }, split));
        });
    }

    input.oninput = update;
    panelContent.append(input, results);
    update();
    setTimeout(() => input.focus(), 0);
  }

  function renderCommandBar() {
    panelContent.innerHTML = '';
    const input = document.createElement('input');
    input.className = 'tab-search';
    input.placeholder = 'Search tabs, bookmarks, or actions';
    input.setAttribute('aria-label', 'Search tabs, bookmarks, or actions');

    const results = document.createElement('div');
    results.style.marginTop = '8px';
    const actions = [
      {
        title: 'New tab',
        subtitle: 'Open a fresh tab',
        run: () => window.browser.newTab(currentSpace),
      },
      {
        title: 'Toggle compact sidebar',
        subtitle: 'Zen-style compact mode',
        run: () => window.browser.setSettings({
          compactMode: browserState.settings?.compactMode !== true,
        }),
      },
      {
        title: 'Manage spaces',
        subtitle: 'Add or customize workspaces',
        run: () => showPanel('spaces'),
        keepOpen: true,
      },
      {
        title: 'Open settings',
        subtitle: 'Appearance and privacy',
        run: () => showPanel('settings'),
        keepOpen: true,
      },
      {
        title: 'Bookmark current page',
        subtitle: 'Save or remove the current bookmark',
        run: () => window.browser.toggleBookmark(),
      },
    ];

    function update() {
      results.replaceChildren();
      const query = input.value.trim().toLowerCase();
      let count = 0;
      const appendAction = (title, subtitle, onClick, keepOpen = false) => {
        results.appendChild(listItem(title, subtitle, () => {
          onClick();
          if (!keepOpen) closePanel();
        }));
        count += 1;
      };

      actions
        .filter((action) => `${action.title} ${action.subtitle}`.toLowerCase().includes(query))
        .forEach((action) => appendAction(action.title, action.subtitle, action.run, action.keepOpen));

      browserState.tabs
        .filter((tab) => `${tab.title} ${tab.url}`.toLowerCase().includes(query))
        .forEach((tab) => appendAction(tab.title || 'New Tab', tab.url || '', () => {
          window.browser.activateTab(tab.id);
        }));

      (browserState.bookmarks || [])
        .filter((bookmark) => `${bookmark.title} ${bookmark.url}`.toLowerCase().includes(query))
        .forEach((bookmark) => appendAction(bookmark.title, bookmark.url, () => {
          window.browser.navigate({ input: bookmark.url, spaceId: currentSpace });
        }));

      if (!count) {
        const empty = document.createElement('div');
        empty.className = 'panel-empty';
        empty.textContent = 'No matching commands, tabs, or bookmarks.';
        results.appendChild(empty);
      }
    }

    input.addEventListener('input', update);
    input.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' || !input.value.trim()) return;
      event.preventDefault();
      window.browser.navigate({ input: input.value.trim(), spaceId: currentSpace });
      closePanel();
    });
    panelContent.append(input, results);
    update();
    setTimeout(() => input.focus(), 0);
  }

  function renderWorkspaces() {
    panelContent.innerHTML = '';
    const draft = getSpaces().map((space) => ({ ...space }));
    const list = document.createElement('div');
    list.className = 'workspace-list';
    const status = document.createElement('p');
    status.className = 'workspace-status';
    status.setAttribute('aria-live', 'polite');

    function drawRows() {
      list.replaceChildren();
      draft.forEach((space, index) => {
        const row = document.createElement('div');
        row.className = 'workspace-row';

        const name = document.createElement('input');
        name.className = 'settings-input workspace-name';
        name.value = space.name;
        name.maxLength = 24;
        name.setAttribute('aria-label', `Name for ${space.name}`);
        name.addEventListener('input', () => { space.name = name.value; });

        const color = document.createElement('input');
        color.className = 'workspace-color';
        color.type = 'color';
        color.value = space.color || (index === 0 ? '#7658c8' : '#4886b8');
        color.setAttribute('aria-label', `Color for ${space.name}`);
        color.addEventListener('input', () => { space.color = color.value; });

        const icon = document.createElement('button');
        icon.className = 'workspace-icon';
        icon.type = 'button';
        icon.title = `Choose a logo for ${space.name}`;
        if (typeof space.iconUrl === 'string' && space.iconUrl.startsWith('file:')) {
          const image = document.createElement('img');
          image.src = space.iconUrl;
          image.alt = '';
          icon.appendChild(image);
        } else {
          icon.textContent = 'Icon';
        }
        icon.addEventListener('click', async () => {
          icon.disabled = true;
          try {
            const iconUrl = await window.browser.chooseCustomIcon();
            if (!iconUrl) return;
            space.iconUrl = iconUrl;
            status.textContent = `Logo selected for ${space.name}. Save spaces to apply it.`;
            drawRows();
          } catch (error) {
            console.error('Could not choose workspace logo:', error);
            status.textContent = error.message || 'Could not choose workspace logo.';
          } finally {
            icon.disabled = false;
          }
        });

        const use = document.createElement('button');
        use.className = 'workspace-use';
        use.type = 'button';
        use.textContent = 'Use';
        use.title = `Switch to ${space.name}`;
        use.addEventListener('click', () => {
          switchSpace(space.id);
          closePanel();
        });

        row.append(name, color, icon, use);
        if (typeof space.iconUrl === 'string' && space.iconUrl.startsWith('file:')) {
          const resetIcon = document.createElement('button');
          resetIcon.className = 'workspace-reset-icon';
          resetIcon.type = 'button';
          resetIcon.textContent = '↺';
          resetIcon.title = `Use the letter logo for ${space.name}`;
          resetIcon.setAttribute('aria-label', resetIcon.title);
          resetIcon.addEventListener('click', () => {
            space.iconUrl = null;
            status.textContent = `Custom logo removed for ${space.name}. Save spaces to apply it.`;
            drawRows();
          });
          row.appendChild(resetIcon);
        }
        if (space.id !== 'home' && space.id !== 'work') {
          const remove = document.createElement('button');
          remove.className = 'workspace-remove';
          remove.type = 'button';
          remove.textContent = '×';
          remove.title = `Remove ${space.name}`;
          remove.setAttribute('aria-label', `Remove ${space.name}`);
          remove.addEventListener('click', () => {
            draft.splice(index, 1);
            drawRows();
          });
          row.appendChild(remove);
        }
        list.appendChild(row);
      });
    }

    const add = document.createElement('button');
    add.className = 'action-button';
    add.textContent = 'Add workspace';
    add.onclick = () => {
      draft.push({
        id: `space-${Date.now()}-${draft.length}`,
        name: `Space ${draft.length + 1}`,
        color: '#6d58bb',
        iconUrl: null,
      });
      drawRows();
    };

    const save = document.createElement('button');
    save.className = 'action-button workspace-save';
    save.textContent = 'Save spaces';
    save.onclick = async () => {
      const updatedSpaces = draft.map((space) => ({
        id: space.id,
        name: space.name.trim(),
        color: space.color,
        iconUrl: typeof space.iconUrl === 'string' && space.iconUrl.startsWith('file:')
          ? space.iconUrl
          : null,
      }));
      if (updatedSpaces.some((space) => !space.name)) {
        status.textContent = 'Workspace names cannot be empty.';
        return;
      }
      const uniqueNames = new Set(updatedSpaces.map((space) => space.name.toLowerCase()));
      if (uniqueNames.size !== updatedSpaces.length) {
        status.textContent = 'Workspace names must be unique.';
        return;
      }

      save.disabled = true;
      try {
        await window.browser.setSettings({ spaces: updatedSpaces });
        status.textContent = 'Spaces saved. Each workspace keeps its own tabs.';
      } catch (error) {
        console.error('Could not save workspaces:', error);
        status.textContent = 'Could not save spaces. See the app logs for details.';
      } finally {
        save.disabled = false;
      }
    };

    const note = document.createElement('p');
    note.className = 'workspace-note';
    note.textContent = 'Switch workspaces below or use the icon button to change a bottom-left logo.';
    drawRows();
    panelContent.append(note, list, add, save, status);
  }

  function renderExtensions() {
    panelContent.innerHTML = '';
    const load = document.createElement('button');
    load.className = 'action-button';
    load.textContent = 'Load unpacked extension';
    load.onclick = async () => {
      await window.browser.loadExtension();
    };

    const store = document.createElement('button');
    store.className = 'action-button';
    store.style.marginLeft = '8px';
    store.textContent = 'Open Chrome Web Store';
    store.onclick = () => window.browser.openExtensionStore();

    panelContent.append(load, store);
    const note = document.createElement('div');
    note.className = 'panel-empty';
    note.textContent = 'Unpacked Manifest V2/V3 extensions can be loaded locally. Electron may not support direct Chrome Web Store installation.';
    panelContent.append(note);
  }

  function renderSettings(initialCategory = 'general') {
    panelContent.innerHTML = '';
    const categoryNav = document.createElement('nav');
    categoryNav.className = 'settings-nav';
    const categoryContent = document.createElement('div');
    categoryContent.className = 'settings-category-content';
    panelContent.append(categoryNav, categoryContent);

    const categories = [
      ['general', 'General'],
      ['profile', 'Profile'],
      ['layout', 'Layout'],
      ['appearance', 'Appearance'],
      ['spaces', 'Spaces'],
      ['privacy', 'Privacy'],
      ['shortcuts', 'Shortcuts'],
    ];
    let activeCategory = categories.some(([id]) => id === initialCategory)
      ? initialCategory
      : 'general';

    function settingHeading(title, description) {
      const heading = document.createElement('div');
      heading.className = 'settings-page-heading';
      const titleElement = document.createElement('h3');
      titleElement.textContent = title;
      const descriptionElement = document.createElement('p');
      descriptionElement.textContent = description;
      heading.append(titleElement, descriptionElement);
      return heading;
    }

    function settingToggle(text, checked, className = 'setting-checkbox') {
      const label = document.createElement('label');
      label.className = className;
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = checked;
      const copy = document.createElement('span');
      copy.textContent = text;
      label.append(input, copy);
      return { label, input };
    }

    function createBackgroundSection(title, description, settingKey, target) {
      const settings = browserState.settings || {};
      const imageUrl = Object.prototype.hasOwnProperty.call(settings, settingKey)
        ? settings[settingKey]
        : settings.backgroundImageUrl;
      const section = document.createElement('section');
      section.className = 'appearance-background';
      const heading = document.createElement('h4');
      heading.textContent = title;
      const details = document.createElement('p');
      details.textContent = description;
      const preview = document.createElement('img');
      preview.className = 'background-preview';
      preview.alt = `${title} preview`;
      preview.hidden = !imageUrl;
      if (imageUrl) preview.src = imageUrl;

      const actions = document.createElement('div');
      actions.className = 'background-actions';
      const choose = document.createElement('button');
      choose.className = 'action-button';
      choose.textContent = 'Choose photo…';
      const clear = document.createElement('button');
      clear.className = 'action-button';
      clear.textContent = 'Remove';
      clear.disabled = !imageUrl;
      const status = document.createElement('p');
      status.className = 'settings-status';
      status.setAttribute('aria-live', 'polite');
      choose.onclick = async () => {
        choose.disabled = true;
        try {
          const chosenUrl = await window.browser.chooseBackground(target);
          if (chosenUrl) {
            preview.src = chosenUrl;
            preview.hidden = false;
            clear.disabled = false;
            status.textContent = 'Background applied.';
          }
        } catch (error) {
          console.error(`Could not set ${title.toLowerCase()} background:`, error);
          status.textContent = error.message || 'Could not set background.';
        } finally {
          choose.disabled = false;
        }
      };
      clear.onclick = async () => {
        clear.disabled = true;
        try {
          await window.browser.clearBackground(target);
          preview.removeAttribute('src');
          preview.hidden = true;
          status.textContent = 'Custom background removed.';
        } catch (error) {
          console.error(`Could not remove ${title.toLowerCase()} background:`, error);
          status.textContent = 'Could not remove background.';
          clear.disabled = false;
        }
      };
      actions.append(choose, clear);
      section.append(heading, details, preview, actions, status);
      return section;
    }

    function renderCategory(name) {
      activeCategory = name;
      categoryNav.querySelectorAll('[data-settings-category]').forEach((button) => {
        button.classList.toggle('active', button.dataset.settingsCategory === name);
      });
      categoryContent.replaceChildren();

      if (name === 'general') {
        categoryContent.appendChild(settingHeading(
          'General',
          'Basic browser behavior and defaults.',
        ));
        const defaults = document.createElement('div');
        defaults.className = 'settings-info-list';
        defaults.innerHTML = '<div><strong>New tabs</strong><span>Open the 7ash start page</span></div><div><strong>Startup</strong><span>Start fresh; previous pages are not restored</span></div><div><strong>Search engine</strong><span>DuckDuckGo</span></div>';
        categoryContent.appendChild(defaults);
        if (window.browser.isWindows) {
          const defaultBrowser = document.createElement('div');
          defaultBrowser.className = 'settings-info-list settings-shortcuts';
          defaultBrowser.innerHTML = '<div><strong>Default browser</strong><span>Choose 7ash Browser in Windows Settings</span></div>';
          const openSettings = document.createElement('button');
          openSettings.className = 'action-button';
          openSettings.textContent = 'Open Windows Default apps';
          const status = document.createElement('p');
          status.className = 'settings-status';
          status.setAttribute('aria-live', 'polite');
          openSettings.onclick = async () => {
            openSettings.disabled = true;
            try {
              await window.browser.openDefaultAppsSettings();
              status.textContent = 'Select 7ash Browser, then set HTTP and HTTPS.';
            } catch (error) {
              console.error('Could not open Windows Default apps settings:', error);
              status.textContent = error.message || 'Could not open Windows Default apps settings.';
            } finally {
              openSettings.disabled = false;
            }
          };
          categoryContent.append(defaultBrowser, openSettings, status);
        }
        return;
      }

      if (name === 'profile') {
        categoryContent.appendChild(settingHeading(
          'Local profile',
          'Your display name and photo stay on this device. You are not signed in, and this profile does not sync.',
        ));
        const nameLabel = document.createElement('label');
        nameLabel.className = 'profile-setting-label';
        nameLabel.textContent = 'Display name';
        const nameInput = document.createElement('input');
        nameInput.className = 'settings-input';
        nameInput.type = 'text';
        nameInput.maxLength = 40;
        nameInput.required = true;
        nameInput.placeholder = 'Enter your name';
        nameInput.value = browserState.settings?.profileName || '';
        nameLabel.appendChild(nameInput);

        const avatarPreview = document.createElement('img');
        avatarPreview.className = 'profile-settings-avatar';
        avatarPreview.alt = 'Profile photo preview';
        const currentAvatar = browserState.settings?.profileAvatarUrl;
        avatarPreview.hidden = typeof currentAvatar !== 'string' || !currentAvatar.startsWith('file:');
        if (!avatarPreview.hidden) avatarPreview.src = currentAvatar;

        const avatarActions = document.createElement('div');
        avatarActions.className = 'background-actions';
        const chooseAvatar = document.createElement('button');
        chooseAvatar.className = 'action-button';
        chooseAvatar.textContent = 'Choose photo…';
        const clearAvatar = document.createElement('button');
        clearAvatar.className = 'action-button';
        clearAvatar.textContent = 'Remove photo';
        clearAvatar.disabled = avatarPreview.hidden;
        const status = document.createElement('p');
        status.className = 'settings-status';
        status.setAttribute('aria-live', 'polite');
        chooseAvatar.onclick = async () => {
          chooseAvatar.disabled = true;
          try {
            const imageUrl = await window.browser.chooseProfileAvatar();
            if (imageUrl) {
              avatarPreview.src = imageUrl;
              avatarPreview.hidden = false;
              clearAvatar.disabled = false;
              status.textContent = 'Profile photo saved on this device.';
            }
          } catch (error) {
            console.error('Could not save profile photo:', error);
            status.textContent = error.message || 'Could not save profile photo.';
          } finally {
            chooseAvatar.disabled = false;
          }
        };
        clearAvatar.onclick = async () => {
          clearAvatar.disabled = true;
          try {
            await window.browser.clearProfileAvatar();
            avatarPreview.removeAttribute('src');
            avatarPreview.hidden = true;
            status.textContent = 'Profile photo removed.';
          } catch (error) {
            console.error('Could not remove profile photo:', error);
            status.textContent = 'Could not remove profile photo.';
            clearAvatar.disabled = false;
          }
        };
        avatarActions.append(chooseAvatar, clearAvatar);

        const save = document.createElement('button');
        save.className = 'action-button';
        save.textContent = 'Save profile';
        save.onclick = async () => {
          const profileName = nameInput.value.trim();
          if (!profileName || profileName.length > 40) {
            status.textContent = 'Enter a name with 1 to 40 characters.';
            nameInput.focus();
            return;
          }
          save.disabled = true;
          try {
            await window.browser.setSettings({ profileName });
            status.textContent = 'Profile saved on this device.';
          } catch (error) {
            console.error('Could not save profile:', error);
            status.textContent = error.message || 'Could not save profile.';
          } finally {
            save.disabled = false;
          }
        };
        categoryContent.append(nameLabel, avatarPreview, avatarActions, save, status);
        return;
      }

      if (name === 'appearance') {
        categoryContent.appendChild(settingHeading(
          'Appearance',
          'Personalize the sidebar, colors, and tab motion.',
        ));
        const themeSelect = document.createElement('select');
        themeSelect.className = 'settings-input';
        themeSelect.innerHTML = [
          '<option value="cloud">Cloud</option>',
          '<option value="arc-light">Arc Light</option>',
          '<option value="arc-dark">Arc Dark</option>',
          '<option value="zen-sakura">Zen Sakura</option>',
          '<option value="zen-forest">Zen Forest</option>',
          '<option value="zen-midnight">Zen Midnight</option>',
          '<option value="dark">Dark</option>',
          '<option value="plain">Plain</option>',
        ].join('');
        themeSelect.value = browserState.settings?.theme || 'cloud';

        const accentLabel = document.createElement('label');
        accentLabel.className = 'setting-color-label';
        accentLabel.textContent = 'Accent color';
        const accentInput = document.createElement('input');
        accentInput.className = 'setting-color';
        accentInput.type = 'color';
        accentInput.value = browserState.settings?.accentColor || themeAccent(themeSelect.value);
        accentLabel.appendChild(accentInput);
        themeSelect.addEventListener('change', () => {
          accentInput.value = themeAccent(themeSelect.value);
        });

        const layoutStyle = browserState.settings?.layoutStyle || 'arc';
        const compact = settingToggle(
          'Compact sidebar',
          layoutStyle === 'zen' ||
            (layoutStyle === 'arc' && browserState.settings?.compactMode === true),
        );
        compact.input.disabled = layoutStyle !== 'arc';
        compact.label.title = layoutStyle === 'arc'
          ? ''
          : 'Compact sidebar is controlled by the selected layout.';
        const animations = settingToggle(
          'Animate new and active tabs',
          browserState.settings?.tabAnimations !== false,
        );
        const sidebarBackground = createBackgroundSection(
          'Left sidebar',
          'Choose a photo for the browser sidebar.',
          'sidebarBackgroundImageUrl',
          'sidebar',
        );
        const panelBackground = createBackgroundSection(
          'Main area',
          'Choose a photo for 7ash menus, panels, and the New Tab page.',
          'panelBackgroundImageUrl',
          'panel',
        );

        const status = document.createElement('p');
        status.className = 'settings-status';
        status.setAttribute('aria-live', 'polite');

        const save = document.createElement('button');
        save.className = 'action-button';
        save.textContent = 'Save appearance';
        save.onclick = async () => {
          save.disabled = true;
          try {
            await window.browser.setSettings({
              theme: themeSelect.value,
              accentColor: accentInput.value,
              compactMode: compact.input.checked,
              tabAnimations: animations.input.checked,
            });
            status.textContent = 'Appearance saved.';
          } catch (error) {
            console.error('Could not save appearance settings:', error);
            status.textContent = 'Could not save appearance settings.';
          } finally {
            save.disabled = false;
          }
        };
        categoryContent.append(
          themeSelect,
          accentLabel,
          compact.label,
          animations.label,
          sidebarBackground,
          panelBackground,
          save,
          status,
        );
        return;
      }

      if (name === 'layout') {
        categoryContent.appendChild(settingHeading(
          'Layout',
          'Choose how tabs and browser controls are arranged.',
        ));
        const layoutChoices = [
          {
            id: 'chrome',
            name: 'Chrome',
            description: 'Tabs across the top, with navigation and address controls below.',
          },
          {
            id: 'arc',
            name: 'Arc',
            description: 'Full-height left sidebar with tabs, spaces, and library shortcuts.',
          },
          {
            id: 'zen',
            name: 'Zen',
            description: 'Compact left rail with vertically arranged tabs and controls.',
          },
        ];
        const currentLayout = ['chrome', 'arc', 'zen'].includes(browserState.settings?.layoutStyle)
          ? browserState.settings.layoutStyle
          : 'arc';
        let selectedLayout = currentLayout;
        const choices = document.createElement('div');
        choices.className = 'layout-choices';
        const status = document.createElement('p');
        status.className = 'settings-status';
        status.setAttribute('aria-live', 'polite');

        layoutChoices.forEach((choice) => {
          const button = document.createElement('button');
          button.className = 'layout-choice';
          button.type = 'button';
          button.setAttribute('aria-pressed', String(currentLayout === choice.id));
          const preview = document.createElement('span');
          preview.className = `layout-preview layout-preview-${choice.id}`;
          preview.setAttribute('aria-hidden', 'true');
          const title = document.createElement('strong');
          title.textContent = `${choice.name}-style`;
          const description = document.createElement('span');
          description.textContent = choice.description;
          button.append(preview, title, description);
          button.onclick = async () => {
            choices.querySelectorAll('.layout-choice').forEach((item) => { item.disabled = true; });
            status.textContent = 'Saving layout…';
            try {
              await window.browser.setSettings({ layoutStyle: choice.id });
              selectedLayout = choice.id;
              choices.querySelectorAll('.layout-choice').forEach((item) => {
                const selected = item === button;
                item.classList.toggle('selected', selected);
                item.setAttribute('aria-pressed', String(selected));
              });
              status.textContent = `${choice.name}-style layout applied.`;
            } catch (error) {
              console.error('Could not save layout settings:', error);
              status.textContent = 'Could not save layout. Please try again.';
            } finally {
              choices.querySelectorAll('.layout-choice').forEach((item) => { item.disabled = false; });
            }
          };
          button.classList.toggle('selected', selectedLayout === choice.id);
          choices.appendChild(button);
        });
        categoryContent.append(choices, status);
        return;
      }

      if (name === 'spaces') {
        categoryContent.appendChild(settingHeading(
          'Spaces',
          'Keep work and personal browsing in separate tab sets.',
        ));
        const manage = document.createElement('button');
        manage.className = 'action-button';
        manage.textContent = 'Manage workspaces';
        manage.onclick = () => showPanel('spaces');
        categoryContent.appendChild(manage);
        return;
      }

      if (name === 'privacy') {
        categoryContent.appendChild(settingHeading(
          'Privacy',
          'Block ads and trackers, and clear local browsing data.',
        ));
        const trackers = settingToggle(
          'Block ads and trackers',
          browserState.settings?.blockKnownTrackers !== false,
          'privacy-option',
        );
        const blockerStatus = document.createElement('p');
        blockerStatus.className = 'privacy-note';
        blockerStatus.setAttribute('aria-live', 'polite');
        blockerStatus.textContent = ({
          active: 'Ad and tracker filter lists are active and refresh daily when online.',
          cached: 'Saved ad and tracker filters are active; the latest update could not be downloaded.',
          updating: 'Updating ad and tracker filter lists. Saved filters remain active if available.',
          loading: 'Loading ad and tracker filter lists.',
          fallback: 'Full filter lists are unavailable. Only the built-in known-tracker fallback is active.',
          disabled: 'Ad and tracker blocking is turned off.',
        })[browserState.adBlockerStatus] || 'Ad-blocking status is unavailable.';
        const signals = settingToggle(
          'Send Do Not Track and GPC signals',
          browserState.settings?.sendPrivacySignals !== false,
          'privacy-option',
        );
        const note = document.createElement('p');
        note.className = 'privacy-note';
        note.textContent = 'Some ads may still get through. Site permissions are denied; first-party storage and fingerprinting may still track you.';
        const status = document.createElement('p');
        status.className = 'settings-status';
        status.setAttribute('aria-live', 'polite');

        const save = document.createElement('button');
        save.className = 'action-button';
        save.textContent = 'Save privacy settings';
        save.onclick = async () => {
          save.disabled = true;
          try {
            await window.browser.setSettings({
              blockKnownTrackers: trackers.input.checked,
              sendPrivacySignals: signals.input.checked,
            });
            status.textContent = 'Privacy settings saved.';
          } catch (error) {
            console.error('Could not save privacy settings:', error);
            status.textContent = 'Could not save privacy settings.';
          } finally {
            save.disabled = false;
          }
        };

        const clearData = document.createElement('button');
        clearData.className = 'action-button privacy-clear';
        clearData.textContent = 'Clear browsing data';
        clearData.onclick = async () => {
          if (!window.confirm('Clear cookies, site data, cache, and in-memory history?')) return;
          clearData.disabled = true;
          try {
            await window.browser.clearBrowsingData();
            status.textContent = 'Browsing data cleared. Bookmarks and frequent sites were kept.';
          } catch (error) {
            console.error('Could not clear browsing data:', error);
            status.textContent = 'Could not clear browsing data.';
          } finally {
            clearData.disabled = false;
          }
        };
        categoryContent.append(blockerStatus, trackers.label, signals.label, note, save, clearData, status);
        return;
      }

      categoryContent.appendChild(settingHeading(
        'Keyboard shortcuts',
        'Quick actions for browsing.',
      ));
      const shortcuts = document.createElement('div');
      shortcuts.className = 'settings-info-list settings-shortcuts';
      shortcuts.innerHTML = '<div><strong>New tab</strong><kbd>Ctrl+T</kbd></div><div><strong>Command bar</strong><kbd>Ctrl+K</kbd></div><div><strong>Focus address bar</strong><kbd>Ctrl+L</kbd></div><div><strong>Bookmark page</strong><kbd>Ctrl+D</kbd></div><div><strong>Reload page</strong><kbd>Ctrl+R</kbd></div><div><strong>Switch spaces</strong><kbd>Ctrl+1 / Ctrl+2</kbd></div><div><strong>Back / forward</strong><kbd>Ctrl+[ / Ctrl+]</kbd></div>';
      categoryContent.appendChild(shortcuts);
    }

    categories.forEach(([name, label]) => {
      const button = document.createElement('button');
      button.className = 'settings-nav-button';
      button.dataset.settingsCategory = name;
      button.textContent = label;
      button.onclick = () => renderCategory(name);
      categoryNav.appendChild(button);
    });
    renderCategory(activeCategory);
  }

  function renderScreenAI() {
    panelContent.replaceChildren();

    const description = document.createElement('p');
    description.className = 'ai-description';
    description.textContent = 'Ask about what is visible on the current page. The app tries available free Gemini models in turn. Your screenshot and question are sent to Google.';

    const keyLabel = document.createElement('label');
    keyLabel.className = 'ai-field-label';
    keyLabel.textContent = 'Gemini API key';
    const keyInput = document.createElement('input');
    keyInput.className = 'settings-input';
    keyInput.type = 'password';
    keyInput.autocomplete = 'new-password';
    keyInput.placeholder = 'Paste your API key';
    keyInput.setAttribute('aria-label', 'Gemini API key');
    keyLabel.appendChild(keyInput);

    const keyHelp = document.createElement('p');
    keyHelp.className = 'ai-key-help';
    keyHelp.textContent = 'Free-tier usage has limits. Avoid scanning sensitive pages; screenshots are sent to Google.';

    const keyActions = document.createElement('div');
    keyActions.className = 'ai-actions';
    const getKey = document.createElement('button');
    getKey.className = 'action-button secondary-action';
    getKey.textContent = 'Get a free API key';
    getKey.onclick = () => window.browser.openGeminiApiKey();
    const saveKey = document.createElement('button');
    saveKey.className = 'action-button';
    saveKey.textContent = 'Save key securely';
    const clearKey = document.createElement('button');
    clearKey.className = 'action-button secondary-action';
    clearKey.textContent = 'Remove key';
    keyActions.append(getKey, saveKey, clearKey);

    const questionForm = document.createElement('form');
    questionForm.className = 'ai-question-form';
    const questionLabel = document.createElement('label');
    questionLabel.className = 'ai-field-label';
    questionLabel.textContent = 'What should I look for?';
    const question = document.createElement('textarea');
    question.className = 'ai-question';
    question.maxLength = 4000;
    question.value = 'Describe what is on this page.';
    question.setAttribute('aria-label', 'Question about the current page');
    questionLabel.appendChild(question);
    const scan = document.createElement('button');
    scan.className = 'action-button ai-scan-button';
    scan.type = 'submit';
    scan.textContent = 'Scan current page';
    scan.disabled = true;
    questionForm.append(questionLabel, scan);

    const status = document.createElement('p');
    status.className = 'ai-status';
    status.setAttribute('role', 'status');
    const answer = document.createElement('div');
    answer.className = 'ai-answer';
    answer.hidden = true;
    answer.setAttribute('aria-live', 'polite');

    let hasKey = false;
    let keyWasUpdated = false;
    function ipcErrorMessage(error, fallback) {
      const message = typeof error?.message === 'string' ? error.message : '';
      if (/TimeoutError|operation was aborted due to timeout/i.test(message)) {
        return 'Gemini took too long to respond. Check your connection and try again.';
      }
      return message.replace(/^Error invoking remote method '[^']+': (?:Error|TimeoutError): /, '')
        || fallback;
    }

    const openGemini = document.createElement('button');
    openGemini.className = 'action-button secondary-action';
    openGemini.textContent = 'Open Gemini website';
    openGemini.onclick = () => {
      window.browser.openGemini();
      closePanel();
    };

    saveKey.onclick = async () => {
      saveKey.disabled = true;
      status.textContent = 'Saving key securely…';
      try {
        await window.browser.saveGeminiApiKey(keyInput.value);
        hasKey = true;
        keyWasUpdated = true;
        scan.disabled = false;
        keyInput.value = '';
        status.textContent = 'API key saved on this device.';
      } catch (error) {
        console.error('Could not save Gemini API key:', error);
        status.textContent = ipcErrorMessage(error, 'Could not save API key.');
      } finally {
        saveKey.disabled = false;
      }
    };

    clearKey.onclick = async () => {
      clearKey.disabled = true;
      try {
        await window.browser.clearGeminiApiKey();
        hasKey = false;
        keyWasUpdated = true;
        scan.disabled = true;
        status.textContent = 'Saved API key removed.';
      } catch (error) {
        console.error('Could not remove Gemini API key:', error);
        status.textContent = ipcErrorMessage(error, 'Could not remove API key.');
      } finally {
        clearKey.disabled = false;
      }
    };

    questionForm.onsubmit = async (event) => {
      event.preventDefault();
      scan.disabled = true;
      scan.textContent = 'Scanning…';
      status.textContent = 'Capturing the current page and asking Gemini…';
      answer.hidden = true;
      try {
        answer.textContent = await window.browser.askAboutScreen(question.value);
        answer.hidden = false;
        status.textContent = 'Gemini response';
      } catch (error) {
        console.error('Could not scan the current page:', error);
        status.textContent = ipcErrorMessage(error, 'Could not scan the current page.');
      } finally {
        scan.disabled = !hasKey;
        scan.textContent = 'Scan current page';
      }
    };

    window.browser.hasGeminiApiKey().then((hasSavedKey) => {
      if (!keyWasUpdated) {
        hasKey = Boolean(hasSavedKey);
        scan.disabled = !hasKey;
        status.textContent = hasKey
          ? 'An API key is saved securely on this device.'
          : 'Get a free key, paste it above, and save it to enable scanning.';
      }
    }).catch((error) => {
      console.error('Could not check for a saved Gemini API key:', error);
      status.textContent = 'Could not check API key status.';
    });

    panelContent.append(
      description,
      keyLabel,
      keyHelp,
      keyActions,
      questionForm,
      status,
      answer,
      openGemini,
    );
  }

  function showPanel(name, settingsCategory = 'general') {
    activatePanelButton(name);
    const titles = {
      bookmarks: 'Bookmarks',
      history: 'History',
      downloads: 'Downloads',
      tabs: 'Tab Search',
      command: 'Command Bar',
      ai: 'AI Screen Scan',
      spaces: 'Workspaces',
      extensions: 'Extensions',
      settings: 'Settings',
    };
    panelTitle.textContent = titles[name] || 'Library';
    if (name === 'bookmarks') renderBookmarks();
    if (name === 'history') renderHistory();
    if (name === 'downloads') renderDownloads();
    if (name === 'tabs') renderTabSearch();
    if (name === 'command') renderCommandBar();
    if (name === 'spaces') renderWorkspaces();
    if (name === 'ai') renderScreenAI();
    if (name === 'extensions') renderExtensions();
    if (name === 'settings') renderSettings(settingsCategory);
  }
}

let receivedBrowserStateEvent = false;
window.browser.onState((newState) => {
  receivedBrowserStateEvent = true;
  applyBrowserState(newState);
});
window.browser.onZenSidebarHover((isExpanded) => {
  zenSidebarHovered = Boolean(isExpanded);
  const isZen = document.documentElement.classList.contains('layout-zen');
  const panelIsOpen = !$('feature-panel').classList.contains('hidden');
  document.documentElement.style.setProperty(
    '--sidebar-width',
    isZen && zenSidebarHovered ? '272px' : '72px',
  );
  document.documentElement.classList.toggle('zen-sidebar-expanded', isZen && zenSidebarHovered);
  document.documentElement.classList.toggle('compact-mode', isZen && !zenSidebarHovered);
  document.documentElement.classList.toggle(
    'zen-panel-peek-hidden',
    isZen && panelIsOpen && !zenSidebarHovered,
  );
});
const zenSidebarSurfaces = [$('sidebar'), $('feature-panel'), $('backdrop')];
let zenSidebarSurfaceLeaveTimer = null;
function reportZenSidebarSurfaceHover() {
  clearTimeout(zenSidebarSurfaceLeaveTimer);
  const isHovered = zenSidebarSurfaces.some((surface) => surface.matches(':hover'));
  if (isHovered) {
    window.browser.setZenSidebarSurfaceHovered(true);
    return;
  }
  zenSidebarSurfaceLeaveTimer = setTimeout(() => {
    const stillHovered = zenSidebarSurfaces.some((surface) => surface.matches(':hover'));
    window.browser.setZenSidebarSurfaceHovered(stillHovered);
  }, 80);
}
zenSidebarSurfaces.forEach((surface) => {
  surface.addEventListener('pointerenter', reportZenSidebarSurfaceHover);
  surface.addEventListener('pointerleave', reportZenSidebarSurfaceHover);
});
window.browser.getState().then((state) => {
  if (!receivedBrowserStateEvent) applyBrowserState(state);
}).catch((error) => {
  console.error('Could not load initial browser state:', error);
});

window.browser.onFocusAddress(() => {
  els.address.focus();
  els.address.select();
});

els.btnBack.onclick = () => window.browser.back();
els.btnForward.onclick = () => window.browser.forward();
els.btnReload.onclick = () => window.browser.reload();

function newTab() {
  window.browser.newTab(currentSpace);
}

els.btnNewTab.onclick = newTab;
els.btnAddPinned.onclick = newTab;
els.btnAddFrequentSite.onclick = () => window.browser.newTab('home');

els.form.addEventListener('click', () => {
  const focusAddress = () => {
    els.address.focus();
    els.address.select();
  };
  if (
    document.documentElement.classList.contains('layout-zen') &&
    document.documentElement.classList.contains('compact-mode')
  ) {
    window.browser.setZenSidebarSurfaceHovered(true);
    setTimeout(focusAddress, 200);
    return;
  }
  focusAddress();
});

els.form.onsubmit = (event) => {
  event.preventDefault();
  const value = els.address.value.trim();
  if (value) window.browser.navigate({ input: value, spaceId: currentSpace });
};

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !$('browser-menu').classList.contains('hidden')) {
    event.preventDefault();
    $('btn-more').click();
    return;
  }
  const mod = event.ctrlKey || event.metaKey;
  if (!mod) return;

  switch (event.key.toLowerCase()) {
    case 't':
      event.preventDefault();
      newTab();
      break;
    case 'k':
      event.preventDefault();
      document.querySelector('[data-open-panel="command"]').click();
      break;
    case 'w':
      event.preventDefault();
      if (browserState.activeId) window.browser.closeTab(browserState.activeId);
      break;
    case 'r':
      event.preventDefault();
      window.browser.reload();
      break;
    case 'l':
      event.preventDefault();
      els.address.focus();
      els.address.select();
      break;
    case 'd':
      event.preventDefault();
      window.browser.toggleBookmark();
      break;
    case '[':
      event.preventDefault();
      window.browser.back();
      break;
    case ']':
      event.preventDefault();
      window.browser.forward();
      break;
    case '1':
    case '2': {
      event.preventDefault();
      const index = Number(event.key) - 1;
      const space = getSpaces()[index];
      if (space) switchSpace(space.id);
      break;
    }
  }
});

function switchSpace(spaceId) {
  if (!getSpaces().some((space) => space.id === spaceId)) return;
  currentSpace = spaceId;
  const tab = tabsInCurrentSpace().find((item) => item.id === browserState.activeId)
    || tabsInCurrentSpace()[0];

  if (tab) window.browser.activateTab(tab.id);
  else window.browser.newTab(spaceId);
  render();
}

function renderSpaces() {
  els.spaces.innerHTML = '';

  const spaces = getSpaces();
  if (!spaces.some((space) => space.id === currentSpace)) {
    currentSpace = spaces[0].id;
  }
  spaces.forEach((space, index) => {
    const button = document.createElement('button');
    button.className = 'space-btn' + (space.id === currentSpace ? ' active' : '');
    button.dataset.letter = space.name.trim().charAt(0).toUpperCase() || 'S';
    button.title = space.name;
    button.setAttribute('aria-label', space.name);
    button.style.setProperty('--space-color', space.color || (index === 0 ? '#7658c8' : '#4886b8'));
    if (typeof space.iconUrl === 'string' && space.iconUrl.startsWith('file:')) {
      button.classList.add('has-custom-icon');
      const image = document.createElement('img');
      image.className = 'space-icon-image';
      image.src = space.iconUrl;
      image.alt = '';
      button.appendChild(image);
    }
    button.onclick = () => switchSpace(space.id);
    els.spaces.appendChild(button);
  });
}

function tabsInCurrentSpace() {
  return browserState.tabs.filter((tab) => (tab.space || 'home') === currentSpace);
}

function faviconText(tab) {
  try {
    const url = new URL(tab.url);
    return url.hostname.replace(/^www\./, '').charAt(0).toUpperCase();
  } catch {
    return 'H';
  }
}

function createTabElement(tab) {
  const row = document.createElement('div');
  row.className = 'tab' + (tab.id === browserState.activeId ? ' active' : '');
  if (!knownTabIds.has(tab.id)) row.classList.add('tab-enter');
  else if (tab.id === browserState.activeId && lastActiveTabId !== tab.id) {
    row.classList.add('tab-activate');
  }
  knownTabIds.add(tab.id);
  row.title = tab.title || tab.url || 'New Tab';

  const favicon = document.createElement('span');
  favicon.className = 'tab-favicon';
  favicon.textContent = faviconText(tab);
  row.appendChild(favicon);

  const title = document.createElement('span');
  title.className = 'tab-title';
  title.textContent = tab.title || tab.url || 'New Tab';
  row.appendChild(title);

  if (!tab.pinned) {
    const pinButton = document.createElement('button');
    pinButton.className = 'tab-action';
    pinButton.textContent = '•';
    pinButton.title = 'Pin tab';
    pinButton.onclick = (event) => {
      event.stopPropagation();
      window.browser.togglePin(tab.id);
    };
    row.appendChild(pinButton);
  }

  const closeButton = document.createElement('button');
  closeButton.className = 'tab-action';
  closeButton.textContent = '×';
  closeButton.title = 'Close tab';
  closeButton.onclick = (event) => {
    event.stopPropagation();
    window.browser.closeTab(tab.id);
  };
  row.appendChild(closeButton);

  row.onclick = () => window.browser.activateTab(tab.id);
  return row;
}

function renderTabs() {
  els.pinned.innerHTML = '';
  els.tabs.innerHTML = '';

  const visible = tabsInCurrentSpace();
  visible.filter((tab) => tab.pinned).forEach((tab) => els.pinned.appendChild(createTabElement(tab)));
  visible.filter((tab) => !tab.pinned).forEach((tab) => els.tabs.appendChild(createTabElement(tab)));
  const liveTabIds = new Set(browserState.tabs.map((tab) => tab.id));
  knownTabIds.forEach((id) => {
    if (!liveTabIds.has(id)) knownTabIds.delete(id);
  });
  lastActiveTabId = browserState.activeId;
  renderFrequentSites();
}

function renderFrequentSites() {
  const section = $('frequent-sites-section');
  const list = $('frequent-sites-list');
  section.hidden = currentSpace !== 'home';
  list.replaceChildren();
  if (section.hidden) return;

  const sites = Array.isArray(browserState.settings?.frequentSites)
    ? browserState.settings.frequentSites
    : [];
  const validSites = sites.filter((site) => (
    site && typeof site.name === 'string' && typeof site.url === 'string'
  ));

  if (validSites.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'frequent-sites-empty';
    empty.textContent = 'Add sites from a new tab';
    list.appendChild(empty);
    return;
  }

  validSites.forEach((site) => {
    let url;
    try {
      url = new URL(site.url);
      if (!['http:', 'https:'].includes(url.protocol)) return;
    } catch {
      return;
    }

    const button = document.createElement('button');
    button.className = 'frequent-site';
    button.type = 'button';
    button.title = `${site.name} — ${url.href}`;
    button.onclick = () => window.browser.navigate({ input: url.href, spaceId: 'home' });

    const icon = document.createElement('span');
    icon.className = 'frequent-site-icon';
    const fallbackIcon = url.hostname.replace(/^www\./, '').charAt(0).toUpperCase() || '•';
    icon.textContent = fallbackIcon;
    const iconUrl = typeof site.iconUrl === 'string' && site.iconUrl.startsWith('file:')
      ? site.iconUrl
      : `${url.origin}/favicon.ico`;
    const image = document.createElement('img');
    image.alt = '';
    image.referrerPolicy = 'no-referrer';
    image.onload = () => icon.replaceChildren(image);
    image.onerror = () => image.remove();
    image.src = iconUrl;
    icon.appendChild(image);

    const name = document.createElement('span');
    name.className = 'frequent-site-name';
    name.textContent = site.name;
    button.append(icon, name);

    list.appendChild(button);
  });
}

function renderAddress() {
  if (document.activeElement === els.address) return;

  const activeTab = browserState.tabs.find((tab) => tab.id === browserState.activeId);
  els.address.value = activeTab && !activeTab.url?.startsWith('file://') ? activeTab.url || '' : '';
}

function renderNavigation() {
  const activeTab = browserState.tabs.find((tab) => tab.id === browserState.activeId);
  els.btnBack.disabled = !activeTab;
  els.btnForward.disabled = !activeTab || !activeTab.canGoForward;
}

function render() {
  renderSpaces();
  renderTabs();
  renderAddress();
  renderNavigation();
}

function applyTheme(theme, accentColor, animateTabs, sidebarBackgroundUrl, panelBackgroundUrl) {
  const layoutStyle = ['chrome', 'arc', 'zen'].includes(browserState.settings?.layoutStyle)
    ? browserState.settings.layoutStyle
    : 'arc';
  const compact = layoutStyle === 'zen' ||
    (layoutStyle === 'arc' && browserState.settings?.compactMode === true);
  const zenExpanded = layoutStyle === 'zen' && zenSidebarHovered;
  const sidebarWidth = layoutStyle === 'chrome'
    ? '100%'
    : layoutStyle === 'zen'
      ? zenExpanded ? '272px' : '72px'
      : compact ? '72px' : '272px';
  document.documentElement.style.setProperty('--sidebar-width', sidebarWidth);
  document.documentElement.style.setProperty('--accent', /^#[0-9a-f]{6}$/i.test(accentColor || '')
    ? accentColor
    : themeAccent(theme));
  document.documentElement.classList.toggle('compact-mode', compact && !zenExpanded);
  document.documentElement.classList.toggle('layout-chrome', layoutStyle === 'chrome');
  document.documentElement.classList.toggle('layout-arc', layoutStyle === 'arc');
  document.documentElement.classList.toggle('layout-zen', layoutStyle === 'zen');
  document.documentElement.classList.toggle('zen-sidebar-expanded', zenExpanded);
  document.documentElement.classList.toggle(
    'zen-panel-peek-hidden',
    layoutStyle === 'zen' &&
      !$('feature-panel').classList.contains('hidden') &&
      !zenExpanded,
  );
  document.documentElement.classList.toggle('animated-tabs', animateTabs);

  const toCssImage = (imageUrl) => {
    try {
      const url = new URL(imageUrl);
      return url.protocol === 'file:' ? `url(${JSON.stringify(url.href)})` : 'none';
    } catch {
      return 'none';
    }
  };
  const sidebarImage = toCssImage(sidebarBackgroundUrl);
  const panelImage = toCssImage(panelBackgroundUrl);
  document.documentElement.style.setProperty('--sidebar-background-image', sidebarImage);
  document.documentElement.style.setProperty('--app-background-image', panelImage);
  document.documentElement.classList.toggle('has-sidebar-background', sidebarImage !== 'none');
  document.documentElement.classList.toggle('has-custom-background', panelImage !== 'none');

  const palettes = {
    cloud: ['rgba(235,230,224,.94)', 'rgba(255,255,255,.72)', 'rgba(255,255,255,.92)', '#242225', '#777279'],
    plain: ['#f4f4f4', '#e9e9e9', '#ffffff', '#242424', '#777777'],
    dark: ['rgba(35,34,40,.96)', 'rgba(255,255,255,.07)', 'rgba(255,255,255,.12)', '#f1eff3', '#aaa5af'],
    'arc-light': ['#f1eff7', '#ffffff', '#ffffff', '#28243a', '#777286'],
    'arc-dark': ['#202127', 'rgba(255,255,255,.07)', 'rgba(255,255,255,.13)', '#f2f0f7', '#aaa7b4'],
    'zen-sakura': ['#f3e8ef', '#fbeef5', '#fff8fc', '#392b35', '#806b79'],
    'zen-forest': ['#e7eee8', '#f1f8f2', '#fbfffc', '#27372e', '#68796d'],
    'zen-midnight': ['#222b39', 'rgba(255,255,255,.07)', 'rgba(255,255,255,.13)', '#eff4fb', '#a7b3c2'],
  };
  const [sidebar, hover, active, ink, muted] = palettes[theme] || palettes.cloud;
  document.documentElement.style.setProperty('--sidebar', sidebar);
  document.documentElement.style.setProperty('--sidebar-hover', hover);
  document.documentElement.style.setProperty('--sidebar-active', active);
  document.documentElement.style.setProperty('--ink', ink);
  document.documentElement.style.setProperty('--muted', muted);
  const darkTheme = ['dark', 'arc-dark', 'zen-midnight'].includes(theme);
  const backgroundOverlay = darkTheme ? 'rgba(25,23,30,.55)' : 'rgba(255,255,255,.52)';
  document.documentElement.style.setProperty('--app-background-overlay', backgroundOverlay);
  document.documentElement.style.setProperty('--sidebar-background-overlay', backgroundOverlay);
}

render();
