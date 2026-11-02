/** What the Game panel UI needs from the editor (stubbed in the browser preview). */

export interface FrameStats {
    mode: 'off' | 'run' | 'pause';
    driver: 'editor' | 'self' | 'step';
    fps: number;
    drawCalls: number;
    tris: number;
    gameWidth: number;
    gameHeight: number;
    designWidth: number;
    designHeight: number;
    /** Size of the game's real screen (device px) in the scene process. */
    screenWidth: number;
    screenHeight: number;
    cameras: number;
    paused: boolean;
    /** How frames are captured, and what the last one cost. */
    capture?: CaptureStats;
    /** Game cameras not rendered to PIE's hidden temp window. */
    mutedCameras?: number;
}

export interface CaptureStats {
    /** 'async+worker' | 'async' (GPU copy without stalls) or 'sync' (readPixels). */
    mode: string;
    /** Capture + encode time of the last frame. */
    ms: number;
    encodeMs: number;
    /** Size of the last JPEG. */
    kb: number;
}

export interface FrameResult {
    id: number;
    /** JPEG as base64 (`data`) or bytes (`bytes`, over the Play-in-Editor channel). */
    frame: { width: number; height: number; data?: string; bytes?: Uint8Array } | null;
    stats: FrameStats;
}

export interface FrameRequest {
    /** Game resolution chosen in the panel (device pixels). */
    gameWidth: number;
    gameHeight: number;
    /** Largest render size worth producing (the displayed size). */
    maxWidth: number;
    maxHeight: number;
    quality: number;
    after: number;
    flip: boolean | null;
    /** Display index (0 = "Display 1"); cameras are filtered by target display. */
    display: number;
    /** Send the JPEG as bytes instead of base64 (the webview channel carries binary). */
    binary?: boolean;
}

export interface InputMessage {
    type: 'down' | 'move' | 'up' | 'wheel' | 'keydown' | 'keyup';
    u?: number;
    v?: number;
    button?: number;
    buttons?: number;
    dx?: number;
    dy?: number;
    deltaX?: number;
    deltaY?: number;
    key?: string;
    code?: string;
    keyCode?: number;
    repeat?: boolean;
    altKey?: boolean;
    ctrlKey?: boolean;
    shiftKey?: boolean;
    metaKey?: boolean;
}

export interface Resolution {
    id: string;
    label: string;
    kind: 'free' | 'design' | 'aspect' | 'fixed';
    w: number;
    h: number;
    custom?: boolean;
}

export interface PanelSettings {
    resolutionId: string;
    display: number;
    quality: 'high' | 'low';
    previewWhenStopped: boolean;
    showStats: boolean;
    custom: Resolution[];
}

export interface GameBridge {
    /** Start / stop Cocos' Play-in-Editor. Resolves false when it refused. */
    setPreviewPlay(play: boolean): Promise<boolean>;
    /** Call a PreviewPlay method (pause, step, ...). */
    previewCall(method: string, ...args: unknown[]): Promise<unknown>;
    /**
     * Find the scene process running Play-in-Editor and send the following
     * calls there. Rejects when it cannot be reached.
     */
    connectPie(): Promise<void>;
    /** Go back to the edit scene's process. */
    disconnectPie(): void;
    /**
     * Give the running game this aspect ratio (width / height). Play-in-Editor
     * emulates a device by sizing its webview; the game uses that size as its
     * screen. null gives the webview back to Cocos.
     */
    setGameAspect(aspect: number | null): void;
    frame(req: FrameRequest): Promise<FrameResult>;
    play(): Promise<unknown>;
    pause(paused: boolean): Promise<unknown>;
    step(): Promise<unknown>;
    stop(): Promise<unknown>;
    detach(): Promise<unknown>;
    input(message: InputMessage): Promise<unknown>;
    loadSettings(): Promise<Partial<PanelSettings> | null>;
    saveSettings(settings: PanelSettings): Promise<void>;
    /** Collect diagnostics and save them; resolves to the file path. */
    diagnose(extra: Record<string, unknown>): Promise<string>;
}
