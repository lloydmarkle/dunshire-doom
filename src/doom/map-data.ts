import { store, type Store } from "./store";
import { Vector3 } from "three";
import { MapObject } from "./map-object";
import { centerSort, closestPoint, lineAABB, lineBounds, lineLineIntersect, pointOnLine, signedLineDistance, sweepAABBAABB, sweepAABBLine, type Bounds, type Vertex } from "./math";
import { MFFlags } from "./doom-things-info";
import { type Lump, int16, word, lumpString } from "../doom";
import { readBspData } from "./wad/bsp-data";

export type Action = () => void;

export interface Thing {
    x: number;
    y: number;
    angle: number;
    type: number;
    flags: number;
}
function thingsLump(lump: Lump) {
    const len = 10;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: THINGS');
    }
    let things = new Array<Thing>(num);
    for (let i = 0; i < num; i++) {
        const x = int16(word(lump.data, 0 + i * len));
        const y = int16(word(lump.data, 2 + i * len));
        const angle = int16(word(lump.data, 4 + i * len));
        const type = int16(word(lump.data, 6+ i * len));
        const flags = int16(word(lump.data, 8 + i * len));
        things[i] = { x, y, angle, type, flags };
    }
    return things;
}

export interface LineDef {
    num: number;
    v: Vertex[];
    flags: number;
    special: number;
    tag: number;
    right?: SideDef;
    left?: SideDef;
    // used by renderer
    transparentWindowHack: boolean;
    // For game processing
    switchAction: Action;
    hitC: number; // don't hit the same line twice during collision detection
}
function lineDefsLump(lump: Lump, vertexes: Vertex[], sidedefs: SideDef[]) {
    const len = 14;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: LINEDEFS');
    }
    let lindefs = new Array<LineDef>(num);
    for (let i = 0; i < num; i++) {
        const v0 = word(lump.data, 0 + i * len);
        const v1 = word(lump.data, 2 + i * len);
        const flags = int16(word(lump.data, 4 + i * len));
        const special = int16(word(lump.data, 6 + i * len));
        const tag = int16(word(lump.data, 8 + i * len));
        const rightSidedef = word(lump.data, 10 + i * len);
        const leftSidedef = word(lump.data, 12 + i * len);

        lindefs[i] = {
            tag, special, flags,
            num: i,
            v: [vertexes[v0], vertexes[v1]],
            left: sidedefs[leftSidedef],
            right: sidedefs[rightSidedef],
            switchAction: null,
            hitC: 0,
            transparentWindowHack: false,
        };
    }
    return lindefs;
}

export const linedefSlope = (() => {
    const rs = { dx: 0, dy: 0, length: 0 };
    return (ld: LineDef) => {
        rs.dx = ld.v[1].x - ld.v[0].x;
        rs.dy = ld.v[1].y - ld.v[0].y;
        rs.length = Math.sqrt(rs.dx * rs.dx + rs.dy * rs.dy);
        return rs;
    }
})();


export interface SideDef {
    // With R2, those don't need to be stores but it also doesn't really hurt because we don't update them
    xOffset: Store<number>;
    yOffset: Store<number>;
    sector: Sector;
    upper: string;
    lower: string;
    middle: string;
    renderData: any;
}
function sideDefsLump(lump: Lump, sectors: Sector[]) {
    const len = 30;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: SIDEDEFS');
    }
    let sidedefs = new Array<SideDef>(num);
    for (let i = 0; i < num; i++) {
        const xOffset = store(int16(word(lump.data, 0 + i * len)));
        const yOffset = store(int16(word(lump.data, 2 + i * len)));
        const upper = fixTextureName(lumpString(lump.data, 4 + i * len, 8));
        const lower = fixTextureName(lumpString(lump.data, 12 + i * len, 8));
        const middle = fixTextureName(lumpString(lump.data, 20 + i * len, 8));
        const sectorId = int16(word(lump.data, 28 + i * len));
        const sector = sectors[sectorId];
        sidedefs[i] = { xOffset, yOffset, sector, lower, middle, upper, renderData: {} };
    }
    return sidedefs;
}

function fixTextureName(name: string) {
    const uname = name?.toUpperCase();
    // Some maps (pirate doom 2) use this texture but it's not supposed to be
    // rendered (https://doomwiki.org/wiki/AASTINKY) so we remove it
    return !name || name.startsWith('-') || uname === 'AASTINKY' || uname === 'AASHITTY' ? undefined : name.toUpperCase();
}

