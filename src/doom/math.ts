export const HALF_PI = Math.PI / 2;
export const QUARTER_PI = Math.PI / 4;
export const EIGHTH_PI = Math.PI / 8;
export const ToRadians = Math.PI / 180;
export const ToDegrees = 180 / Math.PI;

export const ticksPerSecond = 35;
export const tickTime = 1 / ticksPerSecond;

export interface Vertex {
    x: number;
    y: number;
}
const dot = (a: Vertex, b: Vertex) => a.x * b.x + a.y * b.y;

export const xyDistSqr = (v1: Vertex, v2: Vertex) => {
    const dx = v2.x - v1.x;
    const dy = v2.y - v1.y;
    return dx * dx + dy * dy;
}

export interface Bounds {
    top: number;
    left: number;
    bottom: number;
    right: number;
}

interface IntersectionPoint extends Vertex {
    u: number; // distance from point1 to point2 of the impact (0-1)
}

// straight outta m_random.c. It's just not doom without it.
// Note we don't have an equivalent for M_Random(). M_Random() is used for UI effects
// and we use Math.random() for those.
const rngTable = [
    0,   8, 109, 220, 222, 241, 149, 107,  75, 248, 254, 140,  16,  66 ,
    74,  21, 211,  47,  80, 242, 154,  27, 205, 128, 161,  89,  77,  36 ,
    95, 110,  85,  48, 212, 140, 211, 249,  22,  79, 200,  50,  28, 188 ,
    52, 140, 202, 120,  68, 145,  62,  70, 184, 190,  91, 197, 152, 224 ,
    149, 104,  25, 178, 252, 182, 202, 182, 141, 197,   4,  81, 181, 242 ,
    145,  42,  39, 227, 156, 198, 225, 193, 219,  93, 122, 175, 249,   0 ,
    175, 143,  70, 239,  46, 246, 163,  53, 163, 109, 168, 135,   2, 235 ,
    25,  92,  20, 145, 138,  77,  69, 166,  78, 176, 173, 212, 166, 113 ,
    94, 161,  41,  50, 239,  49, 111, 164,  70,  60,   2,  37, 171,  75 ,
    136, 156,  11,  56,  42, 146, 138, 229,  73, 146,  77,  61,  98, 196 ,
    135, 106,  63, 197, 195,  86,  96, 203, 113, 101, 170, 247, 181, 113 ,
    80, 250, 108,   7, 255, 237, 129, 226,  79, 107, 112, 166, 103, 241 ,
    24, 223, 239, 120, 198,  58,  60,  82, 128,   3, 184,  66, 143, 224 ,
    145, 224,  81, 206, 163,  45,  63,  90, 168, 114,  59,  33, 159,  95 ,
    28, 139, 123,  98, 125, 196,  15,  70, 194, 253,  54,  14, 109, 226 ,
    71,  17, 161,  93, 186,  87, 244, 138,  20,  52, 123, 251,  26,  36 ,
    17,  46,  52, 231, 232,  76,  31, 221,  84,  37, 216, 165, 212, 106 ,
    197, 242,  98,  43,  39, 175, 254, 145, 190,  84, 118, 222, 187, 136 ,
    120, 163, 236, 249
]
// We want numbers from [0, 1)
.map(e => e / 256);
export interface RNG {
    // Real number in range [0, 1)
    real(): number;
    // Real number in range (-1, 1)
    real2(): number;
    // Integer bewteen min and max
    int(min: number, max: number): number;
    choice(list: any[]): any;
    angleNoise(shiftBits: number): number;
}

export class TableRNG implements RNG {
    private index = 0;

    real() {
        this.index = (this.index + 1) & 0xff;
        return rngTable[this.index];
    }

    real2() {
        return (this.real() - this.real());
    }

    int(min: number, max: number) {
        return Math.floor(this.real() * (max - min + 1)) + min;
    }

    choice(list: any[]) {
        return list[this.int(0, list.length - 1)];
    }

    angleNoise(shiftBits: number) {
        return this.real2() * circleAngle * (1 << shiftBits)
    }
}

