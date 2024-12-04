import type { LineDef, Seg, SubSector, TreeNode } from "../map-data";
import { type Bounds, type Line, type Vertex } from "../math";
import { int16, word, type Lump } from "./wadfile";
import { readBspData as readZDoomBspData } from "./bsp-zdoom";
import { readBspData as readDeepBspData } from "./bsp-deep";

export type BSPData = { segs: Seg[], subsectors: SubSector[], nodes: TreeNode[] };

export function readBspData(mapLumps: Lump[], vertexes: Vertex[], linedefs: LineDef[]): BSPData {
    // special bsp nodes like XNOD (or zdoom extended nodes) or DeeP nodes https://doomwiki.org/wiki/Node_builder
    if ('XNOD' === String.fromCharCode(...mapLumps[7].data.subarray(0, 4))) {
        // TODO: also ZNOD for compressed nodes?
        return readZDoomBspData(mapLumps, vertexes, linedefs);
    }
    if ('xNd4' === String.fromCharCode(...mapLumps[7].data.subarray(0, 4))) {
        return readDeepBspData(mapLumps, vertexes, linedefs);
    }

    const segs = segsLump(mapLumps[5], vertexes, linedefs);
    const subsectors = subSectorLump(mapLumps[6], segs);
    const nodes = bspNodesLump(mapLumps[7], subsectors);
    return { segs, nodes, subsectors };
}

function segsLump(lump: Lump, vertexes: Vertex[], linedefs: LineDef[]) {
    const len = 12;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: SEGS');
    }
    let segs = new Array<Seg>(num);
    for (let i = 0; i < num; i++) {
        const v0 = word(lump.data, 0 + i * len);
        const v1 = word(lump.data, 2 + i * len);
        const v: Line = [vertexes[v0], vertexes[v1]];
        const linedefId = word(lump.data, 6 + i * len);
        const linedef = linedefs[linedefId];
        const direction = int16(word(lump.data, 8 + i * len));
        segs[i] = { v, linedef, direction };
    }
    return segs;
}

// this bounds will never be true when testing for collisions because if something
// is bigger than left, it will be less than right and fail (same for top and bottom)
export const _invalidBounds: Bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };

function subSectorLump(lump: Lump, segs: Seg[]) {
    const len = 4;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: SSECTORS');
    }
    let subsectors = new Array<SubSector>(num);
    for (let i = 0; i < num; i++) {
        const segCount = int16(word(lump.data, 0 + i * len));
        const segId = word(lump.data, 2 + i * len);
        subsectors[i] = {
            num: i,
            sector: segs[segId].direction
                ? segs[segId].linedef.left.sector
                : segs[segId].linedef.right.sector,
            segs: segs.slice(segId, segId + segCount),
            mobjs: new Set(),
            hitC: 0,
            // bounds and vertexes will be populated by completeSubSectors()
            bounds: _invalidBounds,
            vertexes: [],
            bspLines: [],
         };
    }
    return subsectors;
}

function bspNodesLump(lump: Lump, subsectors: SubSector[]) {
    const len = 28;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: NODES');
    }
    let nodes = new Array<TreeNode>(num);
    for (let i = 0; i < num; i++) {
        let xStart = int16(word(lump.data, 0 + i * len));
        let yStart = int16(word(lump.data, 2 + i * len));
        let xChange = int16(word(lump.data, 4 + i * len));
        let yChange = int16(word(lump.data, 6 + i * len));
        const childRight: any = word(lump.data, 24 + i * len);
        const childLeft: any = word(lump.data, 26 + i * len);
        nodes[i] = {
            childRight, childLeft,
            v: [
                { x: xStart, y: yStart },
                { x: xStart + xChange, y: yStart + yChange },
            ],
        };
    }

    nodes.forEach(node => {
        node.childLeft = assignChild(node.childLeft, nodes, subsectors);
        node.childRight = assignChild(node.childRight, nodes, subsectors);
    });

    return nodes;
}

function assignChild(child: TreeNode | SubSector, nodes: TreeNode[], ssector: SubSector[]) {
    let idx = (child as any) as number;
    return (idx & 0xa000)
        ? ssector[idx & 0x7fff]
        : nodes[idx & 0x7fff];
};