export interface Sector {
    num: number;
    tag: number;
    type: number;
    zFloor: number;
    zCeil: number;
    light: number;
    floorFlat: string;
    ceilFlat: string;
    // part of skyhack
    skyHeight?: number;
    // special rendering data
    renderData: any;
    transfer: LineDef;
    // Game processing data
    center: Vector3;
    specialData: any;
    soundC: number;
    soundTarget: MapObject;
    portalSegs: Seg[];
}
function sectorsLump(lump: Lump) {
    const len = 26;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: SECTORS');
    }
    let sectors = new Array<Sector>(num);
    for (let i = 0; i < num; i++) {
        const zFloor = int16(word(lump.data, 0 + i * len));
        const zCeil = int16(word(lump.data, 2 + i * len));
        const floorFlat = fixTextureName(lumpString(lump.data, 4 + i * len, 8));
        const ceilFlat = fixTextureName(lumpString(lump.data, 12 + i * len, 8));
        const light = int16(word(lump.data, 20 + i * len));
        const type = int16(word(lump.data, 22 + i * len));
        const tag = int16(word(lump.data, 24 + i * len));
        sectors[i] = {
            tag, type, zFloor, zCeil, ceilFlat, floorFlat, light,
            renderData: {},
            transfer: null,
            num: i,
            specialData: null,
            soundC: 0,
            soundTarget: null,
             // filled in after completeSubSectors
            center: new Vector3(),
            portalSegs: [],
        };
    }
    return sectors;
}

function vertexesLump(lump: Lump) {
    const len = 4;
    const num = Math.trunc(lump.data.length / len);
    if (num * len !== lump.data.length) {
        throw new Error('invalid lump: VERTEXES');
    }
    let vertexes = new Array<Vertex>(num);
    for (let i = 0; i < num; i++) {
        const x = int16(word(lump.data, 0 + i * len));
        const y = int16(word(lump.data, 2 + i * len));
        vertexes[i] = { x, y };
    }
    return vertexes;
}

function blockmapLump(lump: Lump) {
    const originX = int16(word(lump.data, 0));
    const originY = int16(word(lump.data, 2));
    const numCols = int16(word(lump.data, 4));
    const numRows = int16(word(lump.data, 6));
    return { originX, originY, numCols, numRows };
}

export interface Seg {
    v: Vertex[];
    linedef: LineDef;
    direction: number;
}

export interface SubSector {
    num: number;
    sector: Sector;
    segs: Seg[];
    vertexes: Vertex[];
    bspLines: Vertex[][]; // <-- useful for debugging but maybe we can remove it?
    // for collision detection
    mobjs: Set<MapObject>;
    bounds: Bounds;
    hitC: number;
}

export interface TreeNode {
    v: Vertex[];
    childRight: TreeNode | SubSector;
    childLeft: TreeNode | SubSector;
}

interface BaseTraceHit {
    subsector: SubSector;
    fraction: number; // 0-1 of how far we moved along the desired path
    overlap: number; // used to resolve a tie in hit fraction
    point: Vector3; // point of hit (maybe redundant because we can compute it from fraction and we don't use z anyway)
}
export interface LineTraceHit extends BaseTraceHit {
    side: -1 | 1; // did we hit front side (1) or back side (-1)
    line: LineDef;
}
export interface MapObjectTraceHit extends BaseTraceHit {
    mobj: MapObject;
    axis: 'x' | 'y';
}
interface SectorTraceHit extends BaseTraceHit {
    flat: 'floor' | 'ceil';
}
export type TraceHit = SectorTraceHit | MapObjectTraceHit | LineTraceHit;
// return true to continue trace, false to stop
export type HandleTraceHit<T=TraceHit> = (hit: T) => boolean;

export const hitSkyFlat = (hit: SectorTraceHit) =>
    (hit.flat === 'ceil' && hit.subsector.sector.ceilFlat === 'F_SKY1') ||
    (hit.flat === 'floor' && hit.subsector.sector.floorFlat === 'F_SKY1');

export const hitSkyWall = (z: number, front: Sector, back: Sector) =>
    (front.ceilFlat === 'F_SKY1') && (
        (z > front.zCeil) ||
        (back && z > back.zCeil && back.skyHeight !== undefined && back.skyHeight !== back.zCeil)
);

