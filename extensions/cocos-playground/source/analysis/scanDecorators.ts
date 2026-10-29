import * as fs from 'fs';
import * as path from 'path';
import * as ts from 'typescript';
import { compressUuid, readMetaUuid } from './assets';
import { DecoratedClass, DecoratedField, PlayGroundConstraints, PlayGroundEnumOption, PlayGroundFieldKind } from './types';

/**
 * Static-analysis field extraction: we never load/execute project scripts (no live Cocos
 * Editor/scene is available to a build-hook process), so instead we parse the TypeScript source
 * directly to find which classes/properties are marked with `@playGroundField`, then separately
 * read the actual values out of the .scene/.prefab JSON files (see scanScenes.ts).
 */

const BUILTIN_KIND_BY_TYPE_NAME: Record<string, PlayGroundFieldKind> = {
    String: 'string',
    CCString: 'string',
    Number: 'number',
    CCFloat: 'number',
    CCInteger: 'number',
    Boolean: 'boolean',
    CCBoolean: 'boolean',
    Color: 'color',
    Vec2: 'vec2',
    Vec3: 'vec3',
    Vec4: 'vec4',
    Texture2D: 'texture2D',
    AudioClip: 'audioClip',
    TextAsset: 'textAsset',
    JsonAsset: 'jsonAsset',
    BufferAsset: 'bufferAsset',
};

function findTsFiles(dir: string): string[] {
    const results: string[] = [];
    if (!fs.existsSync(dir)) return results;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...findTsFiles(fullPath));
        } else if (entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
            results.push(fullPath);
        }
    }
    return results;
}

function getDecoratorCall(node: ts.HasDecorators, name: string): ts.CallExpression | undefined {
    for (const decorator of ts.getDecorators(node) ?? []) {
        const expr = decorator.expression;
        if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === name) {
            return expr;
        }
    }
    return undefined;
}

function hasBareOrCalledDecorator(node: ts.HasDecorators, name: string): boolean {
    for (const decorator of ts.getDecorators(node) ?? []) {
        const expr = decorator.expression;
        if (ts.isIdentifier(expr) && expr.text === name) return true;
        if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === name) return true;
    }
    return false;
}

function getStringLiteralArg(call: ts.CallExpression, index: number): string | undefined {
    const arg = call.arguments[index];
    return arg && ts.isStringLiteral(arg) ? arg.text : undefined;
}

function getObjectLiteralArg(call: ts.CallExpression, index: number): ts.ObjectLiteralExpression | undefined {
    const arg = call.arguments[index];
    return arg && ts.isObjectLiteralExpression(arg) ? arg : undefined;
}

function propertyName(name: ts.PropertyName): string | undefined {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    return undefined;
}

function findProperty(obj: ts.ObjectLiteralExpression, name: string): ts.PropertyAssignment | undefined {
    for (const prop of obj.properties) {
        if (ts.isPropertyAssignment(prop) && propertyName(prop.name) === name) {
            return prop;
        }
    }
    return undefined;
}

function getStringProp(obj: ts.ObjectLiteralExpression, name: string): string | undefined {
    const prop = findProperty(obj, name);
    return prop && ts.isStringLiteral(prop.initializer) ? prop.initializer.text : undefined;
}

/** Resolves the identifier text of a `type: X` / `type: Foo.Bar` / `type: Enum(X)` expression. */
function resolveTypeExpressionName(expr: ts.Expression): string | undefined {
    if (ts.isIdentifier(expr)) return expr.text;
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.name)) return expr.name.text;
    // Cocos's real enum-typed @property syntax wraps the enum in Enum(...) so the Inspector can
    // render a dropdown (a plain `type: SomeEnum` won't show one) — unwrap it to the enum name.
    if (ts.isCallExpression(expr) && ts.isIdentifier(expr.expression) && expr.expression.text === 'Enum') {
        const arg = expr.arguments[0];
        return arg ? resolveTypeExpressionName(arg) : undefined;
    }
    return undefined;
}

/** Resolves `type: X` to `{typeName: 'X', isList: false}`, or Cocos's array-property syntax
 *  `type: [X]` to `{typeName: 'X', isList: true}`. */
