import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import { BufferAttribute, IntType, PlaneGeometry, type BufferGeometry } from "three";
import { TransparentWindowTexture, type MapTextureAtlas } from "./TextureAtlas";
import { linedefSlope, HALF_PI, MapRuntime, type LineDef, type Sector, type SideDef, type Vertex, type WallTextureType, MapObject, type Picture } from "../../doom";
import type { RenderSector } from '../RenderData';
import { inspectorAttributeName } from './MapMeshMaterial';
import { linedefScrollSpeed } from '../../doom/specials';
import { monitorMapObject } from '../Map/SvelteBridge';

// https://github.com/mrdoob/three.js/issues/17361
function flipWindingOrder(geometry: BufferGeometry) {
    const index = geometry.index.array;
    for (let i = 0, end = index.length / 3; i < end; i++) {
      const x = index[i * 3];
      index[i * 3] = index[i * 3 + 2];
      index[i * 3 + 2] = x;
    }
    geometry.index.needsUpdate = true;

    // flip normals (for lighting)
    for (let i = 0; i < geometry.attributes.normal.array.length; i++) {
        geometry.attributes.normal.array[i] *= -1;
    }
    geometry.attributes.normal.needsUpdate = true;
}

const sInt16BufferFrom = (items: number[], vertexCount: number) => {
    const array = new Int16Array(items.length * vertexCount);
    for (let i = 0; i < vertexCount * items.length; i += items.length) {
        for (let j = 0; j < items.length; j++) {
            array[i + j] = items[j];
        }
    }
    const attr = new BufferAttribute(array, items.length);
    attr.gpuType = IntType;
    return attr;
}
export const int16BufferFrom = (items: number[], vertexCount: number) => {
    const array = new Uint16Array(items.length * vertexCount);
    for (let i = 0; i < vertexCount * items.length; i += items.length) {
        for (let j = 0; j < items.length; j++) {
            array[i + j] = items[j];
        }
    }
    const attr = new BufferAttribute(array, items.length);
    attr.gpuType = IntType;
    return attr;
}

type GeoInfo = { vertexOffset: number, vertexCount: number, geom: BufferGeometry };
export function geometryBuilder() {
    let geoInfo: GeoInfo[] = [];
    let numVertex = 0;

    const addWallGeometry = (width: number, height: number, mid: Vertex, top: number, angle: number, sectorNum: number) => {
        const geom = new PlaneGeometry(width, height);
        geom.rotateX(HALF_PI);
        geom.rotateZ(angle);
        geom.translate(mid.x, mid.y, top - height * .5);
        const vertexCount = geom.attributes.position.count;
        const vertexOffset = numVertex;
        numVertex += vertexCount;

        geom.setAttribute('texN', int16BufferFrom([0], vertexCount));
        geom.setAttribute('doomLight', int16BufferFrom([sectorNum], vertexCount));
        geom.setAttribute('doomOffset', sInt16BufferFrom([0, 0], vertexCount));
        geom.setAttribute(inspectorAttributeName, int16BufferFrom([0, 0], vertexCount));
        geoInfo.push({ vertexCount, vertexOffset, geom });
        return geoInfo[geoInfo.length - 1];
    };

    const addFlatGeometry = (geom: BufferGeometry, sectorNum: number) => {
        const vertexCount = geom.attributes.position.count;
        const vertexOffset = numVertex;
        numVertex += vertexCount;

        for (let i = 0; i < geom.attributes.uv.array.length; i++) {
            geom.attributes.uv.array[i] /= 64;
        }
        geom.setAttribute('texN', int16BufferFrom([0], vertexCount));
        geom.setAttribute('doomLight', int16BufferFrom([sectorNum], vertexCount));
        geom.setAttribute('doomOffset', sInt16BufferFrom([0, 0], vertexCount));
        geom.setAttribute(inspectorAttributeName, int16BufferFrom([1, sectorNum], vertexCount));
        geoInfo.push({ vertexCount, vertexOffset, geom });
        return geoInfo[geoInfo.length - 1];
    };

    const emptyPlane = () => new PlaneGeometry(0, 0)
        .setAttribute('texN', int16BufferFrom([0], 4))
        .setAttribute('doomLight', int16BufferFrom([0], 4))
        .setAttribute('doomOffset', sInt16BufferFrom([0, 0], 4))
        .setAttribute(inspectorAttributeName, int16BufferFrom([0, 0], 4));
    function build(name: string) {
        // NB: BufferGeometryUtils.mergeGeometries() fails if array is empty
        const geometry = geoInfo.length ? BufferGeometryUtils.mergeGeometries(geoInfo.map(e => e.geom)) : emptyPlane();
        geoInfo.forEach(e => e.geom = geometry);
        geometry.name = name;
        return geometry;
    }

    return { addWallGeometry, addFlatGeometry, build };
}