export const zeroVec = new Vector3();
export const hittableThing = MFFlags.MF_SOLID | MFFlags.MF_SPECIAL | MFFlags.MF_SHOOTABLE;
export class MapData {
    private subsectorTrace: ReturnType<typeof createSubsectorTrace>;
    private bspTracer: ReturnType<typeof createBspTracer>;
    readonly things: Thing[];
    readonly linedefs: LineDef[];
    readonly vertexes: Vertex[];
    readonly sectors: Sector[];
    readonly nodes: TreeNode[];
    readonly rejects: Uint8Array;
    readonly blockMapBounds: Bounds;

    constructor(lumps: Lump[]) {
        console.time('map-bin')
        this.things = thingsLump(lumps[1]);
        this.sectors = sectorsLump(lumps[8]);
        this.vertexes = vertexesLump(lumps[4]);
        fixVertexes(
            this.vertexes,
            lumps[2], // linedefs
            lumps[5], // segs
        );

        this.rejects = lumps[9].data;
        const blockmap = blockmapLump(lumps[10]);
        this.blockMapBounds = {
            top: blockmap.originY + blockmap.numRows * 128,
            left: blockmap.originX,
            bottom: blockmap.originY,
            right: blockmap.originX + blockmap.numCols * 128,
        }
        const sidedefs = sideDefsLump(lumps[3], this.sectors);
        this.linedefs = lineDefsLump(lumps[2], this.vertexes, sidedefs);

        const { segs, nodes, subsectors } = readBspData(lumps, this.vertexes, this.linedefs);
        this.nodes = nodes;
        const rootNode = this.nodes[this.nodes.length - 1];
        completeSubSectors(rootNode, subsectors);
        this.bspTracer = createBspTracer(rootNode);
        this.subsectorTrace = createSubsectorTrace(rootNode);

        const portalSegsBySector = new Map<Sector, Seg[]>();
        for (const seg of segs) {
            if (!seg.linedef.left) {
                continue;
            }

            let list = portalSegsBySector.get(seg.linedef.left.sector) || [];
            list.push(seg);
            portalSegsBySector.set(seg.linedef.left.sector, list);

            list = portalSegsBySector.get(seg.linedef.right.sector) || [];
            list.push(seg);
            portalSegsBySector.set(seg.linedef.right.sector, list);
        }

        const subsectMap = new Map<Sector, SubSector[]>();
        subsectors.forEach(subsec => {
            const list = subsectMap.get(subsec.sector) ?? [];
            list.push(subsec);
            subsectMap.set(subsec.sector, list);
        });
        for (const sector of this.sectors) {
            sector.portalSegs = portalSegsBySector.get(sector) ?? [];
            // compute sector centers which is used for sector sound origin
            const mid = sectorMiddle(sector, subsectMap.get(sector) ?? []);
            sector.center.set(mid.x, mid.y, (sector.zCeil + sector.zFloor) * .5);
        }

        // figure out any sectors that need sky height adjustment
        const skyGroups = groupSkySectors(this.sectors.filter(e => e.ceilFlat === 'F_SKY1'));
        skyGroups.forEach(sectors => {
            const skyHeight = Math.max(...sectors.map(sec => sec.zCeil));
            sectors.forEach(sector => sector.skyHeight = skyHeight);
        });

        // really? linedefs without segs? I've only found this in a few final doom maps (plutonia29, tnt20, tnt21, tnt27)
        // and all of them are two-sided, most have special flags which is a particular problem. Because we are detection
        // collisions with subsectors and segs, we miss collisions with specials lines and key level events won't happen.
        // To fix this, we add fake segs based on the intersection of the linedef and the subsector bounding box.
        // NOTE: segmenting this way results in duplicates (ie. the same section of a linedef may be segmented into multiple
        // subsectors if the subector bounds overlap or the linedef is on the edge of the bounds) so room to improve.
        const segLines = new Set(segs.map(seg => seg.linedef));
        const linedefsWithoutSegs = this.linedefs.filter(ld => !segLines.has(ld));
        const lineStart = new Vector3();
        const lineVec = new Vector3();
        for (const linedef of linedefsWithoutSegs) {
            lineStart.set(linedef.v[0].x, linedef.v[0].y, 0);
            lineVec.set(linedef.v[1].x - linedef.v[0].x, linedef.v[1].y - linedef.v[0].y, 0);
            // note: offset and angle are not used
            const partialSeg = { linedef, offset: 0, angle: 0 };

            this.subsectorTrace(lineStart, lineVec, 0, subsec => {
                const intersect = lineBounds(linedef.v, subsec.bounds);
                if (intersect) {
                    const v1 = { x: intersect[0].x, y: intersect[0].y };
                    const v2 = { x: intersect[1].x, y: intersect[1].y };
                    subsec.segs.push({ ...partialSeg, v: [v1, v2], direction: 0 });
                    if (linedef.left) {
                        subsec.segs.push({ ...partialSeg, v: [v2, v1], direction: 1 });
                    }
                }
                return true; // continue to next subsector
            });
        }
        console.timeEnd('map-bin')
    }

