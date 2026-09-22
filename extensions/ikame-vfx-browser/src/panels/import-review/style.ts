'use strict';

export const importReviewStyle = `
:host {
    display: flex;
    flex-direction: column;
    height: 100%;
    font-family: sans-serif;
    font-size: 12px;
    color: #ccc;
}
.header {
    padding: 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.header h2 { margin: 0 0 4px 0; font-size: 14px; }
.header .target { color: #888; font-size: 11px; }
.summary {
    padding: 6px 10px;
    background: #2d2d2d;
    border-bottom: 1px solid #444;
    font-size: 11px;
}
.bulk-actions {
    display: flex;
    gap: 6px;
    padding: 6px 10px;
    background: #2a2a2a;
    border-bottom: 1px solid #444;
}
.bulk-actions button {
    padding: 3px 8px;
    background: #3a3a3a;
    border: 1px solid #555;
    color: #eee;
    border-radius: 3px;
    cursor: pointer;
    font-size: 11px;
}
.bulk-actions button:hover { background: #4a4a4a; }
.entry-list {
    flex: 1;
    overflow-y: auto;
}
.entry-row {
    display: flex;
    align-items: center;
    padding: 4px 10px;
    border-bottom: 1px solid #333;
    gap: 8px;
}
.entry-row:hover { background: #2d2d2d; }
.entry-row input[type="checkbox"] { margin: 0; cursor: pointer; }
.badge {
    padding: 1px 6px;
    border-radius: 3px;
    font-size: 10px;
    font-weight: bold;
    min-width: 45px;
    text-align: center;
}
.badge.new { background: #2e7d32; color: white; }
.badge.exists { background: #f57f17; color: white; }
.type-label { color: #888; min-width: 60px; }
.entry-name { flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.entry-path { color: #666; font-size: 11px; max-width: 200px; overflow: hidden; text-overflow: ellipsis; }
.footer {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    padding: 10px;
    background: #2a2a2a;
    border-top: 1px solid #444;
}
.footer button {
    padding: 6px 16px;
    border: 1px solid #555;
    border-radius: 3px;
    cursor: pointer;
    font-size: 12px;
}
.btn-cancel { background: #3a3a3a; color: #eee; }
.btn-cancel:hover { background: #4a4a4a; }
.btn-import { background: #0066cc; color: white; border-color: #0066cc; }
.btn-import:hover { background: #0077ee; }
.btn-import:disabled { background: #555; border-color: #555; cursor: not-allowed; }
`;
