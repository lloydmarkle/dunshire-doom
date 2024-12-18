import { BufferGeometry, ClampToEdgeWrapping, Color, DataTexture, NearestFilter, RepeatWrapping, SRGBColorSpace, Shape, ShapeGeometry, type Texture } from "three";
import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import {
    type DoomWad,
    type SubSector,
    type Sector,
    type Vertex,
    type LineDef,
    pointOnLine,
    type Store,
    type MapObject,
    type MapRuntime,
    store,
    MFFlags,
} from "../doom";
import { sineIn } from 'svelte/easing';
import { derived, readable, type Readable } from "svelte/store";

// all flats (floors/ceilings) are 64px
const flatRepeat = 1 / 64;

export const namedColor = (n: number) => Object.values(Color.NAMES)[n % Object.keys(Color.NAMES).length];

export class MapTextures {
    private cache = new Map<string, Texture>();
    private lightCache = new Map<number, Color>;

    constructor(readonly wad: DoomWad) {
        const maxLight = 255;
        for (let i = 0; i < maxLight + 1; i++) {
            // scale light using a curve to make it look more like doom
            const light = Math.floor(sineIn(i / maxLight) * maxLight);
            this.lightCache.set(i, new Color(light | light << 8 | light << 16));
        }
    }

    get(name: string, type: 'wall' | 'flat' | 'sprite') {
        const cacheKey = type[0] + name;
        let texture = this.cache.get(cacheKey);
        if (texture === undefined && name) {
            const loadFn = type === 'wall' ? 'wallTextureData' :
                type === 'flat' ? 'flatTextureData' :
                'spriteTextureData';
            const data = this.wad[loadFn](name);
            if (data) {
                const buffer = new Uint8ClampedArray(data.width * data.height * 4);
                data.toBuffer(buffer);
                texture = new DataTexture(buffer, data.width, data.height)
                texture.wrapS = RepeatWrapping;
                texture.wrapT = RepeatWrapping;
                texture.magFilter = NearestFilter;
                texture.flipY = true;
                texture.needsUpdate = true;
                texture.colorSpace = SRGBColorSpace;
                texture.userData = {
                    width: data.width,
                    height: data.height,
                    xOffset: data.xOffset,
                    yOffset: data.yOffset,
                    invWidth: 1 / data.width,
                    invHeight: 1 / data.height,
                }

                if (type === 'sprite') {
                    // don't wrap sprites
                    texture.wrapS = ClampToEdgeWrapping;
                    texture.wrapT = ClampToEdgeWrapping;
                }

                if (type === 'flat') {
                    // flats don't need extra positioning (because doom floors are aligned to grid)
                    // so configure the texture here so we don't need to clone to set offset
                    texture.repeat.set(flatRepeat, flatRepeat);
                }
            } else {
                texture = null;
            }
            this.cache.set(cacheKey, texture);
        }
        if (!texture) {
            console.warn('missing', type, name, type)
        }
        return texture;
    }

    lightColor(light: number) {
        return this.lightCache.get(Math.max(0, Math.min(255, Math.floor(light))));
    }
}

export interface ExtraFlat {
    flat: Store<string>;
    lightSector: Sector;
    z: Store<number>;
    ceil: boolean;
    geometry: BufferGeometry;
}
export interface RenderSector {
    visible: Store<boolean>;
    sector: Sector;
    subsectors: SubSector[];
    linedefs: LineDef[];
    geometry: BufferGeometry;
    extraFlats: ExtraFlat[];
    zHackFloor: Readable<number>;
    zHackCeil: Readable<number>;
    flatLighting: Store<number>;
    mobjs: Store<Set<MapObject>>;
}

