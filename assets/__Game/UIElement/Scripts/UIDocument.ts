import { _decorator, Component, Enum, game, Size, SpriteFrame, TextAsset, view, warn } from 'cc';
import { UIBinding } from './UIBinding';
import { spriteFrameToUrl } from './UIAssetResolver';
import { UIScriptRunner } from './UIScript';
import { playGroundField } from 'db://cocos-playground/PlayGroundField';
const { ccclass, property, disallowMultiple, menu } = _decorator;

export enum UIScaleMode {
    /** 1 CSS px = `scaleFactor` screen px, whatever the screen size. */
    ConstantPixelSize,
    /** Layout is authored at a reference resolution and scaled to fit the canvas. */
    ScaleWithScreenSize,
}
Enum(UIScaleMode);

@ccclass('UIAssetEntry')
export class UIAssetEntry {
    @property({ tooltip: 'Used as asset(key) in HTML/CSS' })
    key = '';

    @property(SpriteFrame)
    spriteFrame: SpriteFrame | null = null;
}

const BASE_CSS = `
:host { all: initial; }
.ui-root {
    position: absolute; left: 0; top: 0;
    transform-origin: 0 0;
    display: flex; flex-direction: column;
    overflow: hidden;
    font-family: Arial, Helvetica, sans-serif; font-size: 16px; color: #fff;
    user-select: none; -webkit-user-select: none;
    -webkit-tap-highlight-color: transparent;
    pointer-events: none;
}
.ui-root, .ui-root * { box-sizing: border-box; }
.ui-root * { pointer-events: auto; }
.ui-root [picking-mode="ignore"] { pointer-events: none; }
.ui-root button, .ui-root input, .ui-root select, .ui-root textarea { font: inherit; }
.ui-hidden { display: none !important; }
`;

const ASSET_PATTERN = /asset\(\s*['"]?([^'")\s]+)['"]?\s*\)/g;

/**
 * Cocos equivalent of Unity's UIDocument: renders an HTML + CSS document as a DOM
 * overlay on top of the game canvas (web / playable builds only).
 *
 * - Every UIDocument lives in its own Shadow DOM, so its CSS never leaks.
 * - The root element has `pointer-events: none`; every descendant blocks game input
 *   unless it has `picking-mode="ignore"` (same semantics as Unity's pickingMode).
 * - `asset(key)` in HTML/CSS is replaced by the URL of the matching entry in `assets`.
 * - Inline `<script>` tags run once the content is built (see UIScript.ts for what they can use).
 */
@ccclass('UIDocument')
@disallowMultiple
@menu('UI/UIDocument')
export class UIDocument extends Component {
    static readonly EventType = {
        /** Emitted on the node when an element with `data-action` is clicked: (action, element, event). */
        ACTION: 'ui-action',
    };

    @playGroundField({ type: TextAsset, label: "HTML" })
    htmlAsset: TextAsset | null = null;

    @property({ type: [TextAsset], tooltip: 'Extra HTML files appended after Html Asset, usually <template> definitions (e.g. one file per screen)' })
    templates: TextAsset[] = [];

    @property({ type: [TextAsset], tooltip: 'CSS files, applied in order' })
    styleSheets: TextAsset[] = [];

    @property({ type: [UIAssetEntry], tooltip: 'Images referenced as asset(key) in HTML/CSS' })
    assets: UIAssetEntry[] = [];

    @property({ tooltip: 'Higher values render on top of other UIDocuments' })
    get sortingOrder() { return this._sortingOrder; }
    set sortingOrder(value: number) {
        this._sortingOrder = value;
        if (this._host) this._host.style.zIndex = String(10 + value);
    }
    @property
    private _sortingOrder = 0;

    @property({ type: UIScaleMode })
    scaleMode = UIScaleMode.ScaleWithScreenSize;

    @property({ visible(this: UIDocument) { return this.scaleMode === UIScaleMode.ConstantPixelSize; } })
    scaleFactor = 1;

    @property({
        tooltip: 'Use the project design resolution as reference resolution',
        visible(this: UIDocument) { return this.scaleMode === UIScaleMode.ScaleWithScreenSize; },
    })
    useDesignResolution = true;

