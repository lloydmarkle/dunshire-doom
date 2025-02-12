import type { SubSector, TreeNode, LineDef, Seg } from "../map-data";
import type { Line, Vertex } from "../math";
import { _invalidBounds, type BSPData } from "./bsp-data";
import { dword, int16, word, type Lump } from "./wadfile";

const fixed = (buff: Uint8Array, offset: number) => dword(buff, offset) / 65536.0;

export function readBspData(mapLumps: Lump[], vertexes: Vertex[], linedefs: LineDef[]): BSPData {
    const buff = mapLumps[7].data; // we only care about the NODES lump as assume SEGS and SSECTORS are empty
    let offset = 4; // skip XNOD/ZNOD signature

    // (seg) vertex info
    const orgVerts = dword(buff, offset); offset += 4;
    const newVerts = dword(buff, offset); offset += 4;
    const segVerts = new Array<Vertex>(newVerts);
    for (let i = 0; i < newVerts; i++) {
        const x = fixed(buff, offset); offset += 4;
        const y = fixed(buff, offset); offset += 4;
        segVerts[i] = { x, y };
    }

    const fetchVert = (num: number) => num < orgVerts ? vertexes[num] : segVerts[num - orgVerts];

    // To create actual SubSector objects, we need to read the segs first but zdoom nodes
    // list subsectors first so we store that data temporarily.
    const numSubSectors = dword(buff, offset); offset += 4;
    const numSubsectorSegs = new Array<number>(numSubSectors);
    for (let i = 0; i < numSubSectors; i++) {
        numSubsectorSegs[i] = dword(buff, offset); offset += 4;
    }

    // segs
    const numSegs = dword(buff, offset); offset += 4;
    const segs = new Array<Seg>(numSegs);
    for (let i = 0; i < numSegs; i++) {
        const v0 = dword(buff, offset); offset += 4;
        const v1 = dword(buff, offset); offset += 4;
        const v: Line = [fetchVert(v0), fetchVert(v1)];
        const linedefId = word(buff, offset); offset += 2;
        const linedef = linedefs[linedefId];
        const direction = buff[offset]; offset += 1;
        segs[i] = { v, linedef, direction, blockHit: 0 };
    }

    // subsectors (based on segs and subsectorRefs collected above)
    const subsectors = new Array<SubSector>(numSubSectors);
    let segId = 0;
    for (let i = 0; i < numSubSectors; i++) {
        subsectors[i] = {
            num: i,
            sector: segs[segId].direction
                ? segs[segId].linedef.left.sector
                : segs[segId].linedef.right.sector,
            segs: segs.slice(segId, segId + numSubsectorSegs[i]),
            mobjs: new Set(),
            blockHit: 0,
            // bounds and vertexes will be populated by completeSubSectors()
            bounds: _invalidBounds,
            vertexes: [],
            bspLines: [],
        };
        segId += numSubsectorSegs[i];
    }

    // bsp nodes
    const numNodes = dword(buff, offset); offset += 4;
    const nodes = new Array<TreeNode>(numNodes);
    for (let i = 0; i < numNodes; i++) {
        let xStart = int16(word(buff, offset)); offset += 2;
        let yStart = int16(word(buff, offset)); offset += 2;
        let xChange = int16(word(buff, offset)); offset += 2;
        let yChange = int16(word(buff, offset)); offset += 2;
        offset += 4 * 2 * 2; // skip bounding box
        const childRight: any = dword(buff, offset); offset += 4;
        const childLeft: any = dword(buff, offset); offset += 4;
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

    return { segs, subsectors, nodes };
}

function assignChild(child: TreeNode | SubSector, nodes: TreeNode[], ssector: SubSector[]) {
    let idx = (child as any) as number;
    // https://zdoom.org/wiki/Node#ZDoom_extended_nodes:
    // "Just remember that the child references are stored using four bytes each instead of two."
    return (idx & 0x8000_0000)
        ? ssector[idx & 0x7fff_ffff]
        : nodes[idx & 0x7fff_ffff];
};
