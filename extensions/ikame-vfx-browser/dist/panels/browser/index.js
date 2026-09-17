'use strict';
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
const style_1 = require("./style");
module.exports = Editor.Panel.define({
    template: `
        <div class="toolbar">
            <label>Server:</label>
            <input type="text" id="serverUrl" value="http://10.10.0.204:4649" />
            <button id="btnRefresh">Refresh</button>
        </div>
        <div class="body">
            <div class="sidebar" id="sidebar"></div>
            <div class="content">
                <div class="search-bar">
                    <input type="text" id="searchInput" placeholder="Search..." />
                </div>
                <div class="vfx-list-header">
                    <span class="col-name">Name</span>
                    <span class="col-category">Category</span>
                    <span class="col-action">Action</span>
                </div>
                <div class="vfx-list" id="vfxList"></div>
            </div>
        </div>
        <div class="status-bar" id="statusBar">Ready - click Refresh to load catalog</div>
    `,
    style: style_1.browserStyle,
    $: {
        serverUrl: '#serverUrl',
        btnRefresh: '#btnRefresh',
        sidebar: '#sidebar',
        searchInput: '#searchInput',
        vfxList: '#vfxList',
        statusBar: '#statusBar',
    },
    _items: [],
    _categoryTree: [],
    _selectedCategory: 'All',
    _searchQuery: '',
    _importing: null,
    ready() {
        const self = this;
        self._items = [];
        self._categoryTree = [];
        self._selectedCategory = 'All';
        self._searchQuery = '';
        self._importing = new Set();
        Editor.Profile.getProject('ikame-vfx-browser', 'serverUrl').then((url) => {
            if (url)
                self.$.serverUrl.value = url;
        });
        self.$.btnRefresh.addEventListener('click', () => { self._fetchCatalog(); });
        self.$.searchInput.addEventListener('input', (e) => {
            self._searchQuery = e.target.value;
            self._renderList();
        });
    },
    close() {
        const self = this;
        Editor.Profile.setProject('ikame-vfx-browser', 'serverUrl', self.$.serverUrl.value);
    },
    methods: {
        importComplete(result) {
            const self = this;
            if (result === null || result === void 0 ? void 0 : result.vfxId) {
                self._importing.delete(result.vfxId);
            }
            self._renderList();
            if (result === null || result === void 0 ? void 0 : result.success) {
                self.$.statusBar.textContent = `Imported "${result.prefabName}" (${result.nodesCreated} nodes)`;
            }
            else {
                self.$.statusBar.textContent = `Import failed: ${(result === null || result === void 0 ? void 0 : result.error) || 'unknown error'}`;
            }
        },
        _fetchCatalog() {
            return __awaiter(this, void 0, void 0, function* () {
                const self = this;
                const serverUrl = self.$.serverUrl.value.replace(/\/+$/, '');
                self.$.statusBar.textContent = 'Loading...';
                Editor.Profile.setProject('ikame-vfx-browser', 'serverUrl', serverUrl);
                try {
                    const http = require('http');
                    const url = require('url');
                    const parsed = new (url.URL)(serverUrl + '/api/vfx/catalog');
                    const data = yield new Promise((resolve, reject) => {
                        const req = http.get(parsed, (res) => {
                            if (res.statusCode >= 400) {
                                reject(new Error(`HTTP ${res.statusCode}`));
                                res.resume();
                                return;
                            }
                            const chunks = [];
                            res.on('data', (c) => chunks.push(c));
                            res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
                        });
                        req.on('error', reject);
                    });
                    const catalog = JSON.parse(data);
                    self._items = catalog.items || [];
                    self._buildCategoryTree();
                    self._renderSidebar();
                    self._renderList();
                    self.$.statusBar.textContent = `${self._items.length} effects loaded`;
                }
                catch (err) {
                    self.$.statusBar.textContent = `Error: ${err.message}`;
                    self._items = [];
                    self._renderSidebar();
                    self._renderList();
                }
            });
        },
        _buildCategoryTree() {
            const self = this;
            const catMap = new Map();
            for (const item of self._items) {
                const cat = item.category || 'Uncategorized';
                catMap.set(cat, (catMap.get(cat) || 0) + 1);
                const parts = cat.split('/');
                for (let i = 1; i < parts.length; i++) {
                    const parent = parts.slice(0, i).join('/');
                    if (!catMap.has(parent))
                        catMap.set(parent, 0);
                }
            }
            const roots = [];
            const nodeMap = new Map();
            const sortedKeys = Array.from(catMap.keys()).sort();
            for (const fullPath of sortedKeys) {
                const parts = fullPath.split('/');
                const name = parts[parts.length - 1];
                const node = { name, fullPath, count: catMap.get(fullPath) || 0, children: [], expanded: true };
                nodeMap.set(fullPath, node);
                if (parts.length === 1) {
                    roots.push(node);
                }
                else {
                    const parentPath = parts.slice(0, -1).join('/');
                    const parent = nodeMap.get(parentPath);
                    if (parent) {
                        parent.children.push(node);
                        parent.count = self._items.filter((i) => i.category === parentPath || i.category.startsWith(parentPath + '/')).length;
                    }
                    else {
                        roots.push(node);
                    }
                }
            }
            self._categoryTree = roots;
        },
        _renderSidebar() {
            const self = this;
            const sb = self.$.sidebar;
            sb.innerHTML = '';
            const allDiv = document.createElement('div');
            allDiv.className = 'cat-item' + (self._selectedCategory === 'All' ? ' active' : '');
            allDiv.textContent = `All (${self._items.length})`;
            allDiv.addEventListener('click', () => {
                self._selectedCategory = 'All';
                self._renderSidebar();
                self._renderList();
            });
            sb.appendChild(allDiv);
            function renderNode(node, depth) {
                const div = document.createElement('div');
                div.className = 'cat-item' + (depth > 0 ? ' child' : ' parent');
                if (self._selectedCategory === node.fullPath)
                    div.className += ' active';
                div.style.paddingLeft = (10 + depth * 14) + 'px';
                const arrow = node.children.length > 0 ? (node.expanded ? '▾ ' : '▸ ') : '  ';
                div.textContent = `${arrow}${node.name} (${node.count})`;
                div.addEventListener('click', () => {
                    if (node.children.length > 0 && self._selectedCategory === node.fullPath) {
                        node.expanded = !node.expanded;
                    }
                    self._selectedCategory = node.fullPath;
                    self._renderSidebar();
                    self._renderList();
                });
                sb.appendChild(div);
                if (node.expanded) {
                    for (const child of node.children) {
                        renderNode(child, depth + 1);
                    }
                }
            }
            for (const root of self._categoryTree) {
                renderNode(root, 0);
            }
        },
        _renderList() {
            const self = this;
            const list = self.$.vfxList;
            list.innerHTML = '';
            const filtered = self._items.filter((item) => {
                if (self._selectedCategory !== 'All') {
                    if (item.category !== self._selectedCategory &&
                        !item.category.startsWith(self._selectedCategory + '/')) {
                        return false;
                    }
                }
                if (self._searchQuery) {
                    return item.name.toLowerCase().includes(self._searchQuery.toLowerCase());
                }
                return true;
            });
            for (const item of filtered) {
                const row = document.createElement('div');
                row.className = 'vfx-row';
                const nameSpan = document.createElement('span');
                nameSpan.className = 'col-name';
                nameSpan.textContent = item.name;
                const catSpan = document.createElement('span');
                catSpan.className = 'col-category';
                catSpan.textContent = item.category;
                const actionSpan = document.createElement('span');
                actionSpan.className = 'col-action';
                const btn = document.createElement('button');
                const isImporting = self._importing.has(item.id);
                btn.textContent = isImporting ? 'Importing...' : 'Import';
                btn.disabled = isImporting;
                btn.addEventListener('click', () => { self._startImport(item); });
                actionSpan.appendChild(btn);
                row.appendChild(nameSpan);
                row.appendChild(catSpan);
                row.appendChild(actionSpan);
                list.appendChild(row);
            }
        },
        _startImport(item) {
            return __awaiter(this, void 0, void 0, function* () {
                const self = this;
                const serverUrl = self.$.serverUrl.value.replace(/\/+$/, '');
                self._importing.add(item.id);
                self._renderList();
                self.$.statusBar.textContent = `Downloading "${item.name}"...`;
                try {
                    const { VFXApiClient } = require('../../services/api');
                    const api = new VFXApiClient(serverUrl);
                    const particleJson = yield api.downloadParticleJson(item.id);
                    const entries = self._collectAssetEntries(particleJson);
                    const importFolder = (yield Editor.Profile.getProject('ikame-vfx-browser', 'importFolder'))
                        || 'assets/_IKameVFX/Imported';
                    Editor.Message.send('ikame-vfx-browser', 'open-import-review', {
                        prefabName: item.name,
                        vfxId: item.id,
                        importFolder,
                        particleJson,
                        entries,
                        serverUrl,
                    });
                }
                catch (err) {
                    self.$.statusBar.textContent = `Error: ${err.message}`;
                    self._importing.delete(item.id);
                    self._renderList();
                }
            });
        },
        _collectAssetEntries(particleJson) {
            const entries = [];
            const seenGuids = new Set();
            const textures = particleJson['textures'] || {};
            for (const [guid, texInfo] of Object.entries(textures)) {
                if (seenGuids.has(guid))
                    continue;
                seenGuids.add(guid);
                const info = texInfo;
                entries.push({ guid, name: info.name || info.fileName || guid, type: 'texture', status: 'new', selected: true });
            }
            const walkNode = (node) => {
                const ps = node === null || node === void 0 ? void 0 : node.particleSystem;
                if (ps) {
                    const materialId = ps.materialId;
                    if (materialId && ps.materialType === 'custom' && !seenGuids.has(materialId)) {
                        seenGuids.add(materialId);
                        entries.push({ guid: materialId, name: `Material_${materialId.substring(0, 8)}`, type: 'material', status: 'new', selected: true });
                    }
                    const renderer = ps.rendererModule;
                    if ((renderer === null || renderer === void 0 ? void 0 : renderer.meshId) && !seenGuids.has(renderer.meshId)) {
                        seenGuids.add(renderer.meshId);
                        entries.push({ guid: renderer.meshId, name: renderer.meshName || `Mesh_${renderer.meshId.substring(0, 8)}`, type: 'mesh', status: 'new', selected: true });
                    }
                }
                const children = (node === null || node === void 0 ? void 0 : node.children) || [];
                for (const child of children) {
                    walkNode(child);
                }
            };
            walkNode(particleJson.root);
            return entries;
        },
    },
});
//# sourceMappingURL=index.js.map