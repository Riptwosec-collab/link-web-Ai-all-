/* Smart Link Hub V6.1 — persistent two-theme controller */
(() => {
  'use strict';

  const STORAGE_KEY = 'slh_theme_v61';
  const LEGACY_KEY = 'smartlink_theme';
  const THEMES = {
    gold: {
      name: 'Obsidian Gold',
      short: 'Gold',
      description: 'Black glass · premium gold',
      themeColor: '#020304'
    },
    blue: {
      name: 'Midnight Blue',
      short: 'Blue',
      description: 'Deep black · electric cyan',
      themeColor: '#02050a'
    }
  };

  const valid = value => Object.prototype.hasOwnProperty.call(THEMES, value);
  const savedLocal = () => {
    const current = localStorage.getItem(STORAGE_KEY);
    if (valid(current)) return current;
    const legacy = localStorage.getItem(LEGACY_KEY);
    return valid(legacy) ? legacy : '';
  };

  const initialLocalTheme = savedLocal();
  const hadLocalChoice = Boolean(initialLocalTheme);
  let currentTheme = valid(document.documentElement.dataset.theme)
    ? document.documentElement.dataset.theme
    : (initialLocalTheme || 'gold');
  let dbLoaded = false;
  let observer = null;
  let uiScheduled = false;

  function updateMeta(theme) {
    let meta = document.querySelector('meta[name="theme-color"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.name = 'theme-color';
      document.head.appendChild(meta);
    }
    meta.content = THEMES[theme].themeColor;
  }

  function updateControls() {
    document.querySelectorAll('[data-slh-theme]').forEach(button => {
      const active = button.dataset.slhTheme === currentTheme;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', active ? 'true' : 'false');
    });
    document.querySelectorAll('[data-slh-theme-label]').forEach(el => {
      el.textContent = THEMES[currentTheme].short;
    });
    document.querySelectorAll('[data-slh-current-theme]').forEach(el => {
      el.textContent = THEMES[currentTheme].name;
    });
  }

  function applyTheme(theme, { persist = false, announce = false } = {}) {
    if (!valid(theme)) theme = 'gold';
    currentTheme = theme;
    document.documentElement.dataset.theme = theme;
    if (document.body) document.body.dataset.theme = theme;
    updateMeta(theme);

    localStorage.setItem(STORAGE_KEY, theme);
    localStorage.setItem(LEGACY_KEY, theme);
    updateControls();

    window.dispatchEvent(new CustomEvent('smartlink:theme-change', {
      detail: { theme, name: THEMES[theme].name }
    }));

    if (announce) showNotice(`${THEMES[theme].name} theme`);
    if (persist) persistToDatabase(theme);
  }

  async function persistToDatabase(theme) {
    try {
      const mod = await import('./db.js');
      if (typeof mod.setSetting === 'function') {
        await mod.setSetting('theme', theme);
      }
    } catch (error) {
      console.warn('Theme preference saved locally; cloud preference unavailable.', error);
    }
  }

  async function hydrateFromDatabase() {
    if (dbLoaded) return;
    dbLoaded = true;
    // A device-local choice wins immediately. Cloud is used on a fresh device.
    if (hadLocalChoice) return;
    try {
      const mod = await import('./db.js');
      if (typeof mod.getSetting !== 'function') return;
      const cloudTheme = await mod.getSetting('theme', 'gold');
      if (valid(cloudTheme)) applyTheme(cloudTheme, { persist: false });
    } catch (error) {
      console.warn('Theme preference could not be read from IndexedDB.', error);
    }
  }

  function showNotice(text) {
    const old = document.querySelector('.slh-theme-toast');
    if (old) old.remove();
    const el = document.createElement('div');
    el.className = 'v6-toast slh-theme-toast';
    el.textContent = text;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1800);
  }

  function optionMarkup(theme) {
    const item = THEMES[theme];
    return `<button type="button" class="slh-theme-option" data-slh-theme="${theme}" aria-pressed="false">
      <span class="slh-theme-swatch ${theme}"></span>
      <span><strong>${item.name}</strong><small>${item.description}</small></span>
      <i class="ph-bold ph-check slh-theme-check" aria-hidden="true"></i>
    </button>`;
  }

  function bindThemeMenu(wrap) {
    const trigger = wrap.querySelector('.slh-theme-trigger');
    const menu = wrap.querySelector('.slh-theme-menu');
    if (!trigger || !menu) return;
    trigger.addEventListener('click', event => {
      event.stopPropagation();
      const open = menu.hidden;
      document.querySelectorAll('.slh-theme-menu').forEach(other => { if (other !== menu) other.hidden = true; });
      menu.hidden = !open;
      trigger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', event => {
      const button = event.target.closest('[data-slh-theme]');
      if (!button) return;
      applyTheme(button.dataset.slhTheme, { persist: true, announce: true });
      menu.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    });
  }

  function switcherMarkup(idPrefix = 'slh-theme') {
    return `<button type="button" class="slh-theme-trigger" aria-haspopup="menu" aria-expanded="false" title="Switch theme (Alt+T)">
        <span class="slh-theme-orb" aria-hidden="true"></span>
        <span class="slh-theme-name" data-slh-theme-label>${THEMES[currentTheme].short}</span>
        <i class="ph ph-caret-down" aria-hidden="true"></i>
      </button>
      <div class="slh-theme-menu" role="menu" hidden data-theme-menu="${idPrefix}">
        <div class="slh-theme-menu-title">Interface theme</div>
        ${optionMarkup('gold')}
        ${optionMarkup('blue')}
      </div>`;
  }

  function injectHeaderSwitcher() {
    if (document.getElementById('slh-theme-wrap')) return;
    const addButton = document.getElementById('add-link-btn');
    const host = addButton?.parentElement;
    if (!host) return;

    const wrap = document.createElement('div');
    wrap.id = 'slh-theme-wrap';
    wrap.className = 'slh-theme-wrap';
    wrap.innerHTML = switcherMarkup('header');
    host.insertBefore(wrap, addButton);
    bindThemeMenu(wrap);
    updateControls();
  }

  function injectLoginSwitcher() {
    const login = document.querySelector('#smartlink-auth-gate .slh-login');
    if (!login || document.getElementById('slh-login-theme-wrap')) return;
    const wrap = document.createElement('div');
    wrap.id = 'slh-login-theme-wrap';
    wrap.className = 'slh-theme-wrap';
    wrap.style.cssText = 'position:absolute;right:16px;top:16px;z-index:8';
    wrap.innerHTML = switcherMarkup('login');
    login.appendChild(wrap);
    bindThemeMenu(wrap);
    updateControls();
  }

  function settingsMarkup() {
    return `<section id="slh-theme-settings" class="v6-panel slh-theme-settings p-5">
      <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div>
          <div class="v6-kicker">Appearance</div>
          <h3 class="text-base font-semibold text-white">Interface Theme</h3>
          <p class="text-[10px] leading-5 mt-1" style="color:var(--muted)">ใช้ชุดสีเดียวกันทั้ง Sidebar, Cards, AI, Cloud, Modal, Inputs, Login และ Command Palette</p>
        </div>
        <span class="v6-chip cyan" data-slh-current-theme>${THEMES[currentTheme].name}</span>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-2 mt-4">
        ${optionMarkup('gold')}
        ${optionMarkup('blue')}
      </div>
    </section>`;
  }

  function injectSettingsCard() {
    const title = document.getElementById('page-title')?.textContent?.trim().toLowerCase();
    if (title !== 'settings') return;
    if (document.getElementById('slh-theme-settings')) return;
    const root = document.getElementById('dynamic-content');
    const shell = root?.querySelector('.page-shell') || root?.firstElementChild;
    if (!shell) return;

    const holder = document.createElement('div');
    holder.innerHTML = settingsMarkup();
    const card = holder.firstElementChild;
    shell.insertBefore(card, shell.firstChild);
    card.addEventListener('click', event => {
      const button = event.target.closest('[data-slh-theme]');
      if (!button) return;
      applyTheme(button.dataset.slhTheme, { persist: true, announce: true });
    });
    updateControls();
  }

  function closeMenus() {
    document.querySelectorAll('.slh-theme-menu').forEach(menu => { menu.hidden = true; });
    document.querySelectorAll('.slh-theme-trigger').forEach(trigger => trigger.setAttribute('aria-expanded', 'false'));
  }

  function bindGlobalEvents() {
    document.addEventListener('click', event => {
      if (!event.target.closest('.slh-theme-wrap')) closeMenus();
    });
    document.addEventListener('keydown', event => {
      if (event.key === 'Escape') closeMenus();
      if (event.altKey && event.key.toLowerCase() === 't') {
        event.preventDefault();
        const next = currentTheme === 'gold' ? 'blue' : 'gold';
        applyTheme(next, { persist: true, announce: true });
      }
    });
  }

  function refreshInjectedUi() {
    injectHeaderSwitcher();
    injectLoginSwitcher();
    injectSettingsCard();
  }

  function scheduleInjectedUi() {
    if (uiScheduled) return;
    uiScheduled = true;
    requestAnimationFrame(() => {
      uiScheduled = false;
      refreshInjectedUi();
    });
  }

  function watchDynamicUi() {
    if (observer) return;
    observer = new MutationObserver(scheduleInjectedUi);
    observer.observe(document.body, { childList: true, subtree: true });
  }

  function boot() {
    applyTheme(currentTheme, { persist: false });
    refreshInjectedUi();
    bindGlobalEvents();
    watchDynamicUi();
    hydrateFromDatabase();
  }

  // Public bridge for V6 modules and future command-palette actions.
  window.SmartLinkTheme = {
    get: () => currentTheme,
    set: theme => applyTheme(theme, { persist: true, announce: true }),
    toggle: () => applyTheme(currentTheme === 'gold' ? 'blue' : 'gold', { persist: true, announce: true }),
    themes: () => Object.keys(THEMES)
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
