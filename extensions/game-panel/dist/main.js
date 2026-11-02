"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: !0 });
}, __copyProps = (to, from, except, desc) => {
  if (from && typeof from == "object" || typeof from == "function")
    for (let key of __getOwnPropNames(from))
      !__hasOwnProp.call(to, key) && key !== except && __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: !0 }), mod);

// source/main.ts
var main_exports = {};
__export(main_exports, {
  load: () => load,
  methods: () => methods,
  unload: () => unload
});
module.exports = __toCommonJS(main_exports);

// package.json
var package_default = {
  $schema: "./@types/schema/package/index.json",
  package_version: 2,
  name: "game-panel",
  version: "1.0.0",
  author: "Thanh Hoang",
  editor: ">=3.8.6",
  scripts: {
    preinstall: "node ./scripts/preinstall.js",
    build: "tsc && node ./scripts/build.js",
    watch: "node ./scripts/build.js --watch",
    typecheck: "tsc",
    test: "node ./tests/run.js",
    preview: "node ./tests/preview/build.js"
  },
  description: "i18n:game-panel.description",
  main: "./dist/main.js",
  devDependencies: {
    "@cocos/creator-types": "^3.8.6",
    "@types/node": "^18.17.1",
    esbuild: "^0.24.2",
    typescript: "^5.8.2",
    vue: "^3.1.4"
  },
  panels: {
    default: {
      title: "Game",
      type: "dockable",
      main: "dist/panels/default",
      size: {
        "min-width": 320,
        "min-height": 220,
        width: 960,
        height: 600
      }
    }
  },
  contributions: {
    menu: [
      {
        path: "i18n:menu.panel",
        label: "i18n:game-panel.open_panel",
        message: "open-panel"
      }
    ],
    messages: {
      "open-panel": {
        methods: ["openPanel"]
      },
      "query-web-contents": {
        methods: ["queryWebContents"]
      },
      "scene:preview-stop": {
        methods: ["default.onPreviewStop"]
      },
      "shortcut-play": {
        methods: ["default.shortcutPlay"]
      },
      "shortcut-pause": {
        methods: ["default.shortcutPause"]
      },
      "shortcut-step": {
        methods: ["default.shortcutStep"]
      }
    },
    shortcuts: [
      { message: "shortcut-play", win: "ctrl+p", mac: "cmd+p", when: "PanelName === 'game-panel'" },
      { message: "shortcut-pause", win: "ctrl+shift+p", mac: "cmd+shift+p", when: "PanelName === 'game-panel'" },
      { message: "shortcut-step", win: "ctrl+alt+p", mac: "cmd+alt+p", when: "PanelName === 'game-panel'" }
    ],
    scene: {
      script: "./dist/scene.js"
    },
    profile: {
      project: {
        settings: {
          default: {}
        }
      }
    }
  }
};

// source/main.ts
var methods = {
  openPanel() {
    Editor.Panel.open(package_default.name);
  },
  /** Read-only list of the editor's web contents (diagnostics). */
  queryWebContents() {
    let { webContents } = require("electron");
    return webContents.getAllWebContents().map((w) => ({
      id: w.id,
      type: w.getType(),
      url: String(w.getURL()).slice(0, 200),
      title: w.getTitle(),
      host: w.hostWebContents ? w.hostWebContents.id : null
    }));
  }
};
function load() {
}
function unload() {
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  load,
  methods,
  unload
});
//# sourceMappingURL=main.js.map
