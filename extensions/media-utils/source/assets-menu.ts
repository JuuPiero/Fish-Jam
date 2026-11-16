/**
 * Assets panel context menu: "Open in Image Tools" on images and "Open in
 * Audio Editor" on audio clips. With several assets selected, the image tool
 * gets all selected images (a batch); the audio editor opens the clicked file.
 */
import { isAudioPath, isImagePath } from './shared/image/options';

const PKG = 'media-utils';

interface Item {
    label: string;
    click?: () => void;
}

function nameOf(info: any): string {
    return String((info && (info.file || info.url || info.name)) || '');
}

function selectedUuids(clicked: string): string[] {
    let list: string[] = [];
    try {
        list = (Editor.Selection.getSelected('asset') || []).slice();
    } catch (e) {
        list = [];
    }
    // A right-click on an unselected asset acts on that asset only.
    if (list.indexOf(clicked) < 0) list = [clicked];
    return list;
}

export function onAssetMenu(assetInfo: any): Item[] {
    if (!assetInfo || assetInfo.isDirectory) return [];
    const name = nameOf(assetInfo);
    if (isImagePath(name)) {
        return [
            {
                label: 'Open in Image Tools',
                click() {
                    const uuids = selectedUuids(assetInfo.uuid);
                    Editor.Message.request(PKG, 'open-assets', 'image', uuids).catch((e: any) => console.error('[Media Utils]', e));
                },
            },
        ];
    }
    if (isAudioPath(name)) {
        return [
            {
                label: 'Open in Audio Editor',
                click() {
                    Editor.Message.request(PKG, 'open-assets', 'audio', [assetInfo.uuid]).catch((e: any) => console.error('[Media Utils]', e));
                },
            },
        ];
    }
    return [];
}
