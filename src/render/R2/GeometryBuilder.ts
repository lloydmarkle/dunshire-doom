import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import { BufferAttribute, IntType, PlaneGeometry, type BufferGeometry } from "three";
import { TransparentWindowTexture, type MapTextureAtlas } from "./TextureAtlas";
import { linedefSlope, HALF_PI, MapRuntime, type LineDef, type Sector, type SideDef, type Vertex, type WallTextureType } from "../../doom";
import type { RenderSector } from '../RenderData';
import { inspectorAttributeName } from './MapMeshMaterial';
import { linedefScrollSpeed } from '../../doom/specials';

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

const chooseSector = (transferSector: Sector, sector: Sector) =>
    (transferSector && (transferSector.zFloor < sector.zFloor || transferSector.zCeil > sector.zCeil))
        ? transferSector : sector;

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

    const createLinedefGeometries = (ld: LineDef, width: number, position: Vertex, angle: number, skyHack = false) => {
        let builder = geoBuilder;
        if (ld.special === 260 || ld.transparentWindowHack) {
            builder = translucencyBuilder;
        }

        // these values don't matter because they get reset by the linedef updaters before being rendered
        const top = 1;
        const height = 1;

        let geos: [GeoInfo, GeoInfo, GeoInfo, GeoInfo] = [null, null, null, null];
        if (!ld.left) {
            geos[0] = builder.addWallGeometry(width, height, position, top, angle, ld.right.sector.num);
            applyWallAttributes(ld, geos[0].geom);
            return geos;
        }

        // two-sided so we create a top
        if (!skyHack && (ld.right.upper || ld.left.upper || ld.transparentWindowHack)) {
            geos[0] = builder.addWallGeometry(width, height, position, top, angle, ld.right.sector.num);
            applyWallAttributes(ld, geos[0].geom);
        }
        // and bottom
        if (ld.right.lower || ld.left.lower || ld.transparentWindowHack) {
            geos[1] = builder.addWallGeometry(width, height, position, top, angle, ld.right.sector.num);
            applyWallAttributes(ld, geos[1].geom);
        }
        // and middle(s)
        if (ld.left.middle) {
            geos[2] = builder.addWallGeometry(width, height, position, top, angle + Math.PI, ld.left.sector.num);
            applyWallAttributes(ld, geos[2].geom);
        }
        if (ld.right.middle) {
            geos[3] = builder.addWallGeometry(width, height, position, top, angle, ld.right.sector.num);
            applyWallAttributes(ld, geos[3].geom);
        }
        return geos;
    };

    // TODO: the number of parameters feels wild. This was added for transfer sectors but... can we do better?
    type VerticalSegmentUpdater = (m: MapGeometryUpdater, idx: GeoInfo, geoN: number, textureName: string, top: number, height: number, sector: Sector, xOffset: number, yOffset: number, flipWall: boolean) => void;
    const create2SidedLinedefUpdater = (ld: LineDef, geos: ReturnType<typeof createLinedefGeometries>, updateSection: VerticalSegmentUpdater): MapUpdater => {
        let upperFaceLeft = false;
        let lowerFaceLeft = false;
        const [upperIdx, lowerIdx, midLeftIdx, midRightIdx] = geos;
        return m => {
            // TODO: do we need to choose a sector here? Or to put it another way, how can we remove this for the majority of cases that don't need it?
            const rSec = chooseSector(ld.right.sector.transfer?.right?.sector, ld.right.sector);
            const lSec = chooseSector(ld.left.sector.transfer?.right?.sector, ld.left.sector);
            const floorHigh = Math.max(lSec.zFloor, rSec.zFloor);
            const ceilLow = Math.min(lSec.zCeil, rSec.zCeil);
            const ceilHigh = Math.max(lSec.zCeil, rSec.zCeil);

            // texture alignment info https://doomwiki.org/wiki/Texture_alignment
            // the code for aligning each wall type is inside each block
            if (upperIdx) {
                const useLeft = lSec.zCeil > rSec.zCeil;
                const side = useLeft ? ld.left : ld.right;
                const height = ceilHigh - ceilLow;
                const yOffset = side.yOffset.initial + (ld.flags & 0x0008 ? 0 : -height);
                updateSection(m, upperIdx, 0, chooseTexture(ld, 'upper', useLeft), ceilHigh, height, side.sector, side.xOffset.initial, yOffset, upperFaceLeft !== useLeft);
                upperFaceLeft = useLeft;
            }
            if (lowerIdx) {
                const useLeft = rSec.zFloor > lSec.zFloor;
                // NOTE: we use skyheight (if available) instead of zCeil because of the blue wall switch in E3M6.
                const unpeggedTop = useLeft ? lSec.skyHeight ?? lSec.zCeil : rSec.skyHeight ?? rSec.zCeil;
                const side = useLeft ? ld.left : ld.right;
                const height = floorHigh - Math.min(rSec.zFloor, lSec.zFloor);
                const yOffset = side.yOffset.initial + (ld.flags & 0x0010 ? unpeggedTop - floorHigh : 0);
                updateSection(m, lowerIdx, 1, chooseTexture(ld, 'lower', useLeft), floorHigh, height, side.sector, side.xOffset.initial, yOffset, lowerFaceLeft !== useLeft);
                lowerFaceLeft = useLeft;
            }

            // A bunch of test cases for transfer sectors...
            // For example, the green bars in Sundar map 20 need originalZFloor for top:
            // http://localhost:5173/#wad=doom2&wad=sunder+2407&skill=4&map=MAP20&player-x=-8702.78&player-y=3756.88&player-z=179.72&player-aim=-0.07&player-dir=2.63
            // While the rev cages in profanepromiseland are clipped by the transfer zFloor
            // http://localhost:5173/#wad=doom2&wad=profanepromiseland_rc1&skill=4&map=MAP01&player-x=-2480.63&player-y=-2639.95&player-z=375.95&player-aim=-0.17&player-dir=8.60
            // Some other helpful test cases for middle texture offset
            // http://localhost:5173/#wad=doom2&wad=sunder+2407&skill=4&map=MAP20&player-x=-6510.42&player-y=4220.05&player-z=386.38&player-aim=-0.21&player-dir=-1.06
            // http://localhost:5173/#wad=doom2&wad=profanepromiseland_rc1&skill=4&map=MAP01&player-x=-10019.15&player-y=5704.81&player-z=-147.16&player-aim=-0.06&player-dir=2.49
            // http://localhost:5173/#wad=doom2&wad=pd2&skill=4&map=MAP01&player-x=174.85&player-y=506.97&player-z=212.69&player-aim=-0.29&player-dir=2.33
            // http://localhost:5173/#wad=tnt&skill=4&map=MAP02&player-x=1010.24&player-y=1008.64&player-z=-98.99&player-aim=-0.01&player-dir=-3.67
            // This was tricky to figure out!
            const originalZFloor = Math.max(ld.left.sector.zFloor, ld.right.sector.zFloor);
            const originalZCeil = Math.min(ld.left.sector.zCeil, ld.right.sector.zCeil);
            function updateMiddle(idx: GeoInfo, side: SideDef) {
                const textureName = chooseTexture(ld, 'middle', side === ld.left);
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
                const yOffset = top - clippedTop;
                // double sided linedefs (generally for semi-transparent textures like gates/fences) do not repeat vertically
                // so clip height by pic height or top/floor gap
                const height = Math.min(pic.height - yOffset, clippedTop - floorHigh);
                updateSection(m, idx, side === ld.left ? 2 : 3, textureName, clippedTop, height, side.sector, side.xOffset.initial, yOffset, false);
            }
            if (midLeftIdx) {
                updateMiddle(midLeftIdx, ld.left);
            }
            if (midRightIdx) {
                updateMiddle(midRightIdx, ld.right);
            }
        };
    };

    const transferLindefUpdater = (ld: LineDef, width: number, mid: Vertex, angle: number, skyHack: boolean) => {
        const control = ld.right.sector.transfer?.right?.sector ?? ld.left.sector.transfer.right.sector;
        // create geometries for the A, B, C partitions created from transfer sectors and then clip the walls into
        // those partitions during update. It's not pretty... but it works.
        if (!ld.left) {
            const update1SidedWall: VerticalSegmentUpdater = (m, idx, n, textureName, top, height, sector, xOffset, yOffset, flipWall) => {
                m.changeWallHeight(idx, top, height);
                m.applyWallTexture(idx, textureName, width, height, xOffset, yOffset);
                m.applyLightLevel(idx, sector.num);
            };

            const [partitionA] = createLinedefGeometries(ld, width, mid, angle);
            const [partitionB] = createLinedefGeometries(ld, width, mid, angle);
            const [partitionC] = createLinedefGeometries(ld, width, mid, angle);
            return m => {
                const rSec = chooseSector(ld.right.sector.transfer?.right?.sector, ld.right.sector);
                const textureName = chooseTexture(ld, 'middle');
                const top = rSec.zCeil;
                const height = top - rSec.zFloor;
                const xOffset = ld.right.xOffset.initial;
                const yOffset = ld.right.xOffset.initial;
                // Partition A
                const aTop = Math.min(top, ld.right.sector.zCeil)
                const aHeight = Math.max(0, aTop - Math.max(top - height, control.zCeil));
                update1SidedWall(m, partitionA, 0, textureName, aTop, aHeight, control, xOffset, yOffset + (top - aTop), false);
                // Partition B
                const bTop = Math.min(top, control.zCeil)
                const bHeight = Math.max(0, bTop - Math.max(top - height, control.zFloor));
                update1SidedWall(m, partitionB, 0, textureName, bTop, bHeight, rSec, xOffset, yOffset + (top - bTop), false);
                // Partition C
                const cTop = Math.min(top, control.zFloor)
                const cHeight = Math.max(0, cTop - Math.max(top - height, ld.right.sector.zFloor));
                update1SidedWall(m, partitionC, 0, textureName, cTop, cHeight, control, xOffset, yOffset + (top - cTop), false);
            };
        }

        const update2SidedWall: VerticalSegmentUpdater = (m, idx, _, textureName, top, height, sector, xOffset, yOffset, flipWall) => {
            m.changeWallHeight(idx, top, height);
            m.applyWallTexture(idx, textureName, width, height, xOffset, yOffset);
            if (flipWall) {
                m.flipWallFace(idx, sector.num);
            } else {
                m.applyLightLevel(idx, sector.num);
            }
        };
        const partitionA = createLinedefGeometries(ld, width, mid, angle, skyHack);
        const partitionB = createLinedefGeometries(ld, width, mid, angle, skyHack);
        const partitionC = createLinedefGeometries(ld, width, mid, angle, skyHack);
        return create2SidedLinedefUpdater(ld, partitionB, (m, _, n, textureName, top, height, sector, xOffset, yOffset, flipWall) => {
            const controlLightSector = sector.transfer?.right?.sector ?? sector;
            // Partition A
            const aTop = Math.min(top, sector.zCeil)
            const aHeight = Math.max(0, aTop - Math.max(top - height, control.zCeil));
            update2SidedWall(m, partitionA[n], n, textureName, aTop, aHeight, controlLightSector, xOffset, yOffset + (top - aTop), flipWall);
            // Partition B
            const bTop = Math.min(top, control.zCeil)
            const bHeight = Math.max(0, bTop - Math.max(top - height, control.zFloor));
            update2SidedWall(m, partitionB[n], n, textureName, bTop, bHeight, sector, xOffset, yOffset + (top - bTop), flipWall);
            // Partition C
            const cTop = Math.min(top, control.zFloor)
            const cHeight = Math.max(0, cTop - Math.max(top - height, sector.zFloor));
            update2SidedWall(m, partitionC[n], n, textureName, cTop, cHeight, controlLightSector, xOffset, yOffset + (top - cTop), flipWall);
        });
    };

    const addLinedef = (ld: LineDef): MapUpdater => {
        const { dx, dy, length: width } = linedefSlope(ld);
        if (width === 0) {
            return () => {};
        }

        const angle = Math.atan2(dy, dx);
        const mid = {
            x: (ld.v[1].x + ld.v[0].x) * 0.5,
            y: (ld.v[1].y + ld.v[0].y) * 0.5,
        };

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
        // See also E3M6 https://doomwiki.org/wiki/File:E3m6_three.PNG
        // NOTE: DON'T use transfer lindef when checking for sky!!
        const needSkyWall = ld.right.sector.ceilFlat === 'F_SKY1';
        const skyHack = (ld.left?.sector?.ceilFlat === 'F_SKY1' && needSkyWall);
        const skyHeight = ld.right.sector.skyHeight;
        if (needSkyWall && !skyHack) {
            const idx = skyBuilder.addWallGeometry(width, skyHeight - ld.right.sector.zCeil, mid, skyHeight, angle, 0);
            idx.geom.setAttribute(inspectorAttributeName, int16BufferFrom([1, ld.num], idx.geom.attributes.position.count));
        }

        if (ld.right.sector.transfer || ld.left?.sector?.transfer) {
            return transferLindefUpdater(ld, width, mid, angle, skyHack);
        }

        if (!ld.left) {
            const [idx] = createLinedefGeometries(ld, width, mid, angle);
            return m => {
                const height = ld.right.sector.zCeil - ld.right.sector.zFloor;
                m.changeWallHeight(idx, ld.right.sector.zCeil, height);
                m.applyWallTexture(idx, chooseTexture(ld, 'middle'), width, height, ld.right.xOffset.initial, ld.right.yOffset.initial + (ld.flags & 0x0010 ? -height : 0));
            };
        }
        const update2SidedWall: VerticalSegmentUpdater = (m, idx, _, textureName, top, height, sector, xOffset, yOffset, flipWall) => {
            m.changeWallHeight(idx, top, height);
            m.applyWallTexture(idx, textureName, width, height, xOffset, yOffset);
            if (flipWall) {
                m.flipWallFace(idx, sector.num);
            }
        };
        return create2SidedLinedefUpdater(ld, createLinedefGeometries(ld, width, mid, angle, skyHack), update2SidedWall);
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

    const flatBuilder = (flatName: string) => flatName === 'F_SKY1' ? skyBuilder : geoBuilder;

    type FloorCeilingPair = [GeoInfo, GeoInfo]
    const addSector = (rs: RenderSector): [FloorCeilingPair, GeoInfo[], [FloorCeilingPair, FloorCeilingPair]] => {
        const floorGeo = rs.geometry.clone();
        const floor = flatBuilder(rs.sector.floorFlat).addFlatGeometry(floorGeo, rs.sector.num);
        applySectorSpecials(rs, floorGeo, false);

        const ceilGeo = rs.geometry.clone();
        // flip over triangles for ceiling
        flipWindingOrder(ceilGeo);
        const ceil = flatBuilder(rs.sector.ceilFlat).addFlatGeometry(ceilGeo.clone(), rs.sector.num);
        applySectorSpecials(rs, ceil.geom, true);

        let extras: GeoInfo[] = [];
        for (const extra of rs.extraFlats) {
            const geo = extra.geometry.clone();
            if (extra.ceil) {
                flipWindingOrder(geo);
            }
            const flat = extra.ceil ? extra.flatSector.ceilFlat : extra.flatSector.floorFlat;
            extras.push(flatBuilder(flat).addFlatGeometry(geo, extra.lightSector.num));
            applySectorSpecials(rs, geo, extra.ceil);
        }

        let transfers: [FloorCeilingPair, FloorCeilingPair] = null;
        if (rs.sector.transfer) {
            // create two pairs of extra floor/ceil. Depending on floor and ceiling height of transfer sector
            // and original sector, these won't always be visible but it's more expensive to create a new geometry later
            const transferSec = rs.sector.transfer.right.sector;

            const topCeiling = flatBuilder(transferSec.ceilFlat).addFlatGeometry(ceilGeo.clone(), transferSec.num);
            const topFloor = flatBuilder(transferSec.floorFlat).addFlatGeometry(rs.geometry.clone(), transferSec.num);
            const bottomCeiling = flatBuilder(transferSec.ceilFlat).addFlatGeometry(ceilGeo.clone(), transferSec.num);
            const bottomFloor = flatBuilder(transferSec.floorFlat).addFlatGeometry(rs.geometry.clone(), transferSec.num);
            transfers = [[topFloor, topCeiling], [bottomFloor, bottomCeiling]];
        }

        return [[floor, ceil], extras, transfers];
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
    const appendUpdater = (map: typeof sectorZChanges, sector: Sector | undefined, updater: MapUpdater) => {
        if (!sector) {
            return;
        }
        const list = map.get(sector.num) ?? [];
        list.push(updater);
        map.set(sector.num, list);
    }

    const cacheTextures = (side: SideDef) => {
        if (!side) return;
        if (side.lower) textureAtlas.wallTexture(side.lower);
        if (side.middle) textureAtlas.wallTexture(side.middle);
        if (side.upper) textureAtlas.wallTexture(side.upper);
    }

    for (const rs of renderSectors) {
        rs.linedefs.forEach(ld => {
            const updater = mapBuilder.addLinedef(ld);
            linedefUpdaters.set(ld.num, updater);

            // In general, the necessary textures are cached as part of running the linedef updater however
            // if a two-sided linedef has a left and right texture then it will only use one at startup and later
            // (like, when a platform lowers) it may need the other but it may not be cached. So we explicitly cache
            // textures to make sure we've loaded everything into the atlas
            cacheTextures(ld.right);
            cacheTextures(ld.left);

            appendUpdater(sectorZChanges, rs.sector, updater);
            appendUpdater(sectorZChanges, ld.right.sector.transfer?.right?.sector, updater);
            appendUpdater(sectorZChanges, ld.left?.sector, updater);
            appendUpdater(sectorZChanges, ld.left?.sector?.transfer?.right?.sector, updater);
        });
        if (!rs.geometry) {
            // Plutonia MAP29?
            continue;
        }

        let [[floor, ceil], extras, transfers] = mapBuilder.addSector(rs);

        for (let i = 0; i < extras.length; i++) {
            let extra = rs.extraFlats[i];
            let idx = extras[i];
            // add a tiny offset to z to make sure extra flat is rendered above (floor) or below (ceil) the actual
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
            const [[topFloor, topCeiling], [bottomFloor, bottomCeiling]] = transfers;
            const changer = (m: MapGeometryUpdater) => {
                // TODO: also set palette? we need to choose colours based on palette first
                // (actually, this should be done in the player logic when the player moves into a sector with transfer then we check for palette change)
                // Set up the B partition using the normal floor/ceiling
                m.moveFlat(ceil, rs.sector.skyHeight ?? controlSec.zCeil);
                m.applyFlatTexture(ceil, rs.sector.ceilFlat);
                m.moveFlat(floor, controlSec.zFloor);
                m.applyFlatTexture(floor, rs.sector.floorFlat);

                if (rs.sector.zCeil > controlSec.zCeil) {
                    // position fake ceiling/floor to create A partition
                    m.moveFlat(topCeiling, rs.sector.skyHeight ?? rs.sector.zCeil);
                    m.applyFlatTexture(topCeiling, controlSec.ceilFlat);
                    m.moveFlat(topFloor, controlSec.zCeil);
                    m.applyFlatTexture(topFloor, controlSec.floorFlat);
                } else {
                    // hide A partition and use real ceiling
                    const zCeil = rs.sector.skyHeight ?? rs.sector.zCeil
                    m.moveFlat(topCeiling, zCeil + .1);
                    m.moveFlat(topFloor, zCeil + .1);
                }

                if (rs.sector.zFloor < controlSec.zFloor) {
                    // position fake ceiling/floor to create C partition
                    m.moveFlat(bottomCeiling, controlSec.zFloor);
                    m.applyFlatTexture(bottomCeiling, controlSec.ceilFlat);
                    m.moveFlat(bottomFloor, rs.sector.zFloor);
                    m.applyFlatTexture(bottomFloor, controlSec.floorFlat);
                } else {
                    // hide C partition and use real floor
                    m.moveFlat(bottomCeiling, controlSec.zFloor - .1);
                    m.moveFlat(bottomFloor, controlSec.zFloor - .1);
                }
            };

            appendUpdater(sectorZChanges, rs.sector, changer);
            appendUpdater(sectorZChanges, controlSec, changer);
            appendUpdater(sectorFlatChanges, rs.sector, changer);
            appendUpdater(sectorFlatChanges, controlSec, changer);
        }
    }

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
