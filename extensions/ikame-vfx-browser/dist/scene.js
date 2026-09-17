'use strict';
Object.defineProperty(exports, "__esModule", { value: true });
exports.methods = void 0;
exports.load = load;
exports.unload = unload;
const path_1 = require("path");
module.paths.push((0, path_1.join)(Editor.App.path, 'node_modules'));
function load() {
    console.log('[IKame VFX Browser] Scene script loaded');
}
function unload() {
    console.log('[IKame VFX Browser] Scene script unloaded');
}
exports.methods = {
    buildVFXHierarchy(descriptors, prefabDir) {
        const cc = require('cc');
        const { director, Node, Vec3, Quat, ParticleSystem } = cc;
        const scene = director.getScene();
        if (!scene) {
            return { nodesCreated: 0, warnings: ['No active scene'], rootUuid: null, psNodes: [] };
        }
        let nodesCreated = 0;
        const warnings = [];
        const psNodes = [];
        function buildNode(desc, parent) {
            var _a, _b, _c;
            const node = new Node(desc.name);
            parent.addChild(node);
            if (desc.transform) {
                const pos = desc.transform.localPosition;
                if (Array.isArray(pos) && pos.length >= 3) {
                    node.setPosition(new Vec3(pos[0], pos[1], -pos[2]));
                }
                const rot = desc.transform.localRotation;
                if (Array.isArray(rot) && rot.length >= 4) {
                    node.setRotation(new Quat(-rot[0], -rot[1], rot[2], rot[3]));
                }
                const scl = desc.transform.localScale;
                if (Array.isArray(scl) && scl.length >= 3) {
                    node.setScale(new Vec3(scl[0], scl[1], scl[2]));
                }
            }
            if (desc.hasParticleSystem) {
                try {
                    const ps = node.addComponent(ParticleSystem);
                    if (ps) {
                        applyModules(ps, desc.modules, desc, warnings, cc);
                        nodesCreated++;
                        psNodes.push({
                            nodeUuid: node.uuid || node._id,
                            materialUuid: desc.materialUuid || '',
                            rendererModule: ((_a = desc.modules) === null || _a === void 0 ? void 0 : _a.rendererModule) || null,
                            startSizeX: ((_c = (_b = desc.modules) === null || _b === void 0 ? void 0 : _b.mainModule) === null || _c === void 0 ? void 0 : _c.startSize) || null,
                        });
                    }
                    else {
                        warnings.push(`addComponent(ParticleSystem) returned null on "${desc.name}"`);
                    }
                }
                catch (err) {
                    warnings.push(`Failed to create ParticleSystem on "${desc.name}": ${err.message}`);
                }
            }
            if (desc.children && Array.isArray(desc.children)) {
                for (const childDesc of desc.children) {
                    buildNode(childDesc, node);
                }
            }
            return node;
        }
        const rootNode = buildNode(descriptors, scene);
        return { nodesCreated, warnings, rootUuid: rootNode._id || rootNode.uuid, psNodes };
    },
};
/**
 * Safe module getter — Cocos PS3D property names may vary.
 * Returns the module or null if not found.
 */
