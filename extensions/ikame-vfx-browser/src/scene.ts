'use strict';

import { join } from 'path';
module.paths.push(join(Editor.App.path, 'node_modules'));

export function load() {
    console.log('[IKame VFX Browser] Scene script loaded');
}

export function unload() {
    console.log('[IKame VFX Browser] Scene script unloaded');
}

export const methods = {
    buildVFXHierarchy(descriptors: any, prefabDir: string): any {
        const cc = require('cc');
        const { director, Node, Vec3, Quat, ParticleSystem } = cc;

        const scene = director.getScene();
        if (!scene) {
            return { nodesCreated: 0, warnings: ['No active scene'], rootUuid: null, psNodes: [] };
        }

        let nodesCreated = 0;
        const warnings: string[] = [];
        const psNodes: { nodeUuid: string; materialUuid: string; rendererModule: any; startSizeX: any }[] = [];

        function buildNode(desc: any, parent: any): any {
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
                            rendererModule: desc.modules?.rendererModule || null,
                            startSizeX: desc.modules?.mainModule?.startSize || null,
                        });
                    } else {
                        warnings.push(`addComponent(ParticleSystem) returned null on "${desc.name}"`);
                    }
                } catch (err: any) {
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
function getModule(ps: any, ...names: string[]): any {
    for (const name of names) {
        if (ps[name] != null) return ps[name];
    }
    return null;
}

function applyModules(ps: any, modules: Record<string, any>, desc: any, warnings: string[], cc: any): void {

    // Main module — properties are directly on ps
    if (modules.mainModule) {
        const m = modules.mainModule;
        try {
            ps.duration = m.duration ?? 5;
            ps.loop = m.loop ?? true;
            ps.playOnAwake = m.playOnAwake ?? true;
            ps.capacity = m.capacity ?? 1000;
            if (m.simulationSpace != null) ps.simulationSpace = m.simulationSpace;
            if (m.scaleSpace != null) ps.scaleSpace = m.scaleSpace;
            applyCurve(ps, 'startLifetime', m.startLifetime, cc);
            applyCurve(ps, 'startSpeed', m.startSpeed, cc);
            applyCurve(ps, 'startSizeX', m.startSize, cc);
            if (m.startSizeY) applyCurve(ps, 'startSizeY', m.startSizeY, cc);
            if (m.startSizeZ) applyCurve(ps, 'startSizeZ', m.startSizeZ, cc);
            applyCurve(ps, 'startRotationZ', m.startRotationZ, cc);
            if (m.startRotationX) applyCurve(ps, 'startRotationX', m.startRotationX, cc);
            if (m.startRotationY) applyCurve(ps, 'startRotationY', m.startRotationY, cc);
            applyCurve(ps, 'startDelay', m.startDelay, cc);
            applyCurve(ps, 'gravityModifier', m.gravityModifier, cc);
            if (m.startColor) {
                applyGradient(ps, 'startColor', m.startColor, cc);
            }
        } catch (err: any) {
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
                const Burst = cc.Burst || cc.ParticleSystem?.Burst;
                if (Burst) {
                    ps.bursts = em.bursts.map((b: any) => {
                        const burst = new Burst();
                        burst.time = b.time ?? 0;
                        burst.repeatCount = b.repeatCount ?? 0;
                        burst.repeatInterval = b.repeatInterval ?? 0.01;
                        applyCurve(burst, 'count', b.count, cc);
                        return burst;
                    });
                } else {
                    warnings.push(`Node "${desc.name}": cc.Burst class not found — bursts skipped`);
                }
            }
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": emission error: ${err.message}`);
        }
    } else {
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
            shape.shapeType = sh.shapeType ?? 2;
            shape.radius = sh.radius ?? 1;
            shape.radiusThickness = sh.radiusThickness ?? 1;
            shape.angle = sh.angle ?? 25;
            shape.arc = sh.arc ?? 360;
            shape.arcMode = sh.arcMode ?? 0;
            shape.length = sh.length ?? 5;
            // emitFrom only for Cone (2), other shapes use radiusThickness for shell/volume
            if (sh.shapeType === 2) {
                shape.emitFrom = sh.emitFrom ?? 0;
            }
            shape.alignToDirection = sh.alignToDirection ?? false;
            if (sh.position) {
                shape.position = new cc.Vec3(sh.position.x ?? 0, sh.position.y ?? 0, -(sh.position.z ?? 0));
            }
            if (sh.rotation) {
                shape.rotation = new cc.Vec3(sh.rotation.x ?? 0, sh.rotation.y ?? 0, sh.rotation.z ?? 0);
            }
            if (sh.scale) {
                shape.scale = new cc.Vec3(sh.scale.x ?? 1, sh.scale.y ?? 1, sh.scale.z ?? 1);
            }
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": shapeModule error: ${err.message}`);
        }
    }

    // Velocity over Lifetime
    const velOT = getModule(ps, 'velocityOvertimeModule', '_velocityOvertimeModule');
    if (modules.velocityOverLifetimeModule && velOT) {
        try {
            const v = modules.velocityOverLifetimeModule;
            velOT.enable = true;
            if (v.space != null) velOT.space = v.space;
            applyCurve(velOT, 'x', v.x, cc);
            applyCurve(velOT, 'y', v.y, cc);
            applyCurve(velOT, 'z', v.z, cc);
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": velocityOverLifetime error: ${err.message}`);
        }
    }

    // Force over Lifetime
    const forceOT = getModule(ps, 'forceOvertimeModule', '_forceOvertimeModule');
    if (modules.forceOverLifetimeModule && forceOT) {
        try {
            const f = modules.forceOverLifetimeModule;
            forceOT.enable = true;
            if (f.space != null) forceOT.space = f.space;
            applyCurve(forceOT, 'x', f.x, cc);
            applyCurve(forceOT, 'y', f.y, cc);
            applyCurve(forceOT, 'z', f.z, cc);
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": forceOverLifetime error: ${err.message}`);
        }
    }

    // Color over Lifetime — Cocos uses 'colorOverLifetimeModule' (not 'Overtime')
    const colorOT = getModule(ps, 'colorOverLifetimeModule', 'colorOvertimeModule', '_colorOverLifetimeModule');
    if (modules.colorOverLifetimeModule && colorOT) {
        try {
            colorOT.enable = true;
            applyGradient(colorOT, 'color', modules.colorOverLifetimeModule.color, cc);
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": colorOverLifetime error: ${err.message}`);
        }
    }

    // Size over Lifetime
    const sizeOT = getModule(ps, 'sizeOvertimeModule', '_sizeOvertimeModule');
    if (modules.sizeOverLifetimeModule && sizeOT) {
        try {
            const s = modules.sizeOverLifetimeModule;
            sizeOT.enable = true;
            sizeOT.separateAxes = s.separateAxes ?? false;
            applyCurve(sizeOT, 'size', s.size, cc);
            if (s.separateAxes) {
                applyCurve(sizeOT, 'x', s.x, cc);
                applyCurve(sizeOT, 'y', s.y, cc);
                applyCurve(sizeOT, 'z', s.z, cc);
            }
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": sizeOverLifetime error: ${err.message}`);
        }
    }

    // Rotation over Lifetime
    const rotOT = getModule(ps, 'rotationOvertimeModule', '_rotationOvertimeModule');
    if (modules.rotationOverLifetimeModule && rotOT) {
        try {
            const r = modules.rotationOverLifetimeModule;
            rotOT.enable = true;
            rotOT.separateAxes = r.separateAxes ?? false;
            applyCurve(rotOT, 'z', r.z, cc);
            if (r.separateAxes) {
                applyCurve(rotOT, 'x', r.x, cc);
                applyCurve(rotOT, 'y', r.y, cc);
            }
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": rotationOverLifetime error: ${err.message}`);
        }
    }

    // Limit Velocity
    const limitVel = getModule(ps, 'limitVelocityOvertimeModule', '_limitVelocityOvertimeModule');
    if (modules.limitVelocityOverLifetimeModule && limitVel) {
        try {
            const lv = modules.limitVelocityOverLifetimeModule;
            limitVel.enable = true;
            limitVel.dampen = (lv.dampen ?? 0) * 0.5;
            limitVel.separateAxes = lv.separateAxes ?? false;
            applyCurve(limitVel, 'limit', lv.speed, cc);
            if (lv.separateAxes) {
                applyCurve(limitVel, 'limitX', lv.speedX, cc);
                applyCurve(limitVel, 'limitY', lv.speedY, cc);
                applyCurve(limitVel, 'limitZ', lv.speedZ, cc);
            }
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": limitVelocity error: ${err.message}`);
        }
    }

    // Texture Sheet Animation — mapper already converts sprites→grid
    const texAnim = getModule(ps, 'textureAnimationModule', '_textureAnimationModule');
    if (modules.textureSheetAnimationModule && texAnim) {
        try {
            const tsa = modules.textureSheetAnimationModule;
            texAnim.enable = true;
            texAnim.numTilesX = tsa.numTilesX ?? 1;
            texAnim.numTilesY = tsa.numTilesY ?? 1;
            texAnim.cycleCount = tsa.cycleCount ?? 1;
            applyCurve(texAnim, 'frameOverTime', tsa.frameOverTime, cc);
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": textureSheetAnimation error: ${err.message}`);
        }
    }

    // Trails
    const trail = getModule(ps, 'trailModule', '_trailModule');
    if (modules.trailModule && trail) {
        try {
            const tr = modules.trailModule;
            trail.enable = true;
            trail.minParticleDistance = tr.minVertexDistance ?? 0.2;
            trail.space = tr.worldSpace ? 1 : 0;
            applyCurve(trail, 'widthRatio', tr.widthRatio, cc);
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": trailModule error: ${err.message}`);
        }
    }

    // Renderer
    if (modules.rendererModule) {
        try {
            const rn = modules.rendererModule;
            const ren = ps.renderer || ps._renderer;
            if (ren) {
                ren.renderMode = rn.renderMode ?? 0;
                if (rn.renderMode === 1) {
                    ren.velocityScale = rn.velocityScale ?? 0;
                    ren.lengthScale = rn.lengthScale ?? 2;
                }
                if (rn.renderMode === 4 && rn.meshData) {
                    const createMesh = cc.utils?.MeshUtils?.createMesh || cc.utils?.createMesh;
                    if (createMesh) {
                        const mesh = createMesh(rn.meshData);
                        ren.mesh = mesh;
                    } else {
                        warnings.push(`Node "${desc.name}": cc.utils.MeshUtils.createMesh not available`);
                    }
                }
            } else {
                warnings.push(`Node "${desc.name}": ps.renderer not found`);
            }
        } catch (err: any) {
            warnings.push(`Node "${desc.name}": renderer error: ${err.message}`);
        }
    }

    // Material assignment is handled by the importer via Editor.Message 'set-property'
    // (scene script async loadAny doesn't persist in editor serialization)
}