    findSubSector(x: number, y: number): SubSector {
        return findSubSector(this.nodes[this.nodes.length - 1], x, y);
    }

    findSector(x: number, y: number): Sector {
        return this.findSubSector(x, y).sector;
    }

    sectorNeighbours(sector: Sector): Sector[] {
        // FIXME: can we use sector.portalSegs here instead? It looks like the same computation
        const sectors = [];
        for (const ld of this.linedefs) {
            if (ld.left) { // two-sided
                if (ld.left.sector === sector) {
                    sectors.push(ld.right.sector);
                }
                if (ld.right.sector === sector) {
                    sectors.push(ld.left.sector);
                }
            }
        }
        return sectors.filter((e, i, arr) => arr.indexOf(e) === i && e !== sector);
    }

    traceRay(p: TraceParams) {
        this.bspTracer(p);
    }

    traceMove(p: TraceParams) {
        this.bspTracer(p);
    }

    traceSubsectors(start: Vector3, move: Vector3, radius: number, onHit: HandleTraceHit<SubSector>) {
        this.subsectorTrace(start, move, radius, onHit);
    }
}

function groupSkySectors(sectors: Sector[]): Sector[][] {
    const toVisit = new Set(sectors.map(s => s.num));
    const visitSector = (sector: Sector, group: Set<Sector>) => {
        if (sector.ceilFlat !== 'F_SKY1' || group.has(sector)) {
            return group;
        }

        group.add(sector);
        toVisit.delete(sector.num);
        for (const seg of sector.portalSegs) {
            visitSector(seg.linedef.right.sector, group);
            visitSector(seg.linedef.left.sector, group);
        }
        return group;
    }

    const groups: Sector[][] = [];
    while (toVisit.size) {
        const sector = sectors.pop();
        if (toVisit.has(sector.num)) {
            groups.push([...visitSector(sector, new Set())]);
        }
    }
    return groups;
}

function aabbLineOverlap(pos: Vector3, radius: number, line: LineDef) {
    const lineMinX = Math.min(line.v[0].x, line.v[1].x);
    const lineMaxX = Math.max(line.v[0].x, line.v[1].x);
    const lineMinY = Math.min(line.v[0].y, line.v[1].y);
    const lineMaxY = Math.max(line.v[0].y, line.v[1].y);
    if (lineMinX === lineMaxX) {
        // aabb hit a horizontal line so return y-axis overlap
        const boxMinY = pos.y - radius;
        const boxMaxY = pos.y + radius;
        return Math.min(boxMaxY, lineMaxY) - Math.max(boxMinY, lineMinY)
    } else if (lineMinY === lineMaxY) {
        // aabb hit a vertical line so return x-axis overlap
        const boxMinX = pos.x - radius;
        const boxMaxX = pos.x + radius;
        return Math.min(boxMaxX, lineMaxX) - Math.max(boxMinX, lineMinX);
    }
    return 0;
}

const _aabbAabbOverlap = { area: 0, axis: 'x' as 'x' | 'y' }
function aabbAabbOverlap(p1: Vector3, r1: number, p2: Vector3, r2: number) {
    const b1MinX = p1.x - r1;
    const b1MaxX = p1.x + r1;
    const b1MinY = p1.y - r1;
    const b1MaxY = p1.y + r1;
    const b2MinX = p2.x - r2;
    const b2MaxX = p2.x + r2;
    const b2MinY = p2.y - r2;
    const b2MaxY = p2.y + r2;
    const dx = Math.min(b1MaxX, b2MaxX) - Math.max(b1MinX, b2MinX);
    const dy = Math.min(b1MaxY, b2MaxY) - Math.max(b1MinY, b2MinY);
    _aabbAabbOverlap.axis = dx > dy ? 'y' : 'x';
    _aabbAabbOverlap.area = Math.max(0, dx * dy);
    return _aabbAabbOverlap
}

