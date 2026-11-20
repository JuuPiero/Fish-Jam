import { warn } from 'cc';
import { UIDocument } from './UIDocument';
import { BIND_SCOPE_ATTR, UIBinding } from './UIBinding';
import { UIScriptRunner } from './UIScript';

/**
 * Screen navigation for UIDocument, modelled after React Navigation:
 *
 *   new UINavigation(doc, {
 *       root: stack({
 *           main: tabs({ play: PlayScreen, shop: ShopScreen }, { template: 'main-tabs' }),
 *           level: LevelScreen,
 *       }),
 *       modals: { confirm: ConfirmDialog },
 *   });
 *
 * - A screen is a UIScreen subclass; its DOM is cloned from `<template id="<route name>">`.
 * - Navigators (stack / tabs) are screens too, so they nest freely.
 * - Modals are presented above everything and return a result: `await screen.present('confirm')`.
 * - Declarative navigation in HTML: data-nav="push:shop | back | tab:play | modal:confirm | close ..."
 * - Inline `<script>` tags of a screen template run on mount (before onMount), with `screen` set.
 */

// ====================================================================== Types

export type StackAnimation = 'slide' | 'slide-up' | 'fade' | 'none';
export type ModalPresentation = 'dialog' | 'sheet' | 'fullscreen';

export interface ScreenOptions {
    /** Id of the `<template>` to clone. Defaults to the route name (navigators: none). */
    template?: string;
    /** Transition used when this screen is pushed onto / popped from a stack. */
    animation?: StackAnimation;
    /** How the screen is shown when presented as a modal. */
    presentation?: ModalPresentation;
    /** Modal: tapping the backdrop closes it. Defaults to true except for fullscreen. */
    dismissOnBackdrop?: boolean;
    /** `ignore` lets touches on the screen background through to the game (HUD screens). */
    pickingMode?: 'position' | 'ignore';
}

export type ScreenClass = new () => UIScreen;

export interface RouteConfig {
    screen: ScreenClass;
    options?: ScreenOptions;
    /** Set by stack() / tabs(). */
    navigator?: NavigatorConfig;
}

export type RouteDef = ScreenClass | RouteConfig;
export type Routes = Record<string, RouteDef>;

export interface NavigatorConfig {
    routes: Routes;
    initial?: string;
    initialParams?: any;
    /** Stack: default transition of its screens. Tabs: tab switch transition. */
    animation?: StackAnimation;
}

export interface StackConfig {
    /** First screen. Defaults to the first route. */
    initial?: string;
    initialParams?: any;
    /** Optional layout template wrapping the stack; must contain a `data-outlet` element. */
    template?: string;
    /** Default transition of the screens of this stack. */
    animation?: StackAnimation;
    /** UIStack subclass, to add your own logic to the navigator. */
    screen?: new () => UIStack;
}

export interface TabsConfig {
    initial?: string;
    initialParams?: any;
    /** Layout template: tab buttons (data-nav="tab:<name>") + a `data-outlet` element. */
    template?: string;
    animation?: 'fade' | 'none';
    /** UITabs subclass, to add your own logic to the navigator. */
    screen?: new () => UITabs;
}

export interface NavigationOptions {
    root: RouteDef;
    modals?: Routes;
    /** Element receiving the root navigator. Defaults to a full-screen layer in the document. */
    container?: HTMLElement;
    /** Escape key calls goBack(). Default true. */
    escapeToGoBack?: boolean;
}

/** Declares a stack navigator: push / pop screens with transitions. */
export function stack(routes: Routes, config: StackConfig = {}): RouteConfig {
    return {
        screen: config.screen || UIStack,
        options: config.template ? { template: config.template } : undefined,
        navigator: { routes, initial: config.initial, initialParams: config.initialParams, animation: config.animation },
    };
}

/** Declares a tab navigator: one screen visible at a time, visited tabs stay alive. */
export function tabs(routes: Routes, config: TabsConfig = {}): RouteConfig {
    return {
        screen: config.screen || UITabs,
        options: config.template ? { template: config.template } : undefined,
        navigator: { routes, initial: config.initial, initialParams: config.initialParams, animation: config.animation },
    };
}

// ====================================================================== Transitions

const EASE = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

