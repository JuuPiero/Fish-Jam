import { Asset, assetManager, director, Director, game, resources, Scene, sys } from 'cc';
import { EDITOR, EDITOR_NOT_IN_PREVIEW, PREVIEW } from 'cc/env';

type AssetType<T> = new (...args: any[]) => T;

/**
 * Unity's Resources over Cocos' `resources` bundle (assets under a folder
 * named "resources"). Paths have no extension; a SpriteFrame is
 * "path/spriteFrame", a Texture2D "path/texture".
 *
 * Unity's Load is synchronous; Cocos loading is not. Load() returns the
 * asset only when it is already loaded (or preloaded), else null and starts
 * loading it; use LoadAsync (a promise) or Load(path, type, callback).
 */
export class Resources {
    /** The asset if it is loaded already, else null (and a load is started). With a callback: always async. */
    static Load<T extends Asset>(path: string, type?: AssetType<T>, callback?: (asset: T | null, err?: Error | null) => void): T | null {
        const have = resources.get(path, type as any) as T | null;
        if (callback) {
            if (have) callback(have, null);
            else resources.load(path, type as any, (err: Error | null, a: T) => callback(err ? null : a, err));
            return have;
        }
        if (!have) resources.load(path, type as any, () => undefined);
        return have;
    }

    static LoadAsync<T extends Asset>(path: string, type?: AssetType<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            resources.load(path, type as any, (err: Error | null, a: T) => (err ? reject(err) : resolve(a)));
        });
    }

    /** Every asset under a folder. */
    static LoadAll<T extends Asset>(path: string, type?: AssetType<T>): Promise<T[]> {
        return new Promise((resolve, reject) => {
            resources.loadDir(path, type as any, (err: Error | null, a: T[]) => (err ? reject(err) : resolve(a)));
        });
    }

    static UnloadAsset(asset: Asset): void {
        assetManager.releaseAsset(asset);
    }

    /** Releases every asset of the resources bundle that nothing references (Bundle.releaseUnusedAssets). */
    static UnloadUnusedAssets(): void {
        const b: any = resources;
        if (typeof b.releaseUnusedAssets === 'function') b.releaseUnusedAssets();
    }
}

/** A minimal C#-style event: add / remove handlers. */
export class UnityEvent<T> {
    private handlers: ((arg: T) => void)[] = [];

    add(fn: (arg: T) => void): void {
        if (this.handlers.indexOf(fn) < 0) this.handlers.push(fn);
    }

    remove(fn: (arg: T) => void): void {
        const i = this.handlers.indexOf(fn);
        if (i >= 0) this.handlers.splice(i, 1);
    }

    invoke(arg: T): void {
        const list = this.handlers.slice();
        for (let i = 0; i < list.length; i++) {
            try {
                list[i](arg);
            } catch (e) {
                console.error(e);
            }
        }
    }
}

let sceneHooked = false;

/**
 * Unity's SceneManager over director.loadScene. Cocos runs one scene at a
 * time: there is no additive loading, and a scene is named, not indexed.
 */
export class SceneManager {
    /** Fires after a scene has launched (handler gets the scene). */
    static readonly sceneLoaded = new UnityEvent<Scene>();

    private static hook(): void {
        if (sceneHooked) return;
        sceneHooked = true;
        director.on(Director.EVENT_AFTER_SCENE_LAUNCH, (scene: Scene) => SceneManager.sceneLoaded.invoke(scene || (director.getScene() as Scene)));
    }

    static LoadScene(sceneName: string, onLaunched?: () => void): boolean {
        SceneManager.hook();
        return director.loadScene(sceneName, onLaunched ? () => onLaunched() : undefined);
    }

    /** Preloads, then switches; resolves when the new scene has launched. */
    static LoadSceneAsync(sceneName: string, onProgress?: (progress: number) => void): Promise<void> {
        SceneManager.hook();
        return new Promise((resolve, reject) => {
            director.preloadScene(
                sceneName,
                (done: number, total: number) => {
                    if (onProgress) onProgress(total > 0 ? done / total : 0);
                },
                (err: Error | null) => {
                    if (err) {
                        reject(err);
                        return;
                    }
                    director.loadScene(sceneName, () => resolve());
                },
            );
        });
    }

    static GetActiveScene(): Scene | null {
        return director.getScene();
    }
}

function store(): any {
    return sys.localStorage;
}

/**
 * Unity's PlayerPrefs over sys.localStorage. Values are strings there;
 * GetInt / GetFloat parse them. Writes are immediate (Save() does nothing).
 */
export class PlayerPrefs {
    /** Prepended to every key (empty: keys are used as written). */
    static keyPrefix = '';

    private static k(key: string): string {
        return PlayerPrefs.keyPrefix + key;
    }

    static SetInt(key: string, value: number): void { store().setItem(PlayerPrefs.k(key), String(Math.trunc(value))); }
    static SetFloat(key: string, value: number): void { store().setItem(PlayerPrefs.k(key), String(value)); }
    static SetString(key: string, value: string): void { store().setItem(PlayerPrefs.k(key), String(value)); }

    static GetInt(key: string, defaultValue = 0): number {
        const v = store().getItem(PlayerPrefs.k(key));
        if (v === null || v === undefined || v === '') return defaultValue;
        const n = parseInt(v, 10);
        return isNaN(n) ? defaultValue : n;
    }

    static GetFloat(key: string, defaultValue = 0): number {
        const v = store().getItem(PlayerPrefs.k(key));
        if (v === null || v === undefined || v === '') return defaultValue;
        const n = parseFloat(v);
        return isNaN(n) ? defaultValue : n;
    }

    static GetString(key: string, defaultValue = ''): string {
        const v = store().getItem(PlayerPrefs.k(key));
        return v === null || v === undefined ? defaultValue : String(v);
    }

    static HasKey(key: string): boolean {
        const v = store().getItem(PlayerPrefs.k(key));
        return v !== null && v !== undefined;
    }

    static DeleteKey(key: string): void { store().removeItem(PlayerPrefs.k(key)); }

    /** With a keyPrefix: the prefixed keys only; without: the whole local storage. */
    static DeleteAll(): void {
        const s = store();
        if (!PlayerPrefs.keyPrefix) {
            s.clear();
            return;
        }
        const keys: string[] = [];
        for (let i = 0; i < s.length; i++) {
            const k = s.key(i);
            if (k && k.indexOf(PlayerPrefs.keyPrefix) === 0) keys.push(k);
        }
        for (let i = 0; i < keys.length; i++) s.removeItem(keys[i]);
    }

    static Save(): void {
        // localStorage writes are immediate
    }
}

/** Unity's Application (the parts Cocos has). */
export class Application {
    /** Cocos' sys.platform string (e.g. "WECHAT_GAME", "ANDROID", "MOBILE_BROWSER"). */
    static get platform(): string { return String(sys.platform); }
    static get isMobilePlatform(): boolean { return sys.isMobile; }
    /** True in the editor and its preview. */
    static get isEditor(): boolean { return EDITOR || PREVIEW; }
    /** False only in the editor's scene view. */
    static get isPlaying(): boolean { return !EDITOR_NOT_IN_PREVIEW; }
    static get systemLanguage(): string { return String(sys.language); }

    /** game.frameRate (-1 in Unity means the platform default: here 60). */
    static get targetFrameRate(): number { return Number(game.frameRate); }
    static set targetFrameRate(v: number) { game.frameRate = v > 0 ? v : 60; }

    static OpenURL(url: string): void { sys.openURL(url); }

    /** Ends the game (game.end()); does nothing useful in a web page or the editor. */
    static Quit(): void { game.end(); }
}
