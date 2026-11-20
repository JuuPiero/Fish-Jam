// Hand-written part of the Cocos bindings: Cocos decorators as C# attributes, and the
// markers the generated bindings and the transpiler use. Declarations only.
#pragma warning disable
using System;

namespace cc
{
    /// <summary>The TypeScript name of a member whose C# name had to change.</summary>
    [AttributeUsage(AttributeTargets.All, AllowMultiple = false)]
    public sealed class TsName : Attribute { public TsName(string name) { } }

    /// <summary>
    /// A TypeScript string enum, bound as a static class of string constants. On a parameter or
    /// property (TS interop): typed with such an enum in TypeScript, so a plain string passed to it is cast.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class | AttributeTargets.Parameter | AttributeTargets.Property)]
    public sealed class TsStringEnum : Attribute { }

    /// <summary>A copy of an enum exposed as a static member (`Node.EventType`).</summary>
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class TsEnumAlias : Attribute { }

    /// <summary>A `const enum`: its values are inlined, it does not exist at runtime.</summary>
    [AttributeUsage(AttributeTargets.Enum)]
    public sealed class TsConstEnum : Attribute { }

    /// <summary>A type made up for an object literal type: use `any` in TypeScript.</summary>
    [AttributeUsage(AttributeTargets.Class)]
    public sealed class TsAny : Attribute { }

    /// <summary>
    /// Generic overload without the constructor argument of the TypeScript method:
    /// `getComponent&lt;Sprite&gt;()` is emitted as `getComponent(Sprite)`.
    /// </summary>
    [AttributeUsage(AttributeTargets.Method, AllowMultiple = false)]
    public sealed class TsCtorArg : Attribute { public TsCtorArg(int parameterIndex, int typeArgumentIndex) { } }

    /// <summary>Marker for the hidden constructor every bound class has.</summary>
    public struct TsInit { }

    /// <summary>
    /// A declaration bound from a project or extension TypeScript module (temp/csharp/TsBindings.g.cs):
    /// the transpiler imports it from <paramref name="module"/> ("db://assets/Scripts/Foo" becomes a
    /// relative path, "db://input-system/index" stays as is), under <see cref="Export"/> when the
    /// exported name differs ("default" for a default export).
    /// </summary>
    [AttributeUsage(AttributeTargets.All, AllowMultiple = false)]
    public sealed class TsModule : Attribute
    {
        public TsModule(string module) { }
        public string Export;
    }

    /// <summary>A TypeScript class decorated with @ccclass('name'): serializable, usable as a field type.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class TsCcclass : Attribute { public TsCcclass(string name) { } }

    /// <summary>
    /// A TypeScript class (TS interop) whose JSDoc has the `@unityMessages` tag: it calls Unity-named
    /// methods of its subclasses itself (Awake, Start, Update...), so the transpiler doesn't warn
    /// (CSX2010) that Cocos only calls the camelCase ones.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class TsUnityMessages : Attribute { }

    /// <summary>
    /// On a TS interop attribute class: a TypeScript decorator. Constructor parameters are the
    /// factory's positional parameters; properties ([TsName]) are the members of its options object.
    /// </summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class TsDecorator : Attribute
    {
        /// <summary>Used without a call: @readOnly.</summary>
        public bool Bare;
        /// <summary>Calls cc property() itself: no automatic @property on the member.</summary>
        public bool DeclaresProperty;
        /// <summary>Position of the options object among the factory's parameters (-1: none).</summary>
        public int OptionsIndex = -1;
        /// <summary>The options object is required (emit {} when no option is set).</summary>
        public bool OptionsRequired;
        /// <summary>A required options member filled from the member's type when not set ("type").</summary>
        public string TypeOption;
        /// <summary>The options member receiving the member's other @property options ("property").</summary>
        public string PropertyOptions;
    }

    // ------------------------------------------------------------------ class decorators (cc._decorator)

    /// <summary>@ccclass('Name'). Added automatically to Component classes that don't have it.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
    public sealed class ccclass : Attribute { public ccclass() { } public ccclass(string name) { } }

    /// <summary>@executeInEditMode</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class executeInEditMode : Attribute { public executeInEditMode() { } public executeInEditMode(bool yes) { } }

    /// <summary>@requireComponent(Type) — several are allowed.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
    public sealed class requireComponent : Attribute { public requireComponent(Type type) { } public requireComponent(params Type[] types) { } }

    /// <summary>@menu('Path/Name') in the Add Component menu.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class menu : Attribute { public menu(string path) { } }

    /// <summary>@executionOrder(n)</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class executionOrder : Attribute { public executionOrder(int order) { } }

    /// <summary>@disallowMultiple</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class disallowMultiple : Attribute { public disallowMultiple() { } public disallowMultiple(bool yes) { } }

    /// <summary>@playOnFocus</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class playOnFocus : Attribute { public playOnFocus() { } public playOnFocus(bool yes) { } }