export class ComputedRNG implements RNG {
    real = Math.random;
    real2 = () => Math.random() - Math.random();
    int = randInt;
    choice = (list: any[]) => list[randInt(0, list.length - 1)];
    angleNoise = (shiftBits: number) => (Math.random() - Math.random()) * circleAngle * (1 << shiftBits);
}

export const randInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;

// It took me a while to figure out how angles are randomized in DOOM.
// 360/8192 (ie. 1<<13) is key. (1<<shiftBbits) / (1<<19) accounts for the angle size
// (like pistol has less randomness than invisibility) and the whole thing is multiplied by
// a random number in the range -255 to 255. https://doomwiki.org/wiki/Angle
const circleAngle = 255 * 360 / (1 << 13) / (1 << 19) * ToRadians;

// very cool! https://stackoverflow.com/questions/25582882
// random numbers on a normal distribution
export function randomNorm(min, max, skew) {
    let u = 0, v = 0;
    while(u === 0) u = Math.random() //Converting [0,1) to (0,1)
    while(v === 0) v = Math.random()

    let num = Math.sqrt( -2.0 * Math.log( u ) ) * Math.cos( 2.0 * Math.PI * v )
    num = num / 10.0 + 0.5 // Translate to 0 -> 1
    if (num > 1 || num < 0) {
        num = randomNorm(min, max, skew) // resample between 0 and 1 if out of range
    } else {
        num = Math.pow(num, skew) // Skew
        num *= max - min // Stretch to fill range
        num += min // offset to min
    }
    return num
}

export function signedLineDistance(l: Line, v: Vertex) {
    // https://math.stackexchange.com/questions/274712
    // https://www.xarg.org/book/linear-algebra/2d-perp-product/
    return (v.x - l[0].x) * (l[1].y - l[0].y) - (v.y - l[0].y) * (l[1].x - l[0].x)
}

// more memory efficient to not allocate new objects all the time
const lineLineIntersectionDetails = {
    x: 0, y: 0,
    u: 0, v: 0,
    inBounds: function() {
        return !(this.v < 0 || this.v > 1 || this.u < 0 || this.u > 1);
    }
}
function lineLineIntersectDetailed(l1: Line, l2: Line): typeof lineLineIntersectionDetails {
    // fantastic article https://observablehq.com/@toja/line-box-intersection
    // wikipidia was helpful too https://en.wikipedia.org/wiki/Line%E2%80%93line_intersection#Given_two_points_on_each_line_segment
    const x1x2 = l1[0].x - l1[1].x, y1y2 = l1[0].y - l1[1].y,
        x1x3 = l1[0].x - l2[0].x, y1y3 = l1[0].y - l2[0].y,
        x3x4 = l2[0].x - l2[1].x, y3y4 = l2[0].y - l2[1].y;

    const d =  x1x2 * y3y4 - y1y2 * x3x4;
    // parallel or coincident
    if (d === 0) {
        return undefined;
    }

    lineLineIntersectionDetails.u = (x1x3 * y3y4 - y1y3 * x3x4) / d;
    lineLineIntersectionDetails.v = -(x1x2 * y1y3 - y1y2 * x1x3) / d;
    lineLineIntersectionDetails.x = l1[0].x + lineLineIntersectionDetails.u * (l1[1].x - l1[0].x);
    lineLineIntersectionDetails.y = l1[0].y + lineLineIntersectionDetails.u * (l1[1].y - l1[0].y);
    return lineLineIntersectionDetails;
}

export function lineLineIntersect(l1: Line, l2: Line, bounded = false): IntersectionPoint {
    const details = lineLineIntersectDetailed(l1, l2);
    return (!details || (bounded && !details.inBounds()))
        ? undefined : details;
}


export function pointOnLine(p: Vertex, l: Line) {
    const sd = signedLineDistance(l, p);
    return (
        sd > -0.00001 && sd < 0.00001 &&
        Math.min(l[0].x, l[1].x) <= p.x && p.x <= Math.max(l[0].x, l[1].x) &&
        Math.min(l[0].y, l[1].y) <= p.y && p.y <= Math.max(l[0].y, l[1].y)
    );
}