type MapGeometryUpdater = ReturnType<typeof mapGeometryUpdater>;
type MapUpdater = (m: MapGeometryUpdater) => void;

const chooseSector = (sec1: Sector, sec2: Sector) => {
    if (!sec1) return sec2;
    if (!sec2) return sec1;
    return sec1.zFloor < sec2.zFloor ? sec1 : sec2;
};

const chooseTexture = (ld: LineDef, type: WallTextureType, useLeft = false) => {
    if (ld.transparentWindowHack) {
        return TransparentWindowTexture.TextureName;
    }
    let textureL = ld.left?.[type];
    let textureR = ld.right[type];
    return useLeft ? (textureL ?? textureR) : (textureR ?? textureL);
};

function mapGeometryBuilder(textures: MapTextureAtlas) {
    const geoBuilder = geometryBuilder();
    const skyBuilder = geometryBuilder();
    const translucencyBuilder = geometryBuilder();

    const flatGeoBuilder = (flatName: string) =>
        flatName === 'F_SKY1' ? skyBuilder : geoBuilder;

    const applyWallAttributes = (ld: LineDef, geo: BufferGeometry) => {
        geo.setAttribute(inspectorAttributeName, int16BufferFrom([0, ld.num], geo.attributes.position.count));

        // specials
        if (ld.special === 48) {
            for (let i = 0; i < geo.attributes.position.count; i++) {
                geo.attributes.doomOffset.array[i * 2] = 1;
            }
        } else if (ld.special === 85) {
            for (let i = 0; i < geo.attributes.position.count; i++) {
                geo.attributes.doomOffset.array[i * 2] = -1;
            }
        }
        if (ld.special === 255) {
            for (let i = 0; i < geo.attributes.position.count; i++) {
                geo.attributes.doomOffset.array[i * 2] = ld.right.xOffset.initial;
                geo.attributes.doomOffset.array[i * 2 + 1] = ld.right.yOffset.initial;
            }
        }
    };

    const addLinedef = (ld: LineDef): MapUpdater => {
        const { dx, dy, length: width } = linedefSlope(ld);
        if (width === 0) {
            return () => {};
        }

        const mid = {
            x: (ld.v[1].x + ld.v[0].x) * 0.5,
            y: (ld.v[1].y + ld.v[0].y) * 0.5,
        };
        const angle = Math.atan2(dy, dx);

        // these values don't matter because they get reset by the linedef updaters before being rendered
        const top = 1;
        const height = 1;

        // Sky Hack! https://doomwiki.org/wiki/Sky_hack
        // Detect the skyhack is simple but how it's handled is... messy. How it
        // works is:
        // (1) we set render order to 1 for everything non-sky
        // (2) put extra walls from top of line to sky with (renderOrder=0, writeColor=false, and writeDepth=true)
        //   to occlude geometry behind them
        //
        // These extra walls are mostly fine but not perfect. If you go close to an edge and look toward the bunker thing
        // you can see part of the walls occluded which shouldn't be. Interestingly you can see the same thing in gzDoom
        //
        // What I really want to do is not draw stuff that occluded but I can't think of way to do that.
        // Overall we draw way more geometry than needed.
        //
        // See also E3M6 https://doomwiki.org/wiki/File:E3m6_three.PNG
        // NOTE: DON'T use transfer lindef when checking for sky!!
        const needSkyWall = ld.right.sector.ceilFlat === 'F_SKY1';
        const skyHack = (ld.left?.sector?.ceilFlat === 'F_SKY1' && needSkyWall);
        const skyHeight = ld.right.sector.skyHeight;
        if (needSkyWall && !skyHack) {
            const rSec = chooseSector(ld.right.sector.transfer?.right?.sector, ld.right.sector);
            const idx = skyBuilder.addWallGeometry(width, skyHeight - rSec.zCeil, mid, skyHeight, angle, rSec.num);
            idx.geom.setAttribute(inspectorAttributeName, int16BufferFrom([1, ld.num], idx.geom.attributes.position.count));
        }

        let builder = geoBuilder;
        if (ld.special === 260 || ld.transparentWindowHack) {
            builder = translucencyBuilder;
        }

        if (ld.left) {
            // TODO: for transfer sectors we should probably create three geometries per level (upper, middle, lower) because
            // for walls above the control ceiling or below the control floor, they need control lighting. Height would be 0
            // if control ceiling>ceiling or control floor<floor. It's a little wasteful but only for transfer sectors so not
            // a common case
            let upperIdx: GeoInfo;
            let lowerIdx: GeoInfo;
            let upperFaceLeft = false;
            let lowerFaceLeft = false;
            let midLeftIdx: GeoInfo;
            let midRightIdx: GeoInfo;

            // two-sided so figure out top
            if (!skyHack && (ld.right.upper || ld.left.upper || ld.transparentWindowHack)) {
                upperIdx = builder.addWallGeometry(width, height, mid, top, angle, ld.right.sector.num);
                applyWallAttributes(ld, upperIdx.geom);
            }
            // And bottom
            if (ld.right.lower || ld.left.lower || ld.transparentWindowHack) {
                lowerIdx = builder.addWallGeometry(width, height, mid, top, angle, ld.right.sector.num);
                applyWallAttributes(ld, lowerIdx.geom);
            }
            // And middle(s)
            if (ld.left.middle) {
                midLeftIdx = builder.addWallGeometry(width, height, mid, top, angle + Math.PI, ld.left.sector.num);
                applyWallAttributes(ld, midLeftIdx.geom);
            }
            if (ld.right.middle) {
                midRightIdx = builder.addWallGeometry(width, height, mid, top, angle, ld.right.sector.num);
                applyWallAttributes(ld, midRightIdx.geom);
            }

            return m => {
                // texture alignment info https://doomwiki.org/wiki/Texture_alignment
                // the code for aligning each wall type is inside each block
                const rSec = chooseSector(ld.right.sector.transfer?.right?.sector, ld.right.sector);
                const lSec = chooseSector(ld.left.sector.transfer?.right?.sector, ld.left.sector);
                const floorHigh = Math.max(lSec.zFloor, rSec.zFloor);
                const ceilLow = Math.min(lSec.zCeil, rSec.zCeil);
                const ceilHigh = Math.max(lSec.zCeil, rSec.zCeil);

                if (upperIdx) {
                    const useLeft = lSec.zCeil > rSec.zCeil;
                    const side = useLeft ? ld.left : ld.right;
                    const height = ceilHigh - ceilLow;
                    const pegging = (ld.flags & 0x0008 ? 0 : -height);
                    m.changeWallHeight(upperIdx, ceilHigh, height);
                    m.applyWallTexture(upperIdx, chooseTexture(ld, 'upper', useLeft),
                        width, height,
                        side.xOffset.initial, side.yOffset.initial + pegging);
                    if (upperFaceLeft !== useLeft) {
                        m.flipWallFace(upperIdx, side.sector.num);
                        upperFaceLeft = useLeft;
                    }
                }
                if (lowerIdx) {
                    const useLeft = rSec.zFloor > lSec.zFloor;
                    const side = useLeft ? ld.left : ld.right;
                    const height = floorHigh - Math.min(rSec.zFloor, lSec.zFloor);
                    // NOTE: we use skyheight (if available) instead of zCeil because of the blue wall switch in E3M6.
                    const pegging = (ld.flags & 0x0010) ? (skyHeight ?? rSec.zCeil) - floorHigh : 0;
                    m.changeWallHeight(lowerIdx, floorHigh, height);
                    m.applyWallTexture(lowerIdx, chooseTexture(ld, 'lower', useLeft),
                        width, height,
                        side.xOffset.initial, side.yOffset.initial + pegging);
                    if (lowerFaceLeft !== useLeft) {
                        m.flipWallFace(lowerIdx, side.sector.num);
                        lowerFaceLeft = useLeft;
                    }
                }

                // A bunch of test cases for transfer sectors...
                // For example, the green bars in Sundar map 20 need originalZFloor for top:
                // http://localhost:5173/#wad=doom2&wad=sunder+2407&skill=4&map=MAP20&player-x=-8702.78&player-y=3756.88&player-z=179.72&player-aim=-0.07&player-dir=2.63
                // While the rev cages in profanepromiseland are clipped by the transfer zFloor
                // http://localhost:5173/#wad=doom2&wad=sunder+2407&skill=4&map=MAP20&player-x=-6510.42&player-y=4220.05&player-z=386.38&player-aim=-0.21&player-dir=-1.06
                // Some other helpful test cases:
                // http://localhost:5173/#wad=doom2&wad=profanepromiseland_rc1&skill=4&map=MAP01&player-x=-2480.63&player-y=-2639.95&player-z=375.95&player-aim=-0.17&player-dir=8.60
                // http://localhost:5173/#wad=doom2&wad=profanepromiseland_rc1&skill=4&map=MAP01&player-x=-10019.15&player-y=5704.81&player-z=-147.16&player-aim=-0.06&player-dir=2.49
                // http://localhost:5173/#wad=doom2&wad=pd2&skill=4&map=MAP01&player-x=174.85&player-y=506.97&player-z=212.69&player-aim=-0.29&player-dir=2.33
                // http://localhost:5173/#wad=tnt&skill=4&map=MAP02&player-x=1010.24&player-y=1008.64&player-z=-98.99&player-aim=-0.01&player-dir=-3.67
                // This was tricky to figure out!
                const originalZFloor = Math.max(ld.left.sector.zFloor, ld.right.sector.zFloor);
                const originalZCeil = Math.min(ld.left.sector.zCeil, ld.right.sector.zCeil);
                function updateMiddle(idx: GeoInfo, textureName: string, side: SideDef) {
                    const pic = textures.wallTexture(textureName)[1];
                    let top = 0, clippedTop = 0;
                    if (ld.flags & 0x0010) {
                        // lower unpegged sticks to the ground
                        top = originalZFloor + pic.height + side.yOffset.val;
                        clippedTop = Math.min(ceilLow, top);
                    } else {
                        top = originalZCeil + side.yOffset.val;
                        clippedTop = Math.min(ceilHigh, top);
                    }
                    const yOff = top - clippedTop;
                    // double sided linedefs (generally for semi-transparent textures like gates/fences) do not repeat vertically
                    // so clip height by pic height or top/floor gap
                    const height = Math.min(pic.height - yOff, clippedTop - floorHigh);
                    m.changeWallHeight(idx, clippedTop, height);
                    m.applyWallTexture(idx, textureName, width, height, side.xOffset.initial, yOff);
                }

                if (midLeftIdx) {
                    const tx = chooseTexture(ld, 'middle', true);
                    updateMiddle(midLeftIdx, tx, ld.left);
                }
                if (midRightIdx) {
                    const tx = chooseTexture(ld, 'middle');
                    updateMiddle(midRightIdx, tx, ld.right);
                }
            }
        } else {
            const idx = builder.addWallGeometry(width, height, mid, top, angle, ld.right.sector.num);
            applyWallAttributes(ld, idx.geom);

            return m => {
                const rSec = chooseSector(ld.right.sector.transfer?.right?.sector, ld.right.sector);
                const height = rSec.zCeil - rSec.zFloor;
                m.changeWallHeight(idx, rSec.zCeil, height);
                m.applyWallTexture(idx, chooseTexture(ld, 'middle'),
                    width, height,
                    ld.right.xOffset.initial, ld.right.yOffset.initial + (ld.flags & 0x0010 ? -height : 0));
            };
        }
    };

    const applySectorSpecials = (rs: RenderSector, geo: BufferGeometry, ceiling: boolean) => {
        for (let ld of rs.taggedLines) {
            const needsScrolling = (ceiling && ld.special === 250)
                || (!ceiling && (ld.special === 251 || ld.special == 253));
            if (needsScrolling) {
                let { dx, dy } = linedefScrollSpeed(ld);
                for (let i = 0; i < geo.attributes.position.count; i++) {
                     // draw floors/ceilings with direction flipped!!
                    geo.attributes.doomOffset.array[i * 2 + 0] = -dx;
                    geo.attributes.doomOffset.array[i * 2 + 1] = -dy;
                }
            }
        }
    };

    const addSector = (rs: RenderSector): [GeoInfo, GeoInfo, GeoInfo[], [GeoInfo, GeoInfo]] => {
        const sector = chooseSector(rs.sector.transfer?.right?.sector, rs.sector);
        const floorGeo = rs.geometry.clone();
        const floor = flatGeoBuilder(sector.floorFlat).addFlatGeometry(floorGeo, sector.num);
        applySectorSpecials(rs, floorGeo, false);

        const ceilGeo = rs.geometry.clone();
        // flip over triangles for ceiling
        flipWindingOrder(ceilGeo);
        const ceil = flatGeoBuilder(sector.ceilFlat).addFlatGeometry(ceilGeo, sector.num);
        applySectorSpecials(rs, ceilGeo, true);

        let extras: GeoInfo[] = [];
        for (const extra of rs.extraFlats) {
            const geo = extra.geometry.clone();
            if (extra.ceil) {
                flipWindingOrder(geo);
            }
            const flat = extra.ceil ? extra.flatSector.ceilFlat : extra.flatSector.floorFlat;
            extras.push(flatGeoBuilder(flat).addFlatGeometry(geo, extra.lightSector.num));
            applySectorSpecials(rs, geo, extra.ceil);
        }

        let transfers: [GeoInfo, GeoInfo] = null;
        if (rs.sector.transfer) {
            // create an extra floor and ceiling although we won't always use them
            const transferSec = rs.sector.transfer.right.sector;
            const transferFloor = flatGeoBuilder(transferSec.floorFlat).addFlatGeometry(rs.geometry.clone(), transferSec.num);
            const geo = rs.geometry.clone();
            flipWindingOrder(geo);
            const transferCeiling = flatGeoBuilder(transferSec.floorFlat).addFlatGeometry(geo, transferSec.num);
            transfers = [transferFloor, transferCeiling];
        }

        return [ceil, floor, extras, transfers];
    };

    const build = () => {
        const skyGeometry = skyBuilder.build('sky');
        const translucentGeometry = translucencyBuilder.build('map-translucent');
        const geometry = geoBuilder.build('map');
        return { geometry, skyGeometry, translucentGeometry, updater: mapGeometryUpdater(textures) };
    };

    return { addSector, addLinedef, build };
}