// Hmm... if we get rid of R1, perhaps we could merge this logic into GeometryBuilder? It seems related.
export function buildRenderSectors(wad: DoomWad, mapRuntime: MapRuntime) {
    console.time('b-rs')
    // WOW! There are so many nifty rendering (and gameplay) tricks out there:
    // https://www.doomworld.com/forum/topic/52921-thread-of-vanilla-mapping-tricks/
    // https://www.doomworld.com/vb/thread/74354
    // https://www.doomworld.com/vb/thread/103009
    // https://www.doomworld.com/tutorials/regintro.php
    // Not sure how many I actually want to implement...
    const map = mapRuntime.data;

    // these maps that sort data by sector make an order of magnitude difference for large maps,
    // like sunder or map05 of cosmogensis. On my machine, time drops from 5-8s to 300-400ms.
    const subsectMap = new Map<Sector, SubSector[]>();
    map.nodes.forEach(node => {
        if ('segs' in node.childLeft) {
            const list = subsectMap.get(node.childLeft.sector) ?? [];
            list.push(node.childLeft);
            subsectMap.set(node.childLeft.sector, list);
        }
        if ('segs' in node.childRight) {
            const list = subsectMap.get(node.childRight.sector) ?? [];
            list.push(node.childRight);
            subsectMap.set(node.childRight.sector, list);
        }
    });
    const sectorRightLindefs = new Map<Sector, LineDef[]>();
    const sectorLeftLindefs = new Map<Sector, LineDef[]>();
    map.linedefs.filter(ld => {
        const right = sectorRightLindefs.get(ld.right.sector) ?? [];
        right.push(ld);
        sectorRightLindefs.set(ld.right.sector, right);

        if (ld.left) {
            const left = sectorLeftLindefs.get(ld.left.sector) ?? [];
            left.push(ld);
            sectorLeftLindefs.set(ld.left.sector, left);
        }
    });

    let selfReferencing: RenderSector[] = [];
    let secMap = new Map<Sector, RenderSector>();
    let rSectors: RenderSector[] = [];
    for (const sector of map.sectors) {
        const subsectors = subsectMap.get(sector) ?? [];
        const geos = subsectors.map(subsec => createShape(subsec.vertexes)).filter(e => e);
        // E3M2 (maybe other maps) have sectors with no subsectors and therefore no vertexes. Odd.
        const geometry = geos.length ? BufferGeometryUtils.mergeGeometries(geos) : null;
        if (geometry) {
            geometry.computeBoundingBox();
            sector.zFloor.subscribe(floor => geometry.boundingBox.min.z = floor);
            sector.zCeil.subscribe(ceil => geometry.boundingBox.max.z = ceil);
        }
        const linedefs = sectorRightLindefs.get(sector) ?? [];
        const zHackCeil = readable(0);
        const zHackFloor = readable(0);
        const flatLighting = sector.light;
        const visible = store(true)
        const mobjs = store(new Set<MapObject>());
        const extraFlats = [];
        const renderSector: RenderSector = { visible, sector, subsectors, geometry, linedefs, zHackFloor, zHackCeil, flatLighting, mobjs, extraFlats };
        rSectors.push(renderSector);
        secMap.set(renderSector.sector, renderSector);

        // fascinating little render hack: self-referencing sector. Basically a sector where all lines are two-sided
        // and both sides refer to the same sector. For doom, that sector would be invisible but the renderer fills in the
        // floor and ceiling gaps magically. We can see the effect in Plutonia MAP02 (invisible bridge), MAP24 (floating cages),
        // MAP28 (brown sewage) and TNT MAP02 where the backpack is in "deep water".
        // https://doomwiki.org/wiki/Making_a_self-referencing_sector
        // https://doomwiki.org/wiki/Making_deep_water
        const leftlines = sectorLeftLindefs.get(sector) ?? [];
        const selfref = leftlines.length === linedefs.length && leftlines.every(ld => ld.right.sector === sector);
        if (selfref && geometry) {
            selfReferencing.push(renderSector);
        }

        // floor hack (TNT MAP18): if the floors are unequal, and it's not a closed door/lift, and no front/back lower textures,
        // then we want to draw a floor at the height of the higher sector (like deep water). We can see this in the room
        // where revenants are in the floor or the exit room with the cyberdemon and brown sludge below the floating marble slabs
        const bothLindefs = [...leftlines, ...linedefs];
        const unequalFloorNoLowerTexture = (ld: LineDef) => ld.left &&
                (ld.right.sector.zFloor.val !== ld.left.sector.zFloor.val
                && !ld.left.lower.val && !ld.right.lower.val
                // skip over closed doors and raised platforms
                && ld.right.sector.zFloor.val !== ld.right.sector.zCeil.val
                && ld.left.sector.zFloor.val !== ld.left.sector.zCeil.val);
        const fakeFloorLines = bothLindefs.filter(unequalFloorNoLowerTexture);
        // If there is only one linedef... we'll just not add the fake floor and hope it's okay.
        // I've seen this done as a mapping trick to reference an unreachable sector
        if (fakeFloorLines.length && bothLindefs.every(ld => ld.left)) {
            for (const line of fakeFloorLines) {
                let zSec = line.left.sector === sector ? line.right.sector : line.left.sector;
                let lowerSec = (zSec.zFloor.val > sector.zFloor.val) ? sector : zSec;
                renderSector.extraFlats.push({
                    geometry,
                    z: zSec.zFloor,
                    flat: lowerSec.floorFlat,
                    lightSector: lowerSec,
                    ceil: false,
                });
                break;
            }
        }
    }

    // copy render properties from the outer/containing sector
    for (const rs of selfReferencing) {
        let outerSector = surroundingSector(mapRuntime, rs);
        if (!outerSector) {
            console.warn('no outer sector for self-referencing sectors', rs.sector.num);
            continue;
        }
        rs.sector = secMap.get(outerSector).sector;
    }

    // transparent door and window hack (https://www.doomworld.com/tutorials/fx5.php)
    for (const linedef of map.linedefs) {
        if (linedef.left) {
            const midL = wad.wallTextureData(linedef.left.middle.val);
            const midR = wad.wallTextureData(linedef.right.middle.val);
            // I'm not sure these conditions are exactly right but it works for TNT MAP02 and MAP09
            // and I've tested a bunch of other maps (in Doom and Doom2) and these hacks don't activate.
            // The "window hack" is particularly sensitive (which is why we have the ===1 condition) but it could
            // also be fixed by adding missing textures on various walls (like https://github.com/ZDoom/gzdoom/blob/master/wadsrc/static/zscript/level_compatibility.zs)
            // but even that list isn't complete
            const zeroHeightWithoutUpperAndLower = (
                linedef.left.sector.zFloor.val === linedef.left.sector.zCeil.val
                && linedef.left.sector !== linedef.right.sector // already covered in self-referencing above
                && linedef.left.sector.ceilFlat.val !== 'F_SKY1' && linedef.right.sector.ceilFlat.val !== 'F_SKY1'
                && !linedef.right.lower.val && !linedef.right.upper.val
                && !linedef.left.lower.val && !linedef.left.upper.val
            );
            const doorHack = zeroHeightWithoutUpperAndLower
                && midL && midL.height === linedef.left.yOffset.val
                && midR && midR.height === linedef.right.yOffset.val;
            const windowHack = zeroHeightWithoutUpperAndLower
                && linedef.right.sector.zCeil.val - linedef.left.sector.zCeil.val === 1
                && !midL && !midR;
            if (!windowHack && !doorHack) {
                continue;
            }

            const rs = rSectors.find(sec => sec.sector === linedef.left.sector);
            rs.zHackFloor = derived(
                [linedef.left.sector.zFloor, linedef.right.sector.zFloor],
                ([left, right]) => right - left);
            linedef.transparentDoorHack = doorHack;
            linedef.transparentWindowHack = windowHack;
            if (doorHack) {
                // a door hack means that two flats will probably overlap. We find the sector that is not the door and
                // overwrite some properties (flats and lighting) to hide the z-fighting. It's definitely a hack.
                map.linedefs
                    .filter(ld => pointOnLine(linedef.v[0], ld.v) && linedef.left.sector.light.val !== ld.right.sector.light.val)
                    .map(ld => rSectors.find(sec => sec.sector === ld.right.sector))
                    .filter(rsec => rsec)
                    .forEach(rsec => {
                        rsec.flatLighting = rs.flatLighting;
                        rsec.sector.floorFlat = rs.sector.floorFlat;
                        rsec.sector.ceilFlat = rs.sector.ceilFlat;
                    });
                rs.zHackCeil = rs.zHackFloor
            }
            if (windowHack) {
                // A window hack (unlike a door hack) doesn't have two sectors BUT we do need to offset the ceiling
                // and floor otherwise the geometry won't line up
                rs.zHackCeil = derived(
                    [linedef.left.sector.zCeil, linedef.right.sector.zCeil],
                    ([left, right]) => right - left);
            }
        }
    }

    // keep render sector mobjs lists in sync with mobjs. The assumption here is that most objects won't change sectors
    // very often therefore it is cheaper to maintain the list this way rather than filtering the mobj list when
    // rendering the sector. On the other hand, we are updating lists when most sectors aren't even visible so...
    // TODO: Need some profiler input here,
    let mobjMap = new Map<MapObject, RenderSector>();
    const monitor = (mobj: MapObject) => {
        if (mobj.info.flags & MFFlags.MF_NOSECTOR) {
            return;
        }
        mobj.sector.subscribe(sec => {
            const lastRS = mobjMap.get(mobj);
            lastRS?.mobjs.update(s => { s.delete(mobj); return s });
            const nextRS = secMap.get(sec);
            mobjMap.set(mobj, nextRS)
            nextRS.mobjs.update(s => s.add(mobj));
        });
    }
    const unmonitor = (mobj: MapObject) => {
        const lastRS = mobjMap.get(mobj);
        lastRS?.mobjs.update(s => { s.delete(mobj); return s });
        mobjMap.delete(mobj);
    }
    // for HMR, this seems like a good place to do this
    mapRuntime.events.removeAllListeners();
    mapRuntime.objs.forEach(monitor);
    mapRuntime.events.on('mobj-added', monitor);
    mapRuntime.events.on('mobj-removed', unmonitor);

    console.timeEnd('b-rs')
    return rSectors;
}