const STACK_ANIMATIONS: Record<StackAnimation, { duration: number; enter: Keyframe[]; exit: Keyframe[] | null }> = {
    'slide': {
        duration: 320,
        enter: [{ transform: 'translateX(100%)' }, { transform: 'translateX(0)' }],
        exit: [{ transform: 'translateX(0)' }, { transform: 'translateX(-30%)' }],
    },
    'slide-up': {
        duration: 320,
        enter: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
        exit: null,
    },
    'fade': {
        duration: 200,
        enter: [{ opacity: 0 }, { opacity: 1 }],
        exit: null,
    },
    'none': { duration: 0, enter: [], exit: null },
};

const MODAL_ANIMATIONS: Record<ModalPresentation, Keyframe[]> = {
    dialog: [{ opacity: 0, transform: 'scale(0.9)' }, { opacity: 1, transform: 'scale(1)' }],
    sheet: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
    fullscreen: [{ transform: 'translateY(100%)' }, { transform: 'translateY(0)' }],
};

const BACKDROP_ANIMATION: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const TAB_ANIMATION: Keyframe[] = [{ opacity: 0 }, { opacity: 1 }];
const MODAL_DURATION = 260;
const TAB_DURATION = 160;

function animate(el: HTMLElement, keyframes: Keyframe[], duration: number, reverse = false): Promise<void> {
    if (!duration || !keyframes.length || typeof el.animate !== 'function') return Promise.resolve();
    const frames = reverse ? keyframes.slice().reverse() : keyframes;
    const animation = el.animate(frames, { duration, easing: EASE, fill: 'forwards' });
    return new Promise<void>(resolve => {
        animation.onfinish = () => resolve();
        animation.oncancel = () => resolve();
    }).then(() => animation.cancel());
}

/** Push (reverse = false) or pop (reverse = true) between `top` and the screen `under` it. */
function stackTransition(top: HTMLElement, under: HTMLElement | null, animation: StackAnimation | undefined, reverse: boolean) {
    const preset = STACK_ANIMATIONS[animation || 'slide'] || STACK_ANIMATIONS.slide;
    return Promise.all([
        animate(top, preset.enter, preset.duration, reverse),
        under && preset.exit ? animate(under, preset.exit, preset.duration, reverse) : null,
    ]);
}

const NAV_CSS = `
.nav-root, .nav-modal-layer { position: absolute; inset: 0; }
/* Explicit z-index = own stacking context: z-index used inside screens can never rise above modals. */
.nav-root { z-index: 0; }
.nav-modal-layer { z-index: 1; }
:where(.nav-screen) {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    overflow: hidden;
    isolation: isolate;
}
:where([data-outlet]) { position: relative; flex: 1 1 auto; min-height: 0; }
.nav-hidden { visibility: hidden !important; }
.nav-busy, .nav-busy * { pointer-events: none !important; }
.nav-modal { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; }
.nav-modal--sheet { align-items: flex-end; }
.nav-backdrop { position: absolute; inset: 0; background: var(--nav-backdrop, rgba(0, 0, 0, 0.5)); }
.nav-modal > .nav-screen { position: relative; inset: auto; max-width: 100%; max-height: 100%; }
.nav-modal--sheet > .nav-screen { width: 100%; max-height: 90%; }
.nav-modal--fullscreen > .nav-screen { position: absolute; inset: 0; }
`;

const HIDDEN = 'nav-hidden';

function safeCall<T>(fn: () => T, fallback?: T): T | undefined {
    try {
        return fn();
    } catch (e) {
        console.error('[UINavigation]', e);
        return fallback;
    }
}

function ownerScreenRoot(el: Element): Element | null {
    return el.closest('.nav-screen');
}

// ====================================================================== UIScreen

export class UIScreen<P = any> {
    /** Default options of this screen class, merged with the route / call options. */
    static options: ScreenOptions = {};

    /** Route name. */
    name = '';
    /** Parameters given when navigating to this screen. */
    params: P = {} as P;
    /** Root element (`.nav-screen.screen-<name>`), filled with the template content. */
    root!: HTMLElement;
    navigation!: UINavigation;
    /** Navigator owning this screen (null for the root navigator and modals). */
    navigator: UINavigator | null = null;
    /** Values published by the inline `<script>` tags of this screen's template (`exports.x = ...`). */
    readonly exports: Record<string, any> = {};

    /** @internal */
    _options: ScreenOptions = {};
    /** @internal */
    _modal = false;

    private _focused = false;
    private _mounted = false;
    private _binding: UIBinding<any> | null = null;
    private _scripts = new UIScriptRunner();