    @property({ visible(this: UIDocument) { return this.scaleMode === UIScaleMode.ScaleWithScreenSize && !this.useDesignResolution; } })
    referenceResolution = new Size(720, 1280);

    @property({
        range: [0, 1, 0.01], slide: true,
        tooltip: '0 = match width, 1 = match height',
        visible(this: UIDocument) { return this.scaleMode === UIScaleMode.ScaleWithScreenSize; },
    })
    match = 0.5;

    /**
     * Values published by the inline `<script>` tags of the HTML (`exports.burst = ...`).
     * Always the same object; emptied when the content is rebuilt.
     */
    readonly exports: Record<string, any> = {};

    private _host: HTMLDivElement | null = null;
    private _shadow: ShadowRoot | null = null;
    private _style: HTMLStyleElement | null = null;
    private _root: HTMLDivElement | null = null;
    private _binding: UIBinding<any> | null = null;
    private _resizeObserver: ResizeObserver | null = null;
    private _layoutFrame = 0;
    private _htmlOverride: string | null = null;
    private _cssOverride: string[] | null = null;
    private _scripts = new UIScriptRunner();

    /** Root of the visual tree (like Unity's rootVisualElement). Built lazily on first access. */
    get rootVisualElement(): HTMLElement | null {
        this.ensureBuilt();
        return this._root;
    }

    /** Current bound data (see `bind`). */
    get dataSource(): any {
        return this._binding ? this._binding.state : null;
    }

    onEnable() {
        if (this.ensureBuilt()) {
            this._host!.style.display = '';
            this.scheduleLayout();
        }
    }

    onDisable() {
        if (this._host) this._host.style.display = 'none';
    }

    onDestroy() {
        this.disposeScripts();
        if (this._binding) this._binding.dispose();
        if (this._resizeObserver) this._resizeObserver.disconnect();
        if (this._layoutFrame) cancelAnimationFrame(this._layoutFrame);
        if (this._host) {
            window.removeEventListener('resize', this.scheduleLayout);
            window.removeEventListener('orientationchange', this.scheduleLayout);
            this._host.remove();
        }
        this._host = this._shadow = this._style = this._root = null;
        this._binding = null;
    }

    // ---------------------------------------------------------------- Query

    /** querySelector inside this document. */
    q<E extends Element = HTMLElement>(selector: string): E | null {
        const root = this.rootVisualElement;
        return root ? root.querySelector(selector) as E | null : null;
    }

    /** querySelectorAll inside this document, as an array. */
    qAll<E extends Element = HTMLElement>(selector: string): E[] {
        const root = this.rootVisualElement;
        return root ? Array.from(root.querySelectorAll(selector)) as E[] : [];
    }

    /** Unity-style Q(name, className). `name` matches the id or the `name` attribute. */
    Q<E extends Element = HTMLElement>(name?: string, className?: string): E | null {
        const cls = className ? `.${CSS.escape(className)}` : '';
        if (!name) return this.q<E>(cls || '*');
        return this.q<E>(`#${CSS.escape(name)}${cls}, [name="${CSS.escape(name)}"]${cls}`);
    }

    // ---------------------------------------------------------------- Events

    /**
     * Delegated event listener: `handler` runs when an event of `type` bubbles from an element
     * matching `selector`. Survives `reload()`. Returns a function that removes the listener.
     * Non-bubbling events (focus, mouseenter...) need their bubbling variants (focusin, pointerover...).
     */
    on<K extends keyof HTMLElementEventMap>(
        selector: string,
        type: K,
        handler: (ev: HTMLElementEventMap[K], el: HTMLElement) => void,
    ): () => void {
        if (!this.ensureBuilt()) return () => { };
        const root = this._root!;
        const listener = (ev: Event) => {
            const target = ev.target as Element;
            const el = target && target.closest ? target.closest<HTMLElement>(selector) : null;
            if (el && root.contains(el)) handler(ev as HTMLElementEventMap[K], el);
        };
        root.addEventListener(type, listener);
        return () => root.removeEventListener(type, listener);
    }