function getTypeInfoProp(obj: ts.ObjectLiteralExpression): { typeName?: string; isList: boolean } {
    const prop = findProperty(obj, 'type');
    if (!prop) return { isList: false };

    if (ts.isArrayLiteralExpression(prop.initializer)) {
        const element = prop.initializer.elements[0];
        return { typeName: element ? resolveTypeExpressionName(element) : undefined, isList: true };
    }

    return { typeName: resolveTypeExpressionName(prop.initializer), isList: false };
}

type ConstValue = number | string | boolean;

/**
 * Evaluates a compile-time constant the way TypeScript would for an enum initializer: literals,
 * unary/binary arithmetic and bit operations, parentheses, template-free string concatenation, and
 * references to already-known names (`resolve`) such as earlier members of the same enum.
 */
function evaluateConstant(expr: ts.Expression, resolve: (name: string, qualifier?: string) => ConstValue | undefined): ConstValue | undefined {
    if (ts.isNumericLiteral(expr)) return Number(expr.text);
    if (ts.isStringLiteral(expr) || ts.isNoSubstitutionTemplateLiteral(expr)) return expr.text;
    if (expr.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (expr.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (ts.isParenthesizedExpression(expr)) return evaluateConstant(expr.expression, resolve);
    if (ts.isIdentifier(expr)) return resolve(expr.text);
    if (ts.isPropertyAccessExpression(expr) && ts.isIdentifier(expr.expression)) return resolve(expr.name.text, expr.expression.text);
    if (ts.isPrefixUnaryExpression(expr)) {
        const operand = evaluateConstant(expr.operand, resolve);
        if (typeof operand !== 'number') return undefined;
        switch (expr.operator) {
            case ts.SyntaxKind.MinusToken:
                return -operand;
            case ts.SyntaxKind.PlusToken:
                return operand;
            case ts.SyntaxKind.TildeToken:
                return ~operand;
            default:
                return undefined;
        }
    }
    if (ts.isBinaryExpression(expr)) {
        const left = evaluateConstant(expr.left, resolve);
        const right = evaluateConstant(expr.right, resolve);
        if (left === undefined || right === undefined) return undefined;
        if (expr.operatorToken.kind === ts.SyntaxKind.PlusToken && (typeof left === 'string' || typeof right === 'string')) {
            return String(left) + String(right);
        }
        if (typeof left !== 'number' || typeof right !== 'number') return undefined;
        switch (expr.operatorToken.kind) {
            case ts.SyntaxKind.PlusToken:
                return left + right;
            case ts.SyntaxKind.MinusToken:
                return left - right;
            case ts.SyntaxKind.AsteriskToken:
                return left * right;
            case ts.SyntaxKind.SlashToken:
                return left / right;
            case ts.SyntaxKind.PercentToken:
                return left % right;
            case ts.SyntaxKind.AsteriskAsteriskToken:
                return left ** right;
            case ts.SyntaxKind.LessThanLessThanToken:
                return left << right;
            case ts.SyntaxKind.GreaterThanGreaterThanToken:
                return left >> right;
            case ts.SyntaxKind.GreaterThanGreaterThanGreaterThanToken:
                return left >>> right;
            case ts.SyntaxKind.AmpersandToken:
                return left & right;
            case ts.SyntaxKind.BarToken:
                return left | right;
            case ts.SyntaxKind.CaretToken:
                return left ^ right;
            default:
                return undefined;
        }
    }
    return undefined;
}

interface EnumInfo {
    options: PlayGroundEnumOption[];
}

/**
 * Every `enum` declared in the project, with TypeScript's own member values: auto-increment after a
 * numeric member, constant expressions (`-1`, `1 << 2`, `A | B`), references to earlier members, and
 * string members. Members whose value can't be worked out statically are skipped with a warning.
 */
function collectEnums(sourceFiles: ts.SourceFile[]): Map<string, EnumInfo> {
    const enums = new Map<string, EnumInfo>();

    for (const sourceFile of sourceFiles) {
        const visit = (node: ts.Node) => {
            if (ts.isEnumDeclaration(node)) {
                const enumName = node.name.text;
                const options: PlayGroundEnumOption[] = [];
                const known = new Map<string, ConstValue>();
                let next: number | undefined = 0;
                for (const member of node.members) {
                    const label = ts.isIdentifier(member.name) || ts.isStringLiteral(member.name) ? member.name.text : member.name.getText(sourceFile);
                    let value: ConstValue | undefined;
                    if (member.initializer) {
                        value = evaluateConstant(member.initializer, (name, qualifier) =>
                            qualifier === undefined || qualifier === enumName ? known.get(name) : undefined,
                        );
                    } else {
                        value = next;
                    }
                    if (typeof value !== 'number' && typeof value !== 'string') {
                        console.warn(`[cocos-playground] enum ${enumName}.${label}: value is not a compile-time constant, skipping it.`);
                        next = undefined;
                        continue;
                    }
                    known.set(label, value);
                    options.push({ label, value });
                    next = typeof value === 'number' ? value + 1 : undefined;
                }
                enums.set(enumName, { options });
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
    }

    return enums;
}

/**
 * Editing hints from the decorator's `property: {...}` (Cocos's own @property options): `range`
 * ([min, max, step?]), `min`, `max`, `step`, `slide`, `multiline`.
 */
function readConstraints(optionsObj: ts.ObjectLiteralExpression, typeName: string): PlayGroundConstraints | undefined {
    const constraints: PlayGroundConstraints = {};
    if (typeName === 'CCInteger') constraints.integer = true;

    const propertyProp = findProperty(optionsObj, 'property');
    const propertyObj = propertyProp && ts.isObjectLiteralExpression(propertyProp.initializer) ? propertyProp.initializer : undefined;
    if (propertyObj) {
        const number = (name: string) => {
            const prop = findProperty(propertyObj, name);
            const value = prop ? evaluateConstant(prop.initializer, () => undefined) : undefined;
            return typeof value === 'number' ? value : undefined;
        };
        const flag = (name: string) => {
            const prop = findProperty(propertyObj, name);
            return prop ? evaluateConstant(prop.initializer, () => undefined) === true : false;
        };

        const range = findProperty(propertyObj, 'range');
        if (range && ts.isArrayLiteralExpression(range.initializer)) {
            const [min, max, step] = range.initializer.elements.map((element) => evaluateConstant(element, () => undefined));
            if (typeof min === 'number') constraints.min = min;
            if (typeof max === 'number') constraints.max = max;
            if (typeof step === 'number') constraints.step = step;
        }
        const min = number('min');
        const max = number('max');
        const step = number('step');
        if (min !== undefined) constraints.min = min;
        if (max !== undefined) constraints.max = max;
        if (step !== undefined) constraints.step = step;
        if (flag('slide')) constraints.slide = true;
        if (flag('multiline')) constraints.multiline = true;
    }

    return Object.keys(constraints).length > 0 ? constraints : undefined;
}

export interface DecoratorScan {
    /** @ccclass name → the class, for classes with at least one `@playGroundField`. */
    classes: Map<string, DecoratedClass>;
    /**
     * Every `__type__` a project script can serialize as (decorated or not): a component of one of
     * these that isn't in `classes` simply has no playground fields.
     */
    projectTypeIds: Set<string>;
}

/**
 * Scans every .ts file under `assetsDir` for `@ccclass(...)` classes containing
 * `@playGroundField(...)`-decorated properties.
 */
export function scanDecorators(assetsDir: string): DecoratorScan {
    const files = findTsFiles(assetsDir);
    const sourceFiles = files.map((file) =>
        ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2020, true)
    );

    const enums = collectEnums(sourceFiles);
    const classes = new Map<string, DecoratedClass>();
    const projectTypeIds = new Set<string>();

    for (const sourceFile of sourceFiles) {
        const relativeFile = path.relative(assetsDir, sourceFile.fileName).split(path.sep).join('/');
        // Cocos gives the first component class of a script its compressed script uuid as class id
        // (`__type__` in scenes); any other class serializes under its @ccclass name.
        const scriptUuid = readMetaUuid(sourceFile.fileName);
        let scriptIdTaken = false;

        const visit = (node: ts.Node) => {
            if (ts.isClassDeclaration(node) && node.name) {
                const ccclassCall = getDecoratorCall(node, 'ccclass');
                if (ccclassCall || hasBareOrCalledDecorator(node, 'ccclass')) {
                    const className = (ccclassCall && getStringLiteralArg(ccclassCall, 0)) ?? node.name.text;
                    const typeIds = [className];
                    const extendsSomething = (node.heritageClauses ?? []).some((clause) => clause.token === ts.SyntaxKind.ExtendsKeyword);
                    if (scriptUuid && extendsSomething && !scriptIdTaken) {
                        scriptIdTaken = true;
                        typeIds.unshift(compressUuid(scriptUuid));
                    }
                    typeIds.forEach((typeId) => projectTypeIds.add(typeId));
                    const fields: DecoratedField[] = [];

                    for (const member of node.members) {
                        if (!ts.isPropertyDeclaration(member) || !ts.isIdentifier(member.name)) continue;

                        const fieldCall = getDecoratorCall(member, 'playGroundField');
                        if (!fieldCall) continue;

                        const propertyKey = member.name.text;
                        const optionsObj = getObjectLiteralArg(fieldCall, 0);
                        if (!optionsObj) {
                            console.warn(
                                `[cocos-playground] @playGroundField on ${className}.${propertyKey} is missing an options object, skipping.`
                            );
                            continue;
                        }

                        const { typeName, isList } = getTypeInfoProp(optionsObj);
                        const label = getStringProp(optionsObj, 'label') ?? propertyKey;
                        const group = getStringProp(optionsObj, 'group');

                        if (!typeName) {
                            console.warn(
                                `[cocos-playground] @playGroundField on ${className}.${propertyKey} has no resolvable "type", skipping.`
                            );
                            continue;
                        }

                        const constraints = readConstraints(optionsObj, typeName);
                        const builtinKind = BUILTIN_KIND_BY_TYPE_NAME[typeName];
                        if (builtinKind) {
                            fields.push({ className, propertyKey, kind: builtinKind, label, group, isList, constraints });
                            continue;
                        }

                        const enumInfo = enums.get(typeName);
                        if (enumInfo) {
                            fields.push({
                                className,
                                propertyKey,
                                kind: 'enum',
                                label,
                                group,
                                enumOptions: enumInfo.options,
                                isList,
                                constraints,
                            });
                            continue;
                        }

                        console.warn(
                            `[cocos-playground] @playGroundField on ${className}.${propertyKey} references unknown type "${typeName}", skipping.`
                        );
                    }

                    if (fields.length > 0) {
                        if (classes.has(className)) {
                            console.warn(`[cocos-playground] two @ccclass classes are named "${className}"; only the first one's fields are used.`);
                        } else {
                            classes.set(className, { className, file: relativeFile, typeIds, fields });
                        }
                    }
                }
            }
            ts.forEachChild(node, visit);
        };
        visit(sourceFile);
        // Whatever the parse made of it, the script's own uuid is one of the project's type ids.
        if (scriptUuid) projectTypeIds.add(compressUuid(scriptUuid));
    }

    return { classes, projectTypeIds };
}

/** `__type__` (compressed script uuid or @ccclass name) → the decorated class it serializes. */
export function buildTypeIndex(classes: Map<string, DecoratedClass>): Map<string, DecoratedClass> {
    const index = new Map<string, DecoratedClass>();
    for (const decoratedClass of classes.values()) {
        for (const typeId of decoratedClass.typeIds) {
            if (!index.has(typeId)) index.set(typeId, decoratedClass);
        }
    }
    return index;
}

/**
 * Flattens the per-class map into `propertyKey -> candidate fields`: the fallback for serialized
 * objects whose `__type__` matched no known class id (a script without a .meta, say), which are then
 * matched by which decorated property keys they carry.
 */
export function buildPropertyKeyIndex(classes: Map<string, DecoratedClass>): Map<string, DecoratedField[]> {
    const index = new Map<string, DecoratedField[]>();
    for (const decoratedClass of classes.values()) {
        for (const field of decoratedClass.fields) {
            const candidates = index.get(field.propertyKey) ?? [];
            candidates.push(field);
            index.set(field.propertyKey, candidates);
        }
    }
    return index;
}