function applySplineKeyframes(spline: any, keyframes: any[], cc: any): void {
    if (!spline || !keyframes || keyframes.length === 0) return;
    const RealInterpolationMode = cc.RealInterpolationMode;
    const interpMode = RealInterpolationMode?.LINEAR ?? 2;
    if (typeof spline.assignSorted === 'function') {
        const times = keyframes.map((kf: any) => kf.time ?? 0);
        const values = keyframes.map((kf: any) => ({
            value: kf.value ?? 0,
            leftTangent: kf.inTangent ?? 0,
            rightTangent: kf.outTangent ?? 0,
            interpolationMode: interpMode,
        }));
        spline.assignSorted(times, values);
    } else if (typeof spline.addKeyFrame === 'function') {
        for (const kf of keyframes) {
            spline.addKeyFrame(kf.time ?? 0, {
                value: kf.value ?? 0,
                leftTangent: kf.inTangent ?? 0,
                rightTangent: kf.outTangent ?? 0,
                interpolationMode: interpMode,
            });
        }
    } else if (Array.isArray(spline.keyFrames)) {
        spline.keyFrames = keyframes.map((kf: any) => ({
            time: kf.time ?? 0,
            value: kf.value ?? 0,
            inTangent: kf.inTangent ?? 0,
            outTangent: kf.outTangent ?? 0,
        }));
    }
}

