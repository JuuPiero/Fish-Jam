'use strict';

import { importReviewStyle } from './style';

interface ReviewEntry {
    guid: string;
    name: string;
    type: string;
    status: string;
    existingPath?: string;
    selected: boolean;
}

module.exports = Editor.Panel.define({
    template: `
        <div class="header">
            <h2 id="title">Import: VFX</h2>
            <div class="target" id="target">Target: assets/_IKameVFX/Imported/</div>
        </div>
        <div class="summary" id="summary"></div>
        <div class="bulk-actions">
            <button id="btnAll">Select All</button>
            <button id="btnNone">Select None</button>
            <button id="btnNewOnly">Select New Only</button>
        </div>
        <div class="entry-list" id="entryList"></div>
        <div class="footer">
            <button class="btn-cancel" id="btnCancel">Cancel</button>
            <button class="btn-import" id="btnImport">Import (0)</button>
        </div>
    `,

    style: importReviewStyle,

    $: {
        title: '#title',
        target: '#target',
        summary: '#summary',
        btnAll: '#btnAll',
        btnNone: '#btnNone',
        btnNewOnly: '#btnNewOnly',
        entryList: '#entryList',
        btnCancel: '#btnCancel',
        btnImport: '#btnImport',
    },

    _data: null as any,
    _entries: [] as ReviewEntry[],

    async ready() {
        const self = this as any;
        self._data = await Editor.Message.request('ikame-vfx-browser', 'getImportReviewData');
        if (!self._data) {
            self.$.title.textContent = 'Error: No import data';
            return;
        }
        self._entries = self._data.entries || [];
        self.$.title.textContent = `Import: ${self._data.prefabName}`;
        self.$.target.textContent = `Target: ${self._data.importFolder}/`;

        self.$.btnAll.addEventListener('click', () => {
            self._entries.forEach((e: ReviewEntry) => e.selected = true);
            self._render();
        });
        self.$.btnNone.addEventListener('click', () => {
            self._entries.forEach((e: ReviewEntry) => e.selected = false);
            self._render();
        });
        self.$.btnNewOnly.addEventListener('click', () => {
            self._entries.forEach((e: ReviewEntry) => e.selected = e.status === 'new');
            self._render();
        });
        self.$.btnCancel.addEventListener('click', () => {
            Editor.Panel.close('ikame-vfx-browser.import-review');
        });
        self.$.btnImport.addEventListener('click', () => { self._executeImport(); });
        self._render();
    },

    methods: {
        _render() {
            const self = this as any;
            const list = self.$.entryList;
            list.innerHTML = '';
            for (let i = 0; i < self._entries.length; i++) {
                const entry = self._entries[i];
                const row = document.createElement('div');
                row.className = 'entry-row';
                const cb = document.createElement('input');
                cb.type = 'checkbox';
                cb.checked = entry.selected;
                cb.addEventListener('change', () => {
                    entry.selected = cb.checked;
                    self._updateSummary();
                });
                const badge = document.createElement('span');
                badge.className = `badge ${entry.status}`;
                badge.textContent = entry.status.toUpperCase();
                const typeLbl = document.createElement('span');
                typeLbl.className = 'type-label';
                typeLbl.textContent = entry.type;
                const nameLbl = document.createElement('span');
                nameLbl.className = 'entry-name';
                nameLbl.textContent = entry.name;
                const pathLbl = document.createElement('span');
                pathLbl.className = 'entry-path';
                pathLbl.textContent = entry.existingPath || '';
                row.appendChild(cb);
                row.appendChild(badge);
                row.appendChild(typeLbl);
                row.appendChild(nameLbl);
                row.appendChild(pathLbl);
                list.appendChild(row);
            }
            self._updateSummary();
        },

        _updateSummary() {
            const self = this as any;
            const total = self._entries.length;
            const newCount = self._entries.filter((e: ReviewEntry) => e.status === 'new').length;
            const existsCount = total - newCount;
            const selectedCount = self._entries.filter((e: ReviewEntry) => e.selected).length;
            self.$.summary.textContent = `${total} assets total - ${newCount} new, ${existsCount} already in project - ${selectedCount} selected`;
            self.$.btnImport.textContent = `Import (${selectedCount})`;
            self.$.btnImport.disabled = selectedCount === 0;
        },

        async _executeImport() {
            const self = this as any;
            const selectedCount = self._entries.filter((e: ReviewEntry) => e.selected).length;
            if (selectedCount === 0) return;
            self.$.btnImport.disabled = true;
            self.$.btnImport.textContent = 'Importing...';
            self.$.btnCancel.disabled = true;

            const importData = {
                prefabName: self._data.prefabName,
                vfxId: self._data.vfxId,
                importFolder: self._data.importFolder,
                particleJson: self._data.particleJson,
                entries: self._entries,
                serverUrl: self._data.serverUrl,
            };

            try {
                const result = await Editor.Message.request('ikame-vfx-browser', 'start-import', importData);
                Editor.Message.send('ikame-vfx-browser', 'import-complete', result);
                Editor.Panel.close('ikame-vfx-browser.import-review');
            } catch (err: any) {
                self.$.btnImport.textContent = `Error: ${err.message}`;
                self.$.btnImport.disabled = false;
                self.$.btnCancel.disabled = false;
            }
        },
    },
});
