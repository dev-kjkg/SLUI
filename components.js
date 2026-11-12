/*!
 * components.js — 汎用 UI Web Component ライブラリ（単一ファイル / CDN 対応）
 *
 * 設計:
 *  - すべて Shadow DOM(open) + <slot> + CSSカスタムプロパティ(--ui-*) で構成
 *  - 既定値はすべて :host のCSS変数。利用側CSSで要素ごと・クラスごとに1行で上書き可能
 *  - 操作は CustomEvent(bubbles, composed) のみ発火。アプリ固有処理は一切持たない
 *  - フォーカス可能にしたい要素には `focusable` 属性を付ける
 *
 * タグ一覧:
 *  ui-stage ui-screen ui-icon ui-button ui-card ui-section ui-rail ui-rail-item
 *  ui-list ui-list-item ui-check ui-keyboard ui-key-row ui-key ui-field
 *  ui-progress ui-tile ui-panel ui-toast
 *
 * イベント:
 *  ui-focus / ui-blur       フォーカス移動 (detail: {element, previous})
 *  ui-activate              決定操作 (Enter / Space / クリック)
 *  ui-back                  戻る操作 (Escape / Backspace / GoBack)
 *  ui-keypress              キー入力 (cancelable。preventDefault で標準処理を止める)
 *  ui-key-press             ui-key の決定 (detail: {value, element})
 *  ui-select                ui-rail の選択変更 (detail: {item, index})
 *  ui-change                ui-card / ui-list-item(toggle) / ui-field の値変更
 *  ui-state-change          selected/checked/active/collapsed/disabled/open/value の属性変化
 */
