import type { LineDef, Seg, SubSector, TreeNode } from "../map-data";
import { type Bounds, type Line, type Vertex } from "../math";
import { dword, int16, word, type Lump } from "./wadfile";

// Honestly very similar to vanilla bsp but different enough that it felt better
// to have it's own file. https://doomwiki.org/wiki/Planisphere_2 is the only
// map I know of that uses this format so hopefully I get it right

export type BSPData = { segs: Seg[], subsectors: SubSector[], nodes: TreeNode[] };

export function readBspData(mapLumps: Lump[], vertexes: Vertex[], linedefs: LineDef[]): BSPData {
    const segs = segsLump(mapLumps[5], vertexes, linedefs);
    const subsectors = subSectorLump(mapLumps[6], segs);
    const nodes = bspNodesLump(mapLumps[7], vertexes, subsectors);
    return { segs, nodes, subsectors };
}

function segsLump(lump: Lump, vertexes: Vertex[], linedefs: LineDef[]) {
    const len = 16;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: SEGS');
    }
    let segs = new Array<Seg>(num);
    for (let i = 0; i < num; i++) {
        const v0 = dword(lump.data, 0 + i * len);
        const v1 = dword(lump.data, 4 + i * len);
        const v: Line = [vertexes[v0], vertexes[v1]];
        const linedefId = word(lump.data, 10 + i * len);
        const linedef = linedefs[linedefId];
        const direction = int16(word(lump.data, 12 + i * len));
        segs[i] = { v, linedef, direction, blockHit: 0 };
    }
    return segs;
}

// this bounds will never be true when testing for collisions because if something
// is bigger than left, it will be less than right and fail (same for top and bottom)
export const _invalidBounds: Bounds = { left: Infinity, right: -Infinity, top: Infinity, bottom: -Infinity };

function subSectorLump(lump: Lump, segs: Seg[]) {
    const len = 6;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: SSECTORS');
    }
    let subsectors = new Array<SubSector>(num);
    for (let i = 0; i < num; i++) {
        const segCount = int16(word(lump.data, 0 + i * len));
        const segId = dword(lump.data, 2 + i * len);
        subsectors[i] = {
            num: i,
            sector: segs[segId].direction
                ? segs[segId].linedef.left.sector
                : segs[segId].linedef.right.sector,
            segs: segs.slice(segId, segId + segCount),
            mobjs: new Set(),
            blockHit: 0,
            // bounds and vertexes will be populated by completeSubSectors()
            bounds: _invalidBounds,
            vertexes: [],
            bspLines: [],
         };
    }
    return subsectors;
}

function bspNodesLump(lump: Lump, vertexes: Vertex[], subsectors: SubSector[]) {
    const len = 32;
    let offset = 8; // skip xNd4\0\0\0\0 signature
    const num = Math.trunc((lump.data.length - offset) / len);
    if (num * len + offset !== lump.data.length) {
        throw new Error('invalid lump: NODES');
    }
    let nodes = new Array<TreeNode>(num);
    for (let i = 0; i < num; i++) {
        let xStart = int16(word(lump.data, offset)); offset += 2;
        let yStart = int16(word(lump.data, offset)); offset += 2;
        let xChange = int16(word(lump.data, offset)); offset += 2;
        let yChange = int16(word(lump.data, offset)); offset += 2;
        offset += 4 * 2 * 2 // skip bounds left and right
        const childRight: any = dword(lump.data, offset); offset += 4;
        const childLeft: any = dword(lump.data, offset); offset += 4;
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
    // Similar to zdoom bsp, subsector/node reference is 4 bytes
    return (idx & 0x8000_0000)
        ? ssector[idx & 0x7fff_ffff]
        : nodes[idx & 0x7fff_ffff];
};