export function closestPoint(l: Line, p: Vertex): Vertex {
    let A1 = l[1].y - l[0].y;
    let B1 = l[0].x - l[1].x;
    let det = A1 * A1 + B1 * B1;
    if (det === 0) {
        return p;
    } else {
        let C1 = A1 * l[0].x + B1 * l[0].y;
        let C2 = -B1 * p.x + A1 * p.y;
        return {
            x: (A1 * C1 - B1 * C2) / det,
            y: (A1 * C2 + B1 * C1) / det,
        };
    }
}

export function centerSort(verts: Vertex[]) {
    // sort points in CCW order https://stackoverflow.com/questions/6989100
    let center = { x: 0, y: 0 };
    for (const v of verts) {
        center.x += v.x;
        center.y += v.y;
    }
    center.x /= verts.length;
    center.y /= verts.length;

    return verts
        .sort((a, b) => {
            let acx = a.x - center.x, bcx = b.x - center.x,
                acy = a.y - center.y, bcy = b.y - center.y;
            if (acx >= 0 && bcx < 0) return -1;
            if (acx < 0 && bcx >= 0) return 1;
            if (acx == 0 && bcx == 0) {
                return (acy >= 0 || bcy >= 0) ? b.y - a.y : a.y - b.y;
            }

            // cross product
            let det = acx * bcy - bcx * acy;
            if (det < 0) {
                return -1;
            } else if (det > 0) {
                return 1;
            }
            // sort by distance to center
            let d1 = acx * acx + acy * acy;
            let d2 = bcx * bcx + bcy * bcy;
            return d1 - d2;
        });
}

const PIx2 = Math.PI * 2;
// Angle between 0 and 2PI
// https://stackoverflow.com/questions/2320986
export const normalizeAngle = (angle: number) => Math.PI + angle - (Math.floor((angle + Math.PI) / PIx2)) * PIx2;

const _sweepZeroLine: Line = [
    { x: 0, y: 0 },
    { x: 0, y: 0 },
]
const _sweepVec = { x: 0, y: 0, u: 0 };
const _sweepLineNormal = { x: 0, y: 0 };
export function sweepAABBLine(position: Vertex, radius: number, velocity: Vertex, line: Line): IntersectionPoint {
    // adaptaion of the code from this question:
    // https://gamedev.stackexchange.com/questions/29479

    if (radius < 0.001) {
        // when AABB "radius" is 0, we are basically testing a line from position to position+velocity against another
        // line so do that test instead because this one gets some rounding errors when radius is 0.
        _sweepZeroLine[0].x = position.x;
        _sweepZeroLine[0].y = position.y;
        _sweepZeroLine[1].x = position.x + velocity.x;
        _sweepZeroLine[1].y = position.y + velocity.y;
        return lineLineIntersect(_sweepZeroLine, line, true) as any;
    }

    // form an AABB using position and radius
    const boxMinX = position.x - radius;
    const boxMaxX = position.x + radius;
    const boxMinY = position.y - radius;
    const boxMaxY = position.y + radius;

    _sweepLineNormal.x = line[0].y - line[1].y;
    _sweepLineNormal.y = line[1].x - line[0].x;
    let invVelProj = 1 / dot(velocity, _sweepLineNormal); //projected Velocity to N
    _sweepVec.x = line[0].x - position.x;
    _sweepVec.y = line[0].y - position.y;
    let boxProj = dot(_sweepVec, _sweepLineNormal); //projected Line distance to N

    let r = radius * Math.abs(_sweepLineNormal.x) + radius * Math.abs(_sweepLineNormal.y); //radius to Line
    if (invVelProj < 0) {
        r = -r;
    }

    let hitTime = Math.max((boxProj - r) * invVelProj, 0);
    let outTime = Math.min((boxProj + r) * invVelProj, 1);

    // X axis overlap
    const lineMinX = Math.min(line[0].x, line[1].x);
    const lineMaxX = Math.max(line[0].x, line[1].x);
    if (velocity.x < 0) { // Sweep left
        if (boxMaxX < lineMinX) { return null; }
        hitTime = Math.max((lineMaxX - boxMinX) / velocity.x, hitTime);
        outTime = Math.min((lineMinX - boxMaxX) / velocity.x, outTime);
    } else if (velocity.x > 0) { // Sweep right
        if (boxMinX > lineMaxX) { return null; }
        hitTime = Math.max((lineMinX - boxMaxX) / velocity.x, hitTime);
        outTime = Math.min((lineMaxX - boxMinX) / velocity.x, outTime);
    } else {
        if (lineMinX > boxMaxX || lineMaxX < boxMinX) { return null; }
    }

    // Y axis overlap
    const lineMinY = Math.min(line[0].y, line[1].y);
    const lineMaxY = Math.max(line[0].y, line[1].y);
    if (velocity.y < 0) { // Sweep down
        if (boxMaxY < lineMinY) { return null; }
        hitTime = Math.max((lineMaxY - boxMinY) / velocity.y, hitTime);
        outTime = Math.min((lineMinY - boxMaxY) / velocity.y, outTime);
    } else if (velocity.y > 0) { // Sweep up
        if (boxMinY > lineMaxY) { return null; }
        hitTime = Math.max((lineMinY - boxMaxY) / velocity.y, hitTime);
        outTime = Math.min((lineMaxY - boxMinY) / velocity.y, outTime);
    } else {
        if (lineMinY > boxMaxY || lineMaxY < boxMinY) { return null; }
    }

    if (hitTime > outTime) {
        return null;
    }

    // collision happened, return point of impact
    _sweepVec.x = position.x + velocity.x * hitTime;
    _sweepVec.y = position.y + velocity.y * hitTime;
    _sweepVec.u = hitTime;
    return _sweepVec;
}