    get doc(): UIDocument {
        return this.navigation.doc;
    }

    get isFocused(): boolean {
        return this._focused;
    }

    get isModal(): boolean {
        return this._modal;
    }

    /** Nearest stack navigator (this screen if it is a stack). */
    get stack(): UIStack | null {
        for (let s: UIScreen | null = this; s; s = s.navigator) if (s instanceof UIStack) return s;
        return null;
    }

    /** Nearest tab navigator (this screen if it is one). */
    get tabs(): UITabs | null {
        for (let s: UIScreen | null = this; s; s = s.navigator) if (s instanceof UITabs) return s;
        return null;
    }

    // ------------------------------------------------------------------ Lifecycle (override)

    /** DOM is ready and attached (inline scripts already ran). Register listeners / bindings here. */
    onMount(): void { }
    /** The screen became the visible, active one (after its transition). */
    onFocus(): void { }
    /** Another screen / modal took the focus. */
    onBlur(): void { }
    /** The screen is removed (popped, stack reset, modal closed...). */
    onUnmount(): void { }
    /** Navigated again to this existing screen with new params. */
    onParams(_params: P): void { }
    /** Back requested (Escape, data-nav="back", goBack()). Return true to cancel it. */
    onBack(): boolean { return false; }

    // ------------------------------------------------------------------ DOM helpers (scoped to this screen)

    q<E extends Element = HTMLElement>(selector: string): E | null {
        return this.qAll<E>(selector)[0] || null;
    }

    /** Elements of this screen only (not of nested screens). */
    qAll<E extends Element = HTMLElement>(selector: string): E[] {
        return Array.from(this.root.querySelectorAll(selector))
            .filter(el => ownerScreenRoot(el) === this.root) as E[];
    }

    on<K extends keyof HTMLElementEventMap>(
        selector: string,
        type: K,
        handler: (ev: HTMLElementEventMap[K], el: HTMLElement) => void,
    ): () => void {
        const root = this.root;
        const listener = (ev: Event) => {
            const target = ev.target as Element;
            const el = target && target.closest ? target.closest<HTMLElement>(selector) : null;
            if (el && root.contains(el) && ownerScreenRoot(el) === root) handler(ev as HTMLElementEventMap[K], el);
        };
        root.addEventListener(type, listener);
        return () => root.removeEventListener(type, listener);
    }

    onClick(selector: string, handler: (ev: MouseEvent, el: HTMLElement) => void) {
        return this.on(selector, 'click', handler);
    }

    /** Click on an element of this screen with `data-action="<action>"`. */
    onAction(action: string, handler: (el: HTMLElement, ev: MouseEvent) => void) {
        return this.on(`[data-action="${CSS.escape(action)}"]`, 'click', (ev, el) => handler(el, ev));
    }

    /** Binds data (or a shared `reactive()` store) to this screen's data-bind / data-show / data-class. */
    bind<T extends object>(data: T): T {
        if (this._binding) this._binding.dispose();
        this._binding = new UIBinding(this.root, data);
        return this._binding.state;
    }

    /** Clones `<template id="templateId">` of the document. */
    instantiate<E extends HTMLElement = HTMLElement>(templateId: string): E | null {
        return this.doc.instantiate<E>(templateId);
    }

    // ------------------------------------------------------------------ Navigation shortcuts

    /** Goes to `name` in the nearest navigator that knows it (push in stacks, switch in tabs), else presents the modal `name`. */
    navigate(name: string, params?: any): Promise<void> {
        return this.navigation._run(() => this.navigation._navigateFrom(this, name, params));
    }

    /** Pops the nearest stack that can go back, or closes the modal containing this screen. */
    goBack(): Promise<boolean> {
        return this.navigation._run(() => this.navigation._goBackFrom(this));
    }

    /** Presents a modal and resolves with the value given to its `close(result)`. */
    present<R = any>(name: string, params?: any, options?: ScreenOptions): Promise<R | undefined> {
        return this.navigation.present<R>(name, params, options);
    }

    /** Closes the modal containing this screen, resolving its `present()` with `result`. */
    close(result?: any): Promise<void> {
        let modal: UIScreen = this;
        while (modal.navigator) modal = modal.navigator;
        if (!modal._modal) {
            warn(`[UINavigation] close(): "${this.name}" is not inside a modal.`);
            return Promise.resolve();
        }
        return this.navigation.dismiss(result, modal);
    }