function applyCurve(target: any, propName: string, curveDesc: any, cc?: any): void {
    if (!curveDesc || !target) return;
    try {
        const CurveRange = cc?.CurveRange;
        if (CurveRange) {
            const cr = new CurveRange();
            switch (curveDesc.mode) {
                case 0:
                    cr.mode = 0;
                    cr.constant = curveDesc.constant ?? 0;
                    break;
                case 1:
                    cr.mode = 1;
                    cr.multiplier = curveDesc.multiplier ?? 1;
                    if (curveDesc.spline?.keyframes) {
                        applySplineKeyframes(cr.spline, curveDesc.spline.keyframes, cc);
                    }
                    break;
                case 2: // TwoCurves in Cocos
                    cr.mode = 2;
                    cr.multiplier = curveDesc.multiplier ?? 1;
                    if (curveDesc.splineMin?.keyframes) {
                        applySplineKeyframes(cr.splineMin, curveDesc.splineMin.keyframes, cc);
                    }
                    if (curveDesc.splineMax?.keyframes) {
                        applySplineKeyframes(cr.splineMax, curveDesc.splineMax.keyframes, cc);
                    }
                    break;
                case 3: // TwoConstants in Cocos
                    cr.mode = 3;
                    cr.constantMin = curveDesc.constantMin ?? 0;
                    cr.constantMax = curveDesc.constantMax ?? 0;
                    break;
            }
            target[propName] = cr;
        } else {
            const prop = target[propName];
            if (!prop) return;
            switch (curveDesc.mode) {
                case 0: prop.mode = 0; prop.constant = curveDesc.constant ?? 0; break;
                case 1:
                    prop.mode = 1;
                    prop.multiplier = curveDesc.multiplier ?? 1;
                    if (curveDesc.spline?.keyframes) {
                        applySplineKeyframes(prop.spline, curveDesc.spline.keyframes, cc);
                    }
                    break;
                case 2:
                    prop.mode = 2;
                    prop.multiplier = curveDesc.multiplier ?? 1;
                    break;
                case 3:
                    prop.mode = 3;
                    prop.constantMin = curveDesc.constantMin ?? 0;
                    prop.constantMax = curveDesc.constantMax ?? 0;
                    break;
            }
        }
    } catch (err: any) {
        console.warn(`[IKame VFX] applyCurve "${propName}" error: ${err.message}`);
    }
}