let _sweepAABB = { x: 0, y: 0, u: 0 };
export function sweepAABBAABB(
    p1: Vertex, r1: number, v1: Vertex,
    p2: Vertex, r2: number,
    bounded = true,
): IntersectionPoint {
    // TODO: is there a way to unify this and lineBounds? Seems like it would be nice.

    // test if already overlapping
    const left = (p2.x - r2) - (p1.x + r1);
    const right = (p2.x + r2) - (p1.x - r1);
    const top = (p2.y + r2) - (p1.y - r1);
    const bottom = (p2.y - r2) - (p1.y + r1);
    if (left < 0 && right > 0 && top > 0 && bottom < 0) {
        _sweepAABB.x = p1.x;
        _sweepAABB.y = p1.y;
        _sweepAABB.u = 0;
        return _sweepAABB;
    }

    // test sweeping aabb (based on https://www.amanotes.com/post/using-swept-aabb-to-detect-and-process-collision)
    const dxEntry = (v1.x < 0) ? right : left;
    const dxExit = (v1.x < 0) ? left : right;
    const dyEntry = (v1.y < 0) ? top : bottom;
    const dyExit = (v1.y < 0) ? bottom : top;

    const txEntry = dxEntry / v1.x;
    const txExit = dxExit / v1.x;
    const tyEntry = dyEntry / v1.y;
    const tyExit = dyExit / v1.y;
    const tEntry = Math.max(txEntry, tyEntry);
    const tExit = Math.min(txExit, tyExit);
    if (tEntry > tExit) {
        return null;
    }
    if (bounded && ((txEntry < 0 && tyEntry < 0) || txEntry > 1 || tyEntry > 1)) {
        return null;
    }

    _sweepAABB.x = p1.x + v1.x * tEntry;
    _sweepAABB.y = p1.y + v1.y * tEntry;
    _sweepAABB.u = tEntry;
    return _sweepAABB;
}

