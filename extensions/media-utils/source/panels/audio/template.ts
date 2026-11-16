/** Audio Editor panel template (Vue). */
export const AUDIO_TEMPLATE = /* html */ `
<div class="mu ma" tabindex="0" ref="root" @keydown="onKey($event)" @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop($event)">
  <div class="mu-toolbar">
    <button class="mu-btn icon" title="Open an audio file..." @click="openDialog()" v-html="ic.open"></button>
    <button class="mu-btn" title="Open the audio clip selected in the Assets panel" @click="openSelected()">Open Selected</button>
    <div class="mu-sep"></div>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Skip to Start (Home)" @click="toStart()" v-html="ic.toStart"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" :class="{ on: playing }" :title="playing ? 'Pause (P)' : 'Play (Space)'" @click="togglePause()" v-html="playing ? ic.pause : ic.play"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Stop" @click="stop()" v-html="ic.stop"></button>
    <button class="mu-btn icon" :disabled="!hasDoc || !hasSel" title="Play Selection" @click="playSelection()" v-html="ic.playSel"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" :class="{ on: loopPlay }" title="Loop Playback (Shift+Space plays looped)" @click="loopPlay = !loopPlay" v-html="ic.loop"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Skip to End (End)" @click="toEnd()" v-html="ic.toEnd"></button>
    <input type="range" class="ma-volume" min="0" max="1" step="0.01" v-model.number="volume" title="Playback volume">
    <div class="mu-sep"></div>
    <button class="mu-btn icon" :disabled="!canUndo" :title="'Undo ' + undoLabel + ' (Ctrl+Z)'" @click="undo()" v-html="ic.undo"></button>
    <button class="mu-btn icon" :disabled="!canRedo" :title="'Redo ' + redoLabel + ' (Ctrl+Y)'" @click="redo()" v-html="ic.redo"></button>
    <div class="mu-sep"></div>
    <button class="mu-btn icon" :disabled="!hasSel" title="Cut (Ctrl+X)" @click="cut()" v-html="ic.cut"></button>
    <button class="mu-btn icon" :disabled="!hasSel" title="Copy (Ctrl+C)" @click="copy()" v-html="ic.copy"></button>
    <button class="mu-btn icon" :disabled="!hasDoc || !hasClip" title="Paste (Ctrl+V)" @click="paste()" v-html="ic.paste"></button>
    <button class="mu-btn icon" :disabled="!hasSel" title="Delete (Delete)" @click="del()" v-html="ic.trash"></button>
    <button class="mu-btn icon" :disabled="!hasSel" title="Trim to Selection (Ctrl+T)" @click="trim()" v-html="ic.trim"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Silence / Insert Silence (Ctrl+L)" @click="silence()" v-html="ic.silence"></button>
    <button class="mu-btn icon" :disabled="!hasSel" title="Duplicate (Ctrl+D)" @click="duplicate()" v-html="ic.duplicate"></button>
    <div class="mu-sep"></div>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Zoom In (Ctrl+1 or wheel)" @click="zoomBy(2)" v-html="ic.zoomIn"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Zoom Out (Ctrl+3 or wheel)" @click="zoomBy(0.5)" v-html="ic.zoomOut"></button>
    <button class="mu-btn icon" :disabled="!hasSel" title="Zoom to Selection (Ctrl+E)" @click="zoomSelection()" v-html="ic.zoomSel"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Fit to Width (Ctrl+F)" @click="zoomFit()" v-html="ic.zoomFit"></button>
    <div class="mu-sep"></div>
    <button class="mu-btn icon" :class="{ on: snap }" title="Snap selection to zero crossings" @click="snap = !snap" v-html="ic.snap"></button>
    <button class="mu-btn icon" :disabled="!hasDoc" title="Add Marker at the cursor (Ctrl+M)" @click="addMarker()" v-html="ic.marker"></button>
    <div class="mu-grow"></div>
    <span class="ma-title" v-if="file" :title="file.path">{{ file.name }}<span v-if="dirty" class="mu-warn"> *</span></span>
  </div>

  <div class="ma-main">
    <div class="ma-track" ref="track">
      <canvas ref="ruler" class="ma-ruler" @mousedown="onRulerDown($event)" @dblclick="onRulerDblClick($event)"></canvas>
      <div class="ma-waves" ref="waves" @mousedown="onWaveDown($event)" @wheel.prevent="onWheel($event)">
        <canvas ref="wave"></canvas>
        <canvas ref="overlay" class="ma-overlay"></canvas>
      </div>
      <div class="ma-hscroll" ref="hscroll" @mousedown="onScrollDown($event)"><div class="thumb" :style="thumbStyle"></div></div>
      <div v-if="!hasDoc" class="ma-empty mu-empty">
        Right-click an audio clip in the Assets panel and choose <b>Open in Audio Editor</b>,<br>
        drop a file here, or use <b>Open</b>.
      </div>
    </div>
    <div class="ma-splitter" @mousedown="startSideResize($event)"></div>
    <div class="ma-side mu-scroll" :style="{ width: sideWidth + 'px' }">
      <!-- effects -->
      <div class="mu-fold">
        <div class="mu-fold-head" @click="folds.effects = !folds.effects"><span class="arrow" :class="{ open: folds.effects }" v-html="ic.arrow"></span>Effects</div>
        <div class="mu-fold-body" v-if="folds.effects">
          <div class="mu-row"><label>Effect</label><div class="mu-val"><select v-model="effectId">
            <optgroup v-for="g in effectGroups" :key="g.label" :label="g.label"><option v-for="e in g.items" :key="e.id" :value="e.id">{{ e.label }}</option></optgroup>
          </select></div></div>
          <div class="mu-row" v-for="p in effect.params" :key="effect.id + p.key">
            <label :title="p.title || ''">{{ p.label }}</label>
            <div class="mu-val">
              <template v-if="p.type === 'bool'"><input type="checkbox" v-model="params[effect.id][p.key]"></template>
              <template v-else-if="p.type === 'select'"><select v-model="params[effect.id][p.key]"><option v-for="o in p.options" :key="o[0]" :value="o[0]">{{ o[1] }}</option></select></template>
              <template v-else><input type="range" :min="p.min" :max="p.max" :step="p.step" v-model.number="params[effect.id][p.key]"><input type="number" class="num" :min="p.min" :max="p.max" :step="p.step" v-model.number="params[effect.id][p.key]"></template>
            </div>
          </div>
          <div class="mu-hint" v-if="effect.hint">{{ effect.hint }}</div>
          <div class="mu-hint" v-if="effect.id === 'amplify' || effect.id === 'normalize'">Peak of the {{ hasSel ? 'selection' : 'file' }}: <b>{{ peakText }}</b>
            <a v-if="effect.id === 'amplify'" class="ma-link" @click="params.amplify.db = maxGain">use max without clipping</a></div>
          <div class="ma-apply-row"><span class="ma-target">{{ effectTarget }}</span><button class="mu-btn primary" :disabled="!hasDoc || busy.active" @click="applyEffect()">Apply</button></div>
        </div>
      </div>
      <!-- markers -->
      <div class="mu-fold">
        <div class="mu-fold-head" @click="folds.markers = !folds.markers"><span class="arrow" :class="{ open: folds.markers }" v-html="ic.arrow"></span>Markers &amp; Loop</div>
        <div class="mu-fold-body" v-if="folds.markers">
          <div class="mu-row"><label>Loop</label><div class="mu-val">
            <span v-if="loopRegion" class="ma-time">{{ time(loopRegion.start) }} - {{ time(loopRegion.end) }}</span><span v-else class="ma-dim">none</span>
          </div></div>
          <div class="mu-row"><label></label><div class="mu-val">
            <button class="mu-btn" :disabled="!hasSel" @click="setLoopFromSelection()">Set from Selection</button>
            <button class="mu-btn" :disabled="!loopRegion" @click="selectLoop()">Select</button>
            <button class="mu-btn" :disabled="!loopRegion" @click="clearLoop()">Clear</button>
          </div></div>
          <div class="ma-markers">
            <div v-for="m in markerList" :key="m.id" class="ma-marker">
              <input type="text" :value="m.name" @change="renameMarker(m.id, $event.target.value)">
              <span class="ma-time" @click="goTo(m.position)" title="Move the cursor here">{{ time(m.position) }}</span>
              <span class="x" title="Remove marker" @click="removeMarker(m.id)" v-html="ic.close"></span>
            </div>
            <div v-if="!markerList.length" class="mu-hint">No markers. Ctrl+M adds one at the cursor; drag markers in the ruler, double-click to rename.</div>
          </div>
          <div class="mu-hint">Markers and the loop are saved inside WAV files (cue / smpl chunks). MP3 and OGG exports do not keep them.</div>
        </div>
      </div>
      <!-- export -->
      <div class="mu-fold">
        <div class="mu-fold-head" @click="folds.export = !folds.export"><span class="arrow" :class="{ open: folds.export }" v-html="ic.arrow"></span>Export</div>
        <div class="mu-fold-body" v-if="folds.export">
          <div class="mu-row"><label>Format</label><div class="mu-val"><div class="mu-seg">
            <button v-for="f in ['wav', 'mp3', 'ogg']" :key="f" class="mu-btn" :class="{ on: ex.format === f }" @click="ex.format = f">{{ f.toUpperCase() }}</button>
          </div></div></div>
          <template v-if="ex.format === 'wav'">
            <div class="mu-row"><label>Bit Depth</label><div class="mu-val"><select v-model.number="ex.wavBitDepth"><option :value="16">16-bit PCM</option><option :value="24">24-bit PCM</option><option :value="32">32-bit float</option></select></div></div>
          </template>
          <template v-if="ex.format === 'mp3'">
            <div class="mu-row"><label>Mode</label><div class="mu-val"><div class="mu-seg">
              <button class="mu-btn" :class="{ on: ex.mp3Mode === 'cbr' }" @click="ex.mp3Mode = 'cbr'">Constant</button>
              <button class="mu-btn" :class="{ on: ex.mp3Mode === 'vbr' }" @click="ex.mp3Mode = 'vbr'">Variable</button>
            </div></div></div>
            <div class="mu-row" v-if="ex.mp3Mode === 'cbr'"><label>Bitrate</label><div class="mu-val"><select v-model.number="ex.mp3Bitrate"><option v-for="b in mp3Bitrates" :key="b" :value="b">{{ b }} kbps</option></select></div></div>
            <div class="mu-row" v-else><label title="0 = best, 9 = smallest">VBR Quality</label><div class="mu-val"><input type="range" min="0" max="9" step="1" v-model.number="ex.mp3Quality"><span class="num">V{{ ex.mp3Quality }}</span></div></div>
          </template>
          <template v-if="ex.format === 'ogg'">
            <div class="mu-row"><label title="-1 = smallest, 10 = best">Quality</label><div class="mu-val"><input type="range" min="-1" max="10" step="0.5" v-model.number="ex.oggQuality"><span class="num">{{ ex.oggQuality }}</span></div></div>
            <div class="mu-hint">About {{ oggKbps }} kbps for stereo 44.1 kHz.</div>
          </template>
          <div class="mu-row"><label>Sample Rate</label><div class="mu-val"><select v-model.number="ex.sampleRate">
            <option :value="0">Keep ({{ info.sampleRate }} Hz)</option><option v-for="r in exportRates" :key="r" :value="r">{{ r }} Hz</option>
          </select></div></div>
          <div class="mu-row"><label>Channels</label><div class="mu-val"><select v-model.number="ex.channels">
            <option :value="0">Keep ({{ channelName(info.channels) }})</option><option :value="1">Mono</option><option :value="2">Stereo</option>
          </select></div></div>
          <div class="mu-hint" v-if="exportNote">{{ exportNote }}</div>
          <div class="mu-row"><label>Save Mode</label><div class="mu-val"><div class="mu-seg">
            <button class="mu-btn" :class="{ on: save.mode === 'overwrite' }" title="Replace the file; its .meta and uuid are kept" @click="save.mode = 'overwrite'">Overwrite</button>
            <button class="mu-btn" :class="{ on: save.mode === 'copy' }" @click="save.mode = 'copy'">Save as Copy</button>
          </div></div></div>
          <template v-if="save.mode === 'copy'">
            <div class="mu-row"><label>Name Suffix</label><div class="mu-val"><input type="text" v-model="save.suffix"></div></div>
            <div class="mu-row"><label>Folder</label><div class="mu-val"><input type="text" :value="save.folder || ''" placeholder="Same folder as the source" readonly><button class="mu-btn icon" @click="pickFolder()" v-html="ic.folder"></button><button class="mu-btn icon" :disabled="!save.folder" @click="save.folder = null" v-html="ic.close"></button></div></div>
          </template>
          <div class="mu-hint" v-else>Keeps the uuid; a format change renames the file with its .meta. The original goes to temp/media-utils/backup (Extension menu: Media Utils / Restore Last Overwrite).</div>
          <div class="ma-apply-row"><span class="ma-target">{{ exportTarget }}</span><button class="mu-btn primary" :disabled="!hasDoc || busy.active" @click="exportFile()"><span v-html="ic.save"></span>Export</button></div>
        </div>
      </div>
    </div>
  </div>

  <div class="mu-status ma-selbar">
    <span class="ma-field"><label>Rate</label><b>{{ hasDoc ? info.sampleRate + ' Hz' : '-' }}</b></span>
    <span class="ma-field"><label>Channels</label><b>{{ hasDoc ? channelName(info.channels) : '-' }}</b></span>
    <span class="ma-field"><label>Length</label><b>{{ hasDoc ? time(info.length) : '-' }}</b></span>
    <div class="mu-sep"></div>
    <span class="ma-field"><label>Start</label><input type="text" :value="time(sel.start)" :disabled="!hasDoc" @change="setSelField('start', $event)"></span>
    <span class="ma-field"><label>End</label><input type="text" :value="time(sel.end)" :disabled="!hasDoc" @change="setSelField('end', $event)"></span>
    <span class="ma-field"><label>Length</label><input type="text" :value="time(sel.end - sel.start)" :disabled="!hasDoc" @change="setSelField('length', $event)"></span>
    <span class="ma-field"><label>{{ playing ? 'Playing' : 'Cursor' }}</label><b class="ma-time">{{ time(playing && playPos !== null ? playPos : sel.start) }}</b></span>
    <div class="mu-grow"></div>
    <span class="msg" :class="noticeClass" :title="notice">{{ notice }}</span>
  </div>

  <div v-if="busy.active" class="ma-busy">
    <div class="ma-busy-box">
      <div>{{ busy.text }}</div>
      <div class="mu-progress" v-if="busy.progress >= 0"><div :style="{ width: busy.progress * 100 + '%' }"></div><span>{{ Math.round(busy.progress * 100) }}%</span></div>
    </div>
  </div>
  <div v-if="dragOver" class="ma-drop">Drop an audio file to open it</div>
  <div v-if="modal" class="mu-modal-back" @mousedown.self="closeModal(false)">
    <div class="mu-modal">
      <p>{{ modal.text }}</p>
      <div v-if="modal.input !== undefined" class="ma-modal-input"><input type="text" ref="modalInput" v-model="modal.input" @keydown.enter="closeModal(true)"></div>
      <div class="buttons"><button class="mu-btn" @click="closeModal(false)">Cancel</button><button class="mu-btn primary" @click="closeModal(true)">{{ modal.ok }}</button></div>
    </div>
  </div>
</div>
`;
