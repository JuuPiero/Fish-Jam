/** Assets panel context menu for Spine exports (spine-data assets). */
export function onAssetMenu(assetInfo: { uuid: string; importer?: string; isDirectory?: boolean }) {
    if (!assetInfo?.uuid || assetInfo.importer !== 'spine-data') return [];
    const items: Editor.Menu.ContextMenuItem[] = [
        {
            label: 'Spine Plus: Preview',
            click() {
                Editor.Message.send('spine-plus', 'open-preview', assetInfo.uuid);
            },
        },
        {
            label: 'Spine Plus: Create SkeletonAnimation',
            click() {
                Editor.Message.send('spine-plus', 'create-skeleton', assetInfo.uuid);
            },
        },
    ];
    return items;
}