function applyGradient(target: any, propName: string, gradDesc: any, cc: any): void {
    if (!gradDesc || !target) return;
    const prop = target[propName];
    if (!prop) return;
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
                if (gradDesc.gradient) { applyGradientKeys(prop, gradDesc.gradient, cc); }
                break;
            case 2:
                prop.mode = 2;
                if (gradDesc.colorMin) { prop.colorMin = new cc.Color(gradDesc.colorMin.r, gradDesc.colorMin.g, gradDesc.colorMin.b, gradDesc.colorMin.a); }
                if (gradDesc.colorMax) { prop.colorMax = new cc.Color(gradDesc.colorMax.r, gradDesc.colorMax.g, gradDesc.colorMax.b, gradDesc.colorMax.a); }
                break;
            case 3:
                prop.mode = 3;
                if (gradDesc.gradientMin) { applyGradientKeys(prop, gradDesc.gradientMin, cc, 'gradientMin'); }
                if (gradDesc.gradientMax) { applyGradientKeys(prop, gradDesc.gradientMax, cc, 'gradientMax'); }
                break;
            case 4:
                prop.mode = 4;
                if (gradDesc.gradient) { applyGradientKeys(prop, gradDesc.gradient, cc); }
                break;
        }
    } catch (err) { /* silently skip */ }
}

function applyGradientKeys(prop: any, gradObj: any, cc: any, targetProp: string = 'gradient'): void {
    if (!gradObj) return;
    try {
        const gradient = prop[targetProp] || new cc.Gradient();
        if (gradObj.colorKeys && Array.isArray(gradObj.colorKeys)) {
            gradient.colorKeys = gradObj.colorKeys.map((ck: any) => ({
                time: ck.time,
                color: new cc.Color(ck.color.r, ck.color.g, ck.color.b, ck.color.a),
            }));
        }
        if (gradObj.alphaKeys && Array.isArray(gradObj.alphaKeys)) {
            gradient.alphaKeys = gradObj.alphaKeys.map((ak: any) => ({
                time: ak.time,
                alpha: ak.alpha,
            }));
        }
        prop[targetProp] = gradient;
    } catch (err) { /* skip */ }
}