export function buildMapGeometry(textureAtlas: MapTextureAtlas, mapRuntime: MapRuntime, renderSectors: RenderSector[]) {
    // Geometry updates happen on the merged geometry but it's more efficient to merge the geometries
    // once. With this little structure, we keep track of all the pending changes to apply them when
    // the geometry has been created.
    let pendingUpdates: MapUpdater[] = [];
    let mapUpdater: MapGeometryUpdater = (() => {
        return {
            moveFlat: (idx, z) => pendingUpdates.push(m => m.moveFlat(idx, z)),
            applyFlatTexture: (idx, tx) => pendingUpdates.push(m => m.applyFlatTexture(idx, tx)),
            applyWallTexture: (idx, tx, w, h, ox, oy) => pendingUpdates.push(m => m.applyWallTexture(idx, tx, w, h, ox, oy)),
            changeWallHeight: (idx, top, height) => pendingUpdates.push(m => m.changeWallHeight(idx, top, height)),
            applyLightLevel: (idx, n) => pendingUpdates.push(m => m.applyLightLevel(idx, n)),
            flipWallFace: (idx, n) => pendingUpdates.push(m => m.flipWallFace(idx, n)),
        };
    })();

    const mapBuilder = mapGeometryBuilder(textureAtlas);

    // We're going to subscribe to a whole bunch of property change events so we better keep track of
    // the unsubscribes so we don't leak memory in HMR situation (or when reloading a map)
    let disposables: (() => void)[] = [];
    let linedefUpdaters = new Map<number, MapUpdater>();
    const sectorZChanges = new Map<number, MapUpdater[]>();
    const sectorFlatChanges = new Map<number, MapUpdater[]>();
    const appendUpdater = (map: typeof sectorZChanges, sector: Sector, updater: MapUpdater) => {
        const list = map.get(sector.num) ?? [];
        list.push(updater);
        map.set(sector.num, list);
    }

    let transferChangers = [];
    for (const rs of renderSectors) {
        rs.linedefs.forEach(ld => {
            const updater = mapBuilder.addLinedef(ld);
            linedefUpdaters.set(ld.num, updater);
            appendUpdater(sectorZChanges, rs.sector, updater);
            if (ld.left) {
                appendUpdater(sectorZChanges, ld.left.sector, updater);
            }
        });
        if (!rs.geometry) {
            // Plutonia MAP29?
            continue;
        }

        let [ceil, floor, extras, transfers] = mapBuilder.addSector(rs);

        for (let i = 0; i < extras.length; i++) {
            let extra = rs.extraFlats[i];
            let idx = extras[i];
            // add a tiny offset to z to make sure extra flat is rendered below (floor) or above) ceil) the actual
            // flat to avoid z-fighting. We can use a small offset because doom z values are integers except when the
            // platform is moving but we can tolerate a small error for moving platforms.
            let zOffset = extra.ceil ? 0.001 : -0.001;
            appendUpdater(sectorZChanges, extra.zSector, () => mapUpdater.moveFlat(idx, zOffset + (extra.ceil ? extra.zSector.zCeil : extra.zSector.zFloor)));
            appendUpdater(sectorFlatChanges, extra.flatSector, () => mapUpdater.applyFlatTexture(idx, (extra.ceil ? extra.flatSector.ceilFlat : extra.flatSector.floorFlat)));
        }

        if (!transfers) {
            appendUpdater(sectorZChanges, rs.sector, m => {
                m.moveFlat(floor, rs.sector.zFloor);
                m.moveFlat(ceil, rs.sector.skyHeight ?? rs.sector.zCeil);
            });
            appendUpdater(sectorFlatChanges, rs.sector, m => {
                m.applyFlatTexture(ceil, rs.sector.ceilFlat);
                m.applyFlatTexture(floor, rs.sector.floorFlat);
            });
        } else {
            const controlSec = rs.sector.transfer.right.sector;
            const [tFloor, tCeil] = transfers;
            const changer = (m: MapGeometryUpdater) => {
                m.applyFlatTexture(ceil, rs.sector.ceilFlat);
                m.moveFlat(ceil, rs.sector.skyHeight ?? controlSec.zCeil);
                m.applyFlatTexture(floor, rs.sector.floorFlat);
                m.moveFlat(floor, controlSec.zFloor);

                // we don't need to update fake floors if the real sector sector ceil and floor are within the control sector
                if (rs.sector.zCeil <= controlSec.zCeil && rs.sector.zFloor >= controlSec.zFloor) {
                    return;
                }

                // TODO: also set palette? we need to choose colours based on palette first
                // TODO: if we add two more fake floors, I wonder if we could avoid listening to player movement? It's not super
                // expensive (Sunder map20 has about 100 transfer lines) but it's probably cheaper to just add a few more
                // triangles and not update them (unless a sector moves)
                const playerEye = mapRuntime.player.position.z + mapRuntime.player.viewHeight.val;
                if (playerEye >= controlSec.zCeil) {
                    m.applyFlatTexture(tCeil, controlSec.ceilFlat);
                    m.moveFlat(tCeil, controlSec.zFloor);
                    m.applyFlatTexture(tFloor, controlSec.floorFlat);
                    m.moveFlat(tFloor, rs.sector.zFloor);
                } else if (playerEye >= controlSec.zFloor) {
                    // hide fake floor and ceiling to use the real floor and ceiling
                    m.moveFlat(tCeil, controlSec.zCeil + .1);
                    m.moveFlat(tFloor, controlSec.zFloor - .1);
                } else {
                    m.applyFlatTexture(tCeil, controlSec.ceilFlat);
                    m.moveFlat(tCeil, controlSec.zFloor);
                    m.applyFlatTexture(tFloor, controlSec.floorFlat);
                    m.moveFlat(tFloor, rs.sector.zFloor);
                }
            };

            transferChangers.push(changer);
            appendUpdater(sectorZChanges, rs.sector, changer);
            appendUpdater(sectorZChanges, controlSec, changer);
            appendUpdater(sectorFlatChanges, rs.sector, changer);
            appendUpdater(sectorFlatChanges, controlSec, changer);
        }
    }

    disposables.push(monitorMapObject(mapRuntime, mapRuntime.player, () => transferChangers.forEach(fn => fn(mapUpdater))));

    const updateLinedefTexture = (line: LineDef) => linedefUpdaters.get(line.num)?.(mapUpdater);
    mapRuntime.events.on('wall-texture', updateLinedefTexture);
    disposables.push(() => mapRuntime.events.off('wall-texture', updateLinedefTexture));

    const updateSectorFlat = (sector: Sector) => sectorFlatChanges.get(sector.num)?.forEach(fn => fn(mapUpdater));
    mapRuntime.events.on('sector-flat', updateSectorFlat);
    disposables.push(() => mapRuntime.events.off('sector-flat', updateSectorFlat));

    const updateSectorZ = (sector: Sector) => sectorZChanges.get(sector.num)?.forEach(fn => fn(mapUpdater));
    mapRuntime.events.on('sector-z', updateSectorZ);
    disposables.push(() => mapRuntime.events.off('sector-z', updateSectorZ));

    mapRuntime.data.sectors.forEach(sector => {
        updateSectorFlat(sector);
        updateSectorZ(sector);
    });

    const map = mapBuilder.build();
    mapUpdater = map.updater;
    pendingUpdates.forEach(fn => fn(mapUpdater));
    textureAtlas.commit();

    const { geometry, skyGeometry, translucentGeometry } = map;
    const dispose = () => disposables.forEach(fn => fn());
    return { geometry, skyGeometry, translucentGeometry, dispose };
}

