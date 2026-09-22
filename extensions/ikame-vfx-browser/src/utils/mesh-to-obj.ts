'use strict';

/**
 * Convert Unity mesh JSON (vertices, triangles, normals, uvs) to OBJ format.
 * Cocos Creator natively imports .obj files as mesh assets.
 *
 * Coordinate conversion: Unity (left-hand, Z forward) → Cocos (right-hand, Z backward)
 *   - Vertex/Normal Z is negated
 *   - Triangle winding is reversed (a,b,c → a,c,b)
 */
export function meshJsonToObj(meshJson: Record<string, any>): string {
    const vertices: number[][] = meshJson.vertices || [];
    const triangles: number[] = meshJson.triangles || [];
    const normals: number[][] = meshJson.normals || [];
    const uvs: number[][] = meshJson.uvs || [];
    const name: string = meshJson.name || 'Mesh';

    const lines: string[] = [];
    lines.push(`o ${name}`);

    for (const v of vertices) {
        lines.push(`v ${v[0]} ${v[1]} ${-v[2]}`);
    }

    for (const uv of uvs) {
        lines.push(`vt ${uv[0]} ${uv[1]}`);
    }

    for (const n of normals) {
        lines.push(`vn ${n[0]} ${n[1]} ${-n[2]}`);
    }

    const hasUV = uvs.length > 0;
    const hasNorm = normals.length > 0;

    for (let i = 0; i < triangles.length; i += 3) {
        const a = triangles[i] + 1;
        const b = triangles[i + 1] + 1;
        const c = triangles[i + 2] + 1;
        // Reverse winding (a,c,b) to compensate for Z negation
        if (hasUV && hasNorm) {
            lines.push(`f ${a}/${a}/${a} ${c}/${c}/${c} ${b}/${b}/${b}`);
        } else if (hasNorm) {
            lines.push(`f ${a}//${a} ${c}//${c} ${b}//${b}`);
        } else if (hasUV) {
            lines.push(`f ${a}/${a} ${c}/${c} ${b}/${b}`);
        } else {
            lines.push(`f ${a} ${c} ${b}`);
        }
    }

    return lines.join('\n');
}
