# Line Renderer for Cocos Creator 3.8

A Unity-style **LineRenderer** component: a line through a list of points with a width curve, a color gradient, round corners and caps, camera-facing or flat alignment, texture modes, and Scene view tools to edit and draw the points.

| Unity LineRenderer | Here |
|---|---|
| Positions, Loop, Use World Space | `positions`, `loop`, `useWorldSpace` |
| Width (curve × multiplier) | `widthCurve` × `widthMultiplier` |
| Color (gradient) | `colorGradient` |
| Corner Vertices, End Cap Vertices | `numCornerVertices`, `numCapVertices` |
| Alignment: View / TransformZ | `alignment` |
| Texture Mode: Stretch / Tile / DistributePerSegment / RepeatPerSegment, Texture Scale | `textureMode`, `textureScale` |
| Scene Tools: Edit Points, Create Points, Simplify | Inspector → Edit Points / Create Points / Simplify |
| `SetPosition`, `SetPositions`, `positionCount`, `startWidth`… `Simplify`, `BakeMesh` | `setPosition`, `setPositions`, `positionCount`, `startWidth`… `simplify`, `bakeMesh` |

## Quick start

- **Node → Effects → Line Renderer**: a node with a two-point line, sized to the view.
- **Node → Effects → Draw Line...**: an empty line in Create Points mode: click in the Scene view to add points, or drag to draw.
- Or **Add Component → Effects → LineRenderer** on any node.

The component gets the extension's line material automatically (`db://line-renderer/materials/line-default`, alpha blended). `line-additive` is the additive version. Your own materials need the line effect (`db://line-renderer/effects/line`): it has the techniques **alpha-blend**, **additive** and **opaque**, plus a main texture and tint color.

### 2D (UI)

Added under a Canvas, the component uses UI-sized defaults (width 10, points ±100, local space) and adds a **UIMeshRenderer**, so the line draws in hierarchy order with sprites. Use **TransformZ** alignment to keep the line flat in the XY plane (View works too with the orthographic UI camera).

## Properties

- **Loop**: connect the last point back to the first.
- **Positions**: the points. World space with **Use World Space** on (as in Unity), otherwise the node's local space.
- **Width Curve × Width Multiplier**: width in world units along the line (0 = start, 1 = end of its length).
- **Color Gradient**: color and alpha along the line, multiplied by the material's color and texture.
- **Num Corner Vertices**: rounds the corners (0 = sharp joins).
- **Num Cap Vertices**: rounds both ends.
- **Alignment**: **View** turns the line towards the camera (every camera sees it facing it, in the Scene and the Game view at the same time). **TransformZ** keeps it flat, facing the node's Z axis.
- **Texture Mode**: **Stretch** once along the line, **Tile** every world unit, **Distribute Per Segment** once with every segment getting the same share, **Repeat Per Segment** once per segment. **Texture Scale** multiplies along (x) and across (y).
- **Materials**, from the renderer.

## Scene tools

In the Inspector:

- **Edit Points**:
  - Click points (Shift / Ctrl + click adds or removes); drag them (Ctrl: snap).
  - Drag a rectangle to select several.
  - With **W / E / R**, move, rotate or scale the selected points with handles. These follow the Cocos toolbar's pivot and global/local settings.
  - Double-click a segment to insert a point; **Delete** removes points, not the node; **Ctrl+A** selects all; **Esc** clears the selection, then leaves.
  - **Subdivide Selected** adds a point in the middle of each segment between selected points.
  - Clicking a point of the selected line also starts Edit Points.
- **Create Points**: click to add a point at the end of the line; drag to draw, with a point every **Min Vertex Distance** (and at least every few pixels). **Input** sets where the points go:
  - **Plane**: the ground through the last point, or the node's XY plane in 2D.
  - **Camera Distance**: **Offset** units in front of the camera, like Unity's Mouse Position.
  - **Surfaces**: on scene geometry, lifted by **Offset**.
  **Esc** or **Enter** stops.
- **Simplify Preview / Tolerance / Simplify**: shows in yellow which points Simplify keeps (Ramer-Douglas-Peucker, like Unity), then removes the others.

Lines can be selected by clicking them in the Scene view (the editor's own picking can't see their generated geometry). All edits support undo.

## Scripting

```ts
import { _decorator, Component, Vec3, Color } from 'cc';
import { LineRenderer } from 'db://line-renderer/index';
const { ccclass, property } = _decorator;

@ccclass('Aim')
export class Aim extends Component {
    @property(LineRenderer) line: LineRenderer | null = null;

    update() {
        const line = this.line!;
        line.positionCount = 2;
        line.setPosition(0, this.node.worldPosition);
        line.setPosition(1, new Vec3(0, 0, -10));
        line.startWidth = 0.2;
        line.endWidth = 0.02;
        line.startColor = Color.RED;
        line.endColor = new Color(255, 0, 0, 0);
    }
}
```

API: `positionCount`, `setPosition(i, p)`, `getPosition(i)`, `setPositions(points)`, `getPositions()`, `startWidth` / `endWidth` (setting them makes the width curve a straight line), `startColor` / `endColor` (likewise for the gradient), `getLength()`, `simplify(tolerance)`, `bakeMesh(camera?, worldSpace?)` (the line as a Mesh, e.g. for a collider), `rebuild()`, `markDirty()`.

Change points with `setPosition` / `setPositions`. After changing the `positions` array directly, call `markDirty()`. In the editor, changes are picked up automatically.

## How it works

- The component is a `ModelRenderer` that owns its own render model and GPU buffers (like the engine's `cc.Line`). Nothing generated is saved with the scene.
- The vertex data holds each point with the line directions there; the line shader pushes the vertices sideways, facing the camera or the node's Z axis, and builds the round corners and caps in that plane. That's why View alignment is right for every camera.
- The geometry is rebuilt only when something changes, or when the node moves for world-space lines.
- The Scene view tools are a scene script that listens to the Scene view's mouse and keyboard above the editor's gizmos. Delete and Ctrl+A act on the points while you edit them.

Not in this version: shadows (the line is unlit), Unity's Static texture mode, and lighting data.

**Extension → Line Renderer → Save Diagnostics** writes `diagnostics.json` into the extension folder for troubleshooting.

## Development

```bash
npm install
npm run build      # type-check + bundle to dist/
npm test           # geometry, the component and the scene tools against a fake editor
npm run preview    # tests/preview/out/preview.html: the Inspector with fake data
```

After a build, reload `line-renderer` in **Extension → Extension Manager** (or restart Creator).