export interface TraceParams {
    start: Vector3;
    move: Vector3;
    radius?: number;
    height?: number;
    hitLine?: HandleTraceHit<LineTraceHit>;
    hitFlat?: HandleTraceHit<SectorTraceHit>;
    hitObject?: HandleTraceHit<MapObjectTraceHit>;
}
function createBspTracer(root: TreeNode) {
    const subsectorTrace = createSubsectorTrace(root);
    const nVec = new Vector3();

    const flatHit = (flat: SectorTraceHit['flat'], subsector: SubSector, zFlat: number, params: TraceParams): SectorTraceHit => {
        const u = (zFlat - params.start.z) / params.move.z;
        if (u < 0 || u > 1) {
            return null
        }
        const point = params.start.clone().addScaledVector(params.move, u);
        const inSector = findSubSector(root, point.x, point.y) === subsector;
        if (!inSector) {
            return null;
        }
        return { flat, subsector, point, overlap: 0, fraction: u };
    };

    return (params: TraceParams) => {
        const radius = params.radius ?? 0;
        const allowZeroDot = params.move.x !== 0 || params.move.y !== 0 || params.move.z !== 0;
        let hits: TraceHit[] = [];
        function notify() {
            // sort hits by distance (or by overlap if distance is too close)
            hits.sort((a, b) => {
                const dist = a.fraction - b.fraction;
                return Math.abs(dist) < 0.000001 ? b.overlap - a.overlap : dist;
            });

            let complete = false;
            for (let i = 0; !complete && i < hits.length; i++) {
                const hit = hits[i];
                complete =
                    ('mobj' in hit) ? !params.hitObject(hit) :
                    ('line' in hit) ? !params.hitLine(hit) :
                    ('flat' in hit) ? !params.hitFlat(hit) :
                    // shouldn't get here but...
                    complete;
            }
            hits.length = 0;
            return complete;
        }

        // TODO: since we have a height parameter, I wonder if we should check for top/bottom collisions with walls
        // and things and maybe avoid a few redundant checks? Teleportation, for example, does not check z position and
        // maybe that is desired?
        let firstSubsec = true;
        subsectorTrace(params.start, params.move, radius, subsector => {
            // collide with things
            if (params.hitObject) {
                for (const mobj of subsector.mobjs) {
                    // like wall collisions, we allow the collision if the movement is away from the other mobj
                    nVec.set(params.start.x - mobj.position.x, params.start.y - mobj.position.y, 0);
                    const moveDot = params.move.dot(nVec);
                    // skip collision detection if we are moving away from the other object
                    if (moveDot > 0 || (moveDot === 0 && allowZeroDot)) {
                        continue;
                    }

                    const hit = sweepAABBAABB(params.start, radius, params.move, mobj.position, mobj.info.radius);
                    if (hit) {
                        const point = new Vector3(hit.x, hit.y, params.start.z + params.move.z * hit.u);
                        const ov = aabbAabbOverlap(point, radius, mobj.position, mobj.info.radius);
                        hits.push({ subsector, point, mobj, overlap: ov.area, axis: ov.axis, fraction: hit.u });
                    }
                }
            }

            if (params.hitLine) {
                // collide with walls
                for (const seg of subsector.segs) {
                    // Allow trace to pass through back-to-front. This allows things, like a player, to move away from
                    // a wall if they are stuck as long as they move the same direction as the wall normal. The two sided
                    // line is more complicated but that is handled elsewhere because it impacts movement, not bullets or
                    // other traces.
                    // Doom2's MAP03 starts the player exactly against the wall. Without this, we would be stuck :(
                    nVec.set(seg.v[1].y - seg.v[0].y, seg.v[0].x - seg.v[1].x, 0);
                    const moveDot = params.move.dot(nVec);
                    // NOTE: dot === 0 is special. We allow this only when we are moving
                    // (if we aren't moving, dot will always be 0 and we skip everything)
                    if (moveDot > 0 || (moveDot === 0 && allowZeroDot)) {
                        continue;
                    }

                    const hit = sweepAABBLine(params.start, radius, params.move, seg.v);
                    if (hit) {
                        const side = seg.direction ? 1 : -1;
                        const point = new Vector3(hit.x, hit.y, params.start.z + params.move.z * hit.u);
                        const overlap = aabbLineOverlap(point, radius, seg.linedef);
                        hits.push({ subsector, overlap, point, side, line: seg.linedef, fraction: hit.u });
                    }
                }
            }

            if (params.hitFlat) {
                // collide with floor or ceiling
                const floorHit = params.move.z < 0 && flatHit('floor', subsector, subsector.sector.zFloor, params);
                if (floorHit) {
                    hits.push(floorHit);
                }
                const ceilHit = params.move.z > 0 && flatHit('ceil', subsector, subsector.sector.zCeil - (params.height ?? 0), params);
                if (ceilHit) {
                    hits.push(ceilHit);
                }
            }
            if (params.hitFlat && firstSubsec) {
                // already colliding with a ceiling (like a crusher)
                if (subsector.sector.zCeil - subsector.sector.zFloor - params.height < 0) {
                    const point = params.start.clone().addScaledVector(params.move, 0);
                    hits.push({ flat: 'ceil', subsector, point, overlap: 0, fraction: 0 });
                }
            }

            // always search more than one subsec because we may be on the edge of two
            // so we need to at least look at both (and sort hits) before we notify
            if (firstSubsec) {
                firstSubsec = false;
                return true;
            }
            return !notify();
        });
        notify();
    };
}