    // ------------------------------------------------------------------ Internals

    /** @internal */
    _mount() {
        this._mounted = true;
        this._scripts.run(this.qAll<HTMLScriptElement>('script'), {
            root: this.root,
            doc: this.doc,
            screen: this,
            exports: this.exports,
            label: `ui/${this.doc.node.name}/${this.name}`,
        });
        safeCall(() => this.onMount());
    }

    /** @internal */
    _unmount() {
        if (!this._mounted) return;
        if (this._focused) this._setFocus(false);
        this._unmountChildren();
        this._mounted = false;
        if (this._binding) this._binding.dispose();
        this._binding = null;
        safeCall(() => this.onUnmount());
        this._scripts.dispose();
        this.root.remove();
    }

    /** @internal */
    _setFocus(focused: boolean) {
        if (this._focused === focused || !this._mounted) return;
        this._focused = focused;
        if (focused) {
            safeCall(() => this.onFocus());
            this._focusChildren(true);
        } else {
            this._focusChildren(false);
            safeCall(() => this.onBlur());
        }
    }

    /** @internal */
    _updateParams(params: any) {
        if (params === undefined) return;
        this.params = params;
        safeCall(() => this.onParams(params));
    }

    protected _focusChildren(_focused: boolean) { }
    protected _unmountChildren() { }
}

// ====================================================================== Navigators

export abstract class UINavigator<P = any> extends UIScreen<P> {
    /** @internal */
    _config: NavigatorConfig = { routes: {} };
    /** Element receiving the child screens: `[data-outlet]` of the template, or the root itself. */
    protected outlet!: HTMLElement;

    abstract get activeChild(): UIScreen | null;
    abstract get children(): UIScreen[];

    hasRoute(name: string): boolean {
        return Object.prototype.hasOwnProperty.call(this._config.routes, name);
    }

    canGoBack(): boolean {
        return false;
    }

    /** @internal Must run inside the navigation queue. */
    abstract _navigateTo(name: string, params?: any): Promise<void>;

    /** @internal Must run inside the navigation queue. */
    _back(): Promise<void> {
        return Promise.resolve();
    }

    /** @internal */
    _mount() {
        this.outlet = this.q('[data-outlet]') || this.root;
        super._mount();
        this._mountInitial();
    }

    protected abstract _mountInitial(): void;

    protected get initialRoute(): string {
        return this._config.initial || Object.keys(this._config.routes)[0];
    }

    protected createChild(name: string, params?: any, options?: ScreenOptions): UIScreen {
        const child = this.navigation._createScreen(name, this._config.routes[name], params, this, options);
        this.outlet.appendChild(child.root);
        child._mount();
        return child;
    }

    protected _focusChildren(focused: boolean) {
        const child = this.activeChild;
        if (child) child._setFocus(focused);
    }

    protected _unmountChildren() {
        for (const child of this.children) child._unmount();
    }
}

export class UIStack<P = any> extends UINavigator<P> {
    private _stack: UIScreen[] = [];

    get activeChild(): UIScreen | null {
        return this._stack[this._stack.length - 1] || null;
    }

    get children(): UIScreen[] {
        return this._stack.slice();
    }

    /** Route names from bottom to top. */
    get routeNames(): string[] {
        return this._stack.map(screen => screen.name);
    }

    canGoBack(): boolean {
        return this._stack.length > 1;
    }

    push(name: string, params?: any, options?: ScreenOptions): Promise<void> {
        return this.navigation._run(() => this._push(name, params, options));
    }

    pop(count = 1): Promise<void> {
        return this.navigation._run(() => this._pop(count));
    }

    popToTop(): Promise<void> {
        return this.navigation._run(() => this._pop(this._stack.length - 1));
    }

    /** Replaces the top screen. */
    replace(name: string, params?: any, options?: ScreenOptions): Promise<void> {
        return this.navigation._run(() => this._replace(name, params, options, false));
    }

    /** Replaces the whole stack with a single screen. */
    reset(name: string, params?: any, options?: ScreenOptions): Promise<void> {
        return this.navigation._run(() => this._replace(name, params, options, true));
    }

    /** @internal Goes back to `name` if it is in the stack (updating its params), else pushes it. */
    _navigateTo(name: string, params?: any): Promise<void> {
        for (let i = this._stack.length - 1; i >= 0; i--) {
            if (this._stack[i].name !== name) continue;
            this._stack[i]._updateParams(params);
            return this._pop(this._stack.length - 1 - i);
        }
        return this._push(name, params);
    }

