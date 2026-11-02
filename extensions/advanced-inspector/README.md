# advanced-inspector

Odin-style attributes for the Cocos Creator 3.8 Inspector: buttons, groups, tabs, conditional fields, message boxes, validation, progress bars, dropdowns and more. Add them as decorators next to `@property`.

```ts
import { _decorator, Component } from 'cc';
import { button, infoBox, progressBar, showIf, title } from 'db://advanced-inspector/AdvancedInspector';
const { ccclass, property } = _decorator;

@ccclass('Enemy')
export class Enemy extends Component {
    @title('Stats')
    @progressBar(0, 'maxHp', '#d9453d')
    @property hp = 80;

    @property maxHp = 100;

    @property isBoss = false;

    @showIf('isBoss')
    @infoBox('Bosses ignore knockback.', 'warning')
    @property phases = 3;

    @button('Kill', { color: 'red' })
    kill() {
        this.hp = 0;
    }
}
```

The decorators only record metadata on the class. In a built game they do nothing else.

## Attributes

Member names in attributes (`showIf('isBoss')`, `progressBar(0, 'maxHp')`, ...) can be properties, getters or methods. Start a name with `!` to negate it, e.g. `showIf('!isAlive')`.

### Buttons

| Attribute | |
|---|---|
| `@button(label?, { size?, color? })` | Shows a method as a button. `size`: `'small'`, `'medium'`, `'large'` or pixels. `color`: `'blue'`, `'red'`, `'green'`. |
| `@buttonGroup(name?)` | Puts buttons (or fields) with the same group name side by side. |
| `@inlineButton(method, label?)` | A small button after the field that calls `method`. |

A button appears after the property declared before the method. Clicking it calls the method on every selected component, as one undo step.

### Layout

| Attribute | |
|---|---|
| `@title(text, { subtitle?, bold?, line? })` | A header above the member. |
| `@boxGroup(path, { label?, showLabel? })` | A framed box. Paths nest: `'Settings/Audio'`. |
| `@foldoutGroup(path, { label?, expanded? })` | A collapsible section. Its open state is remembered. |
| `@tabGroup(tab)` or `@tabGroup(group, tab)` | Tabs. A group path can go through a tab: `@boxGroup('Tabs/General/Box')`. |
| `@horizontalGroup(path?)` | Puts members in one row. |
| `@propertySpace(before = 8, after = 0)` | Empty space in pixels. |
| `@propertyOrder(n)` | Sorts members (lower first, default 0). |

Groups appear where their first member is. Cocos' own `@property({ group: { name } })` groups keep working.

### Conditions

| Attribute | |
|---|---|
| `@showIf(member, ...values)` / `@hideIf(member, ...values)` | Shows or hides the member when `member` is truthy, or equals one of `values` (handy for enums: `@showIf('kind', Kind.Boss)`). |
| `@enableIf(member, ...values)` / `@disableIf(member, ...values)` | Makes the member read-only. |
| `@readOnly` | Always read-only. |
| `@hideInPlayMode`, `@hideInEditMode`, `@disableInPlayMode`, `@disableInEditMode` | Play mode is Cocos' Preview in Editor. |

Several `showIf` must all pass. Any `hideIf` hides.

### Messages and validation

| Attribute | |
|---|---|
| `@infoBox(message, type = 'info', visibleIf?)` | A message box above the member. `type`: `'none'`, `'info'`, `'warning'`, `'error'`. |
| `@required(message?)` | An error box when the value is empty (no reference, empty string). |
| `@validateInput(method, message?)` | Calls `method(value)`. Return `true` if valid. Return `false` or an error message string otherwise. |

### Labels and color

| Attribute | |
|---|---|
| `@labelText(text)` | Changes the label. |
| `@hideLabel` | Removes the label. |
| `@suffixLabel(text)` | Text after the field, e.g. `'px'`, `'sec'`. |
| `@guiColor(color)` | Tints the member or button: `'#ff8800'`, `'#ff880080'` or `[r, g, b, a?]`. |

### Value controls

| Attribute | |
|---|---|
| `@progressBar(min = 0, max = 100, color?)` | A number as a bar you can drag. `min` and `max` can be member names. |
| `@minMaxSlider(min, max, showFields = true)` | A `Vec2` as a range: `x` is the minimum, `y` the maximum. |
| `@valueDropdown(items)` | Choose the value from a list. `items` can be values, `{ label, value }` objects, or the name of a member that returns them. |
| `@enumToggleButtons` | An enum or bitmask as a row of buttons. |
| `@onValueChanged(method)` | Calls `method()` after the value is changed in the Inspector. |

Flag attributes work with or without parentheses: `@readOnly` and `@readOnly()` are the same.

### Show in Inspector

`@showInInspector` shows a member that isn't a `@property`: a plain field, a getter, or a value Cocos can't serialize, such as a `Map`.

```ts
@showInInspector
inventory = new Map<string, number>([['Potion', 3], ['Arrow', 20]]);

@showInInspector
get dps() { return this.damage * this.attackSpeed; }
```

- Maps, arrays, sets, typed arrays and objects are shown as foldouts. Map entries are labelled by their key.
- It also shows numbers, strings, booleans, vectors (`Vec2`/`Vec3`/`Vec4`, `Quat`, `Size`, `Rect`), `Color`, nodes, components and assets. Click a node, component or asset to select it.
- You can edit numbers, strings, booleans and vector fields. Getters without a setter are read-only. You can remove items from arrays, sets and maps. You can add items when the existing items show their type: all numbers, all strings or all booleans (for maps: number or string keys).
- Values refresh about twice a second, so you can watch runtime state while the game runs in Preview in Editor.
- These values are not saved with the scene, like any non-serialized field. Edits only change the running object.
- Collections show their first 100 items.
- The other attributes work with it too (`@title`, groups, `@showIf`, `@readOnly`, `@labelText`, ...).

## Demo

`assets/AdvancedInspectorDemo.ts` (in this test project) uses every attribute. Add it to a node and select the node.

## Menu

**Extension → Advanced Inspector → Show Info** prints to the Console whether the runtime is loaded and which classes use attributes.

## How it works

- The runtime (`assets/AdvancedInspector.ts`) is in the extension's folder. The folder is mounted in the project as `db://advanced-inspector`.
- The extension adds an Inspector renderer for script components (`source/inspector/component.ts`). If a component's class uses attributes, the renderer hides Cocos' default property list and draws the component itself. Other components are not affected.
- Fields are still drawn by Cocos' own property editors, so every field type works. The attributes add layout, conditions, messages and buttons around them, or replace the editor with a custom control.
- The scene script (`source/scene.ts`) gives the Inspector each class's metadata. The Inspector reads getters, methods, validators and `@showInInspector` values from the component in the scene. When the Inspector depends on them, it checks again about twice a second.

## Limitations

- Attributes work on script components. They don't apply inside nested `@ccclass` objects or arrays shown in a component.
- `@button` methods are called with no arguments.
- `@valueDropdown` values must be numbers, strings or booleans.
- A script that extends a built-in component with its own Inspector (for example `cc.Sprite`) keeps the built-in Inspector.

## Development

```bash
npm install
npm run build          # type-check + bundle to dist/
npm test               # unit tests (layout, conditions, decorators, @showInInspector)
node tests/preview/build.js   # then open tests/preview/index.html#interact in a browser
```

After a build, reload `advanced-inspector` in **Extension → Extension Manager**.
