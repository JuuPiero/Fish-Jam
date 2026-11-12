# Project Browser

A Unity-style **Project** window for Cocos Creator 3.8.6+: the two-column Project Browser with Favorites, an Assets tree, Packages, a thumbnail grid, Unity search syntax, labels and drag and drop.

Open it from **Panel › Project** or **Extension › Project Browser › Project**. It is a dockable panel, so you can dock it under the Scene view, as in Unity.

## Layout

| Area | What it shows |
|---|---|
| **Favorites** | Built-in searches (All Materials, Models, Prefabs, Scenes, Scripts, Textures) and your saved searches. Save the current search with **★**. Remove one with right-click. |
| **Assets** | The `db://assets` folder tree. It loads from the asset database and remembers which folders are expanded. |
| **Packages** | One folder per extension asset database (`db://input-system` shows as `input-system`, and so on). Cocos' built-in `db://internal` appears as **Cocos Internal** and is read-only. |
| Breadcrumb | The current folder. Click a segment to go there; drop assets on a segment to move them into it. |
| Grid / list | Thumbnails with two-line names. Drag the size slider all the way left for the list view (icon, name and type, plus the folder when searching). |
| Status bar | The selected asset's path, its labels, the label button and the size slider. |
| Mascots | Two pictures; neither takes clicks. Positions and sizes are CSS variables on `.pb-items-wrap` (grid) and `.pb-peek-gap` (toolbar) in `source/panels/style.ts`. |

**Folder colours:** right-click a folder (or several, or a folder in the tree) → **Folder Color**: None, ten muted colours, or **Custom...** (a colour box with a picker and a hex field). The tint shows on the folder's icon in the tree, the grid and the list. Colours are saved per folder uuid in the project profile (`folderColors`), so renaming or moving a folder keeps its colour.

**Dragging an image:** an image is dragged with its texture and sprite frame listed as entries of their own (after the image itself), so the image can be dropped straight onto a SpriteFrame or Texture2D field in the Inspector, as in Unity. Dropping it on this panel still moves only the image.

**Zoom:** the size slider, the mouse wheel over the slider, or **Ctrl + mouse wheel** over the items (as in Unity). The plain wheel over the items scrolls.

**Mascots:**
- **Grid** (`static/hiding.png`, mirrored): a girl hiding behind the folder tree and peeking into the grid. Her fingers rest on the divider. She ducks behind the tree while the pointer or a drag comes near her. Turn her off with **Show Grid Mascot** in the grid's context menu.
- **Toolbar** (`static/undertable.png`): a girl peeking over the toolbar's bottom border, in the middle of the gap between Create and Search. Her hands rest on the border. She ducks while the pointer is over that gap. Turn her off with **Show Toolbar Mascot**.

Each mascot is drawn twice. The body copy is cut at the border she hides behind. The hands copy keeps only the hands and may cross that border, so the hands sit in front of it.

The splitter between the columns, the slider position, the current folder, the expanded folders and the mascot settings persist between sessions (browser local storage).

## Search

| You type | It finds |
|---|---|
| `hero walk` | Names that contain *hero* **and** *walk* |
| `"walk cycle"` | The exact phrase |
| `t:Material` | Assets of that type. Several `t:` filters are OR'ed together. |
| `l:Environment` | Assets with that label. Several `l:` filters are OR'ed together. |
| `*.png`, `ui_??.png` | A file-name glob |

Known `t:` names map to Cocos importers and types: AnimationClip, AnimatorController, AudioClip, Folder, Font, Json, Material, Mesh, Model, PhysicsMaterial, Prefab, Scene, Script, Shader, Sprite, TextAsset, Texture.

Any other word matches part of the engine type or the importer name (`t:SpriteAtlas`, `t:cc.Material`, `t:spine`).

A `t:` filter also finds sub-assets, like Unity: `t:AnimationClip` lists the clips inside FBX and glTF files.

The **Search by Type** and **Search by Label** buttons next to the search field add or remove these tokens.

### Search scope

When you start typing, the scope is **In Assets**.

The scope switches to **In 'Folder'** instead when you start in a package folder: as in Unity, packages are searched only from **In Packages** or from inside a package folder.

**In 'Folder'** searches the current folder and everything below it.

The result count shows `5000+` when results are capped. Hover a result to see its folder.

### Labels

Select assets and click the label button in the status bar.

- Pick an existing label to toggle it on the selection.
- Type a new one and press Enter.

Labels are stored per asset uuid in the project profile (`Editor.Profile` project scope, key `labels`), not in the `.meta` files. Labels of deleted assets are dropped the next time labels are saved. Saved searches are stored in the same profile, under `favorites`.

## Working with assets

