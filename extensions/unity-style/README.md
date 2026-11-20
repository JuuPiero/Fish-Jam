# Unity Style

A Unity-flavoured API over Cocos Creator 3.8.6, for people who think in Unity:
`MonoBehaviour` with `Awake` / `Update` / `GetComponentInChildren` / `Invoke` /
coroutines, `@Serializable` / `@SerializeField`, `Time`, `Debug`, `Mathf`,
`Vector3`, `Random`, `GameObject.Find`, `Resources`, `SceneManager`,
`PlayerPrefs`, and a physics layer: `Physics.Raycast(origin, dir, hit, 100, mask)`,
`SphereCast`, `OverlapSphere`, `LayerMask`, `Physics2D`, and
`OnCollisionEnter` / `OnTriggerEnter` messages.

It wraps Cocos; it does not replace it. `@ccclass`, `@property`, `this.node`,
`PhysicsSystem.instance` and everything else keep working, also mixed with
these.

Runtime scripts live in `assets/` (mounted as `db://unity-style`) and are
compiled into game builds:

```ts
import { MonoBehaviour, Serializable, SerializeField, Physics, RaycastHit, LayerMask, Time, Debug } from 'db://unity-style/index';
```

Not duplicated here: Unity's Input and Input System are the **input-system**
extension, DOTween is **tween-pro**, Cinemachine is **virtual-camera**,
WheelCollider is **vehicle-physics**.

## Writing a script

**Create > MonoBehaviour Script**, in Cocos' Assets panel or in the Project Browser, writes a `@Serializable` MonoBehaviour with `Start` and `Update`. The class is named after the file:

- The Project Browser asks for the name first.
- Cocos' Assets panel creates `NewMonoBehaviour.ts` and starts a rename. Renaming the file there does not rename the class, the same as Cocos' own TypeScript template.

When the csharp extension is enabled, **Create > C# MonoBehaviour Script** writes the C# version. It has `using cc;`, `using static cc.Globals;` and `using Ext.UnityStyle;`.

```ts
import { Node, Vec3 } from 'cc';
import { MonoBehaviour, Serializable, SerializeField, Header, Range, Tooltip,
         Physics, RaycastHit, LayerMask, Collision, WaitForSeconds, Time, Debug } from 'db://unity-style/index';

@Serializable                         // the @ccclass replacement; on top, as @ccclass
export class Turret extends MonoBehaviour {
    @Header('Aim')
    @Tooltip('Metres')
    @Range(1, 100)
    @SerializeField
    range = 30;

    @SerializeField(Node)
    muzzle: Node | null = null;

    private hit = new RaycastHit();   // Unity's `out RaycastHit`: a hit object to fill

    Start(): void {
        this.InvokeRepeating('Scan', 0.5, 0.5);
        this.StartCoroutine(this.Blink());
    }

    Update(dt: number): void {
        this.Rotate(0, 45 * dt, 0);
    }

    Scan(): void {
        if (Physics.Raycast(this.position, this.forward, this.hit, this.range, LayerMask.GetMask('Enemy'))) {
            Debug.Log('Target ' + this.hit.collider!.node.name + ' at ' + this.hit.distance.toFixed(1));
        }
    }

    *Blink() {
        for (;;) {
            yield new WaitForSeconds(1);
            Debug.Log('blink at ' + Time.time);
        }
    }

    OnCollisionEnter(c: Collision): void {
        Debug.Log('hit by ' + c.collider!.node.name + ', speed ' + c.relativeVelocity.length());
    }
}
```