function surroundingSector(map: MapRuntime, rs: RenderSector) {
    let candidates = new Map<number, number>();
    let frequency = -1;
    const countResult = (sec: Sector) => {
        if (sec !== rs.sector) {
            let hits = (candidates.get(sec.num) ?? 0) + 1;
            candidates.set(sec.num, hits);
            if (hits > frequency) {
                frequency = hits;
                return sec;
            }
        }
        return null;
    };

    // For each lindef, go slightly left and right (based on line normal) and see what sectors are there. For everyIf the sector
    // there is self-referencing, we'll need to recurse. If not, then
    // and then choose the most frequently hit sector. It's crude but seems to cover all cases that I know
    // in TNT and Plutonia. I'm not confident it covers all cases out there.
    // NOTE: ideally we only check 1px away but sector38 in Plutonia MAP24 didn't work so we needed to check
    // further from the lines (hence dist)
    let result: Sector = null;
    for (let dist = 1; dist < 16 && !result; dist += 3) {
        for (const ld of rs.linedefs) {
            const sectors = searchNeighbourSector(ld.v, map, dist);
            result = countResult(sectors[0]) ?? countResult(sectors[1]) ?? result;
        }
    }
    return result;
}

const searchNeighbourSector = (() => {
    const mid = { x: 0, y: 0 };
    const norm = { x: 0, y: 0 };
    const result = new Array<Sector>(2);
    return (line: Vertex[], map: MapRuntime, dist: number) => {
        // compute linedef normal
        const dx = line[1].x - line[0].x;
        const dy = line[1].y - line[0].y;
        const len = Math.sqrt(dx * dx + dy * dy);
        norm.y = (-dx / len) * dist;
        norm.x = (dy / len) * dist;
        // and linedef midpoint
        mid.x = (line[0].x + line[1].x) * .5;
        mid.y = (line[0].y + line[1].y) * .5;

        result[0] = map.data.findSector(mid.x + norm.x, mid.y + norm.y);
        result[1] = map.data.findSector(mid.x - norm.x, mid.y - norm.y);

        return result;
    }
})();

function createShape(verts: Vertex[]) {
    if (!verts.length) {
        return null;
    }
    const shape = new Shape();
    shape.autoClose = true;
    shape.arcLengthDivisions = 1;
    shape.moveTo(verts[0].x, verts[0].y);
    for (let i = 1; i < verts.length; i++) {
        shape.lineTo(verts[i].x, verts[i].y);
    }
    return new ShapeGeometry(shape, 1);
}