    /** Shorthand for `on(selector, 'click', handler)`. */
    onClick(selector: string, handler: (ev: MouseEvent, el: HTMLElement) => void) {
        return this.on(selector, 'click', handler);
    }

    /** Runs `handler` when an element with `data-action="<action>"` is clicked. */
    onAction(action: string, handler: (el: HTMLElement, ev: MouseEvent) => void): () => void {
        const listener = (name: string, el: HTMLElement, ev: MouseEvent) => {
            if (name === action) handler(el, ev);
        };
        this.node.on(UIDocument.EventType.ACTION, listener);
        return () => this.node.off(UIDocument.EventType.ACTION, listener);
    }

    // ---------------------------------------------------------------- Data binding & templates

    /**
     * Binds `data` to `data-bind` / `data-show` / `data-class` attributes and returns a reactive
     * proxy: mutate the proxy and the DOM updates on the next microtask.
     */
    bind<T extends object>(data: T): T {
        if (!this.ensureBuilt()) return data;
        if (this._binding) this._binding.dispose();
        this._binding = new UIBinding(this._root!, data);
        return this._binding.state;
    }

    /** Re-applies bindings, e.g. after appending instantiated templates. */
    refreshBindings() {
        if (this._binding) this._binding.refresh();
    }

    /** Clones the first element of `<template id="templateId">`. */
    instantiate<E extends HTMLElement = HTMLElement>(templateId: string): E | null {
        const template = this.q<HTMLTemplateElement>(`template#${CSS.escape(templateId)}`);
        if (!template) {
            warn(`[UIDocument] Template "${templateId}" not found.`);
            return null;
        }
        const element = template.content.firstElementChild;
        return element ? element.cloneNode(true) as E : null;
    }

    /** URL of an entry of `assets`, for use from code (e.g. img.src = doc.assetUrl('coin')). */
    assetUrl(key: string): string {
        const entry = this.assets.find(a => a.key === key);
        return entry ? spriteFrameToUrl(entry.spriteFrame) : '';
    }

    // ---------------------------------------------------------------- Content

    /** Replaces the document with raw strings instead of the assigned TextAssets. */
    setSource(html: string, css: string[] = []) {
        this._htmlOverride = html;
        this._cssOverride = css;
        this.reload();
    }

    /**
     * Adds a stylesheet placed before the document's own CSS, so the document can override it
     * (used by libraries such as UINavigation). Calling again with the same `id` replaces it.
     */
    addStyle(css: string, id?: string): HTMLStyleElement | null {
        if (!this.ensureBuilt()) return null;
        const shadow = this._shadow!;
        let style = id ? shadow.querySelector<HTMLStyleElement>(`style[data-id="${CSS.escape(id)}"]`) : null;
        if (!style) {
            style = document.createElement('style');
            if (id) style.dataset.id = id;
            shadow.insertBefore(style, this._style);
        }
        style.textContent = this.resolveAssets(css, true);
        return style;
    }

    /**
     * Rebuilds the visual tree from the current sources. Delegated listeners and bindings are kept,
     * but anything created at runtime inside the root (e.g. a UINavigation) is wiped.
     * Inline scripts are disposed (onDispose callbacks, loops) and run again.
     */
    reload() {
        const built = !!this._host;
        // A first build already applies the content (and runs the scripts) once.
        if (this.ensureBuilt() && built) this.applyContent();
    }

    // ---------------------------------------------------------------- Internals