(() => {
  'use strict';
  if (window.__uiComponentsLoaded) return;
  window.__uiComponentsLoaded = true;

  /* ---------- フォント読み込み（window.UI_NO_FONTS = true で無効化） ---------- */
  const FONT_HREF = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@24,400,0,0&family=Roboto:wght@300;400;500&family=Roboto+Condensed:wght@300;400&display=block';
  if (!window.UI_NO_FONTS && !document.querySelector('link[data-ui-fonts]')) {
    const l = document.createElement('link');
    l.rel = 'stylesheet';
    l.href = FONT_HREF;
    l.setAttribute('data-ui-fonts', '');
    (document.head || document.documentElement).appendChild(l);
  }

  /* ---------- 共通トークン ---------- */
  const FC = 'var(--ui-font-condensed,"Roboto Condensed","Roboto","Noto Sans JP",sans-serif)';
  const FB = 'var(--ui-font,Roboto,"Noto Sans JP",system-ui,sans-serif)';
  const ACCENT = 'var(--ui-accent,#50e3c2)';
  const ACCENT2 = 'var(--ui-accent-2,#ffab40)';
  const NAVBG = 'var(--ui-nav,#a6a6a6)';
  const RESET = '*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}:host([hidden]){display:none!important}';
  const STATE_ATTRS = new Set(['selected', 'checked', 'active', 'collapsed', 'disabled', 'open', 'value']);

  /* ---------- 基底クラス ---------- */
  class UIElement extends HTMLElement {
    constructor() {
      super();
      const C = this.constructor;
      this.attachShadow({ mode: 'open' }).innerHTML =
        '<style>' + RESET + (C.styles || '') + '</style>' + (C.template || '');
    }
    emit(name, detail = {}, init = {}) {
      return this.dispatchEvent(new CustomEvent(name, { detail, bubbles: true, composed: true, ...init }));
    }
    attributeChangedCallback(name, oldV, newV) {
      if (oldV === newV) return;
      if (typeof this.onAttr === 'function') this.onAttr(name, oldV, newV);
      if (this.isConnected && STATE_ATTRS.has(name)) {
        this.emit('ui-state-change', { name, value: newV, oldValue: oldV, element: this });
      }
    }
  }

  /* 操作可能な要素。ui-stage の外では自身のクリックで ui-activate を発火する */
  class UIInteractive extends UIElement {
    constructor() {
      super();
      this.addEventListener('click', () => {
        if (this.hasAttribute('disabled') || this.closest('ui-stage')) return;
        this.emit('ui-activate', { element: this });
      });
    }
  }

  function syncChecks(host) {
    if (!host.hasAttribute('toggle') && !host.hasAttribute('checked')) return;
    const v = host.hasAttribute('checked');
    host.querySelectorAll('ui-check').forEach((c) => {
      if (c.hasAttribute('checked') !== v) c.toggleAttribute('checked', v);
    });
  }
  function bindToggle(host) {
    host.addEventListener('ui-activate', (e) => {
      if (e.target !== host || !host.hasAttribute('toggle') || host.hasAttribute('disabled')) return;
      const v = !host.hasAttribute('checked');
      host.toggleAttribute('checked', v);
      host.emit('ui-change', { checked: v, element: host });
    });
    host.shadowRoot.addEventListener('slotchange', () => syncChecks(host));
  }

  /* =====================================================================
   * ui-stage : 設計解像度の自動スケーリング + 空間フォーカス移動 + 入力ハブ
   * ===================================================================== */
  class UIStage extends UIElement {
    static template = '<slot></slot>';
    static styles = `
:host{--ui-stage-bg:#969696;--ui-stage-width:1920px;--ui-stage-height:1080px;
  display:block;position:absolute;left:0;top:0;width:var(--ui-stage-width);height:var(--ui-stage-height);
  transform-origin:0 0;overflow:clip;background:var(--ui-stage-bg);font-family:${FB};color:#fff;
  user-select:none;-webkit-user-select:none}`;
    static get observedAttributes() { return ['design-width', 'design-height', 'no-fit']; }
    constructor() {
      super();
      this._cur = null;
      this._onKey = this._onKey.bind(this);
      this._fit = this._fit.bind(this);
      this._onClick = this._onClick.bind(this);
    }
    onAttr() { this._fit(); }
    connectedCallback() {
      window.addEventListener('keydown', this._onKey);
      window.addEventListener('resize', this._fit);
      this.addEventListener('click', this._onClick);
      this._fit();
    }
    disconnectedCallback() {
      window.removeEventListener('keydown', this._onKey);
      window.removeEventListener('resize', this._fit);
      this.removeEventListener('click', this._onClick);
    }
    get current() { return this._cur; }
    _fit() {
      if (this.hasAttribute('no-fit')) {
        this.style.removeProperty('width');
        this.style.removeProperty('height');
        this.style.removeProperty('transform');
        return;
      }
      const dw = parseFloat(this.getAttribute('design-width')) || 1920;
      const dh = parseFloat(this.getAttribute('design-height')) || 1080;
      const s = Math.min(innerWidth / dw, innerHeight / dh);
      this.style.width = innerWidth / s + 'px';
      this.style.height = innerHeight / s + 'px';
      this.style.transform = 'scale(' + s + ')';
      this.style.left = '0';
      this.style.top = '0';
    }
    focusables() {
      return [...this.querySelectorAll('[focusable]')].filter(
        (e) => !e.hasAttribute('disabled') && e.getClientRects().length > 0
      );
    }
    focusElement(el, opts = {}) {
      if (!el) return null;
      const prev = this._cur;
      if (prev && prev !== el) {
        prev.removeAttribute('focused');
        prev.dispatchEvent(new CustomEvent('ui-blur', { detail: { element: prev, next: el }, bubbles: true, composed: true }));
      }
      this._cur = el;
      el.setAttribute('focused', '');
      el.dispatchEvent(new CustomEvent('ui-focus', { detail: { element: el, previous: prev }, bubbles: true, composed: true }));
      if (opts.scroll !== false && !this.hasAttribute('no-scroll')) {
        el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' });
      }
      return el;
    }
    move(d) {
      const cur = this._cur;
      if (!cur) {
        const first = this.focusables()[0];
        return first ? this.focusElement(first) : null;
      }
      const a = cur.getBoundingClientRect();
      const ax = a.left + a.width / 2;
      const ay = a.top + a.height / 2;
      let best = null;
      let bs = 1e9;
      for (const e of this.focusables()) {
        if (e === cur) continue;
        const b = e.getBoundingClientRect();
        const dx = b.left + b.width / 2 - ax;
        const dy = b.top + b.height / 2 - ay;
        const p = d === 'r' ? dx : d === 'l' ? -dx : d === 'd' ? dy : -dy;
        const q = d === 'r' || d === 'l' ? Math.abs(dy) : Math.abs(dx);
        if (p < 8) continue;
        const s = p + q * 2.5;
        if (s < bs) { bs = s; best = e; }
      }
      if (best) this.focusElement(best);
      return best;
    }
    activate() {
      const c = this._cur;
      if (!c || c.hasAttribute('disabled')) return;
      c.dispatchEvent(new CustomEvent('ui-activate', { detail: { element: c }, bubbles: true, composed: true }));
    }
    _onClick(e) {
      const t = e.target && e.target.closest ? e.target.closest('[focusable]') : null;
      if (t && this.contains(t) && t.getClientRects().length > 0 && !t.hasAttribute('disabled')) {
        this.focusElement(t);
        this.activate();
      }
    }
    _onKey(e) {
      const ke = new CustomEvent('ui-keypress', {
        detail: { key: e.key, code: e.code, originalEvent: e },
        bubbles: true, composed: true, cancelable: true
      });
      if (!this.dispatchEvent(ke)) return;
      const m = { ArrowRight: 'r', ArrowLeft: 'l', ArrowDown: 'd', ArrowUp: 'u' }[e.key];
      if (m) {
        e.preventDefault();
        this.move(m);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.activate();
      } else if (e.key === 'Escape' || e.key === 'Backspace' || e.key === 'GoBack') {
        this.emit('ui-back', { key: e.key, originalEvent: e });
      }
    }
  }

  /* =====================================================================
   * ui-screen : active 属性で表示 / 非表示を切り替えるフルサイズ面
   * ===================================================================== */
  class UIScreen extends UIElement {
    static template = '<slot></slot>';
    static styles = `
:host{position:absolute;left:0;top:0;right:0;bottom:0;display:none}
:host([active]){display:block}`;
    static get observedAttributes() { return ['active']; }
  }

  /* =====================================================================
   * ui-icon : name 属性 または テキストで アイコン名(リガチャ)を指定
   * ===================================================================== */
  class UIIcon extends UIElement {
    static template = '<span class="ms" part="glyph"></span>';
    static styles = `
:host{display:inline-block;line-height:1;font-size:inherit}
.ms{font-family:"Material Symbols Outlined";font-weight:400;font-style:normal;line-height:1;display:block;white-space:nowrap;letter-spacing:normal;
  font-feature-settings:"liga";-webkit-font-feature-settings:"liga";
  font-variation-settings:"FILL" var(--ui-icon-fill,1),"wght" var(--ui-icon-weight,500)}`;
    static get observedAttributes() { return ['name']; }
    constructor() {
      super();
      this._g = this.shadowRoot.querySelector('.ms');
    }
    onAttr() { this._render(); }
    connectedCallback() {
      this._render();
      this._mo = new MutationObserver(() => this._render());
      this._mo.observe(this, { childList: true, characterData: true, subtree: true });
    }
    disconnectedCallback() { if (this._mo) this._mo.disconnect(); }
    _render() {
      const n = this.hasAttribute('name') ? this.getAttribute('name') : this.textContent.trim();
      if (this._g.textContent !== n) this._g.textContent = n;
    }
  }

  /* =====================================================================
   * ui-button : variant = round(既定) | round-lg | round-accent | round-sm |
   *             filled | filled-primary | text | control | control-sm
   * ===================================================================== */
  class UIButton extends UIInteractive {
    static template = '<slot></slot>';
    static styles = `
:host{display:grid;place-items:center;box-sizing:border-box;cursor:pointer;white-space:nowrap;
  width:var(--ui-button-width,104px);height:var(--ui-button-height,104px);border-radius:var(--ui-button-radius,50%);
  background:var(--ui-button-bg,#e9e9e9);color:var(--ui-button-color,#757575);font-size:var(--ui-button-font-size,60px);
  font-family:var(--ui-button-font-family,inherit);letter-spacing:var(--ui-button-letter-spacing,normal);
  line-height:var(--ui-button-line-height,1);padding:var(--ui-button-padding,0);box-shadow:var(--ui-button-shadow,0 4px 10px #0006);
  transition:var(--ui-button-transition,.2s)}
:host([focused]){transform:var(--ui-button-focus-transform,scale(1.18));box-shadow:var(--ui-button-focus-shadow,0 12px 28px #0008);
  background:var(--ui-button-focus-bg,#fff);color:var(--ui-button-focus-color,var(--ui-button-color,#757575))}
:host([disabled]){opacity:.4;pointer-events:none}

:host([variant="round-lg"]){--ui-button-width:124px;--ui-button-height:124px;--ui-button-color:#6f6f6f;--ui-button-font-size:76px;
  --ui-button-shadow:0 4px 10px #0007;--ui-button-focus-transform:scale(1.12);--ui-button-focus-shadow:0 12px 26px #0009;
  --ui-button-focus-bg:var(--ui-button-bg,#e9e9e9)}
:host([variant="round-accent"]){--ui-button-width:110px;--ui-button-height:110px;--ui-button-bg:#4285f4;--ui-button-color:#fff;--ui-button-font-size:62px;
  --ui-button-shadow:0 4px 10px #0004;--ui-button-focus-transform:scale(1.12);--ui-button-focus-shadow:0 12px 26px #0009;
  --ui-button-focus-bg:var(--ui-button-bg)}
:host([variant="round-sm"]){--ui-button-width:84px;--ui-button-height:84px;--ui-button-color:#777;--ui-button-font-size:50px;
  --ui-button-shadow:none;--ui-button-transition:.2s;--ui-button-focus-transform:scale(1.15);--ui-button-focus-shadow:none}
:host([variant="filled"]),:host([variant="filled-primary"]){--ui-button-width:auto;--ui-button-height:64px;--ui-button-radius:4px;
  --ui-button-bg:#3d444d;--ui-button-color:currentcolor;--ui-button-font-size:35px;--ui-button-padding:0 28px;--ui-button-line-height:64px;
  --ui-button-shadow:none;--ui-button-transition:.15s;--ui-button-focus-bg:#fff;--ui-button-focus-color:#111;
  --ui-button-focus-transform:scale(1.08);--ui-button-focus-shadow:none}
:host([variant="filled-primary"]){--ui-button-bg:#0057b8}
:host([variant="text"]){--ui-button-width:auto;--ui-button-height:auto;--ui-button-radius:6px;--ui-button-bg:transparent;
  --ui-button-color:${ACCENT};--ui-button-font-size:36px;--ui-button-padding:14px 28px;--ui-button-line-height:normal;
  --ui-button-font-family:${FC};--ui-button-letter-spacing:1px;--ui-button-shadow:none;--ui-button-transition:none;
  --ui-button-focus-bg:${ACCENT};--ui-button-focus-color:#fff;--ui-button-focus-transform:none;--ui-button-focus-shadow:none}
:host([variant="control"]){--ui-button-width:180px;--ui-button-height:180px;--ui-button-bg:transparent;--ui-button-color:currentcolor;
  --ui-button-font-size:76px;--ui-button-shadow:none;--ui-button-transition:.15s;--ui-button-focus-bg:#ffffff66;
  --ui-button-focus-transform:none;--ui-button-focus-shadow:none}
:host([variant="control-sm"]){--ui-button-width:72px;--ui-button-height:72px;--ui-button-bg:#555;--ui-button-color:currentcolor;
  --ui-button-font-size:40px;--ui-button-shadow:none;--ui-button-transition:.15s;--ui-button-focus-bg:#fff;--ui-button-focus-color:#333;
  --ui-button-focus-transform:scale(1.2);--ui-button-focus-shadow:none}`;
    static get observedAttributes() { return ['variant', 'disabled']; }
  }

  /* =====================================================================
   * ui-card : variant = (既定) | wide | dark | light | lift | dim | select
   * slots : media / badge / title / subtitle / (default)
   * 属性  : active(wide の強調) / toggle / checked
   * ===================================================================== */
  class UICard extends UIInteractive {
    static template = '<div class="im" part="media"><slot name="media"></slot><span class="tm" part="badge"><slot name="badge"></slot></span></div>' +
      '<div class="in" part="info"><div class="t" part="title"><slot name="title"></slot></div><div class="s" part="subtitle"><slot name="subtitle"></slot></div><slot></slot></div>';
    static styles = `
:host{--ui-card-width:auto;--ui-card-bg:#fff;--ui-card-shadow:0 2px 4px #0004;
  --ui-card-transition:transform .18s,box-shadow .18s,filter .18s;--ui-card-filter:none;--ui-card-focus-filter:none;
  --ui-card-focus-transform:scale(1.07);--ui-card-focus-shadow:0 18px 36px #0009;--ui-card-focus-z:5;--ui-card-hue:200;
  --ui-card-media-height:auto;
  --ui-card-media-bg:linear-gradient(135deg,hsl(var(--ui-card-hue) 55% 48%),hsl(calc(var(--ui-card-hue) + 60) 65% 24%));
  --ui-card-focus-media-bg:var(--ui-card-media-bg);--ui-card-media-display:block;--ui-card-media-place:normal;
  --ui-card-badge-display:block;--ui-card-badge-color:#bbb;
  --ui-card-info-height:auto;--ui-card-info-padding:18px 18px 0;--ui-card-info-bg:transparent;--ui-card-focus-info-bg:var(--ui-card-info-bg);
  --ui-card-info-color:#fff;--ui-card-focus-info-color:var(--ui-card-info-color);--ui-card-info-font-family:${FC};
  --ui-card-title-size:32px;--ui-card-title-color:currentcolor;--ui-card-title-white-space:nowrap;--ui-card-title-line-height:normal;--ui-card-title-max-height:none;
  --ui-card-subtitle-size:24px;--ui-card-subtitle-color:currentcolor;--ui-card-focus-subtitle-color:var(--ui-card-subtitle-color);--ui-card-subtitle-margin-top:0;
  position:relative;display:block;flex:none;box-sizing:border-box;cursor:pointer;
  width:var(--ui-card-width);background:var(--ui-card-bg);box-shadow:var(--ui-card-shadow);
  transition:var(--ui-card-transition);filter:var(--ui-card-filter)}
:host([focused]){transform:var(--ui-card-focus-transform);z-index:var(--ui-card-focus-z);box-shadow:var(--ui-card-focus-shadow);filter:var(--ui-card-focus-filter)}
:host([disabled]){opacity:.4;pointer-events:none}
.im{position:relative;display:var(--ui-card-media-display);place-items:var(--ui-card-media-place);height:var(--ui-card-media-height);background:var(--ui-card-media-bg)}
:host([focused]) .im{background:var(--ui-card-focus-media-bg)}
.tm{position:absolute;right:14px;bottom:8px;font-size:22px;color:var(--ui-card-badge-color);font-family:${FC};display:var(--ui-card-badge-display)}
.in{height:var(--ui-card-info-height);padding:var(--ui-card-info-padding);background:var(--ui-card-info-bg);color:var(--ui-card-info-color);font-family:var(--ui-card-info-font-family)}
:host([focused]) .in{background:var(--ui-card-focus-info-bg);color:var(--ui-card-focus-info-color)}
.t{font-size:var(--ui-card-title-size);color:var(--ui-card-title-color);font-family:var(--ui-card-title-font-family,inherit);
  white-space:var(--ui-card-title-white-space);overflow:hidden;text-overflow:ellipsis;line-height:var(--ui-card-title-line-height);max-height:var(--ui-card-title-max-height)}
.s{font-size:var(--ui-card-subtitle-size);color:var(--ui-card-subtitle-color);margin-top:var(--ui-card-subtitle-margin-top)}
:host([focused]) .s{color:var(--ui-card-focus-subtitle-color)}

:host([variant="wide"]){--ui-card-width:528px;--ui-card-media-height:296px;--ui-card-media-bg:#a9a9a9;--ui-card-info-height:104px;
  --ui-card-info-bg:#a9a9a9;--ui-card-info-color:#bbb;--ui-card-shadow:0 2px 3px #0002}
:host([variant="wide"][active]){--ui-card-media-bg:#fff;--ui-card-info-bg:${ACCENT};--ui-card-info-color:#fff;--ui-card-shadow:0 2px 4px #0004}
:host([variant="dark"]){--ui-card-width:313px;--ui-card-bg:#3a3a3a;--ui-card-shadow:0 3px 6px #0008;--ui-card-media-height:176px;
  --ui-card-info-height:104px;--ui-card-info-padding:20px 16px;--ui-card-title-size:34px;--ui-card-subtitle-size:24px;
  --ui-card-subtitle-color:#aaa;--ui-card-badge-display:none;--ui-card-focus-transform:scale(1.1)}
:host([variant="light"]){--ui-card-width:395px;--ui-card-bg:#f2f2f2;--ui-card-media-height:222px;--ui-card-info-height:178px;
  --ui-card-info-padding:20px 22px;--ui-card-info-color:#333;--ui-card-info-font-family:Roboto,"Noto Sans JP",sans-serif;
  --ui-card-title-size:30px;--ui-card-title-white-space:normal;--ui-card-title-line-height:1.2;--ui-card-title-max-height:72px;
  --ui-card-subtitle-size:22px;--ui-card-subtitle-color:#777;--ui-card-subtitle-margin-top:8px;--ui-card-badge-display:none;
  --ui-card-focus-transform:scale(1.1);--ui-card-focus-shadow:0 16px 30px #0008}
:host([variant="lift"]){--ui-card-width:440px;--ui-card-media-height:250px;--ui-card-media-bg:#a9a9a9;--ui-card-focus-media-bg:#fff;
  --ui-card-info-height:76px;--ui-card-info-padding:14px 18px 0;--ui-card-info-bg:#a0a0a0;--ui-card-focus-info-bg:${ACCENT};
  --ui-card-badge-display:none;--ui-card-focus-transform:translateY(-14px) scale(1.12)}
:host([variant="dim"]){--ui-card-width:312px;--ui-card-filter:brightness(.55);--ui-card-focus-filter:none;--ui-card-media-height:176px;
  --ui-card-info-height:104px;--ui-card-info-padding:20px 22px;--ui-card-info-bg:#00606a;--ui-card-focus-info-bg:${ACCENT2};
  --ui-card-title-size:28px;--ui-card-subtitle-size:22px;--ui-card-subtitle-color:#ffffff99;--ui-card-focus-subtitle-color:#fff;
  --ui-card-badge-display:none;--ui-card-focus-transform:scale(1.18)}
:host([variant="select"]){--ui-card-width:320px;--ui-card-bg:#272d30;--ui-card-shadow:none;--ui-card-transition:.15s;
  --ui-card-media-height:238px;--ui-card-media-bg:#919596;--ui-card-media-display:grid;--ui-card-media-place:center;
  --ui-card-info-height:141px;--ui-card-info-padding:20px 24px;--ui-card-title-size:30px;--ui-card-title-color:#a9aeb0;
  --ui-card-title-font-family:Roboto;--ui-card-subtitle-size:23px;--ui-card-subtitle-color:#777f82;
  --ui-card-focus-shadow:0 0 0 5px #fff;--ui-card-focus-transform:none;--ui-card-badge-display:none}`;
    static get observedAttributes() { return ['variant', 'active', 'checked', 'disabled']; }
    constructor() {
      super();
      bindToggle(this);
    }
    onAttr(name) { if (name === 'checked') syncChecks(this); }
    connectedCallback() { syncChecks(this); }
  }

  /* =====================================================================
   * ui-section : 見出し(slot=title) + 横並びの行。active で見出しと配下のカードを強調
   * ===================================================================== */
  class UISection extends UIElement {
    static template = '<div class="sec" part="title"><slot name="title"></slot></div><div class="row" part="row"><slot></slot></div>';
    static styles = `
:host{--ui-section-title-size:48px;--ui-section-title-height:62px;--ui-section-title-color:#bcbcbc;--ui-section-title-active-color:#fff;
  --ui-section-title-gap:26px;--ui-section-row-gap:12px;--ui-section-row-padding:30px 0;--ui-section-row-margin:-30px 0 40px;
  display:block}
.sec{font-family:${FC};font-size:var(--ui-section-title-size);height:var(--ui-section-title-height);line-height:var(--ui-section-title-height);
  color:var(--ui-section-title-color);margin-bottom:var(--ui-section-title-gap)}
:host([active]) .sec{color:var(--ui-section-title-active-color)}
.row{display:flex;gap:var(--ui-section-row-gap);overflow:hidden;padding:var(--ui-section-row-padding);margin:var(--ui-section-row-margin)}`;
    static get observedAttributes() { return ['active']; }
    constructor() {
      super();
      this.shadowRoot.addEventListener('slotchange', () => this._sync());
    }
    onAttr() { this._sync(); }
    connectedCallback() { this._sync(); }
    _sync() {
      const on = this.hasAttribute('active');
      this.querySelectorAll(':scope > ui-card').forEach((c) => {
        if (c.hasAttribute('active') !== on) c.toggleAttribute('active', on);
      });
    }
  }

  /* =====================================================================
   * ui-rail / ui-rail-item : 折りたたみ可能な縦ナビゲーション
   * slots(rail): leading / (default=items)   属性: collapsed
   * slots(item): icon / (default=label)      属性: selected
   * ===================================================================== */
  class UIRail extends UIElement {
    static template = '<slot name="leading"></slot><div class="items" part="items"><slot></slot></div>';
    static styles = `
:host{--ui-rail-width:570px;--ui-rail-collapsed-width:150px;--ui-rail-bg:${NAVBG};--ui-rail-shadow:0 0 12px #0004;
  --ui-rail-items-left:98px;--ui-rail-items-top:236px;--ui-rail-collapsed-items-left:52px;
  --ui-rail-leading-left:112px;--ui-rail-leading-top:62px;--ui-rail-collapsed-leading-left:35px;--ui-rail-collapsed-leading-top:70px;
  display:block;position:absolute;left:0;top:0;height:100%;width:var(--ui-rail-width);background:var(--ui-rail-bg);
  box-shadow:var(--ui-rail-shadow);transition:width .25s}
:host([collapsed]){width:var(--ui-rail-collapsed-width);--ui-rail-item-label-max-width:0px;--ui-rail-item-label-opacity:0;--ui-rail-item-selected-bg:#ffffff26}
.items{position:absolute;left:var(--ui-rail-items-left);top:var(--ui-rail-items-top);transition:left .25s}
:host([collapsed]) .items{left:var(--ui-rail-collapsed-items-left)}
::slotted([slot="leading"]){position:absolute;left:var(--ui-rail-leading-left);top:var(--ui-rail-leading-top)}
:host([collapsed]) ::slotted([slot="leading"]){left:var(--ui-rail-collapsed-leading-left);top:var(--ui-rail-collapsed-leading-top);
  --ui-button-width:80px;--ui-button-height:80px;--ui-button-font-size:46px}`;
    static get observedAttributes() { return ['collapsed']; }
    constructor() {
      super();
      this.addEventListener('ui-activate', (e) => {
        if (this.hasAttribute('manual-select')) return;
        const it = e.target;
        if (!(it instanceof Element) || it.localName !== 'ui-rail-item' || !this.contains(it)) return;
        this.select(it);
      });
    }
    select(it) {
      const items = [...this.querySelectorAll('ui-rail-item')];
      items.forEach((x) => x.toggleAttribute('selected', x === it));
      this.emit('ui-select', { item: it, index: items.indexOf(it) });
    }
  }

  class UIRailItem extends UIInteractive {
    static template = '<slot name="icon"></slot><span class="tx" part="label"><slot></slot></span>';
    static styles = `
:host{--ui-rail-item-height:68px;--ui-rail-item-font-size:38px;--ui-rail-item-color:#d4d4d4;--ui-rail-item-padding:0 14px;
  --ui-rail-item-margin-left:-14px;--ui-rail-item-radius:6px;--ui-rail-item-text-shadow:0 1px 2px #0003;--ui-rail-item-transition:.15s;
  --ui-rail-item-focus-bg:#ffffff33;--ui-rail-item-focus-color:#fff;
  --ui-rail-item-selected-height:84px;--ui-rail-item-selected-font-size:46px;--ui-rail-item-selected-color:#fff;
  --ui-rail-item-icon-width:48px;--ui-rail-item-icon-size:36px;--ui-rail-item-icon-gap:18px;
  --ui-rail-item-icon-color:#ffffffa8;--ui-rail-item-icon-selected-color:#fff;
  display:block;cursor:pointer;height:var(--ui-rail-item-height);line-height:var(--ui-rail-item-height);font-family:${FC};
  font-size:var(--ui-rail-item-font-size);color:var(--ui-rail-item-color);padding:var(--ui-rail-item-padding);
  margin-left:var(--ui-rail-item-margin-left);border-radius:var(--ui-rail-item-radius);white-space:nowrap;
  text-shadow:var(--ui-rail-item-text-shadow);transition:var(--ui-rail-item-transition)}
:host([selected]){font-size:var(--ui-rail-item-selected-font-size);color:var(--ui-rail-item-selected-color);
  height:var(--ui-rail-item-selected-height);line-height:var(--ui-rail-item-selected-height);background:var(--ui-rail-item-selected-bg,transparent)}
:host([focused]){background:var(--ui-rail-item-focus-bg);color:var(--ui-rail-item-focus-color)}
:host([disabled]){opacity:.4;pointer-events:none}
.tx{display:inline-block;vertical-align:middle;overflow:hidden;white-space:nowrap;max-width:var(--ui-rail-item-label-max-width,420px);
  opacity:var(--ui-rail-item-label-opacity,1);transition:max-width .25s,opacity .2s}
::slotted([slot="icon"]){display:inline-block;width:var(--ui-rail-item-icon-width);font-size:var(--ui-rail-item-icon-size);vertical-align:middle;
  margin-right:var(--ui-rail-item-icon-gap);color:var(--ui-rail-item-icon-color);text-align:center;line-height:1}
:host([selected]) ::slotted([slot="icon"]){color:var(--ui-rail-item-icon-selected-color)}`;
    static get observedAttributes() { return ['selected', 'disabled']; }
  }

  /* =====================================================================
   * ui-list / ui-list-item
   * list slots : header / (default=items)
   * item slots : leading / (default) / trailing  ・ variant="stacked" は title / subtitle
   * item 属性  : toggle(決定で checked を反転) / checked
   * ===================================================================== */
  class UIList extends UIElement {
    static template = '<div class="hd" part="header"><slot name="header"></slot></div><div class="bd" part="body"><slot></slot></div>';
    static styles = `
:host{--ui-list-width:1393px;--ui-list-shadow:0 8px 30px #0006;--ui-list-header-height:97px;--ui-list-header-bg:${ACCENT};
  --ui-list-header-font-size:31px;--ui-list-header-padding:0 0 0 64px;--ui-list-body-height:760px;--ui-list-body-bg:#b4b4b4;
  display:block;width:var(--ui-list-width);box-shadow:var(--ui-list-shadow);overflow:hidden}
.hd{height:var(--ui-list-header-height);line-height:var(--ui-list-header-height);background:var(--ui-list-header-bg);
  font-size:var(--ui-list-header-font-size);padding:var(--ui-list-header-padding)}
.bd{height:var(--ui-list-body-height);overflow:hidden;background:var(--ui-list-body-bg)}`;
  }

  class UIListItem extends UIInteractive {
    static template = '<div class="hl"></div><slot name="leading"></slot>' +
      '<span class="main"><slot></slot></span>' +
      '<span class="stack"><span class="a"><slot name="title"></slot></span><span class="b"><slot name="subtitle"></slot></span></span>' +
      '<slot name="trailing"></slot>';
    static styles = `
:host{--ui-list-item-display:flex;--ui-list-item-align:center;--ui-list-item-height:96px;--ui-list-item-font-size:31px;
  --ui-list-item-padding:0 64px;--ui-list-item-border:1px solid #c6c6c6;--ui-list-item-transition:none;
  --ui-list-item-highlight-bg:#d5d5d5;--ui-list-item-highlight-width:69%;--ui-list-item-highlight-display:block;--ui-list-item-focus-bg:transparent;
  --ui-list-item-leading-width:105px;--ui-list-item-leading-weight:400;
  --ui-list-item-title-size:38px;--ui-list-item-subtitle-size:24px;--ui-list-item-subtitle-color:#bdbdbd;
  position:relative;display:var(--ui-list-item-display);align-items:var(--ui-list-item-align);box-sizing:border-box;cursor:pointer;
  height:var(--ui-list-item-height);font-size:var(--ui-list-item-font-size);padding:var(--ui-list-item-padding);
  border-bottom:var(--ui-list-item-border);transition:var(--ui-list-item-transition)}
:host([focused]){background:var(--ui-list-item-focus-bg)}
:host([disabled]){opacity:.4;pointer-events:none}
.hl{display:none;position:absolute;left:0;top:0;bottom:0;width:var(--ui-list-item-highlight-width);background:var(--ui-list-item-highlight-bg)}
:host([focused]) .hl{display:var(--ui-list-item-highlight-display)}
.main,.stack{position:relative;z-index:1}
.main{flex:1}
.stack{display:none}
.a{display:block;font-size:var(--ui-list-item-title-size);font-family:${FC}}
.b{display:block;font-size:var(--ui-list-item-subtitle-size);color:var(--ui-list-item-subtitle-color)}
::slotted(*){position:relative;z-index:1}
::slotted([slot="leading"]){width:var(--ui-list-item-leading-width);font-weight:var(--ui-list-item-leading-weight)}
:host([variant="stacked"]){--ui-list-item-display:block;--ui-list-item-align:normal;--ui-list-item-height:130px;--ui-list-item-padding:26px 0 0 59px;
  --ui-list-item-font-size:16px;--ui-list-item-border:none;--ui-list-item-transition:.15s;--ui-list-item-focus-bg:#ffffff2a;
  --ui-list-item-highlight-display:none}
:host([variant="stacked"]) .main{display:none}
:host([variant="stacked"]) .stack{display:block}`;
    static get observedAttributes() { return ['variant', 'checked', 'disabled']; }
    constructor() {
      super();
      bindToggle(this);
    }
    onAttr(name) { if (name === 'checked') syncChecks(this); }
    connectedCallback() { syncChecks(this); }
  }

  /* =====================================================================
   * ui-check : variant = (既定=circle) | box     属性: checked
   * ===================================================================== */
  class UICheck extends UIElement {
    static template = '<slot></slot>';
    static styles = `
:host{--ui-check-size:96px;--ui-check-radius:50%;--ui-check-bg:#5a5f66;--ui-check-color:#9aa0a5;--ui-check-font-size:64px;
  --ui-check-checked-bg:#00bfff;--ui-check-checked-color:#fff;--ui-check-unchecked-icon-display:contents;
  display:grid;place-items:center;box-sizing:border-box;width:var(--ui-check-size);height:var(--ui-check-size);
  border-radius:var(--ui-check-radius);background:var(--ui-check-bg);color:var(--ui-check-color);font-size:var(--ui-check-font-size)}
:host([checked]){background:var(--ui-check-checked-bg);color:var(--ui-check-checked-color)}
slot{display:var(--ui-check-unchecked-icon-display)}
:host([checked]) slot{display:contents}
:host([variant="box"]){--ui-check-size:56px;--ui-check-radius:2px;--ui-check-bg:#fff;--ui-check-color:#1fa88c;--ui-check-font-size:44px;
  --ui-check-checked-bg:#fff;--ui-check-checked-color:#1fa88c;--ui-check-unchecked-icon-display:none}`;
    static get observedAttributes() { return ['variant', 'checked']; }
  }

  /* =====================================================================
   * ui-keyboard / ui-key-row / ui-key
   * key variant = (既定) | label | space     属性: value
   * ===================================================================== */
  class UIKeyboard extends UIElement {
    static template = '<slot></slot>';
    static styles = ':host{display:block}';
  }
  class UIKeyRow extends UIElement {
    static template = '<slot></slot>';
    static styles = ':host{--ui-key-row-height:72px;display:flex;height:var(--ui-key-row-height);margin-bottom:0}';
  }
  class UIKey extends UIInteractive {
    static template = '<slot></slot><span class="bar" part="bar"></span>';
    static styles = `
:host{--ui-key-width:81px;--ui-key-height:72px;--ui-key-font-size:40px;--ui-key-font-weight:300;--ui-key-radius:6px;--ui-key-transition:.1s;
  --ui-key-focus-bg:#ffffff40;--ui-key-focus-transform:scale(1.12);--ui-key-icon-size:36px;--ui-key-margin-left:0px;
  --ui-key-bar-width:380px;--ui-key-bar-height:12px;--ui-key-bar-top:30px;--ui-key-bar-display:none;
  position:relative;display:grid;place-items:center;cursor:pointer;width:var(--ui-key-width);height:var(--ui-key-height);
  margin-left:var(--ui-key-margin-left);font-size:var(--ui-key-font-size);font-weight:var(--ui-key-font-weight);
  font-family:var(--ui-key-font-family,inherit);border-radius:var(--ui-key-radius);transition:var(--ui-key-transition)}
:host([focused]){background:var(--ui-key-focus-bg);transform:var(--ui-key-focus-transform)}
:host([disabled]){opacity:.4;pointer-events:none}
::slotted(ui-icon){font-size:var(--ui-key-icon-size)}
.bar{display:var(--ui-key-bar-display);position:absolute;top:var(--ui-key-bar-top);left:calc((100% - var(--ui-key-bar-width)) / 2);
  width:var(--ui-key-bar-width);height:var(--ui-key-bar-height);background:#fff;border-radius:1px}
:host([variant="label"]){--ui-key-font-size:28px;--ui-key-font-family:${FC}}
:host([variant="space"]){--ui-key-width:432px;--ui-key-margin-left:30px;--ui-key-bar-display:block}`;
    static get observedAttributes() { return ['variant', 'value', 'disabled']; }
    constructor() {
      super();
      this.addEventListener('ui-activate', (e) => {
        if (e.target !== this) return;
        const value = this.hasAttribute('value') ? this.getAttribute('value') : this.textContent.trim();
        this.emit('ui-key-press', { value, element: this });
      });
    }
  }

  /* =====================================================================
   * ui-field : 表示専用の入力欄。value / placeholder / caret 属性
   * variant = (既定=box) | box-light | underline
   * ===================================================================== */
  class UIField extends UIInteractive {
    static template = '<span class="txt" part="text"></span>';
    static styles = `
:host{--ui-field-width:1200px;--ui-field-height:112px;--ui-field-bg:#b3b3b3;--ui-field-color:#8b8b8b;--ui-field-filled-color:#222;
  --ui-field-font-size:40px;--ui-field-font-weight:400;--ui-field-line-height:112px;--ui-field-padding:0 0 0 48px;--ui-field-transition:.15s;
  --ui-field-shadow:none;--ui-field-border-bottom:none;--ui-field-focus-bg:#c9c9c9;--ui-field-focus-shadow:0 0 0 4px #fff;
  --ui-field-caret-width:3px;--ui-field-caret-height:64px;--ui-field-caret-color:#fff;
  display:block;cursor:text;white-space:nowrap;overflow:hidden;width:var(--ui-field-width);height:var(--ui-field-height);
  background:var(--ui-field-bg);color:var(--ui-field-color);font-size:var(--ui-field-font-size);font-weight:var(--ui-field-font-weight);
  line-height:var(--ui-field-line-height);padding:var(--ui-field-padding);transition:var(--ui-field-transition);
  box-shadow:var(--ui-field-shadow);border-bottom:var(--ui-field-border-bottom)}
:host([filled]){color:var(--ui-field-filled-color)}
:host([focused]){background:var(--ui-field-focus-bg);box-shadow:var(--ui-field-focus-shadow)}
:host([caret]) .txt::after{content:"";display:inline-block;width:var(--ui-field-caret-width);height:var(--ui-field-caret-height);
  background:var(--ui-field-caret-color);vertical-align:middle;animation:ui-blink 1s steps(1) infinite}
@keyframes ui-blink{50%{opacity:0}}
:host([variant="box-light"]){--ui-field-width:1136px;--ui-field-bg:#dcdcdc;--ui-field-color:#999;--ui-field-filled-color:#666;
  --ui-field-font-size:38px;--ui-field-shadow:0 1px 2px #0003;--ui-field-focus-bg:#eee;--ui-field-focus-shadow:0 0 0 4px #4285f4}
:host([variant="underline"]){--ui-field-width:384px;--ui-field-height:84px;--ui-field-bg:transparent;--ui-field-color:#fff;--ui-field-filled-color:#fff;
  --ui-field-font-size:60px;--ui-field-font-weight:300;--ui-field-line-height:normal;--ui-field-padding:0;--ui-field-transition:none;
  --ui-field-border-bottom:3px solid #fff;--ui-field-focus-bg:transparent;--ui-field-focus-shadow:none}`;
    static get observedAttributes() { return ['variant', 'value', 'placeholder', 'caret']; }
    constructor() {
      super();
      this._t = this.shadowRoot.querySelector('.txt');
    }
    get value() { return this.getAttribute('value') || ''; }
    set value(v) { this.setAttribute('value', String(v == null ? '' : v)); }
    onAttr(name, oldV, newV) {
      if (name === 'value' || name === 'placeholder') {
        this._render();
        if (name === 'value' && this.isConnected) this.emit('ui-change', { value: newV || '', element: this });
      }
    }
    connectedCallback() { this._render(); }
    _render() {
      const v = this.value;
      this._t.textContent = v || this.getAttribute('placeholder') || '';
      this.toggleAttribute('filled', !!v);
    }
  }

  /* =====================================================================
   * ui-progress : value / max 属性。slots: start / end / (default=中央のコントロール)
   * ===================================================================== */
  class UIProgress extends UIElement {
    static template = '<div class="tk" part="track"><div class="pg" part="fill"></div></div>' +
      '<span class="tt s"><slot name="start"></slot></span><span class="tt e"><slot name="end"></slot></span>' +
      '<div class="ct" part="controls"><slot></slot></div>';
    static styles = `
:host{--ui-progress-width:1395px;--ui-progress-height:138px;--ui-progress-bg:${ACCENT};--ui-progress-track-height:6px;
  --ui-progress-track-bg:#ffffff70;--ui-progress-fill-bg:#fff;--ui-progress-label-top:30px;--ui-progress-label-size:22px;
  --ui-progress-label-color:#ffffffa0;--ui-progress-label-inset:28px;--ui-progress-controls-gap:20px;
  position:relative;display:block;overflow:hidden;width:var(--ui-progress-width);height:var(--ui-progress-height);background:var(--ui-progress-bg)}
.tk{position:absolute;left:0;right:0;top:0;height:var(--ui-progress-track-height);background:var(--ui-progress-track-bg)}
.pg{height:var(--ui-progress-track-height);background:var(--ui-progress-fill-bg);width:0}
.tt{position:absolute;top:var(--ui-progress-label-top);font-size:var(--ui-progress-label-size);color:var(--ui-progress-label-color)}
.tt.s{left:var(--ui-progress-label-inset)}
.tt.e{right:var(--ui-progress-label-inset)}
.ct{position:absolute;left:0;right:0;top:0;bottom:0;display:flex;justify-content:center;align-items:center;gap:var(--ui-progress-controls-gap)}`;
    static get observedAttributes() { return ['value', 'max']; }
    constructor() {
      super();
      this._pg = this.shadowRoot.querySelector('.pg');
    }
    onAttr() { this._update(); }
    connectedCallback() { this._update(); }
    _update() {
      const max = parseFloat(this.getAttribute('max')) || 100;
      const val = parseFloat(this.getAttribute('value')) || 0;
      this._pg.style.width = Math.max(0, Math.min(100, (val / max) * 100)) + '%';
    }
  }

  /* =====================================================================
   * ui-tile : variant = (既定=solid) | lift | gradient
   * ===================================================================== */
  class UITile extends UIInteractive {
    static template = '<slot></slot>';
    static styles = `
:host{--ui-tile-width:auto;--ui-tile-height:128px;--ui-tile-bg:#a9a9a9;--ui-tile-shadow:0 2px 3px #0003;--ui-tile-transition:.15s;
  --ui-tile-focus-bg:#fff;--ui-tile-focus-transform:scale(1.1);--ui-tile-focus-shadow:0 10px 20px #0007;--ui-tile-focus-outline:none;
  --ui-tile-focus-z:3;--ui-tile-hue:200;
  position:relative;display:block;cursor:pointer;width:var(--ui-tile-width);height:var(--ui-tile-height);background:var(--ui-tile-bg);
  box-shadow:var(--ui-tile-shadow);transition:var(--ui-tile-transition)}
:host([focused]){background:var(--ui-tile-focus-bg);transform:var(--ui-tile-focus-transform);z-index:var(--ui-tile-focus-z);
  box-shadow:var(--ui-tile-focus-shadow);outline:var(--ui-tile-focus-outline)}
:host([disabled]){opacity:.4;pointer-events:none}
:host([variant="lift"]){--ui-tile-width:530px;--ui-tile-height:200px;--ui-tile-bg:#a8a8a8;--ui-tile-shadow:none;--ui-tile-focus-bg:#c4c4c4;
  --ui-tile-focus-transform:translateY(-14px);--ui-tile-focus-shadow:none}
:host([variant="gradient"]){--ui-tile-height:170px;
  --ui-tile-bg:linear-gradient(135deg,hsl(var(--ui-tile-hue) 45% 50%),hsl(calc(var(--ui-tile-hue) + 50) 50% 26%));
  --ui-tile-shadow:none;--ui-tile-focus-bg:var(--ui-tile-bg);--ui-tile-focus-outline:4px solid #fff;--ui-tile-focus-shadow:0 14px 28px #000a}`;
    static get observedAttributes() { return ['variant', 'disabled']; }
  }

  /* =====================================================================
   * ui-panel : 中央寄せのアイコン / コンテンツ枠。variant = (既定) | accent
   * ===================================================================== */
  class UIPanel extends UIElement {
    static template = '<slot></slot>';
    static styles = `
:host{--ui-panel-size:120px;--ui-panel-bg:#fff;--ui-panel-color:#cfcfcf;--ui-panel-font-size:70px;
  display:grid;place-items:center;width:var(--ui-panel-size);height:var(--ui-panel-size);background:var(--ui-panel-bg);
  color:var(--ui-panel-color);font-size:var(--ui-panel-font-size)}
:host([variant="accent"]){--ui-panel-size:279px;--ui-panel-bg:${ACCENT};--ui-panel-color:#ffffffcc;--ui-panel-font-size:150px}`;
    static get observedAttributes() { return ['variant']; }
  }

  /* =====================================================================
   * ui-toast : show(text, duration) / hide() / open 属性
   * ===================================================================== */
  class UIToast extends UIElement {
    static template = '<slot></slot>';
    static styles = `
:host{--ui-toast-bg:#000d;--ui-toast-padding:18px 40px;--ui-toast-radius:40px;--ui-toast-font-size:30px;--ui-toast-bottom:50px;--ui-toast-z:99;
  position:absolute;left:50%;bottom:var(--ui-toast-bottom);transform:translate(-50%,40px);background:var(--ui-toast-bg);
  padding:var(--ui-toast-padding);border-radius:var(--ui-toast-radius);font-size:var(--ui-toast-font-size);opacity:0;transition:.3s;z-index:var(--ui-toast-z)}
:host([open]){opacity:1;transform:translate(-50%,0)}`;
    static get observedAttributes() { return ['open']; }
    show(text, duration) {
      if (text !== undefined) this.textContent = text;
      const d = duration != null ? duration : (parseFloat(this.getAttribute('duration')) || 1500);
      this.setAttribute('open', '');
      clearTimeout(this._tm);
      this._tm = setTimeout(() => this.hide(), d);
    }
    hide() {
      clearTimeout(this._tm);
      this.removeAttribute('open');
    }
  }

  /* ---------- 登録 ---------- */
  const defs = {
    'ui-stage': UIStage, 'ui-screen': UIScreen, 'ui-icon': UIIcon, 'ui-button': UIButton, 'ui-card': UICard,
    'ui-section': UISection, 'ui-rail': UIRail, 'ui-rail-item': UIRailItem, 'ui-list': UIList, 'ui-list-item': UIListItem,
    'ui-check': UICheck, 'ui-keyboard': UIKeyboard, 'ui-key-row': UIKeyRow, 'ui-key': UIKey, 'ui-field': UIField,
    'ui-progress': UIProgress, 'ui-tile': UITile, 'ui-panel': UIPanel, 'ui-toast': UIToast
  };
  for (const [tag, cls] of Object.entries(defs)) {
    if (!customElements.get(tag)) customElements.define(tag, cls);
  }
  window.UIComponents = { version: '1.0.0', tags: Object.keys(defs) };
})();
