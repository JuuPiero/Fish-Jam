'use strict';

export const browserStyle = `
:host {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: sans-serif;
    font-size: 12px;
    color: #ccc;
}
.toolbar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.toolbar label { white-space: nowrap; font-weight: bold; }
.toolbar input[type="text"] {
    flex: 1;
    background: #1a1a1a;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
}
.toolbar button {
    padding: 4px 12px;
    background: #3a3a3a;
    border: 1px solid #555;
    color: #eee;
    border-radius: 3px;
    cursor: pointer;
}
.toolbar button:hover { background: #4a4a4a; }
.body {
    display: flex;
    flex: 1;
    overflow: hidden;
}
.sidebar {
    width: 160px;
    min-width: 120px;
    background: #252525;
    border-right: 1px solid #444;
    overflow-y: auto;
    padding: 4px 0;
}
.sidebar .cat-item {
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}
.sidebar .cat-item:hover { background: #333; }
.sidebar .cat-item.active { background: #0066cc; color: white; }
.sidebar .cat-item.parent { font-weight: bold; }
.sidebar .cat-item.child { padding-left: 24px; }
.content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}
.search-bar {
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.search-bar input {
    width: 100%;
    background: #1a1a1a;
    border: 1px solid #555;
    color: #eee;
    padding: 4px 8px;
    border-radius: 3px;
    box-sizing: border-box;
}
.vfx-list {
    flex: 1;
    overflow-y: auto;
    padding: 0;
}
.vfx-list-header {
    display: flex;
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #555;
    font-weight: bold;
    font-size: 11px;
    color: #999;
}
.vfx-row {
    display: flex;
    padding: 6px 10px;
    border-bottom: 1px solid #333;
    align-items: center;
}
.vfx-row:hover { background: #2d2d2d; }
.col-name { width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.col-category { width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: #888; }
.col-action { margin-left: auto; }
.col-action button {
    padding: 3px 10px;
    background: #0066cc;
    border: none;
    color: white;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}
.col-action button:hover { background: #0077ee; }
.col-action button:disabled { background: #555; cursor: not-allowed; }
.status-bar {
    padding: 4px 10px;
    background: #2a2a2a;
    border-top: 1px solid #444;
    font-size: 11px;
    color: #888;
}
`;