    /** @internal */
    _back(): Promise<void> {
        return this._pop(1);
    }

    protected _mountInitial() {
        this._stack.push(this.createChild(this.initialRoute, this._config.initialParams));
    }

    private async _push(name: string, params?: any, options?: ScreenOptions) {
        if (!this.hasRoute(name)) {
            warn(`[UINavigation] Stack "${this.name}" has no route "${name}".`);
            return;
        }
        const previous = this.activeChild;
        const next = this.createChild(name, params, options);
        this._stack.push(next);
        if (previous && this.isFocused) previous._setFocus(false);

        await stackTransition(next.root, previous && previous.root, next._options.animation, false);

        if (previous) previous.root.classList.add(HIDDEN);
        if (this.isFocused) next._setFocus(true);
    }

    private async _pop(count: number) {
        const stack = this._stack;
        count = Math.min(count, stack.length - 1);
        if (count <= 0) return;

        const top = stack[stack.length - 1];
        const removed = stack.splice(stack.length - count, count);
        const revealed = stack[stack.length - 1];
        if (this.isFocused) top._setFocus(false);
        for (const screen of removed) if (screen !== top) screen._unmount();

        revealed.root.classList.remove(HIDDEN);
        await stackTransition(top.root, revealed.root, top._options.animation, true);

        top._unmount();
        if (this.isFocused) revealed._setFocus(true);
    }

    private async _replace(name: string, params: any, options: ScreenOptions | undefined, all: boolean) {
        if (!this.hasRoute(name)) {
            warn(`[UINavigation] Stack "${this.name}" has no route "${name}".`);
            return;
        }
        const previous = this.activeChild;
        const old = all ? this._stack.splice(0) : this._stack.splice(-1);
        const next = this.createChild(name, params, options);
        this._stack.push(next);
        if (previous && this.isFocused) previous._setFocus(false);

        await stackTransition(next.root, previous && previous.root, next._options.animation, false);

        for (const screen of old) screen._unmount();
        if (this.isFocused) next._setFocus(true);
    }
}

export class UITabs<P = any> extends UINavigator<P> {
    private _screens = new Map<string, UIScreen>();
    private _active: UIScreen | null = null;

    get activeChild(): UIScreen | null {
        return this._active;
    }

    get children(): UIScreen[] {
        return Array.from(this._screens.values());
    }

    get activeName(): string {
        return this._active ? this._active.name : '';
    }

    /** Switches to tab `name` (created on first visit, kept alive afterwards). */
    jumpTo(name: string, params?: any): Promise<void> {
        return this.navigation._run(() => this._jumpTo(name, params));
    }

    /** @internal */
    _navigateTo(name: string, params?: any): Promise<void> {
        return this._jumpTo(name, params);
    }

    protected _mountInitial() {
        const first = this.getOrCreate(this.initialRoute, this._config.initialParams);
        this.activate(first);
    }

    private async _jumpTo(name: string, params?: any) {
        if (!this.hasRoute(name)) {
            warn(`[UINavigation] Tabs "${this.name}" has no route "${name}".`);
            return;
        }
        const previous = this._active;
        const existed = this._screens.has(name);
        const next = this.getOrCreate(name, params);
        if (existed) next._updateParams(params);
        if (next === previous) return;

        if (previous && this.isFocused) previous._setFocus(false);
        this.activate(next);
        const duration = this._config.animation === 'none' ? 0 : TAB_DURATION;
        await animate(next.root, TAB_ANIMATION, duration);

        if (previous) previous.root.classList.add(HIDDEN);
        if (this.isFocused) next._setFocus(true);
    }

    private getOrCreate(name: string, params?: any): UIScreen {
        let screen = this._screens.get(name);
        if (!screen) {
            screen = this.createChild(name, params);
            screen.root.classList.add(HIDDEN);
            this._screens.set(name, screen);
        }
        return screen;
    }

    private activate(screen: UIScreen) {
        if (this._active) this._active.root.style.zIndex = '';
        this._active = screen;
        screen.root.style.zIndex = '1';
        screen.root.classList.remove(HIDDEN);

        // Highlight the tab buttons of this navigator.
        for (const button of this.qAll('[data-nav]')) {
            const [verb, target] = button.dataset.nav!.split(':').map(part => part.trim());
            if (verb !== 'tab') continue;
            const active = target === screen.name;
            button.classList.toggle('is-active', active);
            button.setAttribute('aria-selected', String(active));
        }
    }
}

