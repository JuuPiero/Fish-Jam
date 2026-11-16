/** Image Tools panel template (Vue). */
export const IMAGE_TEMPLATE = /* html */ `
<div class="mu mi" tabindex="0" @dragover.prevent="dragOver = true" @dragleave="dragOver = false" @drop.prevent="onDrop($event)" @keydown="onKey($event)">
  <div class="mu-toolbar">
    <button class="mu-btn" title="Add the images selected in the Assets panel" @click="addSelected()"><span v-html="ic.plus"></span>Add Selected</button>
    <button class="mu-btn" title="Add image files from disk" @click="addFiles()"><span v-html="ic.open"></span>Add Files...</button>
    <button class="mu-btn" :disabled="!files.length || batch.running" title="Remove every image from the list" @click="clearFiles()"><span v-html="ic.close"></span>Clear</button>
    <div class="mu-grow"></div>
    <button class="mu-btn" :disabled="!backup.last || batch.running" :title="backupTitle" @click="restoreLast()"><span v-html="ic.restore"></span>Restore Last</button>
  </div>

  <div class="mi-main">
    <!-- file list -->
    <div class="mi-list mu-scroll" :style="{ width: listWidth + 'px' }">
      <div v-if="!files.length" class="mu-empty">Drop images here, use <b>Add Selected</b>,<br>or right-click images in the Assets panel<br>and choose <b>Open in Image Tools</b>.</div>
      <div v-for="(f, i) in files" :key="f.path" class="mi-file" :class="{ sel: i === current }" @click="select(i)" :title="f.path">
        <div class="mi-file-name">
          <span class="badge">{{ f.format ? f.format.toUpperCase() : '?' }}</span>
          <span class="name">{{ f.name }}</span>
          <span class="x" title="Remove from the list" @click.stop="removeFile(i)" v-html="ic.close"></span>
        </div>
        <div class="mi-file-info">
          <span>{{ f.width }} x {{ f.height }}</span>
          <span>{{ bytes(f.size) }}</span>
          <span v-if="f.status === 'done'" class="mu-ok">&rarr; {{ bytes(f.resultSize) }}</span>
          <span v-if="f.status === 'skipped'" class="mu-warn" title="The result was not smaller; the file was left as it is">kept</span>
          <span v-if="f.status === 'busy'">...</span>
          <span v-if="f.status === 'error'" class="mu-err" :title="f.error">error</span>
        </div>
      </div>
    </div>
    <div class="mi-splitter" @mousedown="startListResize($event)"></div>

    <!-- preview -->
    <div class="mi-center">
      <div class="mu-toolbar mi-viewbar">
        <div class="mu-seg">
          <button class="mu-btn" :class="{ on: view.mode === 'split' }" title="Before | After split" @click="view.mode = 'split'"><span v-html="ic.split"></span></button>
          <button class="mu-btn" :class="{ on: view.mode === 'before' }" @click="view.mode = 'before'">Before</button>
          <button class="mu-btn" :class="{ on: view.mode === 'after' }" @click="view.mode = 'after'">After</button>
        </div>
        <div class="mu-sep"></div>
        <button class="mu-btn" :class="{ on: view.fit }" title="Fit to view" @click="fitView()"><span v-html="ic.zoomFit"></span></button>
        <button class="mu-btn" title="Actual pixels (100%)" @click="zoomTo(1)">1:1</button>
        <span class="mi-zoom">{{ Math.round(scale * 100) }}%</span>
        <div class="mu-sep"></div>
        <button class="mu-btn" :class="{ on: cropEditing }" :disabled="!currentFile" title="Edit the crop box on the image" @click="toggleCropEdit()"><span v-html="ic.crop"></span>Crop Box</button>
        <div class="mu-grow"></div>
        <span v-if="preview.busy" class="mi-busy">Rendering...</span>
      </div>
      <div ref="stage" class="mi-stage" :class="{ panning: panning }" @wheel.prevent="onWheel($event)" @mousedown="onStageDown($event)">
        <div v-if="!currentFile" class="mu-empty mi-stage-empty">No image selected.</div>
        <template v-else>
          <div class="mi-layer" v-if="originalUrl && (view.mode !== 'after' || cropEditing)" :style="beforeClip">
            <img :src="originalUrl" :style="beforeStyle" draggable="false">
          </div>
          <div class="mi-layer" v-if="resultUrl && view.mode !== 'before' && !cropEditing" :style="afterClip">
            <img :src="resultUrl" :style="afterStyle" draggable="false">
          </div>
          <template v-if="view.mode === 'split' && !cropEditing && resultUrl">
            <div class="mi-split-line" :style="{ left: splitX + 'px' }" @mousedown.stop="startSplitDrag($event)"><div class="grip"></div></div>
            <div class="mi-tag left">Before</div>
            <div class="mi-tag right">After</div>
          </template>
          <template v-if="cropEditing"><div v-for="(s, i) in cropShade" :key="i" class="mi-shade" :style="s"></div></template>
          <div v-if="cropEditing" class="mi-crop" :style="cropBoxStyle" @mousedown.stop="startCropDrag($event, 'move')">
            <div v-for="h in cropHandles" :key="h" class="h" :class="h" @mousedown.stop="startCropDrag($event, h)"></div>
            <div class="mi-crop-size">{{ cropPx.width }} x {{ cropPx.height }}</div>
          </div>
          <div v-if="preview.error" class="mi-stage-error mu-err">{{ preview.error }}</div>
        </template>
      </div>
      <div class="mu-status mi-compare" v-if="currentFile">
        <span>Before: <b>{{ currentFile.width }} x {{ currentFile.height }}</b> {{ (currentFile.format || '').toUpperCase() }} <b>{{ bytes(currentFile.size) }}</b></span>
        <template v-if="preview.result">
          <span>&rarr;</span>
          <span>After: <b>{{ preview.result.width }} x {{ preview.result.height }}</b> {{ preview.result.format.toUpperCase() }} <b>{{ bytes(preview.result.size) }}</b>
            <span :class="preview.result.size <= currentFile.size ? 'mu-ok' : 'mu-warn'">({{ sizeDelta }})</span></span>
          <span class="mi-hints">{{ sizeHint }}</span>
        </template>
        <span v-for="w in preview.warnings" class="mu-warn" :title="w">{{ w }}</span>
      </div>
    </div>

    <!-- settings -->
    <div class="mi-splitter" @mousedown="startSettingsResize($event)"></div>
    <div class="mi-settings" :style="{ width: settingsWidth + 'px' }">
      <div class="mi-settings-scroll mu-scroll">
      <!-- crop -->
      <div class="mu-fold" :class="{ off: !o.crop.enabled }">
        <div class="mu-fold-head" @click="toggleFold('crop')"><span class="arrow" :class="{ open: folds.crop }" v-html="ic.arrow"></span><input type="checkbox" v-model="o.crop.enabled" @click.stop>Crop</div>
        <div class="mu-fold-body" v-if="folds.crop">
          <div class="mu-row"><label>X / Y</label><div class="mu-val"><input type="number" class="num" :value="cropPx.left" @change="setCropPx('left', $event)"><input type="number" class="num" :value="cropPx.top" @change="setCropPx('top', $event)"></div></div>
          <div class="mu-row"><label>Width / Height</label><div class="mu-val"><input type="number" class="num" :value="cropPx.width" @change="setCropPx('width', $event)"><input type="number" class="num" :value="cropPx.height" @change="setCropPx('height', $event)"></div></div>
          <div class="mu-row"><label></label><div class="mu-val"><button class="mu-btn" @click="toggleCropEdit()">{{ cropEditing ? 'Done' : 'Edit Crop Box' }}</button><button class="mu-btn" @click="resetCrop()">Reset</button></div></div>
          <div class="mu-hint">Stored relative to the image, so a batch crops the same region of every image.</div>
        </div>
      </div>
      <!-- trim -->
      <div class="mu-fold" :class="{ off: !o.trim.enabled }">
        <div class="mu-fold-head" @click="toggleFold('trim')"><span class="arrow" :class="{ open: folds.trim }" v-html="ic.arrow"></span><input type="checkbox" v-model="o.trim.enabled" @click.stop>Trim Transparent Border</div>
        <div class="mu-fold-body" v-if="folds.trim">
          <div class="mu-row"><label title="Pixels with alpha at or below this count as transparent">Alpha Threshold</label><div class="mu-val"><input type="range" min="0" max="254" v-model.number="o.trim.threshold"><input type="number" class="num" min="0" max="254" v-model.number="o.trim.threshold"></div></div>
          <div class="mu-row"><label title="Transparent pixels kept around the content">Margin (px)</label><div class="mu-val"><input type="number" class="num" min="0" v-model.number="o.trim.margin"></div></div>
        </div>
      </div>
      <!-- rotate / flip -->
      <div class="mu-fold" :class="{ off: !transformOn }">
        <div class="mu-fold-head" @click="toggleFold('transform')"><span class="arrow" :class="{ open: folds.transform }" v-html="ic.arrow"></span>Rotate / Flip</div>
        <div class="mu-fold-body" v-if="folds.transform">
          <div class="mu-row"><label>Rotate</label><div class="mu-val">
            <div class="mu-seg"><button v-for="r in [0, 90, 180, 270]" :key="r" class="mu-btn" :class="{ on: o.transform.rotate === r }" @click="o.transform.rotate = r">{{ r }}&deg;</button></div>
          </div></div>
          <div class="mu-row"><label>Flip</label><div class="mu-val">
            <button class="mu-btn" :class="{ on: o.transform.flipH }" title="Flip horizontally" @click="o.transform.flipH = !o.transform.flipH"><span v-html="ic.flipH"></span>Horizontal</button>
            <button class="mu-btn" :class="{ on: o.transform.flipV }" title="Flip vertically" @click="o.transform.flipV = !o.transform.flipV"><span v-html="ic.flipV"></span>Vertical</button>
          </div></div>
        </div>
      </div>
      <!-- resize -->
      <div class="mu-fold" :class="{ off: !o.resize.enabled }">
        <div class="mu-fold-head" @click="toggleFold('resize')"><span class="arrow" :class="{ open: folds.resize }" v-html="ic.arrow"></span><input type="checkbox" v-model="o.resize.enabled" @click.stop>Resize</div>
        <div class="mu-fold-body" v-if="folds.resize">
          <div class="mu-row"><label>Mode</label><div class="mu-val"><div class="mu-seg">
            <button class="mu-btn" :class="{ on: o.resize.mode === 'percent' }" @click="o.resize.mode = 'percent'">Percent</button>
            <button class="mu-btn" :class="{ on: o.resize.mode === 'pixels' }" @click="o.resize.mode = 'pixels'">Pixels</button>
          </div></div></div>
          <template v-if="o.resize.mode === 'percent'">
            <div class="mu-row"><label>Scale (%)</label><div class="mu-val"><input type="range" min="1" max="200" v-model.number="o.resize.percent"><input type="number" class="num" min="1" max="1000" v-model.number="o.resize.percent"></div></div>
          </template>
          <template v-else>
            <div class="mu-row"><label>Width</label><div class="mu-val"><input type="number" class="num" min="0" :value="o.resize.width" @change="setResizeDim('width', $event)"><span class="dim">px</span></div></div>
            <div class="mu-row"><label>Height</label><div class="mu-val"><input type="number" class="num" min="0" :value="o.resize.height" @change="setResizeDim('height', $event)"><span class="dim">px</span></div></div>
            <div class="mu-row"><label>Keep Aspect</label><div class="mu-val"><input type="checkbox" v-model="o.resize.keepAspect"></div></div>
            <div class="mu-row"><label title="How the image fits a Width x Height box">Fit</label><div class="mu-val"><select v-model="o.resize.fit">
              <option value="fill">Fill (stretch)</option><option value="contain">Contain (letterbox)</option><option value="cover">Cover (crop)</option><option value="inside">Inside (shrink to fit)</option><option value="outside">Outside</option>
            </select></div></div>
            <div class="mu-row" v-if="o.resize.fit === 'contain'"><label>Letterbox Color</label><div class="mu-val"><input type="color" :value="hex6(o.resize.background)" @input="o.resize.background = withAlpha($event.target.value, o.resize.background)"><input type="range" min="0" max="255" :value="alphaOf(o.resize.background)" @input="o.resize.background = setAlpha(o.resize.background, $event.target.value)" title="Alpha"></div></div>
          </template>
          <div class="mu-row"><label title="Texture compression (ETC/PVRTC/ASTC) prefers these sizes">Round Size</label><div class="mu-val"><select v-model="o.resize.rounding">
            <option value="none">None</option><option value="pot-nearest">Power of Two (nearest)</option><option value="pot-up">Power of Two (up)</option><option value="pot-down">Power of Two (down)</option><option value="multiple4">Multiple of 4</option>
          </select></div></div>
          <div class="mu-row"><label>Filter</label><div class="mu-val"><select v-model="o.resize.kernel">
            <option value="nearest">Nearest (pixel art)</option><option value="cubic">Bicubic</option><option value="mitchell">Mitchell</option><option value="lanczos2">Lanczos 2</option><option value="lanczos3">Lanczos 3</option>
          </select></div></div>
          <div class="mu-row"><label>Allow Enlarge</label><div class="mu-val"><input type="checkbox" v-model="o.resize.allowEnlarge"></div></div>
        </div>
      </div>
      <!-- pad -->
      <div class="mu-fold" :class="{ off: !o.pad.enabled }">
        <div class="mu-fold-head" @click="toggleFold('pad')"><span class="arrow" :class="{ open: folds.pad }" v-html="ic.arrow"></span><input type="checkbox" v-model="o.pad.enabled" @click.stop>Pad / Extend Canvas</div>
        <div class="mu-fold-body" v-if="folds.pad">
          <div class="mu-row"><label>Top / Bottom</label><div class="mu-val"><input type="number" class="num" min="0" v-model.number="o.pad.top"><input type="number" class="num" min="0" v-model.number="o.pad.bottom"></div></div>
          <div class="mu-row"><label>Left / Right</label><div class="mu-val"><input type="number" class="num" min="0" v-model.number="o.pad.left"><input type="number" class="num" min="0" v-model.number="o.pad.right"></div></div>
          <div class="mu-row"><label>Fill</label><div class="mu-val"><select v-model="o.pad.extendWith">
            <option value="background">Color</option><option value="copy">Copy Edge Pixels</option><option value="mirror">Mirror</option><option value="repeat">Repeat</option>
          </select></div></div>
          <div class="mu-row" v-if="o.pad.extendWith === 'background'"><label>Color / Alpha</label><div class="mu-val"><input type="color" :value="hex6(o.pad.color)" @input="o.pad.color = withAlpha($event.target.value, o.pad.color)"><input type="range" min="0" max="255" :value="alphaOf(o.pad.color)" @input="o.pad.color = setAlpha(o.pad.color, $event.target.value)"><span class="num">{{ alphaOf(o.pad.color) }}</span></div></div>
        </div>
      </div>
      <!-- adjust -->
      <div class="mu-fold" :class="{ off: !o.adjust.enabled }">
        <div class="mu-fold-head" @click="toggleFold('adjust')"><span class="arrow" :class="{ open: folds.adjust }" v-html="ic.arrow"></span><input type="checkbox" v-model="o.adjust.enabled" @click.stop>Color Adjust</div>
        <div class="mu-fold-body" v-if="folds.adjust">
          <div class="mu-row" v-for="a in adjustSliders" :key="a.key"><label>{{ a.label }}</label><div class="mu-val"><input type="range" :min="a.min" :max="a.max" v-model.number="o.adjust[a.key]" @dblclick="o.adjust[a.key] = 0"><input type="number" class="num" :min="a.min" :max="a.max" v-model.number="o.adjust[a.key]"></div></div>
          <div class="mu-row"><label>Grayscale</label><div class="mu-val"><input type="checkbox" v-model="o.adjust.grayscale"></div></div>
          <div class="mu-row"><label>Tint</label><div class="mu-val"><input type="color" v-model="o.adjust.tint"><input type="range" min="0" max="100" v-model.number="o.adjust.tintAmount"><span class="num">{{ o.adjust.tintAmount }}%</span></div></div>
          <div class="mu-row"><label></label><div class="mu-val"><button class="mu-btn" @click="resetAdjust()">Reset</button></div></div>
        </div>
      </div>
      <!-- alpha -->
      <div class="mu-fold" :class="{ off: !o.alpha.enabled }">
        <div class="mu-fold-head" @click="toggleFold('alpha')"><span class="arrow" :class="{ open: folds.alpha }" v-html="ic.arrow"></span><input type="checkbox" v-model="o.alpha.enabled" @click.stop>Alpha</div>
        <div class="mu-fold-body" v-if="folds.alpha">
          <div class="mu-row"><label>Mode</label><div class="mu-val"><select v-model="o.alpha.mode">
            <option value="bleed">Alpha Bleed (fix edge halos)</option><option value="premultiply">Premultiply Alpha</option>
          </select></div></div>
          <div class="mu-hint" v-if="o.alpha.mode === 'bleed'">Fills the colour of fully transparent pixels from their neighbours. The image looks the same, but filtering and mipmaps stop pulling dark fringes into sprite edges.</div>
          <div class="mu-hint" v-else>Multiplies RGB by alpha. Only for textures drawn with premultiplied-alpha blending (Cocos: enable Premultiply Alpha in the texture import settings instead when possible).</div>
        </div>
      </div>
      <!-- output format -->
      <div class="mu-fold">
        <div class="mu-fold-head" @click="toggleFold('encode')"><span class="arrow" :class="{ open: folds.encode }" v-html="ic.arrow"></span>Format &amp; Compression</div>
        <div class="mu-fold-body" v-if="folds.encode">
          <div class="mu-row"><label>Format</label><div class="mu-val"><select v-model="o.encode.format">
            <option value="keep">Keep ({{ currentFormatLabel }})</option><option value="png">PNG</option><option value="jpg">JPG</option><option value="webp">WebP</option><option value="avif" :disabled="!caps.avif">AVIF{{ caps.avif ? '' : ' (not available)' }}</option>
          </select></div></div>
          <template v-if="outFormat === 'png'">
            <div class="mu-row"><label title="zlib level; lossless">Compression</label><div class="mu-val"><input type="range" min="0" max="9" v-model.number="o.encode.pngCompression"><span class="num">{{ o.encode.pngCompression }}</span></div></div>
            <div class="mu-row"><label title="Quantise to an indexed palette (lossy, much smaller)">Palette (Quantise)</label><div class="mu-val"><input type="checkbox" v-model="o.encode.pngPalette"></div></div>
            <template v-if="o.encode.pngPalette">
              <div class="mu-row"><label>Max Colors</label><div class="mu-val"><input type="range" min="2" max="256" v-model.number="o.encode.pngColors"><input type="number" class="num" min="2" max="256" v-model.number="o.encode.pngColors"></div></div>
              <div class="mu-row"><label title="Uses the fewest colours that reach this quality">Quality</label><div class="mu-val"><input type="range" min="0" max="100" v-model.number="o.encode.pngQuality"><span class="num">{{ o.encode.pngQuality }}</span></div></div>
              <div class="mu-row"><label>Dither</label><div class="mu-val"><input type="range" min="0" max="1" step="0.05" v-model.number="o.encode.pngDither"><span class="num">{{ o.encode.pngDither.toFixed(2) }}</span></div></div>
              <div class="mu-row"><label>Effort</label><div class="mu-val"><input type="range" min="1" max="10" v-model.number="o.encode.pngEffort"><span class="num">{{ o.encode.pngEffort }}</span></div></div>
            </template>
            <div class="mu-hint" v-else>Lossless. Images with 256 colours or fewer are also tried as an exact indexed PNG; the smaller file is kept.</div>
          </template>
          <template v-if="outFormat === 'jpg'">
            <div class="mu-row"><label>Quality</label><div class="mu-val"><input type="range" min="1" max="100" v-model.number="o.encode.jpgQuality"><span class="num">{{ o.encode.jpgQuality }}</span></div></div>
            <div class="mu-row"><label>Chroma Subsampling</label><div class="mu-val"><select v-model="o.encode.jpgChroma"><option value="4:2:0">4:2:0 (smaller)</option><option value="4:4:4">4:4:4 (sharper colour)</option></select></div></div>
            <div class="mu-row"><label>Progressive</label><div class="mu-val"><input type="checkbox" v-model="o.encode.jpgProgressive"></div></div>
            <div class="mu-row"><label title="mozjpeg trellis quantisation: smaller files, slower">MozJPEG</label><div class="mu-val"><input type="checkbox" v-model="o.encode.jpgMozjpeg"></div></div>
            <div class="mu-row"><label title="Transparent pixels are flattened onto this colour">Background</label><div class="mu-val"><input type="color" v-model="o.encode.jpgBackground"></div></div>
          </template>
          <template v-if="outFormat === 'webp'">
            <div class="mu-row"><label>Lossless</label><div class="mu-val"><input type="checkbox" v-model="o.encode.webpLossless"></div></div>
            <div class="mu-row" v-if="!o.encode.webpLossless"><label>Quality</label><div class="mu-val"><input type="range" min="1" max="100" v-model.number="o.encode.webpQuality"><span class="num">{{ o.encode.webpQuality }}</span></div></div>
            <div class="mu-row" v-if="!o.encode.webpLossless"><label>Near Lossless</label><div class="mu-val"><input type="checkbox" v-model="o.encode.webpNearLossless"></div></div>
            <div class="mu-row"><label>Alpha Quality</label><div class="mu-val"><input type="range" min="0" max="100" v-model.number="o.encode.webpAlphaQuality"><span class="num">{{ o.encode.webpAlphaQuality }}</span></div></div>
            <div class="mu-row"><label>Effort</label><div class="mu-val"><input type="range" min="0" max="6" v-model.number="o.encode.webpEffort"><span class="num">{{ o.encode.webpEffort }}</span></div></div>
          </template>
          <template v-if="outFormat === 'avif'">
            <div class="mu-row"><label>Lossless</label><div class="mu-val"><input type="checkbox" v-model="o.encode.avifLossless"></div></div>
            <div class="mu-row" v-if="!o.encode.avifLossless"><label>Quality</label><div class="mu-val"><input type="range" min="1" max="100" v-model.number="o.encode.avifQuality"><span class="num">{{ o.encode.avifQuality }}</span></div></div>
            <div class="mu-row"><label>Chroma Subsampling</label><div class="mu-val"><select v-model="o.encode.avifChroma"><option value="4:4:4">4:4:4</option><option value="4:2:0">4:2:0</option></select></div></div>
            <div class="mu-row"><label>Effort</label><div class="mu-val"><input type="range" min="0" max="9" v-model.number="o.encode.avifEffort"><span class="num">{{ o.encode.avifEffort }}</span></div></div>
            <div class="mu-hint mu-warn">Cocos Creator does not import AVIF as a texture. Use it for files loaded outside the asset pipeline.</div>
          </template>
          <div class="mu-row"><label title="When only re-encoding to the same format and the result is not smaller, keep the original file">Keep If Not Smaller</label><div class="mu-val"><input type="checkbox" v-model="o.encode.skipIfLarger"></div></div>
        </div>
      </div>
      <!-- save -->
      <div class="mu-fold">
        <div class="mu-fold-head" @click="toggleFold('save')"><span class="arrow" :class="{ open: folds.save }" v-html="ic.arrow"></span>Output</div>
        <div class="mu-fold-body" v-if="folds.save">
          <div class="mu-row"><label>Save Mode</label><div class="mu-val"><div class="mu-seg">
            <button class="mu-btn" :class="{ on: save.mode === 'overwrite' }" title="Replace the file in place; its .meta and uuid are kept" @click="save.mode = 'overwrite'">Overwrite</button>
            <button class="mu-btn" :class="{ on: save.mode === 'copy' }" title="Write a new file and import it" @click="save.mode = 'copy'">Save as Copy</button>
          </div></div></div>
          <template v-if="save.mode === 'copy'">
            <div class="mu-row"><label>Name Suffix</label><div class="mu-val"><input type="text" v-model="save.suffix" placeholder="-edited"></div></div>
            <div class="mu-row"><label>Folder</label><div class="mu-val"><input type="text" :value="save.folder || ''" placeholder="Same folder as the source" readonly :title="save.folder || ''"><button class="mu-btn icon" title="Choose a folder" @click="pickFolder()" v-html="ic.folder"></button><button class="mu-btn icon" title="Same folder as the source" :disabled="!save.folder" @click="save.folder = null" v-html="ic.close"></button></div></div>
          </template>
          <div class="mu-hint" v-else>The asset keeps its uuid and import settings. A format change renames the file with its .meta. Originals are backed up to temp/media-utils/backup (Restore Last).</div>
        </div>
      </div>
      </div>

      <div class="mi-apply">
        <div v-if="batch.running || batch.total" class="mi-progress-row">
          <div class="mu-progress"><div :style="{ width: (batch.total ? batch.done / batch.total * 100 : 0) + '%' }"></div><span>{{ batch.done }} / {{ batch.total }}</span></div>
          <button v-if="batch.running" class="mu-btn" @click="batch.cancel = true">Cancel</button>
        </div>
        <div class="mi-apply-buttons">
          <button class="mu-btn" :disabled="!currentFile || batch.running" @click="apply(false)">Apply to Current</button>
          <button class="mu-btn primary" :disabled="!files.length || batch.running" @click="apply(true)">Apply to All ({{ files.length }})</button>
        </div>
        <div class="mu-hint mu-err" v-if="!caps.loaded">{{ caps.error || 'Loading sharp...' }}</div>
      </div>
    </div>
  </div>

  <div class="mu-status">
    <span class="msg" :class="noticeClass">{{ notice }}</span>
  </div>

  <div v-if="dragOver" class="mi-drop">Drop images to add them</div>
  <div v-if="modal" class="mu-modal-back" @mousedown.self="closeModal(false)">
    <div class="mu-modal">
      <p>{{ modal.text }}</p>
      <div class="buttons"><button class="mu-btn" @click="closeModal(false)">Cancel</button><button class="mu-btn primary" @click="closeModal(true)">{{ modal.ok }}</button></div>
    </div>
  </div>
</div>
`;