export function mapGeometryUpdater(textures: MapTextureAtlas) {
    const applyWallTexture = (info: GeoInfo, textureName: string, width: number, height: number, offsetX: number, offsetY: number) => {
        if (!textureName) {
            changeWallHeight(info, 0, 0);
            return;
        }

        const [index, tx] = textures.wallTexture(textureName);
        const vertexOffset = info.vertexOffset;
        const geo = info.geom;

        // You know... I wonder if we could push even more of this into the fragment shader? We could put xOffset/yOffset
        // and maybe even pegging offset too. The drawback there is that mostly these values don't change (except xOffset/yOffset
        // for animated textures) so maybe it's not the right place?
        const invHeight = 1 / tx.height;
        const invWidth = 1 / tx.width;
        geo.attributes.uv.array[2 * vertexOffset + 0] =
            geo.attributes.uv.array[2 * vertexOffset + 4] = offsetX * invWidth;
        geo.attributes.uv.array[2 * vertexOffset + 1] =
            geo.attributes.uv.array[2 * vertexOffset + 3] = ((height % tx.height) - height + offsetY) * invHeight;
        geo.attributes.uv.array[2 * vertexOffset + 5] =
            geo.attributes.uv.array[2 * vertexOffset + 7] = ((height % tx.height) + offsetY) * invHeight;
        geo.attributes.uv.array[2 * vertexOffset + 2] =
            geo.attributes.uv.array[2 * vertexOffset + 6] = (width + offsetX) * invWidth;
        // set texture index
        geo.attributes.texN.array.fill(index, vertexOffset, vertexOffset + 4);

        geo.attributes.texN.needsUpdate = true;
        geo.attributes.uv.needsUpdate = true;
    };

    const changeWallHeight = (info: GeoInfo, top: number, height: number) => {
        const offset = info.vertexOffset * 3;
        const geo = info.geom;
        geo.attributes.position.array[offset + 2] =
            geo.attributes.position.array[offset + 5] = top;
        geo.attributes.position.array[offset + 8] =
            geo.attributes.position.array[offset + 11] = top - height;
        geo.attributes.position.needsUpdate = true;
    };

    const flipWallFace = (info: GeoInfo, sectorNum: number) => {
        const offset = info.vertexOffset * 3;
        const geo = info.geom;

        applyLightLevel(info, sectorNum);

        // rotate wall by 180
        let x1 = geo.attributes.position.array[offset + 0];
        let y1 = geo.attributes.position.array[offset + 1];
        geo.attributes.position.array[offset + 0] = geo.attributes.position.array[offset + 9];
        geo.attributes.position.array[offset + 1] = geo.attributes.position.array[offset + 10];
        geo.attributes.position.array[offset + 9] = x1;
        geo.attributes.position.array[offset + 10] = y1;

        let x2 = geo.attributes.position.array[offset + 3];
        let y2 = geo.attributes.position.array[offset + 4];
        geo.attributes.position.array[offset + 3] = geo.attributes.position.array[offset + 6];
        geo.attributes.position.array[offset + 4] = geo.attributes.position.array[offset + 7];
        geo.attributes.position.array[offset + 6] = x2;
        geo.attributes.position.array[offset + 7] = y2;

        geo.attributes.position.needsUpdate = true;

        // flip normals so lighting works
        for (let i = info.vertexOffset * 3, end = (info.vertexOffset + info.vertexCount) * 3; i < end; i++) {
            geo.attributes.normal.array[i] *= -1;
        }
        geo.attributes.normal.needsUpdate = true;
    };

    const applyFlatTexture = (info: GeoInfo, textureName: string) => {
        const geo = info.geom;
        let index = textures.flatTexture(textureName)[0];
        geo.attributes.texN.array.fill(index, info.vertexOffset, info.vertexOffset + info.vertexCount);
        geo.attributes.texN.needsUpdate = true;
    };

    const moveFlat = (info: GeoInfo, zPosition: number) => {
        const geo = info.geom;
        let end = (info.vertexCount + info.vertexOffset) * 3;
        for (let i = info.vertexOffset * 3; i < end; i += 3) {
            geo.attributes.position.array[i + 2] = zPosition;
        }
        geo.attributes.position.needsUpdate = true;
    };

    const applyLightLevel = (info: GeoInfo, sectorNum: number) => {
        info.geom.attributes.doomLight.array.fill(sectorNum, info.vertexOffset, info.vertexOffset + info.vertexCount);
        info.geom.attributes.doomLight.needsUpdate = true;
    }

    return {
        moveFlat,
        applyFlatTexture,
        applyWallTexture,
        changeWallHeight,
        applyLightLevel,
        flipWallFace,
    }
}
