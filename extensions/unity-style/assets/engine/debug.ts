import { Color, director, Vec3 } from 'cc';
import { DebugDraw } from './debug-draw';

const WHITE = new Color(255, 255, 255, 255);

function fmt(format: string, args: any[]): string {
    return String(format).replace(/\{(\d+)(?::[^}]*)?\}/g, (m, i) => {
        const v = args[Number(i)];
        return v === undefined ? m : String(v);
    });
}

/**
 * Unity's Debug: logging to the console (the Cocos Console in the editor)
 * and lines drawn with the geometry renderer (see DebugDraw).
 */
export class Debug {
    /** Optional context (node / component) is printed after the message. */
    static Log(message: any, context?: any): void {
        if (context !== undefined) console.log(message, context);
        else console.log(message);
    }

    static LogWarning(message: any, context?: any): void {
        if (context !== undefined) console.warn(message, context);
        else console.warn(message);
    }

    static LogError(message: any, context?: any): void {
        if (context !== undefined) console.error(message, context);
        else console.error(message);
    }

    static LogException(error: any, context?: any): void {
        Debug.LogError(error, context);
    }

    /** "{0} has {1} hp" with the arguments as an array: LogFormat('{0} hp', [hp]). */
    static LogFormat(format: string, args?: any[]): void {
        console.log(fmt(format, args || []));
    }

    static LogWarningFormat(format: string, args?: any[]): void {
        console.warn(fmt(format, args || []));
    }

    static LogErrorFormat(format: string, args?: any[]): void {
        console.error(fmt(format, args || []));
    }

    /** Logs an error when the condition is false. */
    static Assert(condition: boolean, message?: any, context?: any): void {
        if (!condition) Debug.LogError(message === undefined ? 'Assertion failed' : 'Assertion failed: ' + message, context);
    }

    /** A line for `duration` seconds (0: one frame). */
    static DrawLine(start: Readonly<Vec3>, end: Readonly<Vec3>, color: Readonly<Color> = WHITE, duration = 0, depthTest = true): void {
        DebugDraw.line(start, end, color, duration, depthTest);
    }

    /** A line from start to start + dir (dir's length is the line's length). */
    static DrawRay(start: Readonly<Vec3>, dir: Readonly<Vec3>, color: Readonly<Color> = WHITE, duration = 0, depthTest = true): void {
        DebugDraw.line(start, new Vec3(start.x + dir.x, start.y + dir.y, start.z + dir.z), color, duration, depthTest);
    }

    /** Pauses the game (director.pause), like Debug.Break in the editor. */
    static Break(): void {
        director.pause();
    }
}
