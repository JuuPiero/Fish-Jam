# Spine Plus for Cocos Creator 3.8

A Spine runtime component in the style of spine-unity's **SkeletonAnimation**. It plays Spine **4.2 and 4.3** exports with the official spine-core runtimes. **Physics constraints react to the node's movement**, like in Unity, and a **Spine Preview** panel lets you try animations, skins and physics.

Cocos's built-in `sp.Skeleton` can't do this:

- It reads one Spine version per project (3.8 by default, or 4.2).
- It never passes the node's movement to physics.
- It can't read 4.3 exports.

| spine-unity | Here |
|---|---|
| SkeletonAnimation | `SkeletonAnimation` component |
| SkeletonGraphic (UI) | `SkeletonAnimation` + `SkeletonUIRenderer` (added automatically in a Canvas) |
| Skeleton Data Asset | the Cocos spine-data asset (`.json` / `.skel` + `.atlas` + textures) |
| Initial Skin, Animation Name, Loop, Time Scale | `skin`, `animation`, `loop`, `timeScale` |
| Initial Flip X / Y | `flipX`, `flipY` |
| Physics Position / Rotation Inheritance, Movement Relative To, limits | `physicsPositionInheritance`, `physicsRotationInheritance`, `physicsMovementRelativeTo`, `physicsPositionLimit`, `physicsRotationLimit` |
| `skeleton`, `AnimationState`, UpdateLocal / UpdateWorld / UpdateComplete | `skeleton`, `state`, `onUpdateLocal` / `onUpdateWorld` / `onUpdateComplete` |
| BoneFollower | `BoneFollower` |
| Skeleton Debug / Preview window | Spine Preview panel |

## Quick start

1. Import a Spine export as usual: the skeleton `.json` or `.skel`, its `.atlas` (or `.atlas.txt`) and the texture pages, in one folder. Cocos makes a spine-data asset from it.
2. Right-click the skeleton asset, then:
   - **Spine Plus: Create SkeletonAnimation** adds a node to the open scene. It goes under the selected node, or into a Canvas when the Scene view is 2D. The first animation plays and a skin with images is selected.
   - **Spine Plus: Preview** opens the Spine Preview panel.
3. Or add **Spine → SkeletonAnimation** to any node and drag the asset onto **Skeleton Data**.

The skeleton plays in the Scene view (**Play In Editor**). Move the node with the transform tool and you will see physics react.

### 2D (Canvas) and 3D

- **In a Canvas**, the component gets the `spine-default` material (no depth test) and a **SkeletonUIRenderer**. The skeleton then draws in hierarchy order with sprites, and works with masks and UIOpacity. **Fit UITransform** in the Inspector sizes the UITransform to the skeleton, so it can be clicked in the 2D Scene view.
- **In a 3D scene**, it gets the `spine-world` material (depth tested, no depth write). Spine units are node units, so scale the node down (e.g. 0.01), or set the asset's scale.

Both materials use the extension's `spine` effect (`db://spine-plus/effects/spine`). It is the official two-color ("tint black") shader. Your own materials need that effect.

## Physics

Spine 4.2+ physics constraints simulate every frame. As in spine-unity, the node's movement is fed to physics:

- **Physics Position Inheritance (X, Y)**: how much of the node's movement moves physics. 1 = all, 0 = none. Movement is measured in the node's space, so rotation and scale are handled.
- **Physics Rotation Inheritance**: the same for rotation around Z.
- **Physics Movement Relative To**: measure movement relative to another node instead of the world, e.g. a vehicle the character rides, or a scrolling camera.
- **Physics Position / Rotation Limit**: the largest movement passed per frame (0 = no limit).
- **Use Physics** off keeps the constraints in their pose.

After teleporting a character, call `resetLastPosition()` so the jump isn't passed to physics. `resetPhysics()` also puts physics at rest. You can move physics yourself with `physicsTranslate(x, y)` and `physicsRotate(x, y, degrees)`.

## Properties

- **Skeleton Data**: the spine-data asset.
- **Skin**, **Animation**: pickers filled from the data. The animation plays on track 0 when the skeleton starts.
- **Loop**, **Time Scale**, **Color** (tint), **Flip X / Y**.
- **Alpha Mode**: textures with premultiplied alpha or not. **Auto** reads `pma: true` from the atlas.
- **Physics** group: see above.
- **Advanced** group:
  - **Use Clipping**: clipping attachments.
  - **Z Spacing**: depth between slots, for 3D.
  - **Play In Editor**: animate in the Scene view.
  - **Debug Bones**: draw the bones in the Scene view.
- **Materials**, from the renderer.

The Inspector shows the export's version and the runtime that reads it, with bone, slot, physics and vertex counts. It also has **Preview**, **Restart**, **Reset Physics** and **Fit UITransform** buttons.