let _lineAABB2 = [
    { x: 0, y: 0, u: 0 },
    { x: 0, y: 0, u: 0 },
];
export function lineBounds(line: Line, bounds: Bounds) {
    // hmmm.. this function is very similar to sweepAABBAABB.. maybe we can combine them?
    const left = bounds.left - line[0].x;
    const right = bounds.right - line[0].x;
    const top = bounds.top - line[0].y;
    const bottom = bounds.bottom - line[0].y;
    const vx = line[1].x - line[0].x;
    const vy = line[1].y - line[0].y;

    // test sweeping aabb (based on https://www.amanotes.com/post/using-swept-aabb-to-detect-and-process-collision)
    const dxEntry = (vx < 0) ? right : left;
    const dxExit = (vx < 0) ? left : right;
    const dyEntry = (vy < 0) ? bottom : top;
    const dyExit = (vy < 0) ? top : bottom;

    const txEntry = dxEntry / vx;
    const txExit = dxExit / vx;
    const tyEntry = dyEntry / vy;
    const tyExit = dyExit / vy;
    let tEntry =
        isNaN(txEntry) ? tyEntry :
        isNaN(tyEntry) ? txEntry :
        Math.max(txEntry, tyEntry);
    let tExit =
        isNaN(txExit) ? tyExit :
        isNaN(tyExit) ? txExit :
        Math.min(txExit, tyExit);
    if (tEntry > tExit || tExit < 0 || tEntry > 1) {
        return null;
    }

    tEntry = Math.max(0, tEntry);
    tExit = Math.min(1, tExit);
    _lineAABB2[0].x = line[0].x + vx * tEntry;
    _lineAABB2[0].y = line[0].y + vy * tEntry;
    _lineAABB2[0].u = tEntry;
    _lineAABB2[1].x = line[0].x + vx * tExit;
    _lineAABB2[1].y = line[0].y + vy * tExit;
    _lineAABB2[1].u = tExit;
    return _lineAABB2;
}

let _lineAABB = { x: 0, y: 0 };
export function lineAABB(line: Line, pos: Vertex, radius: number, bounded = true) {
    _lineAABB.x = line[1].x - line[0].x;
    _lineAABB.y = line[1].y - line[0].y;
    // we can get lineAABB using sweep and setting the box radius to 0
    return sweepAABBAABB(line[0], 0, _lineAABB, pos, radius, bounded);
}

export type Line = [Vertex, Vertex];
const decimal = (n: number) => (n % 1) + (n < 0 ? 1 : 0);
// Classic algorithm http://www.cse.yorku.ca/~amana/research/grid.pdfs
export class AmanatidesWooTrace {
    private hasMovement = false;
    private vox: Vertex = { x: 0, y: 0 };
    private tMax: Vertex = { x: 0, y: 0 };
    private tDelta: Vertex = { x: 0, y: 0 };
    private voxChange: Vertex = { x: 0, y: 0 };

    constructor(
        private boundsLeft: number,
        private boundsBottom: number,
        private gridSize: number,
        private numRows: number,
        private numCols: number,
    ) {}

    initFromLine(line: Line) {
        return this.init(line[0].x, line[0].y, { x: line[1].x - line[0].x, y: line[1].y - line[0].y });
    }

    init(x: number, y: number, vel: Vertex) {
        this.voxChange.x = Math.sign(vel.x);
        this.voxChange.y = Math.sign(vel.y);
        this.hasMovement = !(this.voxChange.x === 0 && this.voxChange.y === 0)
        // See https://stackoverflow.com/questions/12367071
        const startX = (x - this.boundsLeft) / this.gridSize;
        const startY = (y - this.boundsBottom) / this.gridSize;
        this.vox.x = Math.floor(startX);
        this.vox.y = Math.floor(startY);
        if (!this.hasMovement) {
            return this.vox;
        }

        this.tDelta.x = Math.abs(this.gridSize / vel.x);
        this.tDelta.y = Math.abs(this.gridSize / vel.y);
        this.tMax.x = this.tDelta.x * (vel.x < 0 ? decimal(startX) : 1 - decimal(startX));
        this.tMax.y = this.tDelta.y * (vel.y < 0 ? decimal(startY) : 1 - decimal(startY));
        return this.vox;
    }

    private complete() {
        const inBounds = this.vox.x >= 0 && this.vox.x <= this.numCols && this.vox.y >= 0 && this.vox.y <= this.numRows;
        const atEnd = (this.tMax.x > 1 && this.tMax.y > 1);
        return !this.hasMovement || !inBounds || atEnd;
    }

    step() {
        if (this.complete()) {
            return null;
        }
        if (this.tMax.x < this.tMax.y) {
            this.tMax.x += this.tDelta.x;
            this.vox.x += this.voxChange.x;
        } else {
            this.tMax.y += this.tDelta.y;
            this.vox.y += this.voxChange.y;
        }
        return this.vox;
    }
}