// ====================================================================== UINavigation

interface ModalEntry {
    screen: UIScreen;
    wrapper: HTMLElement;
    backdrop: HTMLElement;
    resolve: (result: any) => void;
}

export class UINavigation {
    readonly doc: UIDocument;
    readonly root: UIScreen;

    private readonly _host: HTMLElement;
    private readonly _container: HTMLElement;
    private readonly _modalLayer: HTMLElement;
    private readonly _modalRoutes: Routes;
    private readonly _modals: ModalEntry[] = [];
    private readonly _screenOf = new WeakMap<Element, UIScreen>();
    private readonly _listeners = new Set<(navigation: UINavigation) => void>();
    private readonly _ownsContainer: boolean;
    private readonly _escapeToGoBack: boolean;
    private _queue: Promise<unknown> = Promise.resolve();
    private _busy = 0;
    private _destroyed = false;

    constructor(doc: UIDocument, options: NavigationOptions) {
        const host = doc.rootVisualElement;
        if (!host) throw new Error('[UINavigation] UIDocument is not available (web only).');
        this.doc = doc;
        this._host = host;
        this._modalRoutes = options.modals || {};
        doc.addStyle(NAV_CSS, 'ui-navigation');

        this._ownsContainer = !options.container;
        this._container = options.container || this.createLayer('nav-root');
        this._modalLayer = this.createLayer('nav-modal-layer');

        this.root = this._createScreen('root', options.root, undefined, null);
        this._container.appendChild(this.root.root);
        this.root._mount();
        this.root._setFocus(true);

        this._escapeToGoBack = options.escapeToGoBack !== false;
        host.addEventListener('click', this.onNavClick);
        if (this._escapeToGoBack) window.addEventListener('keydown', this.onKeyDown);
    }

    /** Deepest focused screen (inside the top modal if any). */
    get current(): UIScreen {
        let screen = this._modals.length ? this._modals[this._modals.length - 1].screen : this.root;
        while (screen instanceof UINavigator && screen.activeChild) screen = screen.activeChild;
        return screen;
    }

    /** Active route names, e.g. ["main", "shop", "confirm"]. */
    get path(): string[] {
        const names: string[] = [];
        const collect = (screen: UIScreen | null) => {
            for (; screen; screen = screen instanceof UINavigator ? screen.activeChild : null) names.push(screen.name);
        };
        collect(this.root);
        names.shift(); // "root"
        for (const modal of this._modals) collect(modal.screen);
        return names;
    }

    /** True while a navigation (transition) is running. */
    get isBusy(): boolean {
        return this._busy > 0;
    }

    /** Navigates from the focused screen. See UIScreen.navigate. */
    navigate(name: string, params?: any): Promise<void> {
        return this._run(() => this._navigateFrom(this.current, name, params));
    }

    /** Back from the focused screen: onBack() hooks, then nearest stack pop, then modal close. */
    goBack(): Promise<boolean> {
        return this._run(() => this._goBackFrom(this.current));
    }

    present<R = any>(name: string, params?: any, options?: ScreenOptions): Promise<R | undefined> {
        return new Promise<R | undefined>(resolve => {
            this._run(() => this._present(name, params, options, resolve)).catch(() => resolve(undefined));
        });
    }

    /** Closes `screen`'s modal (default: the top one), resolving its present() with `result`. */
    dismiss(result?: any, screen?: UIScreen): Promise<void> {
        return this._run(() => this._dismiss(result, screen));
    }