function createSubsectorTrace(root: TreeNode) {
    const end = new Vector3();
    const moveBounds = { left: 0, right: 0, top: 0, bottom: 0 };

    return (start: Vector3, move: Vector3, radius: number, onHit: HandleTraceHit<SubSector>) => {
        vecFromMovement(end, start, move, radius);
        moveBounds.left = Math.min(start.x, start.x + move.x) - radius;
        moveBounds.right = Math.max(start.x, start.x + move.x) + radius;
        moveBounds.top = Math.min(start.y, start.y + move.y) - radius;
        moveBounds.bottom = Math.max(start.y, start.y + move.y) + radius;

        let complete = false;
        function visitNode(node: TreeNode | SubSector) {
            if (complete) {
                return;
            }
            if ('segs' in node) {
                // BSP queries always end up in some node (even if we're outside the map)
                // so check and make sure the aabb's overlap
                const missBox = (
                    node.bounds.left > moveBounds.right
                    || node.bounds.right < moveBounds.left
                    || node.bounds.top > moveBounds.bottom
                    || node.bounds.bottom < moveBounds.top);
                if (missBox) {
                    return;
                }

                complete = !onHit(node);
                return;
            }

            // we have three cases really:
            // (1) aabb is on the line so check left AND right (only happens when radius > 0)
            // (2) aabb is on the left or the right.
            //  (a) if start and end are on different sides then check both
            //  (b) else just check the start side
            const point = radius > 0 ? lineAABB(node.v, start, radius, false) : null;
            const side = point ? -1 : Math.sign(signedLineDistance(node.v, start));
            visitNode((side <= 0) ? node.childLeft : node.childRight);
            const eside = Math.sign(signedLineDistance(node.v, end));
            if (point || eside !== side) {
                visitNode((side <= 0) ? node.childRight : node.childLeft);
            }
        }

        visitNode(root);
    };
}

export function vecFromMovement(vec: Vector3, start: Vector3, move: Vector3, radius: number) {
    vec.copy(start).add(move);
    vec.x += Math.sign(move.x) * radius;
    vec.y += Math.sign(move.y) * radius;
    return vec;
}

const _findVec = new Vector3();
function findSubSector(root: TreeNode, x: number, y: number) {
    _findVec.set(x, y, 0);
    let node: TreeNode | SubSector = root;
    while (true) {
        if ('segs' in node) {
            return node;
        }
        const side = signedLineDistance(node.v, _findVec);
        node = side <= 0 ? node.childLeft : node.childRight;
    }
}