    /// <summary>@help('url')</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class help : Attribute { public help(string url) { } }

    /// <summary>@icon('url')</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class icon : Attribute { public icon(string url) { } }

    /// <summary>@inspector('url')</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class inspector : Attribute { public inspector(string url) { } }

    // ------------------------------------------------------------------ property decorator

    /// <summary>
    /// @property: shows the field in the Inspector and serializes it. The type is taken from the
    /// field (Node, Prefab, int -> CCInteger, Node[] -> [Node]...), so <c>[property]</c> is usually
    /// enough. Named arguments match the Cocos options.
    /// </summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class property : Attribute
    {
        public property() { }
        public property(Type type) { }
        public Type type;
        public string tooltip;
        public string displayName;
        public int displayOrder;
        public double min;
        public double max;
        public double step;
        public double[] range;
        public bool slide;
        public bool visible;
        public bool serializable;
        public bool multiline;
        public bool @readonly;
        public bool editorOnly;
        public bool @override;
        public bool radian;
        public bool animatable;
        public string group;
        public string unit;
        public string formerlySerializedAs;
    }

    /// <summary>@type(T): the same as [property(typeof(T))].</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class type : Attribute { public type(Type type) { } }

    /// <summary>@serializable: serialized but not shown.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class serializable : Attribute { }

    /// <summary>@visible(false) and similar flags.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class visible : Attribute { public visible(bool yes) { } }

    /// <summary>@tooltip('text')</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class tooltip : Attribute { public tooltip(string text) { } }

    /// <summary>@displayName('text')</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class displayName : Attribute { public displayName(string text) { } }

    /// <summary>@range([min, max, step])</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class range : Attribute { public range(double min, double max, double step = 1) { } }

    // ------------------------------------------------------------------ attribute conventions
    // C#-style names for the Cocos decorators. Components and [Serializable] classes get
    // @ccclass('ClassName') automatically, and fields are serialized by the Unity rule:
    // public fields of serializable types, or private ones with [SerializeField];
    // [NonSerialized] (System) opts out. The lowercase attributes above still work.

    /// <summary>Overrides the automatic @ccclass name (the class name).</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false, Inherited = false)]
    public sealed class ClassNameAttribute : Attribute { public ClassNameAttribute(string name) { } }

    /// <summary>@menu('Path/Name') in the Add Component menu.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class MenuAttribute : Attribute { public MenuAttribute(string path) { } }

    /// <summary>@executeInEditMode: lifecycle methods also run in the editor.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class ExecuteInEditModeAttribute : Attribute { public ExecuteInEditModeAttribute() { } public ExecuteInEditModeAttribute(bool yes) { } }

    /// <summary>@requireComponent(Type): adding this component adds those too.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = true)]
    public sealed class RequireComponentAttribute : Attribute { public RequireComponentAttribute(Type type) { } public RequireComponentAttribute(params Type[] types) { } }

    /// <summary>@executionOrder(n): lower runs first.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class ExecutionOrderAttribute : Attribute { public ExecutionOrderAttribute(int order) { } }

    /// <summary>@disallowMultiple: one per node.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class DisallowMultipleAttribute : Attribute { public DisallowMultipleAttribute() { } public DisallowMultipleAttribute(bool yes) { } }

    /// <summary>@playOnFocus: with ExecuteInEditMode, updates continuously while selected.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class PlayOnFocusAttribute : Attribute { public PlayOnFocusAttribute() { } public PlayOnFocusAttribute(bool yes) { } }

    /// <summary>@help('url'): the help button of the component.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class HelpAttribute : Attribute { public HelpAttribute(string url) { } }

    /// <summary>@icon('url')</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class IconAttribute : Attribute { public IconAttribute(string url) { } }

    /// <summary>@inspector('url'): a custom inspector.</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class InspectorAttribute : Attribute { public InspectorAttribute(string url) { } }

    /// <summary>@uniquelyReferenced</summary>
    [AttributeUsage(AttributeTargets.Class, AllowMultiple = false)]
    public sealed class UniquelyReferencedAttribute : Attribute { }

    /// <summary>Serializes a private or protected field (shown in the Inspector).</summary>
    [AttributeUsage(AttributeTargets.Field, AllowMultiple = false)]
    public sealed class SerializeFieldAttribute : Attribute { }

    /// <summary>Serialized, but not shown in the Inspector (visible: false).</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class HideInInspectorAttribute : Attribute { }

    /// <summary>
    /// The explicit @property, for property accessors and advanced options. Named arguments are
    /// the Cocos options: [Property(Type = typeof(Node), Tooltip = "...", Serializable = false)].
    /// </summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class PropertyAttribute : Attribute
    {
        public PropertyAttribute() { }
        public PropertyAttribute(Type type) { }
        public Type Type;
        public string Tooltip;
        public string DisplayName;
        public int DisplayOrder;
        public string Group;
        public double Min;
        public double Max;
        public double Step;
        public double[] Range;
        public bool Slide;
        public bool Visible;
        public bool Serializable;
        public bool Multiline;
        public bool ReadOnly;
        public bool EditorOnly;
        public bool Override;
        public bool Radian;
        public bool Animatable;
        public string Unit;
        public string FormerlySerializedAs;
    }

