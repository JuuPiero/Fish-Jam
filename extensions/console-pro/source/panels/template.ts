/** Vue template of the Console Pro panel (compiled at runtime by the bundled Vue). */
export const TEMPLATE = /* html */ `
<div class="cp" ref="root" tabindex="-1" @keydown="onKey" :class="{ 'cp-colored-off': !ui.colorText }">
    <div class="cp-toolbar">
        <button class="cp-btn" title="Clear the Console Pro list" @click="clearAll">Clear</button>
        <button class="cp-btn drop" title="Clear options" @click="clearMenu"><span v-html="icons.chevron"></span></button>
        <button class="cp-btn" :class="{ on: ui.collapse }" title="Collapse identical messages" @click="toggleCollapse">Collapse</button>
        <button class="cp-btn" :class="{ on: config.errorPause }" title="Pause Play-in-Editor when the game logs an error" @click="toggleConfig('errorPause')">Error Pause</button>
        <div class="cp-grow"></div>
        <div class="cp-search">
            <span class="lens" v-html="icons.search"></span>
            <input ref="search" :class="{ bad: queryError }" :title="queryError || 'Search (Ctrl+F)'" placeholder="Search" spellcheck="false"
                :value="ui.query" @input="onQueryInput($event.target.value)" @keydown.esc.stop="setQuery('')" @keydown.down.prevent="focusList" @keydown.enter.prevent="focusList" />
            <div class="opts">
                <span v-if="ui.query" class="x" title="Clear search" @click="setQuery('')" v-html="icons.close"></span>
                <span class="opt" :class="{ on: ui.caseSensitive }" title="Match case" @click="toggleUi('caseSensitive')">Aa</span>
                <span class="opt" :class="{ on: ui.regex }" title="Use regular expression" @click="toggleUi('regex')">.*</span>
            </div>
        </div>
        <button class="cp-btn icon" :class="{ on: ui.time }" title="Show timestamps" @click="toggleUi('time')" v-html="icons.clock"></button>
        <button class="cp-btn icon" :class="{ on: ui.wrap }" title="Wrap long messages" @click="toggleUi('wrap')" v-html="icons.wrap"></button>
        <div class="cp-sep"></div>
        <template v-for="lv in levelButtons" :key="lv.level">
            <button class="cp-btn level" :class="{ on: ui.levels[lv.level] }" :title="lv.title" @click="toggleLevel(lv.level, $event)">
                <span v-html="lv.icon"></span><span class="n">{{ lv.count }}</span>
            </button>
        </template>
        <button class="cp-btn icon" title="More" @click="moreMenu" v-html="icons.more"></button>
    </div>

    <div class="cp-chips" v-if="chips.length" @wheel="onChipsWheel">
        <template v-for="c in chips" :key="c.id">
            <span v-if="c.sep" class="cp-sep"></span>
            <span v-else class="cp-chip" :class="[c.state, c.group === 'source' ? 'src' : '']" :title="c.title"
                @click="chipClick(c, $event)" @dblclick="chipSolo(c)" @contextmenu.prevent="chipMenu(c)">
                <span>{{ c.label }}</span><span class="n">{{ c.count }}</span>
            </span>
        </template>
        <span v-if="chipsActive" class="reset" title="Show every channel" @click="resetChips">Show all</span>
    </div>

    <div class="cp-list" ref="list" tabindex="0" :class="{ wrap: ui.wrap, tall: entryLinesUsed > 1 }" @scroll="onScroll" @mousedown="onListMouseDown">
        <div class="cp-spacer" :style="{ height: totalHeight + 'px' }"></div>
        <div v-for="r in visibleRows" :key="r.key" class="cp-row" :class="[r.level, { odd: r.odd, sel: r.sel }]"
            :style="{ top: r.top + 'px', height: r.height + 'px' }" :title="r.tip"
            @mousedown="rowDown(r, $event)" @dblclick="rowOpen(r)" @contextmenu.prevent="rowMenu(r)">
            <span class="ic" v-html="r.icon"></span>
            <span v-if="ui.time" class="tm">{{ r.time }}</span>
            <span class="msg" v-html="r.html"></span>
            <span v-if="ui.sourceColumn" class="src">{{ r.source }}</span>
            <span v-if="r.count > 1" class="cnt">{{ r.count > 9999 ? '9999+' : r.count }}</span>
        </div>
        <div v-if="!rowCount" class="cp-empty">{{ emptyText }}</div>
    </div>

    <div class="cp-split" @mousedown="startSplit"></div>
    <div class="cp-details" :style="{ height: ui.detailsH + 'px' }">
        <div class="cp-details-head">
            <span class="meta">{{ detailMeta }}</span>
            <button class="cp-btn icon" title="Copy message" :disabled="!detail" @click="copyDetail(false)" v-html="icons.copy"></button>
            <button class="cp-btn" title="Copy message and stack" :disabled="!detail" @click="copyDetail(true)">Copy with Stack</button>
            <button class="cp-btn icon" title="Open the first project frame (Enter / double-click)" :disabled="!detail" @click="openDetail" v-html="icons.open"></button>
        </div>
        <div class="cp-details-body" ref="details">
            <template v-if="detail">
                <pre class="text">{{ detail.message }}</pre>
                <template v-if="detail.frames.length">
                    <div class="cp-section">{{ detail.fromMessage ? 'Locations' : 'Stack' }}</div>
                    <ul class="cp-frames">
                        <li v-for="(f, i) in detail.frames" :key="i" class="cp-frame" :class="{ user: f.user, internal: f.internal }">
                            <span class="fn">{{ f.fn ? f.fn + ' ' : '' }}</span>
                            <a v-if="f.file" :title="f.file" @click="openFrame(f)">{{ f.display }}</a>
                            <span v-else>{{ f.display }}</span>
                            <a v-if="f.cs" class="cs" :title="'Open the C# source (line is approximate): ' + f.cs.file" @click="openCs(f)">{{ f.cs.display }} (C#)</a>
                            <span v-if="f.mapped" class="raw" :title="f.raw">(mapped)</span>
                        </li>
                    </ul>
                </template>
            </template>
        </div>
    </div>
    <div v-if="toast" class="cp-toast">{{ toast }}</div>
</div>
`;