    /** Called after every navigation. Returns a function removing the listener. */
    onChange(listener: (navigation: UINavigation) => void): () => void {
        this._listeners.add(listener);
        return () => this._listeners.delete(listener);
    }

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._host.removeEventListener('click', this.onNavClick);
        window.removeEventListener('keydown', this.onKeyDown);
        for (const modal of this._modals.splice(0)) {
            modal.screen._unmount();
            modal.resolve(undefined);
        }
        this.root._unmount();
        this._modalLayer.remove();
        if (this._ownsContainer) this._container.remove();
        this._listeners.clear();
    }

    // ------------------------------------------------------------------ Internals (used by screens / navigators)

    /** @internal Serializes navigation operations so transitions never overlap. */
    _run<T>(operation: () => Promise<T> | T): Promise<T> {
        const run = async (): Promise<T> => {
            if (this._destroyed) return undefined as T;
            this.setBusy(+1);
            try {
                return await operation();
            } finally {
                this.setBusy(-1);
                this._listeners.forEach(listener => safeCall(() => listener(this)));
            }
        };
        const result = this._queue.then(run);
        this._queue = result.catch(e => console.error('[UINavigation]', e));
        return result;
    }

    /** @internal */
    _createScreen(name: string, def: RouteDef, params: any, parent: UINavigator | null, callOptions?: ScreenOptions): UIScreen {
        const config: RouteConfig = typeof def === 'function' ? { screen: def } : def;
        const ctor = config.screen as ScreenClass & { options?: ScreenOptions };
        const screen = new ctor();
        const inherited: ScreenOptions = parent instanceof UIStack && parent._config.animation ? { animation: parent._config.animation } : {};
        screen._options = { ...inherited, ...ctor.options, ...config.options, ...callOptions };
        screen.name = name;
        screen.params = params !== undefined ? params : {};
        screen.navigation = this;
        screen.navigator = parent;

        const isNavigator = screen instanceof UINavigator;
        if (isNavigator) {
            if (!config.navigator) warn(`[UINavigation] "${name}" is a navigator class; declare it with stack() / tabs().`);
            (screen as UINavigator)._config = config.navigator || { routes: {} };
        }

        const root = document.createElement('div');
        root.className = `nav-screen screen-${name}`;
        root.dataset.screen = name;
        root.setAttribute(BIND_SCOPE_ATTR, '');
        const pickingMode = screen._options.pickingMode || (isNavigator ? 'ignore' : 'position');
        if (pickingMode === 'ignore') root.setAttribute('picking-mode', 'ignore');

        const templateId = screen._options.template !== undefined ? screen._options.template : (isNavigator ? '' : name);
        if (templateId) {
            const template = this.doc.q<HTMLTemplateElement>(`template#${CSS.escape(templateId)}`);
            if (template) root.appendChild(template.content.cloneNode(true));
            else warn(`[UINavigation] <template id="${templateId}"> not found for screen "${name}".`);
        }

        screen.root = root;
        this._screenOf.set(root, screen);
        return screen;
    }

    /** @internal */
    async _navigateFrom(from: UIScreen, name: string, params?: any): Promise<void> {
        for (let nav = from instanceof UINavigator ? from : from.navigator; nav; nav = nav.navigator) {
            if (nav.hasRoute(name)) return nav._navigateTo(name, params);
        }
        if (this._modalRoutes[name]) {
            this.present(name, params);
            return;
        }
        warn(`[UINavigation] No navigator or modal has a route "${name}".`);
    }

    /** @internal */
    async _goBackFrom(from: UIScreen): Promise<boolean> {
        for (let screen: UIScreen | null = from; screen; screen = screen.navigator) {
            if (safeCall(() => screen!.onBack(), false)) return true;
            if (screen instanceof UIStack && screen.canGoBack()) {
                await screen._back();
                return true;
            }
            if (!screen.navigator && screen.isModal) {
                await this._dismiss(undefined, screen);
                return true;
            }
        }
        return false;
    }

    // ------------------------------------------------------------------ Modals

    private async _present(name: string, params: any, options: ScreenOptions | undefined, resolve: (result: any) => void) {
        const def = this._modalRoutes[name];
        if (!def) {
            warn(`[UINavigation] No modal route "${name}".`);
            resolve(undefined);
            return;
        }
        const screen = this._createScreen(name, def, params, null, options);
        screen._modal = true;
        const presentation = screen._options.presentation || 'dialog';

        const wrapper = document.createElement('div');
        wrapper.className = `nav-modal nav-modal--${presentation}`;
        wrapper.setAttribute('picking-mode', 'ignore');
        const backdrop = document.createElement('div');
        backdrop.className = 'nav-backdrop';
        wrapper.append(backdrop, screen.root);
        this._modalLayer.appendChild(wrapper);
        screen._mount();

        const dismissOnBackdrop = screen._options.dismissOnBackdrop !== undefined
            ? screen._options.dismissOnBackdrop
            : presentation !== 'fullscreen';
        if (dismissOnBackdrop) backdrop.addEventListener('click', () => this.dismiss(undefined, screen));

        const previous = this._modals.length ? this._modals[this._modals.length - 1].screen : this.root;
        this._modals.push({ screen, wrapper, backdrop, resolve });
        previous._setFocus(false);

        await Promise.all([
            animate(backdrop, BACKDROP_ANIMATION, MODAL_DURATION),
            animate(screen.root, MODAL_ANIMATIONS[presentation] || MODAL_ANIMATIONS.dialog, MODAL_DURATION),
        ]);
        screen._setFocus(true);
    }

    private async _dismiss(result: any, screen?: UIScreen) {
        const modals = this._modals;
        const index = screen ? modals.findIndex(entry => entry.screen === screen) : modals.length - 1;
        if (index < 0) return;
        const entry = modals[index];
        const wasTop = index === modals.length - 1;
        modals.splice(index, 1);
        entry.screen._setFocus(false);

        const presentation = entry.screen._options.presentation || 'dialog';
        await Promise.all([
            animate(entry.backdrop, BACKDROP_ANIMATION, MODAL_DURATION, true),
            animate(entry.screen.root, MODAL_ANIMATIONS[presentation] || MODAL_ANIMATIONS.dialog, MODAL_DURATION, true),
        ]);

        entry.screen._unmount();
        entry.wrapper.remove();
        entry.resolve(result);
        if (wasTop) (modals.length ? modals[modals.length - 1].screen : this.root)._setFocus(true);
    }

    // ------------------------------------------------------------------ DOM

    private createLayer(className: string): HTMLElement {
        const layer = document.createElement('div');
        layer.className = className;
        layer.setAttribute('picking-mode', 'ignore');
        this._host.appendChild(layer);
        return layer;
    }

    private setBusy(delta: number) {
        this._busy += delta;
        const busy = this._busy > 0;
        this._container.classList.toggle('nav-busy', busy);
        this._modalLayer.classList.toggle('nav-busy', busy);
    }

    /** Declarative navigation: data-nav="verb:target", optional data-params='{"id":1}'. */
    private onNavClick = (ev: MouseEvent) => {
        const target = ev.target as Element;
        const el = target && target.closest ? target.closest<HTMLElement>('[data-nav]') : null;
        if (!el || !this._host.contains(el)) return;
        // Buttons outside any screen (e.g. a fixed HUD in the main HTML) act from the focused screen.
        const screenRoot = ownerScreenRoot(el);
        const screen = (screenRoot && this._screenOf.get(screenRoot)) || this.current;

        const spec = el.dataset.nav!;
        const separator = spec.indexOf(':');
        const verb = (separator < 0 ? spec : spec.slice(0, separator)).trim();
        const arg = separator < 0 ? '' : spec.slice(separator + 1).trim();
        const params = parseParams(el.dataset.params);
        const stackOf = () => {
            const s = screen.stack;
            if (!s) warn(`[UINavigation] data-nav="${spec}": no stack above "${screen.name}".`);
            return s;
        };

        switch (verb) {
            case 'back': screen.goBack(); break;
            case 'navigate': screen.navigate(arg, params); break;
            case 'push': { const s = stackOf(); if (s) s.push(arg, params); break; }
            case 'replace': { const s = stackOf(); if (s) s.replace(arg, params); break; }
            case 'reset': { const s = stackOf(); if (s) s.reset(arg, params); break; }
            case 'pop-to-top': { const s = stackOf(); if (s) s.popToTop(); break; }
            case 'tab': {
                let nav: UIScreen | null = screen;
                while (nav && !(nav instanceof UITabs && nav.hasRoute(arg))) nav = nav.navigator;
                if (nav) (nav as UITabs).jumpTo(arg, params);
                else warn(`[UINavigation] data-nav="${spec}": no tabs with route "${arg}".`);
                break;
            }
            case 'modal': this.present(arg, params); break;
            case 'close': screen.close(el.dataset.result); break;
            default: warn(`[UINavigation] Unknown data-nav verb "${verb}".`);
        }
    };

    private onKeyDown = (ev: KeyboardEvent) => {
        if (ev.key === 'Escape' && !ev.repeat) this.goBack();
    };
}

function parseParams(json: string | undefined): any {
    if (!json) return undefined;
    try {
        return JSON.parse(json);
    } catch (e) {
        warn(`[UINavigation] Invalid data-params JSON: ${json}`);
        return undefined;
    }
}