    /// <summary>tooltip</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class TooltipAttribute : Attribute { public TooltipAttribute(string text) { } }

    /// <summary>range: [min, max] or [min, max, step]</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class RangeAttribute : Attribute { public RangeAttribute(double min, double max) { } public RangeAttribute(double min, double max, double step) { } }

    /// <summary>min</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class MinAttribute : Attribute { public MinAttribute(double min) { } }

    /// <summary>max</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class MaxAttribute : Attribute { public MaxAttribute(double max) { } }

    /// <summary>step</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class StepAttribute : Attribute { public StepAttribute(double step) { } }

    /// <summary>slide: a slider for a ranged number.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class SlideAttribute : Attribute { }

    /// <summary>displayName</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class DisplayNameAttribute : Attribute { public DisplayNameAttribute(string name) { } }

    /// <summary>displayOrder</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class DisplayOrderAttribute : Attribute { public DisplayOrderAttribute(int order) { } }

    /// <summary>multiline: a text area for strings.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class MultilineAttribute : Attribute { }

    /// <summary>group: Cocos property groups (tabs) in the Inspector.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class GroupAttribute : Attribute { public GroupAttribute(string name) { } }

    /// <summary>readonly: shown but not editable.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class ReadOnlyAttribute : Attribute { }

    /// <summary>type: overrides the type taken from the field.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class TypeAttribute : Attribute { public TypeAttribute(Type type) { } }

    /// <summary>formerlySerializedAs: keeps data saved under an old field name.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class FormerlySerializedAsAttribute : Attribute { public FormerlySerializedAsAttribute(string oldName) { } }

    /// <summary>editorOnly: not saved in builds.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class EditorOnlyAttribute : Attribute { }

    /// <summary>unit: a unit label (m, °, %...).</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class UnitAttribute : Attribute { public UnitAttribute(string unit) { } }

    /// <summary>radian: stored in radians, shown in degrees.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class RadianAttribute : Attribute { }

    /// <summary>animatable: whether the animation editor can key it.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class AnimatableAttribute : Attribute { public AnimatableAttribute(bool yes) { } }

    /// <summary>visible: shows an underscore field or hides any field.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class VisibleAttribute : Attribute { public VisibleAttribute(bool yes) { } }

    /// <summary>override: redeclares a property of a base class.</summary>
    [AttributeUsage(AttributeTargets.Field | AttributeTargets.Property, AllowMultiple = false)]
    public sealed class OverridePropertyAttribute : Attribute { }

    // ------------------------------------------------------------------ operators (C# only)
    // Lowered by the transpiler to Cocos' static methods, each into a new value:
    // a + b -> Vec3.add(new Vec3(), a, b), v * s -> Vec3.multiplyScalar(new Vec3(), v, s),
    // -v -> Vec3.negate(new Vec3(), v), q1 * q2 -> Quat.multiply(new Quat(), q1, q2).
    // == stays reference equality (as in TypeScript): use a.equals(b) to compare values.

    public partial class Vec2
    {
        public static Vec2 operator +(Vec2 a, Vec2 b) => throw null;
        public static Vec2 operator -(Vec2 a, Vec2 b) => throw null;
        public static Vec2 operator -(Vec2 a) => throw null;
        public static Vec2 operator *(Vec2 a, double s) => throw null;
        public static Vec2 operator *(double s, Vec2 a) => throw null;
        public static Vec2 operator /(Vec2 a, double s) => throw null;
    }

    public partial class Vec3
    {
        public static Vec3 operator +(Vec3 a, Vec3 b) => throw null;
        public static Vec3 operator -(Vec3 a, Vec3 b) => throw null;
        public static Vec3 operator -(Vec3 a) => throw null;
        public static Vec3 operator *(Vec3 a, double s) => throw null;
        public static Vec3 operator *(double s, Vec3 a) => throw null;
        public static Vec3 operator /(Vec3 a, double s) => throw null;
    }

    public partial class Vec4
    {
        public static Vec4 operator +(Vec4 a, Vec4 b) => throw null;
        public static Vec4 operator -(Vec4 a, Vec4 b) => throw null;
        public static Vec4 operator -(Vec4 a) => throw null;
        public static Vec4 operator *(Vec4 a, double s) => throw null;
        public static Vec4 operator *(double s, Vec4 a) => throw null;
        public static Vec4 operator /(Vec4 a, double s) => throw null;
    }

    public partial class Quat
    {
        public static Quat operator *(Quat a, Quat b) => throw null;
    }
}
