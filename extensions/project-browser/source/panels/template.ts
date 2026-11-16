/**
 * Template of the Project window (Unity's two-column Project browser).
 */
export const TEMPLATE = /* html */ `
<div class="pb" tabindex="0" @keydown="onKey" @mousedown="closeMenus($event)" @mousemove="trackMods($event)" @dragleave="rootDragLeave($event)"
     @dragover.capture="logDragOver($event)" @drop.capture="logDrop($event)">
  <div class="pb-toolbar">
    <button class="pb-btn" @click="createMenu($event)" :disabled="readonlyFolder" title="Create an asset in the current folder">Create ▾</button>
    <span class="pb-grow pb-peek-gap"><template v-if="ui.peek !== false && peekSrc">
      <span class="pb-peek-clip body"><img class="pb-peek" :src="peekSrc" draggable="false" alt=""></span>
      <span class="pb-peek-clip hands"><img class="pb-peek" :src="peekSrc" draggable="false" alt=""></span>
    </template></span>
    <div class="pb-search">
      <svg class="lens" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><circle cx="10" cy="10" r="6"/><path d="M15 15l6 6"/></svg>
      <input ref="search" :value="query" @input="setQuery($event.target.value)" placeholder="Search" spellcheck="false" @keydown.esc="setQuery('')">
      <span class="clear" v-if="query" @click="setQuery('')" title="Clear">×</span>
    </div>
    <div class="pb-drop">
      <button class="pb-btn icon" :class="{ on: menu === 'type' }" @click.stop="toggleMenu('type', $event)" title="Search by Type">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="8" cy="8" r="4"/><rect x="13" y="13" width="8" height="8"/><path d="M14 4l6 6M20 4l-6 6"/></svg>
      </button>
      <div class="pb-menu" ref="menuEl" v-if="menu === 'type'" @mousedown.stop>
        <div class="pb-menu-item" v-for="t in typeNames" :key="t" @click="toggleType(t)"><span class="check">{{ hasToken('t:', t) ? '✓' : '' }}</span>{{ t }}</div>
      </div>
    </div>
    <div class="pb-drop">
      <button class="pb-btn icon" :class="{ on: menu === 'label' }" @click.stop="toggleMenu('label', $event)" title="Search by Label">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
      </button>
      <div class="pb-menu" ref="menuEl" v-if="menu === 'label'" @mousedown.stop>
        <div class="pb-menu-note" v-if="!labels.length">No labels yet. Add labels to assets with the label button in the status bar.</div>
        <div class="pb-menu-item" v-for="l in labels" :key="l" @click="toggleLabel(l)"><span class="check">{{ hasToken('l:', l) ? '✓' : '' }}</span>{{ l }}</div>
      </div>
    </div>
    <button class="pb-btn icon" :disabled="!query" @click="saveSearch" title="Save the search in Favorites">★</button>
  </div>

  <div class="pb-body">
    <div class="pb-left" :style="{ width: ui.leftWidth + 'px' }" @contextmenu.prevent>
      <div v-for="r in treeRows" :key="r.key" class="pb-row" :class="{ sel: r.sel, head: r.head, drop: dropTarget === r.key }"
           :style="{ paddingLeft: (4 + r.depth * 14) + 'px' }"
           @click="treeClick(r)" @contextmenu.prevent.stop="treeMenu(r, $event)"
           @dragover.prevent="treeDragOver(r, $event)" @dragleave="dragLeave(r.key, $event)" @drop.prevent.stop="treeDrop(r, $event)">
        <span class="pb-arrow" @click.stop="toggleNode(r)">{{ r.hasChildren ? (r.open ? '▼' : '▶') : '' }}</span>
        <span v-html="r.icon" :style="r.color ? { color: r.color } : null"></span>
        <span class="label">{{ r.label }}</span>
        <span class="ro" v-if="r.readonly && r.depth === 1">read-only</span>
      </div>
    </div>
    <div class="pb-split" @mousedown.prevent="startSplit"></div>
    <div class="pb-right">
      <div class="pb-crumbs">
        <template v-if="searching">
          <span class="pb-crumb last">Search:</span>
          <div class="pb-scope">
            <button class="pb-btn" :class="{ on: scope === 'assets' }" @click="setScope('assets')">In Assets</button>
            <button class="pb-btn" :class="{ on: scope === 'packages' }" @click="setScope('packages')">In Packages</button>
            <button class="pb-btn" :class="{ on: scope === 'folder' }" @click="setScope('folder')" :title="folder">In '{{ folderName }}'</button>
          </div>
          <span class="pb-grow"></span>
          <span class="pb-chip">{{ items.length }}{{ items.length >= limit ? '+' : '' }}</span>
        </template>
        <template v-else>
          <template v-for="(c, i) in crumbs" :key="c.url">
            <span class="pb-crumb-sep" v-if="i">›</span>
            <span class="pb-crumb" :class="{ last: i === crumbs.length - 1, drop: dropTarget === 'crumb:' + c.url }" @click="navigate(c.url)"
                  @dragover.prevent.stop="crumbDragOver(c, $event)" @dragleave="dragLeave('crumb:' + c.url, $event)" @drop.prevent.stop="crumbDrop(c, $event)">{{ c.label }}</span>
          </template>
        </template>
      </div>

      <div class="pb-items-wrap" @mousemove.capture="mascotTrack($event)" @dragover.capture="mascotTrack($event)" @mouseleave="mascotLeave" @wheel="gridWheel($event)">
      <div class="pb-items" ref="items" tabindex="-1" :class="{ drop: dropTarget === '#grid' }"
           @scroll="onScroll" @mousedown.self="clickEmpty($event)" @contextmenu.prevent="gridMenu(null, $event)"
           @dragover.prevent="gridDragOver($event)" @dragleave="dragLeave('#grid', $event)" @drop.prevent="gridDrop($event)">
        <div class="pb-canvas" :style="{ height: layout.height + 'px' }" @mousedown.self="clickEmpty($event)">
          <template v-if="listMode">
            <ui-drag-item v-for="v in visible" :key="v.key" class="pb-line" :class="{ sel: isSel(v.a), sub: !!v.a.parent, drop: dropTarget === v.a.uuid, ping: pingUuid === v.a.uuid }"
                 :style="{ top: v.y + 'px', left: gridInset + 'px' }" :type.attr="dragFor(v.a).type" :types.attr="dragFor(v.a).types" :value.attr="dragFor(v.a).value" :additional.attr="dragFor(v.a).json"
                 :title="v.a.url" @mousedown="itemDown(v, $event)" @dblclick="open(v.a)" @contextmenu.prevent.stop="gridMenu(v.a, $event)"
                 @dragstart="dragStart(v.a, $event)" @dragend="dragEnd" @dragover.prevent.stop="itemDragOver(v.a, $event)" @dragleave="dragLeave(v.a.uuid, $event)" @drop.prevent.stop="itemDrop(v.a, $event)">
              <span class="pb-arrow" @mousedown.stop @click.stop="toggleSubs(v.a)">{{ hasSubs(v.a) ? (subsOpen(v.a) ? '▼' : '▶') : '' }}</span>
              <span class="ico"><img v-if="thumbOf(v.a).src" :src="thumbOf(v.a).src"><ui-icon v-else-if="thumbOf(v.a).icon" :value="thumbOf(v.a).icon"></ui-icon><span v-else v-html="iconFor(v.a)" :style="folderStyle(v.a)"></span></span>
              <input v-if="renaming === v.a.uuid" class="pb-rename" ref="rename" :value="renameText" @input="renameText = $event.target.value"
                     @keydown.enter.stop="commitRename" @keydown.esc.stop="renaming = ''" @blur="commitRename" @mousedown.stop>
              <span v-else class="nm">{{ nameOf(v.a) }}</span>
              <span class="fd" v-if="searching">{{ folderOf(v.a) }}</span>
              <span class="ty">{{ typeOf(v.a) }}</span>
            </ui-drag-item>
          </template>
          <template v-else>
            <ui-drag-item v-for="v in visible" :key="v.key" class="pb-cell" :class="{ sel: isSel(v.a), sub: !!v.a.parent, drop: dropTarget === v.a.uuid, ping: pingUuid === v.a.uuid }"
                 :style="{ left: v.x + 'px', top: v.y + 'px', width: layout.cellW + 'px', height: layout.cellH + 'px' }"
                 :type.attr="dragFor(v.a).type" :types.attr="dragFor(v.a).types" :value.attr="dragFor(v.a).value" :additional.attr="dragFor(v.a).json"
                 :title="searching ? folderOf(v.a) + '/' + v.a.name : v.a.name" @mousedown="itemDown(v, $event)" @dblclick="open(v.a)" @contextmenu.prevent.stop="gridMenu(v.a, $event)"
                 @dragstart="dragStart(v.a, $event)" @dragend="dragEnd" @dragover.prevent.stop="itemDragOver(v.a, $event)" @dragleave="dragLeave(v.a.uuid, $event)" @drop.prevent.stop="itemDrop(v.a, $event)">
              <div class="pb-thumb" :style="{ width: layout.size + 'px', height: layout.size + 'px' }">
                <img v-if="thumbOf(v.a).src" :src="thumbOf(v.a).src" draggable="false">
                <ui-icon v-else-if="thumbOf(v.a).icon" :value="thumbOf(v.a).icon" :style="{ fontSize: Math.round(layout.size * 0.62) + 'px' }"></ui-icon>
                <span v-else v-html="iconFor(v.a)" :style="folderStyle(v.a)" style="display:flex;width:100%;height:100%;align-items:center;justify-content:center"></span>
                <span class="pb-expand" v-if="hasSubs(v.a)" @mousedown.stop @click.stop="toggleSubs(v.a)" :title="subsOpen(v.a) ? 'Hide sub-assets' : 'Show sub-assets'">{{ subsOpen(v.a) ? '◀' : '▶' }}</span>
              </div>
              <input v-if="renaming === v.a.uuid" class="pb-rename" ref="rename" :value="renameText" @input="renameText = $event.target.value"
                     @keydown.enter.stop="commitRename" @keydown.esc.stop="renaming = ''" @blur="commitRename" @mousedown.stop>
              <div v-else class="pb-name">{{ nameOf(v.a) }}</div>
            </ui-drag-item>
          </template>
        </div>
        <div class="pb-empty" v-if="!items.length">{{ searching ? 'No results' + (scope === 'assets' ? ' in Assets.' : '.') : (folder === packagesRoot ? 'No packages.' : 'This folder is empty.') }}</div>
      </div>
        <template v-if="ui.mascot !== false && mascotSrc && view.width > 240">
          <span class="pb-mascot-clip body"><img ref="mascot" class="pb-mascot" :class="{ shy: mascotShy }" :src="mascotSrc" draggable="false" alt="" @load="measure"></span>
          <span class="pb-mascot-clip hands"><img class="pb-mascot" :class="{ shy: mascotShy }" :src="mascotSrc" draggable="false" alt=""></span>
        </template>
      </div>

      <div class="pb-status">
        <span class="path" :class="{ hint: !!notice || mods.alt }" :title="statusText">{{ statusText }}</span>
        <span v-for="l in selectedLabels" :key="l" class="pb-chip">{{ l }}</span>
        <div class="pb-drop">
          <button class="pb-btn icon" :disabled="!selection.length || selectionReadonly" @click.stop="toggleMenu('labels', $event)" title="Labels of the selected assets">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="7.5" r="1.5"/></svg>
          </button>
          <div class="pb-menu" ref="menuEl" v-if="menu === 'labels'" style="top:auto;bottom:22px" @mousedown.stop>
            <input ref="newLabel" placeholder="New label, Enter to add" @keydown.enter="addLabel($event.target.value); $event.target.value = ''" @keydown.esc="menu = ''">
            <div class="pb-menu-item" v-for="l in labels" :key="l" @click="toggleSelectionLabel(l)"><span class="check">{{ labelState(l) }}</span>{{ l }}</div>
          </div>
        </div>
        <input type="range" min="0" max="100" :value="ui.zoom" @input="setZoom(+$event.target.value)" @wheel.prevent="zoomWheel($event)" title="Size (all the way left: list). Mouse wheel here, or Ctrl + wheel over the items.">
      </div>
    </div>
  </div>

  <!-- Folder Color > Custom...: a colour box at the pointer -->
  <div class="pb-colorpick" v-if="colorPick" :style="{ left: colorPick.x + 'px', top: colorPick.y + 'px' }" @mousedown.stop @keydown.stop>
    <div class="pb-colorpick-title">Folder color</div>
    <div class="pb-colorpick-row">
      <input type="color" :value="colorPick.value" @input="colorPick.value = $event.target.value" title="Pick a colour">
      <input class="pb-colorpick-hex" :value="colorPick.value.toUpperCase()" maxlength="7" spellcheck="false"
             @change="colorPick.value = $event.target.value" @keydown.enter="colorPick.value = $event.target.value; applyColorPick()" @keydown.esc="colorPick = null">
    </div>
    <div class="pb-colorpick-row end">
      <button class="pb-btn" @click="colorPick = null">Cancel</button>
      <button class="pb-btn primary" @click="applyColorPick()">Apply</button>
    </div>
  </div>

  <!-- Import Asset Package (like Unity's Import Unity Package window) -->
  <div class="pb-modal-back" v-if="importDlg" @mousedown.self.stop @contextmenu.prevent.stop @dragover.stop @drop.stop.prevent>
    <div class="pb-modal pb-import" @mousedown.stop>
      <div class="pb-modal-title">Import Asset Package</div>
      <div class="pb-modal-sub">
        From <b>{{ importDlg.info.project }}</b><template v-if="importDlg.info.creator"> (Cocos {{ importDlg.info.creator }})</template>,
        {{ importDlg.info.count }} asset{{ importDlg.info.count === 1 ? '' : 's' }}<template v-if="importDlg.info.kind === 'loose'">. No asset-package.json: uuids come from the .meta files</template>.
      </div>
      <div class="pb-modal-path" :title="importDlg.info.path">{{ importDlg.info.path }}</div>
      <div class="pb-modal-opts">
        <span class="lbl">Import to</span>
        <label><input type="radio" name="pb-import-mode" :checked="importDlg.mode === 'original'" @change="setImportMode('original')"> Original paths</label>
        <label :title="importDlg.folderUrl"><input type="radio" name="pb-import-mode" :checked="importDlg.mode === 'folder'" @change="setImportMode('folder')"> Under '{{ folderTitle(importDlg.folderUrl) }}'</label>
      </div>
      <div class="pb-modal-list">
        <div v-if="importDlg.busy && !importDlg.rows.length" class="pb-menu-note">Reading the package...</div>
        <div v-for="r in importRows" :key="r.path" class="pb-pkg-row" :class="{ off: r.checked === false, dir: r.isDirectory }" :style="{ paddingLeft: (6 + r.depth * 14) + 'px' }">
          <input type="checkbox" :checked="r.checked === true" :indeterminate.prop="r.checked === null" :disabled="!r.isDirectory && r.actions.length < 2" @change="toggleImportRow(r)">
          <span class="ico" v-html="pkgIcon(r)"></span>
          <span class="nm" :title="r.target">{{ r.name }}</span>
          <span class="tag" v-if="r.dependency">dependency</span>
          <span class="tag" v-if="!r.isDirectory && !r.hasMeta" title="No .meta file: Cocos gives it a new uuid">no meta</span>
          <span class="st" :class="r.status" v-if="r.statusText" :title="statusTitle(r)">{{ r.statusText }}</span>
          <select v-if="r.conflict || r.status === 'identical'" :value="r.actionNow" @change="setImportAction(r, $event.target.value)" :title="statusTitle(r)">
            <option v-for="c in r.choices" :key="c.value" :value="c.value">{{ c.label }}</option>
          </select>
        </div>
      </div>
      <div class="pb-modal-error" v-if="importDlg.error">{{ importDlg.error }}</div>
      <div class="pb-modal-foot">
        <button class="pb-btn" @click="importAll(true)">All</button>
        <button class="pb-btn" @click="importAll(false)">None</button>
        <span class="pb-grow sum">{{ importSummary }}</span>
        <button class="pb-btn" @click="closeImport()">Cancel</button>
        <button class="pb-btn primary" :disabled="importDlg.busy" @click="runImport()">Import</button>
      </div>
    </div>
  </div>

  <!-- Export Package (Unity's Export Package: the selection and its dependencies) -->
  <div class="pb-modal-back" v-if="exportDlg" @mousedown.self.stop @contextmenu.prevent.stop @dragover.stop @drop.stop.prevent>
    <div class="pb-modal pb-export" @mousedown.stop>
      <div class="pb-modal-title">Export Package</div>
      <div class="pb-modal-sub">The selected assets and what they use, with their .meta files (uuids kept). Cocos Internal and extension assets are left out.</div>
      <div class="pb-modal-list">
        <div v-if="exportDlg.busy && !exportDlg.rows.length" class="pb-menu-note">Collecting dependencies...</div>
        <div v-for="r in exportDlg.rows" :key="r.uuid" class="pb-pkg-row" :class="{ off: !exportDlg.checked[r.uuid], dir: r.isDirectory }" :style="{ paddingLeft: (6 + r.depth * 14) + 'px' }">
          <input type="checkbox" :checked="!!exportDlg.checked[r.uuid]" @change="toggleExportRow(r)">
          <span class="ico" v-html="pkgIcon(r)"></span>
          <span class="nm" :title="r.path">{{ r.name }}</span>
          <span class="tag" v-if="r.dependency">dependency</span>
        </div>
      </div>
      <div class="pb-modal-error" v-if="exportDlg.error">{{ exportDlg.error }}</div>
      <div class="pb-modal-foot">
        <label><input type="checkbox" :checked="exportDlg.includeDeps" @change="setIncludeDeps($event.target.checked)"> Include dependencies</label>
        <span class="pb-grow sum">{{ exportCount }} asset{{ exportCount === 1 ? '' : 's' }}</span>
        <button class="pb-btn" @click="exportDlg = null">Cancel</button>
        <button class="pb-btn" :disabled="exportDlg.busy || !exportCount" @click="runExport(false)" title="A folder with asset-package.json, assets/ and the .meta files">Export Folder...</button>
        <button class="pb-btn primary" :disabled="exportDlg.busy || !exportCount" @click="runExport(true)" title="The same folder as a .zip">Export .zip...</button>
      </div>
    </div>
  </div>
</div>
`;