## Scripting

```ts
import { _decorator, Component, Vec3 } from 'cc';
import { SkeletonAnimation } from 'db://spine-plus/index';
const { ccclass, property } = _decorator;

@ccclass('Hero')
export class Hero extends Component {
    @property(SkeletonAnimation) spine: SkeletonAnimation | null = null;

    start() {
        const s = this.spine!;
        s.setMix('walk', 'jump', 0.2);
        s.setAnimation(0, 'walk', true);
        s.addAnimation(0, 'idle', true, 2);
        s.setEventListener((entry, event) => console.log('event', event.data.name));
        s.setCompleteListener((entry) => console.log('done', entry.animation?.name));
    }

    jump() {
        this.spine!.setAnimation(0, 'jump', false);
        this.spine!.addAnimation(0, 'walk', true, 0);
    }

    teleport(to: Vec3) {
        this.node.setWorldPosition(to);
        this.spine!.resetLastPosition(); // don't swing the physics
    }
}
```

API:

| Area | Members |
|---|---|
| Animation | `setAnimation`, `addAnimation`, `setEmptyAnimation`, `addEmptyAnimation`, `getCurrent`, `clearTrack`, `clearTracks`, `setMix` |
| Skin, slots and bones | `setSkin`, `setAttachment`, `findBone`, `findSlot`, `getBoneLocal`, `getBoneWorldPosition` |
| Listeners | `setStartListener` / `Interrupt` / `End` / `Dispose` / `Complete` / `Event` |
| Physics | `physicsTranslate`, `physicsRotate`, `resetPhysics`, `resetLastPosition` |
| Control and info | `paused`, `reload`, `fitUITransform`, `info`, `runtimeVersion`, `loadError` |

`skeleton` and `state` are the spine-core objects. They are 4.2 or 4.3 classes depending on the export (`runtimeVersion`).

### BoneFollower

Add **Spine → BoneFollower** to a node and set the skeleton and the bone name. The node then follows the bone, for example a weapon on a hand or a particle effect on a tail. Options:

- **Follow XY Position**, **Follow Z Position**
- **Follow Bone Rotation**
- **Follow Local Scale**
- **Follow Skeleton Flip**

## Spine Preview panel

Open it with **Panel → Spine Preview**, or by right-clicking a Spine asset. With **Follow Selection** on, it shows the Spine asset or the SkeletonAnimation node selected in the editor.

- **Animations**: list with filter. Play, pause, restart, setup pose, loop, mix duration, speed and a time scrubber.
- **Skins**.
- **Physics**:
  - Simulate on/off, and the position and rotation inheritance.
  - **Drag the character** to move it (physics reacts). **Shift+drag** rotates it.
  - **Shake X / Shake Y / Wobble** shake it automatically. **Reset Physics** and **Recenter** put it back.
- **View**: bones (physics bones in pink), mesh wireframe, bounds, background and alpha mode. Right or middle drag pans, the wheel zooms, a double-click frames the skeleton.
- **Info**: version, runtime, bones, slots, physics constraints, animations, skins, events and size. A list shows events as they fire.

The panel uses the same runtime, mesh builder and physics handling as the component.

## Versions

| Export | Read with |
|---|---|
| 4.3.x | spine-core 4.3 |
| 4.2.x | spine-core 4.2 |
| 4.0 / 4.1 JSON | spine-core 4.2 (best effort, no physics in these versions) |
| 3.x | not supported: re-export from Spine 4.2+, or use Cocos's `sp.Skeleton` |

The version comes from the export itself: `skeleton.spine` in JSON, the header in `.skel`. Both runtimes are bundled. They are needed because 4.3 stores ik, transform, path and physics constraints in a single `constraints` list, so each runtime only reads its own format.

## Notes

- The **Spine** engine module must stay enabled in Project Settings → Feature Cropping, because the spine-data asset type comes from it.
- Up to 65535 vertices per skeleton (16-bit indices).
- Web and the editor are tested. Native builds use the engine's UIMeshRenderer path in a Canvas and are untested.
- In a 3D scene, skeletons are selected from the Hierarchy; the Scene view can't pick generated meshes. In a Canvas, the UITransform rect is used.
- spine-core is under the [Spine Runtimes License](http://esotericsoftware.com/spine-runtimes-license): you need a Spine license to use it.

**Extension → Spine Plus → Save Diagnostics** writes `diagnostics.json` into the extension folder for troubleshooting.

## Development

```bash
npm install
npm run libs       # bundle spine-core 4.2 / 4.3 into assets/lib
npm run build      # type-check + bundle to dist/
npm test           # loader, mesh, physics, component (fake engine)
npm run preview    # tests/preview/out/preview.html: the Preview panel with the samples
```

After a build, reload `spine-plus` in **Extension → Extension Manager** (or restart Creator).
