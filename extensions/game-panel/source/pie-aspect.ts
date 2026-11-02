/**
 * Play-in-Editor shows the game in a webview sized to a device's aspect ratio,
 * and the engine inside uses that size as its screen. This controller sizes the
 * element to another aspect (fitted and centred in its container), keeps it that
 * way if Cocos re-applies its own size, and restores the original style.
 * DOM only, so it can be tested in a browser.
 */

export interface AspectController {
    /** Size `el` to `aspect` (width / height); null releases it. */
    set(el: HTMLElement | null, aspect: number | null): void;
    release(): void;
    info(): Record<string, unknown>;
}

function container(el: Element): HTMLElement | null {
    return (el.parentElement || ((el.getRootNode() as ShadowRoot).host as HTMLElement) || null);
}

export function createAspectController(maxFightsPer2s = 20): AspectController {
    const s = {
        value: null as number | null,
        el: null as HTMLElement | null,
        savedStyle: null as string | null,
        applied: '',
        mutation: null as MutationObserver | null,
        resize: null as ResizeObserver | null,
        raf: 0,
        fights: [] as number[],
        gaveUp: false,
    };

    function apply() {
        const el = s.el;
        if (!el || !s.value) return;
        const box = container(el)?.getBoundingClientRect();
        if (!box || box.width < 2 || box.height < 2) return;
        let w = box.width;
        let h = w / s.value;
        if (h > box.height) {
            h = box.height;
            w = h * s.value;
        }
        w = Math.max(1, Math.floor(w));
        h = Math.max(1, Math.floor(h));
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        if (getComputedStyle(el).position === 'absolute') {
            el.style.left = `${Math.floor((box.width - w) / 2)}px`;
            el.style.top = `${Math.floor((box.height - h) / 2)}px`;
            el.style.right = 'auto';
            el.style.bottom = 'auto';
        }
        s.applied = el.getAttribute('style') || '';
    }

    function schedule() {
        if (s.raf) return;
        s.raf = requestAnimationFrame(() => {
            s.raf = 0;
            apply();
        });
    }

    function onStyleChanged() {
        const el = s.el;
        if (!el || s.gaveUp || (el.getAttribute('style') || '') === s.applied) return;
        // Cocos re-applied its device size: take it back, but do not fight forever.
        const now = Date.now();
        s.fights = s.fights.filter((t) => now - t < 2000);
        s.fights.push(now);
        if (s.fights.length > maxFightsPer2s) {
            s.gaveUp = true;
            return;
        }
        schedule();
    }

    function release() {
        s.mutation?.disconnect();
        s.resize?.disconnect();
        s.mutation = null;
        s.resize = null;
        if (s.raf) cancelAnimationFrame(s.raf);
        s.raf = 0;
        const el = s.el;
        if (el && el.isConnected) {
            if (s.savedStyle === null) el.removeAttribute('style');
            else el.setAttribute('style', s.savedStyle);
        }
        s.el = null;
        s.savedStyle = null;
        s.applied = '';
        s.fights = [];
        s.gaveUp = false;
    }

    return {
        set(el, aspect) {
            s.value = aspect && Number.isFinite(aspect) && aspect > 0 ? aspect : null;
            if (!s.value || !el) {
                release();
                return;
            }
            if (s.el !== el) {
                release();
                s.el = el;
                s.savedStyle = el.getAttribute('style');
                s.mutation = new MutationObserver(onStyleChanged);
                s.mutation.observe(el, { attributes: true, attributeFilter: ['style'] });
                const box = container(el);
                if (box) {
                    s.resize = new ResizeObserver(schedule);
                    s.resize.observe(box);
                }
            }
            s.gaveUp = false;
            apply();
        },
        release,
        info() {
            return { value: s.value, applied: s.applied, savedStyle: s.savedStyle, fights: s.fights.length, gaveUp: s.gaveUp };
        },
    };
}