| Action | How |
|---|---|
| Select | Click. Ctrl-click to toggle, Shift-click for a range, Ctrl+A for all. The selection is the editor's asset selection (`Editor.Selection.clear` + `select('asset', uuids)`), so the Inspector shows the asset exactly as it does for the Assets panel. Selecting in the Assets panel highlights the same assets here and scrolls to them when they are in the open folder. |
| Ping | Click an asset field in the Inspector (a script, clip, prefab, material, sprite frame...). The browser opens the asset's folder, leaves a search that would hide it, scrolls to it and flashes it, like Unity's ping. The selection does not change. A sub-asset pings its main asset; node and component references are ignored. |
| Open | Double-click or Enter. A folder navigates; a model expands its sub-assets; anything else goes to `asset-db open-asset` (scenes open, scripts open in your code editor). |
| Sub-assets | The ▶ handle on a thumbnail, or the arrow in list view. |
| Rename | F2, or a slow click on a selected item's context menu → Rename. Enter commits, Esc cancels. The extension is kept unless you type it. |
| Duplicate | Ctrl+D |
| Delete | Delete, after a confirmation |
| Create | The **Create** button or right-click → Create. Same entries as Cocos' Assets panel: Folder; every asset handler's entry from `asset-db query-create-menu-list`, grouped with separators (handler-only entries included, made by the handler itself); and what enabled extensions add through `contributions.assets.menu.createMenu` (Shader Graph, Input Actions, Animator Controller, ...). As in Unity and Cocos, a new asset is **named first**: a placeholder appears in rename mode, and the file is created with that name on Enter or click-away (Esc cancels). This matters for scripts, whose class name comes from the file name at creation. Folders are created at once and then renamed. An extension's create item can opt into the same name-first flow by adding plain data to it: `nameFirst: { fullFileName: 'NewComponent.cs', message: [pkg, msg, ...args] }`; after naming, the browser sends `msg` to `pkg` with the chosen db url first (the C# extension does this). |
| Move | Drag assets onto a folder in the tree, a folder thumbnail, a breadcrumb segment or the empty grid. Moving several assets asks first. |
| Make a prefab | Drag nodes from the Hierarchy onto the grid (current folder) or onto any folder. Each node becomes `<Node name>.prefab`, or `Cube 1.prefab`, `Cube 2.prefab`... when the name is taken (`scene create-prefab (nodeUuid, url)`, which also links the node). The new prefab flashes when it lands in the open folder; the Hierarchy selection stays. |
| Import | Drop files from Explorer onto a folder (`asset-db import-asset`). |
| Drop feedback | While dragging, the folder that would take the drop is highlighted: a tree row, a folder thumbnail or list row, a breadcrumb segment, or the whole grid for the open folder. A folder that cannot take it shows the not-allowed cursor: the dragged folder itself, one of its children, the folder the assets are already in, read-only places. Hovering a closed tree folder for a moment opens it. |
| Context menu | Create, Open, Show in Explorer, Find in Assets Panel, Copy Path, Copy UUID, Rename, Duplicate, Delete, Reimport, then what extensions add for that asset (`contributions.assets.menu.assetMenu`, e.g. Open in Shader Graph). Also Refresh for an empty-area click, the Render Previews toggle and Clear Thumbnail Cache. Extension menu files are loaded in the panel like the Assets panel does, and reloaded when they change. |
| Keyboard | Arrow keys move the selection (Shift extends), Backspace goes to the parent folder, Ctrl+F focuses the search. |

Cocos Internal and the Packages root are read-only: no create, rename, move, delete or import there.

### Drag out to the Scene, Hierarchy and Inspector

Every grid and list item is a Cocos `<ui-drag-item>`, which fills `Editor.UI.DragArea.currentDragInfo` the way the Assets panel does:

```
type        "cc.Material"                       first asset's type (folders: "cc.Asset")
types       "cc.Material,cc.Asset,cc.Mesh,..."  all types, extends and sub-asset types (3.8.5+ drop filters)
value       "uuid1,uuid2"                       the uuids, comma-separated, each once
additional  JSON [{ type, value, name, extends?, subAssets?: { "<key after @>": { type, value, name } } }]
```

Dragging a selected item drags the whole selection. The same `value` and `additional` strings are also set on `dataTransfer`, for plain DOM drop targets.