function completeSubSectors(root: TreeNode, subsectors: SubSector[]) {
    let bspLines = [];

    function visitNodeChild(child: TreeNode | SubSector) {
        if ('segs' in child) {
            child.vertexes = subsectorVerts(child.segs, bspLines);
            child.bspLines = [...bspLines];
            // originally I was going to use the TreeNode bounds (boundsLeft/boundsRight) but those bounds don't
            // include the implicit edges from bsp lines so the boxes aren't right. It's easy to compute bounds from
            // a set of vertexes anyway
            child.bounds = computeBounds(child.vertexes);
        } else {
            visitNode(child);
        }
    }

    function visitNode(node: TreeNode) {
        bspLines.push(node.v);
        visitNodeChild(node.childLeft);
        bspLines.pop();

        bspLines.push([node.v[1], node.v[0]]);
        visitNodeChild(node.childRight);
        bspLines.pop();
    }

    visitNode(root);
    // must be done after visiting all the subsectors because that fills in the initial implicit vertexes
    subsectors.forEach(subsec => addExtraImplicitVertexes(subsec, createSubsectorTrace(root)));
}

function subsectorVerts(segs: Seg[], bspLines: Vertex[][]) {
    // explicit points
    let verts = segs.map(e => e.v).flat();

    // implicit points requiring looking at bsp lines that cut this subsector. It took me a while to figure this out.
    // Here are some helpful links:
    // - https://www.doomworld.com/forum/topic/105730-drawing-flats-from-ssectors/
    // - https://www.doomworld.com/forum/topic/50442-dooms-floors/
    // - https://doomwiki.org/wiki/Subsector
    //
    // This source code below was particularly helpful and I implemented something quite similar:
    // https://github.com/cristicbz/rust-doom/blob/6aa7681cee4e181a2b13ecc9acfa3fcaa2df4014/wad/src/visitor.rs#L670
    // NOTE: because we've "fixed" vertexes, we can use very low constants to compare insideBsp and insideSeg
    let segLines = segs.map(e => e.v);
    for (let i = 0; i < bspLines.length - 1; i++) {
        for (let j = i; j < bspLines.length; j++) {
            let point = lineLineIntersect(bspLines[i], bspLines[j]);
            if (!point) {
                continue;
            }

            // The intersection point must lie both within the BSP volume and the segs volume.
            // the constants here are a little bit of trial and error but E1M1 had a
            // couple of subsectors in the zigzag room that helped and E3M6.
            // Also Doom2 MAP29, Plutonia MAP25. There is still a tiny gap in Doom2 MAP25 though...
            let insideBsp = bspLines.map(l => signedLineDistance(l, point)).every(dist => dist <= .1);
            let insideSeg = segLines.map(l => signedLineDistance(l, point)).every(dist => dist >= -500);
            if (insideBsp && insideSeg) {
                verts.push({ x: point.x, y: point.y, implicitLines: [bspLines[i], bspLines[j]] } as any);
            }
        }
    }

    const maxDist = .2;
    // remove vertexes that are "similar"
    verts = verts.filter((v, i, arr) => arr.findIndex(e => Math.abs(e.x - v.x) < maxDist && Math.abs(e.y - v.y) < maxDist) === i);
    return centerSort(verts);
}

function fixVertexes(
    vertexes: Vertex[],
    lineDefData: Lump,
    segData: Lump,
) {
    let segVerts = new Set(Array(vertexes.length).keys());
    const numLinedefs = lineDefData.data.length / 14;
    for (let i = 0; i < numLinedefs; i++) {
        segVerts.delete(word(lineDefData.data, 0 + i * 14));
        segVerts.delete(word(lineDefData.data, 2 + i * 14));
    }

    // Doom vertexes are integers so segs from integers can't always be on the line. These "fixes" are mostly
    // about taking seg vertices that are close to a linedef but not actually on the linedef. Once we put them on
    // the linedef, they don't always intersect with the bsp lines so we correct them again later
    // (see addExtraImplicitVertexes()).
    const numSegs = segData.data.length / 12;
    for (let i = 0; i < numSegs; i++) {
        const v0 = word(segData.data, 0 + i * 12);
        const v1 = word(segData.data, 2 + i * 12);
        if (!segVerts.has(v0) && !segVerts.has(v1)) {
            continue;
        }

        const ld = word(segData.data, 6 + i * 12);
        const ldv0 = word(lineDefData.data, 0 + ld * 14);
        const ldv1 = word(lineDefData.data, 2 + ld * 14);
        const line = [vertexes[ldv0], vertexes[ldv1]];

        const vx0 = vertexes[v0];
        if (segVerts.has(v0) && !pointOnLine(vx0, line)) {
            vertexes[v0] = closestPoint(line, vx0);
        }

        const vx1 = vertexes[v1];
        if (segVerts.has(v1) && !pointOnLine(vx1, line)) {
            vertexes[v1] = closestPoint(line, vx1);
        }
    }
}

