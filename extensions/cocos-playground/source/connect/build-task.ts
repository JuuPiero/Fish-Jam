import * as path from 'path';

/*
 * Running a Web Mobile build from the panel, through the editor's own builder: it repeats the most
 * recent web-mobile task of the Build panel (same options — scenes, debug, MD5, output folder…) as a
 * new task, and waits for it. The builder's task messages (`query-tasks-info`, `add-task`) aren't in
 * its public typings, hence the defensive reading of what they return.
 */

type TaskState = 'waiting' | 'success' | 'failure' | 'cancel' | 'processing' | 'none';

interface BuildTask {
    id: string;
    state: TaskState;
    progress: number;
    message: string;
    time?: string | number;
    options: Record<string, any>;
    rawOptions?: Record<string, any>;
}

const request = (Editor.Message.request as any).bind(Editor.Message) as (target: string, message: string, ...args: any[]) => Promise<any>;

async function tasks(): Promise<BuildTask[]> {
    const info = await request('builder', 'query-tasks-info');
    const queue = info?.queue ?? info?.tasks ?? info;
    const list = Array.isArray(queue) ? queue : Object.values(queue ?? {});
    return list.filter((task: any) => task && typeof task.id === 'string' && task.options);
}

const timeOf = (task: BuildTask) => (typeof task.time === 'number' ? task.time : Date.parse(String(task.time ?? '')) || 0);

/** `project://build` + `web-mobile` → an absolute folder. */
function outputDir(projectRoot: string, options: Record<string, any>): string {
    const buildPath = String(options.buildPath ?? 'project://build');
    const base = buildPath.startsWith('project://') ? path.join(projectRoot, buildPath.slice('project://'.length)) : buildPath;
    return path.join(base, String(options.outputName || options.platform || 'web-mobile'));
}

/** Builds Web Mobile like the last time, reporting progress (0–1); resolves with the output folder. */
export async function runWebMobileBuild(projectRoot: string, onProgress: (fraction: number, message: string) => void): Promise<string> {
    const before = await tasks();
    const last = before.filter((task) => (task.rawOptions ?? task.options)?.platform === 'web-mobile').sort((a, b) => timeOf(b) - timeOf(a))[0];
    if (!last) {
        void request('builder', 'open');
        throw new Error('No Web Mobile build to repeat yet. Build once for "Web Mobile" in the Build panel (now open); after that, Build here repeats it.');
    }
    const options = { ...(last.rawOptions ?? last.options) };
    delete options.taskId;
    delete options.id;
    delete options.logDest;

    onProgress(0, 'Starting the build…');
    const known = new Set(before.map((task) => task.id));
    const added = await request('builder', 'add-task', options);
    const addedId = typeof added === 'string' ? added : typeof added?.id === 'string' ? added.id : null;

    const deadline = Date.now() + 30 * 60_000;
    for (;;) {
        await new Promise((resolve) => setTimeout(resolve, 500));
        const current = (await tasks()).find((task) => (addedId ? task.id === addedId : !known.has(task.id)));
        if (current) {
            const fraction = current.progress > 1 ? current.progress / 100 : current.progress;
            onProgress(Math.max(0, Math.min(1, fraction || 0)), current.message || 'Building…');
            if (current.state === 'success') return outputDir(projectRoot, current.options ?? options);
            if (current.state === 'failure') throw new Error(`The build failed: ${current.message || 'see the Build panel'}`);
            if (current.state === 'cancel') throw new Error('The build was cancelled');
        }
        if (Date.now() > deadline) throw new Error('The build did not finish in 30 minutes');
    }
}
