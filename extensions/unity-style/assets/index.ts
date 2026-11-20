/**
 * unity-style: a Unity-flavoured API over Cocos Creator 3.8.
 *
 *   import { MonoBehaviour, Serializable, SerializeField, Physics, RaycastHit, Time } from 'db://unity-style/index';
 *
 * Modules (each can also be imported alone, e.g. 'db://unity-style/physics/physics'):
 *   engine/   MonoBehaviour, decorators, Time, Debug, Mathf, Vector3/Vector2/Quaternion,
 *             Random, GameObject / Object statics, Tag, Resources, SceneManager,
 *             PlayerPrefs, Application, coroutines
 *   physics/  Physics, Physics2D, RaycastHit(2D), LayerMask, Collision(2D), PhysicsMessages
 */
export { Mathf } from './core/mathf';
export type { Ref } from './core/mathf';
export {
    Coroutine, CustomYieldInstruction, WaitForEndOfFrame, WaitForFixedUpdate, WaitForSeconds, WaitForSecondsRealtime, WaitUntil, WaitWhile, YieldInstruction,
} from './core/coroutines';
export type { IteratorLike } from './core/coroutines';

export { Time } from './engine/time';
export { Debug } from './engine/debug';
export { DebugDraw } from './engine/debug-draw';
export { Vector2, Vector3, Quaternion } from './engine/vectors';
export { Random } from './engine/random';
export { Tag } from './engine/Tag';
export {
    Destroy, DestroyImmediate, DontDestroyOnLoad, FindAnyObjectByType, FindFirstObjectByType, FindObjectOfType, FindObjectsByType, FindObjectsOfType, GameObject,
    Instantiate, PrimitiveType, UnityObject,
} from './engine/objects';
export { Application, PlayerPrefs, Resources, SceneManager, UnityEvent } from './engine/resources';
export {
    AddComponentMenu, DefaultExecutionOrder, DisallowMultipleComponent, ExecuteAlways, ExecuteInEditMode, FormerlySerializedAs, Header, HelpURL, HideInInspector, Min,
    Multiline, NonSerialized, Range, RequireComponent, Serializable, SerializeField, Space, TextArea, Tooltip,
} from './engine/decorators';
export { MonoBehaviour } from './engine/MonoBehaviour';

export { QueryTriggerInteraction, RaycastHit, RaycastHit2D } from './physics/physics-types';
export { LayerMask } from './physics/layer-mask';
export { Physics } from './physics/physics';
export { CapsuleDirection2D, Physics2D } from './physics/physics-2d';
export { Collision, Collision2D, ContactPoint, ContactPoint2D } from './physics/collision';
export { PhysicsMessages } from './physics/PhysicsMessages';

import { installAutoAttach } from './physics/PhysicsMessages';
import { ensureLoop } from './engine/time';

ensureLoop();
installAutoAttach();