const distSqr = (a: Vertex, b: Vertex) => (b.x - a.x) * (b.x - a.x) + (b.y - a.y) * (b.y - a.y);

const _vec = new Vector3();
function addExtraImplicitVertexes(subsector: SubSector, tracer: ReturnType<typeof createSubsectorTrace>) {
    // Because of corrections in fixVertxes(), we have to realign some points to the bsp lines (eg. sector 92 in E1M5,
    // 6 in E1M4, several in sector 7 in E1M7, sector 109 in E4M2). E3M2 has several lines that aren't right, even without
    // the correctsion from fixVertexes() (eg. near big brown tree in sector 60, near sector 67).
    // There are probably more in other maps but this is what I've found so far.
    //
    // This whole thing is a kludge though.
    //
    // This function adjusts the vertexes of each subsector such that they are touching the edges of other subsectors.
    // There is a still a spot in sector 31 of E3M2 that isn't fixed by this because those vertexes are not implicit
    // vertexes. Other than E3M2, adding these vertices fixes all other places I could find (although I assume that
    // if there is one defect in E3M2, there are others in other maps that I just didn't find).
    for (const vert of subsector.vertexes) {
        if (!('implicitLines' in vert)) {
            continue;
        }

        const bspLines = vert.implicitLines as Vertex[][];
        _vec.set(vert.x, vert.y, 0);
        tracer(_vec, zeroVec, 5, subs => {
            if (subs === subsector) {
                return true; // skip this subsector
            }

            const edges = [];
            edges.push([subs.vertexes[0], subs.vertexes[subs.vertexes.length - 1]]);
            for (let i = 1; i < subs.vertexes.length; i++) {
                edges.push([subs.vertexes[i - 1], subs.vertexes[i]]);
            }

            const onEdge = edges.reduce((on, line) => on || pointOnLine(vert, line), false);
            if (onEdge) {
                return true; // vertex is already on the edge of a neighbour subsector so we're all good
            }

            // vertex is not on the edge of a neighbour subsector so find the closest point (at most 2px away) that is on both the bsp and sub sector line
            let dist = 4;
            let closest = { x: 0, y: 0 };
            for (const edge of edges) {
                for (const bspLine of bspLines) {
                    const p = lineLineIntersect(bspLine, edge);
                    if (!p || !pointOnLine(p, edge)) {
                        continue;
                    }
                    const d = distSqr(p, vert);
                    if (d > 0 && d < dist) {
                        dist = d;
                        closest.x = p.x;
                        closest.y = p.y;
                    }
                }
            }
            // if we've found a point, add it
            if (dist < 4) subsector.vertexes.push(closest);
            return true;
        });
    }

    // re-update subsector vertexes but don't merge any additional points added above
    subsector.vertexes = centerSort(subsector.vertexes);
}

function computeBounds(verts: Vertex[], allowLinearBounds = false): Bounds {
    let left = Infinity;
    let right = -Infinity;
    let top = Infinity;
    let bottom = -Infinity;
    for (let v of verts) {
        left = Math.min(left, v.x);
        right = Math.max(right, v.x);
        top = Math.min(top, v.y);
        bottom = Math.max(bottom, v.y);
    }

    const linearBounds = (left - right === 0 || top - bottom === 0);
    if (linearBounds && !allowLinearBounds) {
        // E4M7 (around sectors 78-87 at least) and several plutonia and tnt maps have bounds where one dimension is 0.
        // These bounds get even more messed up with the implicit vertices added by subsectorVerts so exclude them
        // and recompute the bounds
        return computeBounds(verts.filter(e => !('implicitLines' in e)), true);
    }
    return { left, right, top, bottom };
}

function sectorMiddle(sector: Sector, subsectors: SubSector[]) {
    let mid = { x: 0, y: 0 };
    let vcount = 0;
    for (const sub of subsectors) {
        if (sub.sector !== sector) {
            continue;
        }

        for (const v of sub.vertexes) {
            vcount += 1;
            mid.x += v.x;
            mid.y += v.y;
        }
    }
    if (!vcount) {
        return mid;
    }
    mid.x /= vcount;
    mid.y /= vcount;
    return mid;
}