function getModule(ps, ...names) {
    for (const name of names) {
        if (ps[name] != null)
            return ps[name];
    }
    return null;
}
function applyModules(ps, modules, desc, warnings, cc) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _0, _1, _2, _3, _4, _5, _6, _7, _8, _9, _10, _11, _12;
    // Main module — properties are directly on ps
    if (modules.mainModule) {
        const m = modules.mainModule;
        try {
            ps.duration = (_a = m.duration) !== null && _a !== void 0 ? _a : 5;
            ps.loop = (_b = m.loop) !== null && _b !== void 0 ? _b : true;
            ps.playOnAwake = (_c = m.playOnAwake) !== null && _c !== void 0 ? _c : true;
            ps.capacity = (_d = m.capacity) !== null && _d !== void 0 ? _d : 1000;
            if (m.simulationSpace != null)
                ps.simulationSpace = m.simulationSpace;
            if (m.scaleSpace != null)
                ps.scaleSpace = m.scaleSpace;
            applyCurve(ps, 'startLifetime', m.startLifetime, cc);
            applyCurve(ps, 'startSpeed', m.startSpeed, cc);
            applyCurve(ps, 'startSizeX', m.startSize, cc);
            if (m.startSizeY)
                applyCurve(ps, 'startSizeY', m.startSizeY, cc);
            if (m.startSizeZ)
                applyCurve(ps, 'startSizeZ', m.startSizeZ, cc);
            applyCurve(ps, 'startRotationZ', m.startRotationZ, cc);
            if (m.startRotationX)
                applyCurve(ps, 'startRotationX', m.startRotationX, cc);
            if (m.startRotationY)
                applyCurve(ps, 'startRotationY', m.startRotationY, cc);
            applyCurve(ps, 'startDelay', m.startDelay, cc);
            applyCurve(ps, 'gravityModifier', m.gravityModifier, cc);
            if (m.startColor) {
                applyGradient(ps, 'startColor', m.startColor, cc);
            }
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": mainModule error: ${err.message}`);
        }
    }
    // Emission — no sub-module in Cocos, properties are directly on PS
    if (modules.emissionModule) {
        try {
            const em = modules.emissionModule;
            applyCurve(ps, 'rateOverTime', em.rateOverTime, cc);
            applyCurve(ps, 'rateOverDistance', em.rateOverDistance, cc);
            if (em.bursts && em.bursts.length > 0) {
                const Burst = cc.Burst || ((_e = cc.ParticleSystem) === null || _e === void 0 ? void 0 : _e.Burst);
                if (Burst) {
                    ps.bursts = em.bursts.map((b) => {
                        var _a, _b, _c;
                        const burst = new Burst();
                        burst.time = (_a = b.time) !== null && _a !== void 0 ? _a : 0;
                        burst.repeatCount = (_b = b.repeatCount) !== null && _b !== void 0 ? _b : 0;
                        burst.repeatInterval = (_c = b.repeatInterval) !== null && _c !== void 0 ? _c : 0.01;
                        applyCurve(burst, 'count', b.count, cc);
                        return burst;
                    });
                }
                else {
                    warnings.push(`Node "${desc.name}": cc.Burst class not found — bursts skipped`);
                }
            }
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": emission error: ${err.message}`);
        }
    }
    else {
        applyCurve(ps, 'rateOverTime', { mode: 0, constant: 0 }, cc);
        applyCurve(ps, 'rateOverDistance', { mode: 0, constant: 0 }, cc);
        ps.bursts = [];
    }
    // Shape
    const shape = getModule(ps, 'shapeModule', '_shapeModule');
    if (modules.shapeModule && shape) {
        try {
            const sh = modules.shapeModule;
            shape.enable = true;
            shape.shapeType = (_f = sh.shapeType) !== null && _f !== void 0 ? _f : 2;
            shape.radius = (_g = sh.radius) !== null && _g !== void 0 ? _g : 1;
            shape.radiusThickness = (_h = sh.radiusThickness) !== null && _h !== void 0 ? _h : 1;
            shape.angle = (_j = sh.angle) !== null && _j !== void 0 ? _j : 25;
            shape.arc = (_k = sh.arc) !== null && _k !== void 0 ? _k : 360;
            shape.arcMode = (_l = sh.arcMode) !== null && _l !== void 0 ? _l : 0;
            shape.length = (_m = sh.length) !== null && _m !== void 0 ? _m : 5;
            // emitFrom only for Cone (2), other shapes use radiusThickness for shell/volume
            if (sh.shapeType === 2) {
                shape.emitFrom = (_o = sh.emitFrom) !== null && _o !== void 0 ? _o : 0;
            }
            shape.alignToDirection = (_p = sh.alignToDirection) !== null && _p !== void 0 ? _p : false;
            if (sh.position) {
                shape.position = new cc.Vec3((_q = sh.position.x) !== null && _q !== void 0 ? _q : 0, (_r = sh.position.y) !== null && _r !== void 0 ? _r : 0, -((_s = sh.position.z) !== null && _s !== void 0 ? _s : 0));
            }
            if (sh.rotation) {
                shape.rotation = new cc.Vec3((_t = sh.rotation.x) !== null && _t !== void 0 ? _t : 0, (_u = sh.rotation.y) !== null && _u !== void 0 ? _u : 0, (_v = sh.rotation.z) !== null && _v !== void 0 ? _v : 0);
            }
            if (sh.scale) {
                shape.scale = new cc.Vec3((_w = sh.scale.x) !== null && _w !== void 0 ? _w : 1, (_x = sh.scale.y) !== null && _x !== void 0 ? _x : 1, (_y = sh.scale.z) !== null && _y !== void 0 ? _y : 1);
            }
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": shapeModule error: ${err.message}`);
        }
    }
    // Velocity over Lifetime
    const velOT = getModule(ps, 'velocityOvertimeModule', '_velocityOvertimeModule');
    if (modules.velocityOverLifetimeModule && velOT) {
        try {
            const v = modules.velocityOverLifetimeModule;
            velOT.enable = true;
            if (v.space != null)
                velOT.space = v.space;
            applyCurve(velOT, 'x', v.x, cc);
            applyCurve(velOT, 'y', v.y, cc);
            applyCurve(velOT, 'z', v.z, cc);
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": velocityOverLifetime error: ${err.message}`);
        }
    }
    // Force over Lifetime
    const forceOT = getModule(ps, 'forceOvertimeModule', '_forceOvertimeModule');
    if (modules.forceOverLifetimeModule && forceOT) {
        try {
            const f = modules.forceOverLifetimeModule;
            forceOT.enable = true;
            if (f.space != null)
                forceOT.space = f.space;
            applyCurve(forceOT, 'x', f.x, cc);
            applyCurve(forceOT, 'y', f.y, cc);
            applyCurve(forceOT, 'z', f.z, cc);
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": forceOverLifetime error: ${err.message}`);
        }
    }
    // Color over Lifetime — Cocos uses 'colorOverLifetimeModule' (not 'Overtime')
    const colorOT = getModule(ps, 'colorOverLifetimeModule', 'colorOvertimeModule', '_colorOverLifetimeModule');
    if (modules.colorOverLifetimeModule && colorOT) {
        try {
            colorOT.enable = true;
            applyGradient(colorOT, 'color', modules.colorOverLifetimeModule.color, cc);
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": colorOverLifetime error: ${err.message}`);
        }
    }
    // Size over Lifetime
    const sizeOT = getModule(ps, 'sizeOvertimeModule', '_sizeOvertimeModule');
    if (modules.sizeOverLifetimeModule && sizeOT) {
        try {
            const s = modules.sizeOverLifetimeModule;
            sizeOT.enable = true;
            sizeOT.separateAxes = (_z = s.separateAxes) !== null && _z !== void 0 ? _z : false;
            applyCurve(sizeOT, 'size', s.size, cc);
            if (s.separateAxes) {
                applyCurve(sizeOT, 'x', s.x, cc);
                applyCurve(sizeOT, 'y', s.y, cc);
                applyCurve(sizeOT, 'z', s.z, cc);
            }
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": sizeOverLifetime error: ${err.message}`);
        }
    }
    // Rotation over Lifetime
    const rotOT = getModule(ps, 'rotationOvertimeModule', '_rotationOvertimeModule');
    if (modules.rotationOverLifetimeModule && rotOT) {
        try {
            const r = modules.rotationOverLifetimeModule;
            rotOT.enable = true;
            rotOT.separateAxes = (_0 = r.separateAxes) !== null && _0 !== void 0 ? _0 : false;
            applyCurve(rotOT, 'z', r.z, cc);
            if (r.separateAxes) {
                applyCurve(rotOT, 'x', r.x, cc);
                applyCurve(rotOT, 'y', r.y, cc);
            }
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": rotationOverLifetime error: ${err.message}`);
        }
    }
    // Limit Velocity
    const limitVel = getModule(ps, 'limitVelocityOvertimeModule', '_limitVelocityOvertimeModule');
    if (modules.limitVelocityOverLifetimeModule && limitVel) {
        try {
            const lv = modules.limitVelocityOverLifetimeModule;
            limitVel.enable = true;
            limitVel.dampen = ((_1 = lv.dampen) !== null && _1 !== void 0 ? _1 : 0) * 0.5;
            limitVel.separateAxes = (_2 = lv.separateAxes) !== null && _2 !== void 0 ? _2 : false;
            applyCurve(limitVel, 'limit', lv.speed, cc);
            if (lv.separateAxes) {
                applyCurve(limitVel, 'limitX', lv.speedX, cc);
                applyCurve(limitVel, 'limitY', lv.speedY, cc);
                applyCurve(limitVel, 'limitZ', lv.speedZ, cc);
            }
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": limitVelocity error: ${err.message}`);
        }
    }
    // Texture Sheet Animation — mapper already converts sprites→grid
    const texAnim = getModule(ps, 'textureAnimationModule', '_textureAnimationModule');
    if (modules.textureSheetAnimationModule && texAnim) {
        try {
            const tsa = modules.textureSheetAnimationModule;
            texAnim.enable = true;
            texAnim.numTilesX = (_3 = tsa.numTilesX) !== null && _3 !== void 0 ? _3 : 1;
            texAnim.numTilesY = (_4 = tsa.numTilesY) !== null && _4 !== void 0 ? _4 : 1;
            texAnim.cycleCount = (_5 = tsa.cycleCount) !== null && _5 !== void 0 ? _5 : 1;
            applyCurve(texAnim, 'frameOverTime', tsa.frameOverTime, cc);
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": textureSheetAnimation error: ${err.message}`);
        }
    }
    // Trails
    const trail = getModule(ps, 'trailModule', '_trailModule');
    if (modules.trailModule && trail) {
        try {
            const tr = modules.trailModule;
            trail.enable = true;
            trail.minParticleDistance = (_6 = tr.minVertexDistance) !== null && _6 !== void 0 ? _6 : 0.2;
            trail.space = tr.worldSpace ? 1 : 0;
            applyCurve(trail, 'widthRatio', tr.widthRatio, cc);
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": trailModule error: ${err.message}`);
        }
    }
    // Renderer
    if (modules.rendererModule) {
        try {
            const rn = modules.rendererModule;
            const ren = ps.renderer || ps._renderer;
            if (ren) {
                ren.renderMode = (_7 = rn.renderMode) !== null && _7 !== void 0 ? _7 : 0;
                if (rn.renderMode === 1) {
                    ren.velocityScale = (_8 = rn.velocityScale) !== null && _8 !== void 0 ? _8 : 0;
                    ren.lengthScale = (_9 = rn.lengthScale) !== null && _9 !== void 0 ? _9 : 2;
                }
                if (rn.renderMode === 4 && rn.meshData) {
                    const createMesh = ((_11 = (_10 = cc.utils) === null || _10 === void 0 ? void 0 : _10.MeshUtils) === null || _11 === void 0 ? void 0 : _11.createMesh) || ((_12 = cc.utils) === null || _12 === void 0 ? void 0 : _12.createMesh);
                    if (createMesh) {
                        const mesh = createMesh(rn.meshData);
                        ren.mesh = mesh;
                    }
                    else {
                        warnings.push(`Node "${desc.name}": cc.utils.MeshUtils.createMesh not available`);
                    }
                }
            }
            else {
                warnings.push(`Node "${desc.name}": ps.renderer not found`);
            }
        }
        catch (err) {
            warnings.push(`Node "${desc.name}": renderer error: ${err.message}`);
        }
    }
    // Material assignment is handled by the importer via Editor.Message 'set-property'
    // (scene script async loadAny doesn't persist in editor serialization)
}
function applySplineKeyframes(spline, keyframes, cc) {
    var _a, _b, _c, _d, _e;
    if (!spline || !keyframes || keyframes.length === 0)
        return;
    const RealInterpolationMode = cc.RealInterpolationMode;
    const interpMode = (_a = RealInterpolationMode === null || RealInterpolationMode === void 0 ? void 0 : RealInterpolationMode.LINEAR) !== null && _a !== void 0 ? _a : 2;
    if (typeof spline.assignSorted === 'function') {
        const times = keyframes.map((kf) => { var _a; return (_a = kf.time) !== null && _a !== void 0 ? _a : 0; });
        const values = keyframes.map((kf) => {
            var _a, _b, _c;
            return ({
                value: (_a = kf.value) !== null && _a !== void 0 ? _a : 0,
                leftTangent: (_b = kf.inTangent) !== null && _b !== void 0 ? _b : 0,
                rightTangent: (_c = kf.outTangent) !== null && _c !== void 0 ? _c : 0,
                interpolationMode: interpMode,
            });
        });
        spline.assignSorted(times, values);
    }
    else if (typeof spline.addKeyFrame === 'function') {
        for (const kf of keyframes) {
            spline.addKeyFrame((_b = kf.time) !== null && _b !== void 0 ? _b : 0, {
                value: (_c = kf.value) !== null && _c !== void 0 ? _c : 0,
                leftTangent: (_d = kf.inTangent) !== null && _d !== void 0 ? _d : 0,
                rightTangent: (_e = kf.outTangent) !== null && _e !== void 0 ? _e : 0,
                interpolationMode: interpMode,
            });
        }
    }
    else if (Array.isArray(spline.keyFrames)) {
        spline.keyFrames = keyframes.map((kf) => {
            var _a, _b, _c, _d;
            return ({
                time: (_a = kf.time) !== null && _a !== void 0 ? _a : 0,
                value: (_b = kf.value) !== null && _b !== void 0 ? _b : 0,
                inTangent: (_c = kf.inTangent) !== null && _c !== void 0 ? _c : 0,
                outTangent: (_d = kf.outTangent) !== null && _d !== void 0 ? _d : 0,
            });
        });
    }
}
function applyCurve(target, propName, curveDesc, cc) {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p;
    if (!curveDesc || !target)
        return;
    try {
        const CurveRange = cc === null || cc === void 0 ? void 0 : cc.CurveRange;
        if (CurveRange) {
            const cr = new CurveRange();
            switch (curveDesc.mode) {
                case 0:
                    cr.mode = 0;
                    cr.constant = (_a = curveDesc.constant) !== null && _a !== void 0 ? _a : 0;
                    break;
                case 1:
                    cr.mode = 1;
                    cr.multiplier = (_b = curveDesc.multiplier) !== null && _b !== void 0 ? _b : 1;
                    if ((_c = curveDesc.spline) === null || _c === void 0 ? void 0 : _c.keyframes) {
                        applySplineKeyframes(cr.spline, curveDesc.spline.keyframes, cc);
                    }
                    break;
                case 2: // TwoCurves in Cocos
                    cr.mode = 2;
                    cr.multiplier = (_d = curveDesc.multiplier) !== null && _d !== void 0 ? _d : 1;
                    if ((_e = curveDesc.splineMin) === null || _e === void 0 ? void 0 : _e.keyframes) {
                        applySplineKeyframes(cr.splineMin, curveDesc.splineMin.keyframes, cc);
                    }
                    if ((_f = curveDesc.splineMax) === null || _f === void 0 ? void 0 : _f.keyframes) {
                        applySplineKeyframes(cr.splineMax, curveDesc.splineMax.keyframes, cc);
                    }
                    break;
                case 3: // TwoConstants in Cocos
                    cr.mode = 3;
                    cr.constantMin = (_g = curveDesc.constantMin) !== null && _g !== void 0 ? _g : 0;
                    cr.constantMax = (_h = curveDesc.constantMax) !== null && _h !== void 0 ? _h : 0;
                    break;
            }
            target[propName] = cr;
        }
        else {
            const prop = target[propName];
            if (!prop)
                return;
            switch (curveDesc.mode) {
                case 0:
                    prop.mode = 0;
                    prop.constant = (_j = curveDesc.constant) !== null && _j !== void 0 ? _j : 0;
                    break;
                case 1:
                    prop.mode = 1;
                    prop.multiplier = (_k = curveDesc.multiplier) !== null && _k !== void 0 ? _k : 1;
                    if ((_l = curveDesc.spline) === null || _l === void 0 ? void 0 : _l.keyframes) {
                        applySplineKeyframes(prop.spline, curveDesc.spline.keyframes, cc);
                    }
                    break;
                case 2:
                    prop.mode = 2;
                    prop.multiplier = (_m = curveDesc.multiplier) !== null && _m !== void 0 ? _m : 1;
                    break;
                case 3:
                    prop.mode = 3;
                    prop.constantMin = (_o = curveDesc.constantMin) !== null && _o !== void 0 ? _o : 0;
                    prop.constantMax = (_p = curveDesc.constantMax) !== null && _p !== void 0 ? _p : 0;
                    break;
            }
        }
    }
    catch (err) {
        console.warn(`[IKame VFX] applyCurve "${propName}" error: ${err.message}`);
    }
}
function applyGradient(target, propName, gradDesc, cc) {
    if (!gradDesc || !target)
        return;
    const prop = target[propName];
    if (!prop)
        return;
    try {
        switch (gradDesc.mode) {
            case 0:
                prop.mode = 0;
                if (gradDesc.color) {
                    prop.color = new cc.Color(gradDesc.color.r, gradDesc.color.g, gradDesc.color.b, gradDesc.color.a);
                }
                break;
            case 1:
                prop.mode = 1;
                if (gradDesc.gradient) {
                    applyGradientKeys(prop, gradDesc.gradient, cc);
                }
                break;
            case 2:
                prop.mode = 2;
                if (gradDesc.colorMin) {
                    prop.colorMin = new cc.Color(gradDesc.colorMin.r, gradDesc.colorMin.g, gradDesc.colorMin.b, gradDesc.colorMin.a);
                }
                if (gradDesc.colorMax) {
                    prop.colorMax = new cc.Color(gradDesc.colorMax.r, gradDesc.colorMax.g, gradDesc.colorMax.b, gradDesc.colorMax.a);
                }
                break;
            case 3:
                prop.mode = 3;
                if (gradDesc.gradientMin) {
                    applyGradientKeys(prop, gradDesc.gradientMin, cc, 'gradientMin');
                }
                if (gradDesc.gradientMax) {
                    applyGradientKeys(prop, gradDesc.gradientMax, cc, 'gradientMax');
                }
                break;
            case 4:
                prop.mode = 4;
                if (gradDesc.gradient) {
                    applyGradientKeys(prop, gradDesc.gradient, cc);
                }
                break;
        }
    }
    catch (err) { /* silently skip */ }
}
function applyGradientKeys(prop, gradObj, cc, targetProp = 'gradient') {
    if (!gradObj)
        return;
    try {
        const gradient = prop[targetProp] || new cc.Gradient();
        if (gradObj.colorKeys && Array.isArray(gradObj.colorKeys)) {
            gradient.colorKeys = gradObj.colorKeys.map((ck) => ({
                time: ck.time,
                color: new cc.Color(ck.color.r, ck.color.g, ck.color.b, ck.color.a),
            }));
        }
        if (gradObj.alphaKeys && Array.isArray(gradObj.alphaKeys)) {
            gradient.alphaKeys = gradObj.alphaKeys.map((ak) => ({
                time: ak.time,
                alpha: ak.alpha,
            }));
        }
        prop[targetProp] = gradient;
    }
    catch (err) { /* skip */ }
}
//# sourceMappingURL=scene.js.map