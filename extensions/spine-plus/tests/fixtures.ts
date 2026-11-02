// Real exports used by the tests: the project's samples (Fish 4.2, the 4.3
// export) and the spine-unity examples when they're on this machine.
import fs from 'fs';
import path from 'path';
import type { SpineSource } from '../assets/core/spine-runtime';

const extRoot = path.join(__dirname, '..', '..');
const projectAssets = path.join(extRoot, '..', '..', 'assets');
const unityExamples = 'F:/Workspace/Projects/Chicken/Assets/Spine Examples/Spine Skeletons';

export interface Fixture {
    name: string;
    dir: string;
    skeleton: string;
    atlas: string;
}

export const FIXTURES: Fixture[] = [
    { name: 'Fish (4.2 json)', dir: path.join(projectAssets, 'Fish'), skeleton: 'skeleton.json', atlas: 'skeleton.atlas.txt' },
    { name: 'exports_4.3 (4.3 json)', dir: path.join(projectAssets, 'exports_4.3'), skeleton: 'skeleton.json', atlas: 'skeleton.atlas.txt' },
    { name: 'sack (4.3 binary)', dir: path.join(unityExamples, 'sack'), skeleton: 'sack-pro.skel.bytes', atlas: 'sack.atlas.txt' },
    { name: 'snowglobe (4.3 binary)', dir: path.join(unityExamples, 'snowglobe'), skeleton: 'snowglobe-pro.skel.bytes', atlas: 'snowglobe.atlas.txt' },
    { name: 'celestial-circus (4.3 json)', dir: path.join(unityExamples, 'celestial-circus'), skeleton: 'celestial-circus-pro.json', atlas: 'celestial-circus.atlas.txt' },
    { name: 'whirlyblendmodes (4.3 json)', dir: path.join(unityExamples, 'whirlyblendmodes'), skeleton: 'whirlyblendmodes.json', atlas: 'whirlyblendmodes.atlas.txt' },
    { name: 'raptor-pro (4.3 json)', dir: path.join(unityExamples, 'raptor-pro-and-mask'), skeleton: 'raptor-pro.json', atlas: 'raptor.atlas.txt' },
    { name: 'dragon (4.3 json, 6 pages)', dir: path.join(unityExamples, 'Dragon'), skeleton: 'dragon.json', atlas: 'dragon.atlas.txt' },
];

export function available(f: Fixture): boolean {
    return fs.existsSync(path.join(f.dir, f.skeleton)) && fs.existsSync(path.join(f.dir, f.atlas));
}

/** Plain objects stand in for textures: { page, name }. */
export function source(f: Fixture): SpineSource {
    const file = path.join(f.dir, f.skeleton);
    const isJson = f.skeleton.endsWith('.json');
    return {
        json: isJson ? JSON.parse(fs.readFileSync(file, 'utf8')) : null,
        binary: isJson ? null : new Uint8Array(fs.readFileSync(file)),
        atlasText: fs.readFileSync(path.join(f.dir, f.atlas), 'utf8'),
        pageImage: (name, index) => ({ page: index, name }),
    };
}