One component class per script file (Cocos' rule). The file name is the
component's name when `@Serializable` has no argument.

## MonoBehaviour

`MonoBehaviour` extends Cocos' `Component`. Write the Unity messages:

| Unity | Called by Cocos as | Notes |
| --- | --- | --- |
| `Awake()` | `onLoad` | |
| `OnEnable()` / `OnDisable()` | `onEnable` / `onDisable` | |
| `Start()` | `start` | |
| `Update(dt)` | `update(dt)` | `dt` is also `Time.deltaTime` |
| `LateUpdate(dt)` | `lateUpdate(dt)` | |
| `FixedUpdate()` | each fixed step, before `Update` | step = the physics fixed step; same stepping rule as Cocos' physics (at most Max Sub Steps per frame) |
| `OnDestroy()` | `onDestroy` | |
| `OnCollisionEnter/Stay/Exit(c)`, `OnTriggerEnter/Stay/Exit(other)`, the `2D` ones | `PhysicsMessages` | see Physics |

- A hook is installed only for messages the class defines, so a class without
  `Update` is not scheduled.
- If a class defines both `update` and `Update`, only the Cocos one runs (no
  double calls). If you override a camelCase hook in a subclass, call
  `super.xxx()` to keep the base class's Unity message.
- `FixedUpdate` does not run in the editor's scene view, even with
  `@ExecuteInEditMode`.

Members:

| Unity | Here |
| --- | --- |
| `gameObject`, `transform` | the node (Cocos has one object for both); `this.node` works too |
| `tag`, `CompareTag(t)` | a `Tag` component (see GameObject) |
| `position`, `localPosition`, `rotation`, `localRotation`, `eulerAngles`, `localEulerAngles`, `localScale`, `lossyScale` | get returns a **copy** (as Unity's structs), set applies it |
| `forward`, `right`, `up` | Cocos' node axes: **forward is -Z** |
| `Translate(v or x,y,z, Space.Self)`, `Rotate(euler or x,y,z, Space.Self)`, `RotateAxis(axis, angle)`, `RotateAround`, `LookAt` | `Space.Self` (default) uses the node's world rotation, like Unity |
| `TransformPoint` / `InverseTransformPoint` / `TransformDirection` / `InverseTransformDirection` | |
| `parent`, `SetParent(p, worldPositionStays = true)`, `childCount`, `GetChild(i)`, `Find("A/B")`, sibling index | |
| `GetComponent(s)`, `TryGetComponent(type, { value })`, `AddComponent` | |
| `GetComponentInChildren(type, includeInactive)`, `GetComponentsInChildren`, `GetComponentInParent`, `GetComponentsInParent` | self first, as Unity; inactive nodes skipped unless `includeInactive` |
| `SendMessage`, `BroadcastMessage`, `SendMessageUpwards` | |
| `Invoke(name or fn, t)`, `InvokeRepeating`, `CancelInvoke`, `IsInvoking` | scaled time; paused while the node is inactive |
| `StartCoroutine`, `StopCoroutine`, `StopAllCoroutines` | see Coroutines |
| `Destroy`, `Instantiate`, `DontDestroyOnLoad`, `FindObjectOfType(s)`, `print` | also module functions |
| `isActiveAndEnabled`, `enabled` | |
| (extra) `Delay(seconds): Promise` | `await this.Delay(0.5)` for async code (and C#) |

### Coroutines

`StartCoroutine` takes a generator (`this.Fade()`), a method name
(`'Fade'`, with an optional argument) or a function returning one. It runs
to its first `yield` at once. It stops when the behaviour is destroyed or its
node deactivated (not when the behaviour is only disabled), as in Unity.

| `yield` | resumes |
| --- | --- |
| `null` | next frame, after `LateUpdate` (Unity: before it) |
| `new WaitForSeconds(s)` / `WaitForSecondsRealtime(s)` | after scaled / real seconds |
| `new WaitUntil(fn)` / `WaitWhile(fn)` | checked every frame |
| `new WaitForEndOfFrame()` | after the frame is drawn |
| `new WaitForFixedUpdate()` | after the next FixedUpdate step |
| a `Coroutine` (from StartCoroutine) | when it ends |
| another generator: `yield this.Child()` | runs it nested (`yield*` works too) |
| a Promise | when it settles; its value comes back from `yield`, a rejection is thrown at the `yield` |
| a `CustomYieldInstruction` subclass | while `keepWaiting` |

Generators work in preview and in builds: Cocos 3.8.6 compiles web builds to
ES5 with Babel 7.22, which turns `function*` into its `regeneratorRuntime`
helper. That helper ships in the build's shared Babel helper chunk
(`src/chunks/bundle.js`, the `rollupPluginModLoBabelHelpers` module, the same
one `async` functions already use; seen in CocosGoat's own web-mobile build).
Nothing needs enabling. The runtime was also run on the real engine with its
scripts compiled by Babel's loose ES5 transform, generators included (see Tests).

## Decorators

| Unity | Here | Cocos underneath |
| --- | --- | --- |
| class (implicit) / `[Serializable]` | `@Serializable` / `@Serializable('Name')` | `@ccclass` |
| `[SerializeField]` | `@SerializeField`, `@SerializeField(Node)`, `@SerializeField([Node])`, `@SerializeField(Enum(Team))`, `@SerializeField({ ...property options })` | `@property` (with `serializable: true`) |
| `[HideInInspector]` | `@HideInInspector` | `visible(false)` |
| `[Tooltip]`, `[Range(a, b)]`, `[Min]`, `[Multiline]` / `[TextArea]` | same names | `tooltip`, `range` + `slide`, `rangeMin`, `multiline` |
| `[Header("x")]`, `[Space(10)]` | `@Header('x')`, `@Space(10)` | metadata read by the **advanced-inspector** extension (its `@title` / `@propertySpace`); Cocos' own Inspector has no headers |
| `[FormerlySerializedAs]`, `[NonSerialized]` | same names | `formerlySerializedAs`; plain fields are not saved anyway |
| `[RequireComponent(T)]` (up to 3, or an array), `[DisallowMultipleComponent]`, `[ExecuteInEditMode]` / `[ExecuteAlways]`, `[AddComponentMenu]`, `[DefaultExecutionOrder]`, `[HelpURL]` | same names | `requireComponent`, `disallowMultiple`, `executeInEditMode`, `menu`, `executionOrder`, `help` |

- **Serialization is explicit.** TypeScript erases `public` / `private`, so
  Unity's "public fields are saved" cannot be detected. Only `@SerializeField`
  (or `@property`) saves and shows a field. The other field decorators only
  add Inspector information. Cocos drops them in release builds, so a field
  with only `@Tooltip` is not saved.
- `@SerializeField` always sets `serializable: true`. Cocos' own editor
  decorators (`@tooltip`, `@range`, `@visible`...) switch a property to
  "standalone" mode. In that mode a plain `@property` next to them is **not
  saved** in the editor and preview (measured in the engine test). With
  `@SerializeField` you don't have to care.
- Put `@Serializable` on top: the class decorators below it (`@RequireComponent`...)
  must run first, as with `@ccclass`.

**Class names and minification.** Release builds minify class names. The
CocosGoat web-mobile build has `var g = t("InputBinding", function(){ function t(...)`,
so a class's own `name` cannot be trusted. The engine resolves this for
components: a component defined without a name is named after its **script
file**. That name is a string literal in the compiled script
(`_RF.push({}, "<uuid>", "Turret")`), so it survives minification. A nameless
`@Serializable` component therefore gets the file name.

A nameless non-component data class gets `"<ScriptFile>.<n>"`, where n is its
order among the nameless data classes of that file. This name also comes from
the compiled script, but it changes if you reorder those classes. Pass a name
(`@Serializable('Inventory.Item')`) to pin it. Saved data refers to data
classes by this name.

## Statics

| Unity | Here |
| --- | --- |
| `Time.deltaTime`, `unscaledDeltaTime`, `time`, `unscaledTime`, `timeSinceLevelLoad`, `realtimeSinceStartup`, `frameCount`, `fixedDeltaTime` (get/set = the physics step), `fixedTime`, `inFixedTimeStep` | same |
| `Time.timeScale` | Cocos has no global time scale. The loop wraps `director.tick` on the director instance and passes `dt * timeScale` to the whole frame. Component updates, physics, animation, tweens and the scheduler all slow down, and 0 pauses them, as in Unity. Ignored in the editor's scene view (`Time.timeScaleSupported`). |
| `Debug.Log/LogWarning/LogError/LogException`, `LogFormat('{0}', [args])`, `Assert`, `Break` | console; `Break` pauses the director |
| `Debug.DrawLine(a, b, color, duration, depthTest)`, `DrawRay(start, dir, ...)` | geometry renderer of the main window's first camera (or `DebugDraw.cameras`). Needs the **Geometry Renderer** engine module (Project Settings > Feature Cropping). |
| `Mathf.*` | Unity's names and behaviour: `Round` is half-to-even, `Sign(0)` is 1, `SmoothDamp(cur, target, { value: vel }, time)`, `PerlinNoise`, `DeltaAngle`, `PingPong`... `Min/Max(a, b, ...)` take up to 6 values or an array |
| `Vector3.*`, `Vector2.*`, `Quaternion.*` | static helpers returning new `Vec3` / `Vec2` / `Quat` (`out` as last argument to reuse): `Distance`, `Lerp`, `MoveTowards`, `Angle`, `SignedAngle`, `Project`, `Reflect`, `Slerp`, `SmoothDamp`, `Add/Sub/Mul/Div`; `Quaternion.Euler`, `AngleAxis`, `LookRotation`, `FromToRotation`, `Slerp`, `RotateTowards`, `Inverse`, `Mul`, `MulVec3`. `Vector3.forward` is **(0, 0, -1)** (Cocos), and Euler angles follow Cocos' order. |
| `Random.value`, `Range`, `insideUnitSphere`, `onUnitSphere`, `insideUnitCircle`, `rotation`, `ColorHSV`, `InitState(seed)` | **`Range(min, max)` is always a float.** TypeScript cannot tell Unity's int overload from the float one, so use `RangeInt(min, max)` for an int (max exclusive). |
| `GameObject.Find(name or "A/B")`, `FindWithTag`, `FindGameObjectsWithTag`, `CreatePrimitive(PrimitiveType.Cube)` | `GameObject.Create(name, [components])` replaces `new GameObject(...)` |
| Tags | Cocos nodes have no tag; the `Tag` component (Add Component > Unity Style > Tag) holds one. No Tag = "Untagged". |
| `Object.Destroy(obj, t)`, `Instantiate(...)`, `DontDestroyOnLoad`, `FindObjectOfType(s)`, `FindFirstObjectByType`... | module functions, or `UnityObject.*` (a class named `Object` would hide JavaScript's) |
| `Resources.Load` | Cocos loading is async. `Load(path, type)` returns the asset when it is already loaded, else null (and starts the load). Use `LoadAsync` (a Promise), `Load(path, type, callback)`, or `LoadAll`. Paths are inside a `resources` folder, without extension (`"hero/spriteFrame"` for a SpriteFrame). |
| `SceneManager.LoadScene(name)`, `LoadSceneAsync(name, onProgress)`, `GetActiveScene()`, `sceneLoaded.add(fn)` | one scene at a time: no additive loading, no build indices |
| `PlayerPrefs.*` | over `sys.localStorage` (optional `keyPrefix`) |
| `Application.platform`, `isMobilePlatform`, `isEditor`, `isPlaying`, `targetFrameRate`, `OpenURL`, `Quit` | |

## Physics (3D)

### Unity to Cocos

| Unity | unity-style | Cocos underneath |
| --- | --- | --- |
| `Physics.Raycast(origin, dir, out hit, maxDist, mask, qti)` | `Physics.Raycast(origin, dir, hit, maxDist, mask, qti)` | `PhysicsSystem.instance.raycastClosest(ray, mask, dist, triggers)` + `raycastClosestResult` |
| `Physics.Raycast(ray, ...)` | same (`geometry.Ray`) | |
| `RaycastAll`, `RaycastNonAlloc(…, results, …)` | same; sorted by distance, one hit per collider | `raycast` + `raycastResults` |
| `Linecast(a, b, out hit)` | `Linecast(a, b, hit?)` | |
| `SphereCast`, `BoxCast`, `CapsuleCast` (+ `All`, `NonAlloc`) | same argument order; `hit` optional | `sweepSphere/Box/Capsule(Closest)` on Bullet and PhysX, geometric sweeps on builtin and cannon.js |
| `OverlapSphere/Box/Capsule` (+ `NonAlloc`), `CheckSphere/Box/Capsule` | same | geometric (Cocos has no overlap query) |
| `Physics.ClosestPoint(p, collider, pos, rot)` | same (pos / rot optional) | geometric |
| `RaycastHit.point / normal / distance / collider / rigidbody / transform` | same (+ `node`, `gameObject`); `triangleIndex` is always -1 | `PhysicsRayResult` |
| `QueryTriggerInteraction`, `Physics.queriesHitTriggers` | same | `queryTrigger` flag, plus our own filtering where a backend ignores it |
| `Physics.gravity`, `autoSimulation`, `Simulate(step)`, `SyncTransforms()` | same; `fixedDeltaTime`, `sleepThreshold` too | `PhysicsSystem` |
| `IgnoreLayerCollision(a, b, ignore)` / `GetIgnoreLayerCollision` | same | the collision matrix, re-applied to existing bodies |
| `IgnoreCollision(c1, c2)` | same | native on Bullet only (see matrix) |
| `Physics.AllLayers`, `DefaultRaycastLayers`, `IgnoreRaycastLayer` | same | |
| `LayerMask.GetMask(...)`, `NameToLayer`, `LayerToName` | same | collision groups |
| `gameObject.layer = n` | `LayerMask.SetLayer(nodeOrComponent, n)`, `GetLayer` | `RigidBody.group` / `Collider.setGroup` + `setMask` |
| `OnCollisionEnter(Collision)` etc. | same, on any component | collider events via `PhysicsMessages` |

**Out parameters.** TypeScript has no `out`. You pass a `RaycastHit` and the
query fills it; the call returns a boolean, as in Unity. A miss clears the
hit. `RaycastHit` is a class, so the same call works from C#:
`var hit = new RaycastHit(); if (Physics.Raycast(p, d, hit, 10)) ...`.

**Distances.** `Infinity` (the default) is passed to Cocos as 10,000,000, its
own default. Cocos must not be given Infinity.

### Layers are physics collision groups

Unity's layer index `i` is the Cocos collision group bit `1 << i`. Layer 0 is
the project's `DEFAULT` group, which also answers to "Default". The names come
from Project Settings > Physics > Collision Groups; 2D and 3D share them.
`NameToLayer` ignores case, spaces and underscores, so "Ignore Raycast" finds
a group named `IGNORE_RAYCAST`. A layer mask is a plain number, the group mask
Cocos' queries take. `Physics.IgnoreRaycastLayer` is the group named Ignore
Raycast (0 when the project has none), and rays default to
`DefaultRaycastLayers` (= every layer but that one).

Node layers (`node.layer`, rendering visibility) are a different thing and
are not used.

In Cocos a group belongs to the physics body of a node: the RigidBody, or
DEFAULT for a static collider without one. When a group changes, Cocos does
not apply the collision matrix again. `LayerMask.SetLayer` sets the group and
re-applies the matrix row, which is what a Unity layer change does.

### What works where (measured)

Each cell below was run on the real engine (see Tests). The runs used the
Cocos 3.8.6 engine sources and the real Bullet, PhysX and Box2D wasm builds,
plus cannon.js and builtin.

| | builtin | cannon.js | Bullet | PhysX |
| --- | --- | --- | --- | --- |
| Raycast / All / Linecast, layer mask | yes | yes | yes | yes |
| hit normal | yes (Cocos returns zero: computed here) | yes | yes | yes |
| trigger filtering | yes (the backend ignores the flag: filtered here) | yes (duplicate hits removed) | yes | yes |
| SphereCast / BoxCast / CapsuleCast | yes, geometric | yes, geometric (no capsule colliders in cannon.js) | yes, native (distance fixed: Bullet reports origin-to-point) | yes, native |
| Overlap* / Check* / ClosestPoint | yes, geometric | yes | yes | yes |
| OnTriggerEnter/Stay/Exit | yes | yes | yes | yes |
| OnCollisionEnter/Stay/Exit | no (no contacts in builtin) | yes | yes | yes |
| IgnoreLayerCollision | n/a (no dynamics) | yes | yes | yes |
| IgnoreCollision | messages only | messages only | yes (native) | messages only |

"Geometric" means computed here from the colliders' component data and node
transforms:
- Box, Sphere, Capsule and Plane are exact.
- Cylinder and Cone use their bounding box.
- Mesh, Terrain and Simplex use the backend's world AABB.
- Box against box sweeps step and bisect, to 1e-4 m.
- The collider list is gathered by a scene walk once per frame. After you
  create colliders, call `Physics.SyncTransforms()` before querying them in
  the same frame.

"Messages only" means `PhysicsMessages` drops the events between the pair,
but the bodies still collide.

As in Unity, shape casts skip colliders the shape overlaps at its start.
`Physics.emulateShapeCasts = true` forces the geometric casts on Bullet and
PhysX too. The two agree to 0.003 m in the test.

### Collision messages

`PhysicsMessages` (Add Component > Physics > Physics Messages) listens to the
node's colliders. It calls `OnCollisionEnter/Stay/Exit(collision)`,
`OnTriggerEnter/Stay/Exit(otherCollider)` and the 2D versions on every other
component of the node. Those components need no base class, and, as in Unity,
messages reach disabled components too. You rarely add it yourself:
- a `MonoBehaviour` adds it when it loads, if it defines a message;
- a scene scan adds it to any node that has a collider and a component
  defining a message. The scan runs at scene launch and then every
  `PhysicsMessages.autoAttachInterval` seconds (0.5, set 0 to stop);
  `PhysicsMessages.autoAttach = false` turns it off.
- Neither runs in the editor's scene view.

`Collision` has:
- `collider` (the other), `rigidbody`, `node` / `transform` / `gameObject`;
- `contacts`, `contactCount`, `GetContact(i)`, `relativeVelocity`;
- `impulse`, which is always zero (Cocos does not report it).

`ContactPoint.normal` points from the other collider into this one; a ball
landing on the ground gets (0, 1, 0). `relativeVelocity` is the other body's
velocity minus this one's, taken before the physics step when both nodes have
PhysicsMessages, so an impact reports the impact speed. When the other node
has none, its velocity is read after the step.

`Collision2D` uses Unity's naming: `collider` is the other collider,
`otherCollider` is this one. It also has `rigidbody` / `otherRigidbody`,
`contacts` (`point`, `normal`, `separation`, `normalImpulse`,
`tangentImpulse`) and `relativeVelocity`. Box2D has no stay event, so
`OnCollisionStay2D` and `OnTriggerStay2D` are sent once a frame for each
touching pair, without contacts. The component turns on the 2D body's
`enabledContactListener`, which Box2D needs for collider events.

### Debug draw

`Physics.debugDrawQueries = true` draws every ray, cast and overlap: rays in
green (hit) or red (miss), the cast shape at its start and at the hit, and
overlap shapes. They stay for `Physics.debugDrawDuration` seconds.
`Physics2D` has the same flags, plus `debugDrawZ`. Drawing needs the Geometry
Renderer module, like Debug.DrawLine.

## Physics2D

| Unity | Here | Box2D | builtin 2D |
| --- | --- | --- | --- |
| `Raycast(origin, dir, distance, mask, minDepth, maxDepth)`: RaycastHit2D or **null** | same; `if (hit)` works | native | geometric (Cocos' builtin has no ray cast) |
| `RaycastAll`, `Linecast(All)` | same | native | geometric |
| `CircleCast`, `BoxCast(origin, size, angle, dir, ...)`, `CapsuleCast` (+ `All`) | same | exact geometric (vertex-edge contacts), candidates from the backend's AABB query |
| `OverlapPoint/Circle/Box/Area/Capsule` (+ `All`), `OverlapCollider`, `ClosestPoint` | same | geometric over `testAABB` candidates (exact for box, circle and concave polygons) |
| `RaycastHit2D.point / normal / distance / fraction / centroid / collider / rigidbody` | same | |
| `queriesHitTriggers`, `queriesStartInColliders` | same (a ray starting inside a collider reports it at distance 0) | |
| `IgnoreLayerCollision` | the 2D matrix, refreshed on existing colliders | |
| `IgnoreCollision(c1, c2)` | Box2D: contact disabled in pre-solve; messages dropped everywhere | |
| `OnCollisionEnter2D` / `OnTriggerEnter2D`... | measured: yes on Box2D (contacts, normals, impulses); on builtin 2D the Enter/Stay/Exit messages arrive for overlaps, without contact points (no dynamics) | |

An infinite 2D distance becomes `Physics2D.infiniteDistance` (100,000 world
units), because Box2D needs an end point. Distances are in world units
(pixels in a usual 2D scene). The JavaScript "box2d" backend goes through the
same framework calls as Box2D wasm, but only the wasm one was run.

## C# (the csharp extension)

The runtime is plain exported TypeScript, so the csharp extension's TS interop
binds it as `Ext.UnityStyle`. Tested: a C# component compiled with the csharp
toolchain (a scratch build of the tool) to TypeScript, and that TypeScript
type-checks against cc.d.ts and these sources (the csharp tests do it with
`tests/interop/UnityUse.cs`; its coroutines also run against this extension's
scheduler, `core/coroutines.ts`, in node):

```csharp
using System.Collections;
using cc;
using static cc.Globals;
using Ext.UnityStyle;
using US = Ext.UnityStyle;

public class Shooter : MonoBehaviour
{
    [SerializeField] private double range = 50;          // csharp's own attribute
    [Header("Ammo")] [Range(1, 30)] public int clip = 10; // [Header] / [Space] are unity-style's
    void Update(double dt)                               // a Unity message: no warning
    {
        var hit = new RaycastHit();                      // the `out` parameter
        if (Physics.Raycast(position, forward, hit, range, LayerMask.GetMask("Enemy")))
            Debug.Log(hit.collider.node.name + " " + hit.distance);
        double r = US.Random.Range(0, 1);                // System.Random is also in scope
    }
    void Start() { StartCoroutine(Reload()); }
    IEnumerator Reload()                                 // a coroutine: a generator in TypeScript
    {
        yield return new WaitForSeconds(0.5);
        clip = 10;
    }
    void OnCollisionEnter(Collision c) { Debug.Log(c.contactCount); }
}
```

- **Attributes:** `[SerializeField]`, `[Tooltip]`, `[Range]`, `[Min]`,
  `[Multiline]`, `[HideInInspector]`, `[FormerlySerializedAs]`,
  `[NonSerialized]`, `[RequireComponent]`, `[ExecuteInEditMode]` are the
  csharp extension's own; it adds `@ccclass` / `@property` itself. This
  extension's decorators of the same names do the same thing (they wrap the
  same Cocos decorators), so the TS interop leaves them out of C# by itself:
  nothing is ambiguous and nothing needs excluding. `[Header]`, `[Space]`,
  `[TextArea]`, `[AddComponentMenu]`, `[DisallowMultipleComponent]`,
  `[ExecuteAlways]`, `[DefaultExecutionOrder]` and `[HelpURL]` (no csharp
  equivalent) come from here.
- `Random` is also `System.Random`: write `US.Random` with the alias above.
- **Unity messages** (`Awake`, `Start`, `Update`, `LateUpdate`, `FixedUpdate`,
  `OnEnable`, `OnDisable`, `OnDestroy`, the physics ones) work as in
  TypeScript. `MonoBehaviour` carries the `@unityMessages` JSDoc tag, which
  tells the transpiler not to warn CSX2010 ("Cocos calls 'update'...") on them.
- **Coroutines:** a C# `IEnumerator` method becomes a generator, so
  `StartCoroutine(Blink())`, `StartCoroutine("Blink", arg)`, `yield return null`,
  `yield return new WaitForSeconds(s)`, `yield return StartCoroutine(...)`,
  `yield return Child()` (nested) and `yield break` work as described in
  [Coroutines](#coroutines). As in TypeScript, `IEnumerator Start()` is not
  started by itself: start it from a `void Start()` (the transpiler warns
  CSX2012). `Invoke`, `InvokeRepeating` and `async` methods with
  `await Delay(seconds)` work too.

## Tests

```
npm run build          # tsc + the editor bundle
npm test               # pure logic: layers, 3D/2D geometry, Mathf, coroutines (15)
npm run test:engine    # the real 3.8.6 engine headless: 125 checks
LOOSE=1 BABEL_DIR=<node_modules with @babel/*> npm run test:engine
```

- `test:engine` bundles the engine TypeScript from the Creator install (the
  vehicle-physics harness, extended). It runs:
  - the 3D queries, messages and filters on builtin, cannon.js, Bullet and
    PhysX;
  - the 2D ones on Box2D wasm and builtin 2D;
  - the MonoBehaviour lifecycle, decorators (class attributes read back),
    Invoke, coroutines, timeScale, Instantiate / Destroy and the transform
    helpers.
  It prints the support matrix.
- With `LOOSE=1`, `assets/` and the test scripts are compiled by Babel the way
  web builds compile scripts: loose, IE 11 target, generators through the
  regenerator helper. Classes stay native there only because the test engine
  itself is ES2020. All 125 checks pass.
- The pure tests also pass with classes compiled to ES5.

## Limits

- Not run in the Cocos editor yet: the asset-db import, the Inspector
  (decorators, Tag, PhysicsMessages), preview, builds, and native platforms.
- `Physics.IgnoreCollision` uses Bullet's wasm module (`globalThis.Bullet`,
  absent with the asm.js fallback) and the shape's shared body.
- Overlap queries use component data. A collider whose shape a backend does not
  support (a capsule on cannon.js) is skipped.
- `Collision.impulse` is zero, `RaycastHit.triangleIndex` is -1.
- `GameObject.CreatePrimitive` uses a builtin-standard material (or
  `GameObject.defaultMaterial`).