Drops into the browser read `currentDragInfo` (our own drags and the Assets panel's) and then `dataTransfer`. Uuids are deduplicated.

Hierarchy rows are `<ui-drag-item type="cc.Node">`. A drop counts as nodes when the drag info's type is `cc.Node`, or `additional` has `cc.Node` entries. Uuids the asset index does not know are checked with `scene query-node`, for a Hierarchy docked in another window where `currentDragInfo` is not shared. The drop effect is chosen from what the source allows (`effectAllowed`), so a copy-only drag is not refused.

The search-by-type, search-by-label and status-bar label dropdowns fit inside the visible panel. Each opens below its button, or above it when there is more room there. The list scrolls inside the height it gets, and is placed again when the panel resizes.

## Thumbnails

| Asset | Thumbnail |
|---|---|
| Image, texture, sprite frame, cube map | The whole picture, scaled to fit 256 px with its aspect kept. Formats Chromium decodes (PNG, JPG, WebP, GIF, BMP, ICO, AVIF, SVG) are read from the source file. For TGA, PSD, TIFF, HDR, EXR and others, the image is read from the PNG Cocos writes to the library (`query-asset-info().library`). RGBE images (`isRGBE`, e.g. HDR skies) are decoded with the engine's formula and tone-mapped. A sprite frame shows its own rectangle (atlas frames too, rotated frames turned back). Textures and sprite frames find their image through `userData.imageUuidOrDatabaseUri`. |
| Plain picture files | `.gif`, `.svg`, `.ico`... that Cocos keeps as plain files (importer `*`) show their picture too. |
| Anything an image decode fails on | `asset-db query-asset-thumbnail (uuid, 'large')`: Cocos' file or icon. |
| Material, prefab, mesh, model | Rendered by Cocos' own preview scenes, the ones the Inspector uses (details below). |
| Everything else | Our icons (below). For types we have no icon for, Cocos' importer icon (`asset-db query-icon-config-map`). |

The preview scenes are reached through the editor's preview client, `Editor._Module.require('PreviewExtends').default` (GLPreview). It runs on the channels `scene:material-preview`, `scene:prefab-preview`, `scene:mesh-preview` and `scene:model-preview`. For each asset:

1. Set the asset to preview:
   - material: `scene preview-material`
   - prefab, mesh, model: `scene call-preview-function <channel> setPrefab | setMesh | setModel`. A model passes its prefab sub-asset.
2. Query the preview data: `query-*-preview-data`.
3. Draw it into an off-screen 128 px canvas with `drawGL`.
4. Encode it with `toDataURL('image/png')`.

Thumbnails render one at a time and only for visible items. Images go before previews.

Rendered previews and image thumbnails are cached as PNG files in `<project>/temp/project-browser/thumbs`. A thumbnail is re-rendered when the asset's source file is newer. For images, the `.meta` file (sprite frame edits) and the library file (reimport) also count.

The preview scenes are shared with the Inspector. While the editor's selected asset is of the same kind (for example, a material is selected), thumbnails of that kind wait, so the Inspector's preview is not disturbed.

You can turn preview rendering off from the grid's context menu (**Render Previews**). Materials, prefabs and models then show flat icons.

**Extension › Project Browser › Clear Thumbnail Cache** removes the cache.

## Icons

The icons are original SVGs drawn for this extension in the manner of Unity's Project window:

- gray folders, with open and empty variants
- a blue cube for prefabs
- a page with a TS or JS badge for scripts, and a purple C# badge for `.cs` files (the `csharp` extension)
- files Cocos doesn't import (importer `*`): a page with an extension badge. Common kinds have their own colour (MD, CSV, XML, YML, PY, LUA, PDF, ZIP, DLL, HTML, GLSL...); anything else shows its extension, up to 4 letters, on grey. List mode shows them as "XYZ File". Text assets with a known extension (`.md`, `.csv`, `.xml`...) get the badge too; plain `.txt` keeps the text icon. `t:Script` also finds `.cs` files.
- a dark tile with a light, split-face cube for scenes
- a shaded sphere for materials
- a mesh wireframe, and a cube for models
- a picture for textures
- an animation curve through orange keyframes, on a clip tile, for animation clips
- a state graph for animator controllers
- a speaker for audio
- "Aa" for fonts
- a page with a sphere for shaders
- pages for JSON and text
- a box for packages; Cocos Internal has a lock

No Unity artwork and no third-party icon set is used, so there is no icon license to carry. Icons are bundled into `dist`; nothing is fetched at runtime.

The grays use `currentColor`, so they follow the editor theme: light gray on the dark palettes, dark gray on the light ones, including the editor-theme extension's Unity palettes. Accent colors are mid-tones chosen to read on both.

Cocos has no prefab variants, so there is no variant icon.

## Build and test

```
npm install
npx tsc            # typecheck
node scripts/build.js
node tests/run.js  # search, type mapping, labels, tree and path helpers, drag data, icons,
                   # drop rules, prefab names, popup placement, ping helpers, image sources, RGBE
```

`dist/` is bundled with esbuild, Vue 3 included.

The panel uses Vue's template compiler build (`vue/dist/vue.esm-bundler.js`), like the other CocosGoat extensions. The extension itself has no `eval`.

## Status

**Verified offline** (node): the query parser and search, Unity type mapping, sorting, the label store, the tree, breadcrumb, scope and rename helpers, the drag payload and drop parsing, the icon set, drop rules, prefab names, popup placement, ping helpers, image source picking and RGBE decoding. Typecheck and bundle are clean.

**Verified in headless Chrome** with a mocked `Editor`. Image thumbnails of real WebP, GIF, TGA (library PNG), RGBE HDR and an atlas with a sprite frame are covered. So are the selection calls passing a structured clone (the old ones passed a Vue proxy, which the editor's IPC cannot clone), drop highlight, not-allowed and spring-loaded folders, a Hierarchy-style node drop calling `create-prefab`, dropdown placement in a short panel, and the ping.

**Not yet run in Cocos:**

- the panel itself
- preview rendering through PreviewExtends
- `ui-drag-item` drops into the Scene, Hierarchy and Inspector
- the create menu, moving and importing
- the Hierarchy's real drag data
- the `ui-kit:touch-asset` broadcast from Inspector asset fields

Known limitations:

- A prefab thumbnail is not re-rendered when only a material it uses changes. Clear the cache to refresh it.
- Labels are not written to `.meta` files, so other tools don't see them.