    private ensureBuilt(): boolean {
        if (this._host) return true;
        if (!this.isValid) return false;
        const canvas = game.canvas;
        if (typeof document === 'undefined' || !canvas) {
            warn('[UIDocument] DOM is not available on this platform; UIDocument only works on web builds.');
            return false;
        }

        const parent = canvas.parentElement || document.body;
        if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';

        const host = this._host = document.createElement('div');
        host.className = 'cc-ui-document';
        host.dataset.node = this.node.name;
        host.style.position = 'absolute';
        host.style.overflow = 'hidden';
        host.style.pointerEvents = 'none';
        host.style.zIndex = String(10 + this._sortingOrder);
        if (!this.enabledInHierarchy) host.style.display = 'none';

        this._shadow = host.attachShadow({ mode: 'open' });
        this._style = document.createElement('style');
        this._root = document.createElement('div');
        this._root.className = 'ui-root';
        this._shadow.appendChild(this._style);
        this._shadow.appendChild(this._root);
        parent.appendChild(host);

        this._root.addEventListener('click', ev => {
            const target = ev.target as Element;
            const el = target && target.closest ? target.closest<HTMLElement>('[data-action]') : null;
            if (el) this.node.emit(UIDocument.EventType.ACTION, el.dataset.action, el, ev);
        });

        if (typeof ResizeObserver !== 'undefined') {
            this._resizeObserver = new ResizeObserver(this.scheduleLayout);
            this._resizeObserver.observe(canvas);
        }
        window.addEventListener('resize', this.scheduleLayout);
        window.addEventListener('orientationchange', this.scheduleLayout);

        // Layout first, so inline scripts can measure elements.
        this.updateLayout();
        this.applyContent();
        return true;
    }

    private applyContent() {
        this.disposeScripts();
        const html = this._htmlOverride !== null ? this._htmlOverride : (this.htmlAsset ? this.htmlAsset.text : '');
        const sheets = this._cssOverride !== null
            ? this._cssOverride
            : this.styleSheets.filter(Boolean).map(sheet => sheet.text);

        const templates = this.templates.filter(Boolean).map(asset => asset.text);

        this._style!.textContent = BASE_CSS + sheets.map(css => this.resolveAssets(css, true)).join('\n');
        this._root!.innerHTML = this.resolveAssets([html, ...templates].join('\n'), false);
        this.refreshBindings();

        // Scripts inside <template> are not reached here: screens run their own when mounted.
        this._scripts.run(Array.from(this._root!.querySelectorAll('script')), {
            root: this._root!,
            doc: this,
            screen: null,
            exports: this.exports,
            label: `ui/${this.node.name}`,
        });
    }

    private disposeScripts() {
        this._scripts.dispose();
        for (const key of Object.keys(this.exports)) delete this.exports[key];
    }

    private resolveAssets(text: string, isCss: boolean): string {
        return text.replace(ASSET_PATTERN, (_match, key: string) => {
            const url = this.assetUrl(key);
            if (!url) warn(`[UIDocument] asset("${key}") is not registered on node "${this.node.name}".`);
            if (isCss) return url ? `url("${url}")` : 'none';
            return url;
        });
    }

    private scheduleLayout = () => {
        if (this._layoutFrame) return;
        this._layoutFrame = requestAnimationFrame(() => {
            this._layoutFrame = 0;
            this.updateLayout();
        });
    };

    private updateLayout() {
        const canvas = game.canvas;
        const host = this._host;
        if (!canvas || !host || !host.parentElement) return;

        const canvasRect = canvas.getBoundingClientRect();
        const parent = host.parentElement;
        const parentRect = parent.getBoundingClientRect();
        const width = canvasRect.width;
        const height = canvasRect.height;
        if (width <= 0 || height <= 0) return;

        host.style.left = `${canvasRect.left - parentRect.left - parent.clientLeft}px`;
        host.style.top = `${canvasRect.top - parentRect.top - parent.clientTop}px`;
        host.style.width = `${width}px`;
        host.style.height = `${height}px`;

        const scale = this.computeScale(width, height);
        const root = this._root!;
        root.style.width = `${width / scale}px`;
        root.style.height = `${height / scale}px`;
        root.style.transform = `scale(${scale})`;
    }

    private computeScale(width: number, height: number): number {
        if (this.scaleMode === UIScaleMode.ConstantPixelSize) return Math.max(this.scaleFactor, 0.0001);
        const reference = this.useDesignResolution ? view.getDesignResolutionSize() : this.referenceResolution;
        if (reference.width <= 0 || reference.height <= 0) return 1;
        // Same formula as Unity's CanvasScaler / PanelSettings: interpolate in log space.
        const logWidth = Math.log2(width / reference.width);
        const logHeight = Math.log2(height / reference.height);
        return Math.pow(2, logWidth + (logHeight - logWidth) * this.match);
    }
}
