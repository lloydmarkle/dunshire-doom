import * as BufferGeometryUtils from 'three/examples/jsm/utils/BufferGeometryUtils';
import { BufferAttribute, IntType, PlaneGeometry, type BufferGeometry } from "three";
import type { MapTextureAtlas, TextureAtlas } from "./TextureAtlas";
import { HALF_PI, MapRuntime, type LineDef, type Sector, type SideDef, type Store, type Vertex, type WallTextureType } from "../../doom";
import type { RenderSector } from '../RenderData';
import { inspectorAttributeName } from './MapMeshMaterial';
import { sectorLightAnimations } from '../../doom/specials';

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
    let geos: BufferGeometry[] = [];
    let geoInfo: GeoInfo[] = [];
    let numVertex = 0;

    const createWallGeo = (width: number, height: number, mid: Vertex, top: number, angle: number) => {
        const geo = new PlaneGeometry(width, height);
        geo.rotateX(HALF_PI);
        geo.rotateZ(angle);
        geo.translate(mid.x, mid.y, top - height * .5);
        return geo;
    }

    const addWallGeometry = (geo: BufferGeometry, sectorNum: number) => {
        const vertexCount = geo.attributes.position.count;
        const vertexOffset = numVertex;
        numVertex += vertexCount;

        geo.setAttribute('texN', int16BufferFrom([0], vertexCount));
        geo.setAttribute('doomLight', int16BufferFrom([sectorNum], vertexCount));
        geo.setAttribute('doomOffset', sInt16BufferFrom([0, 0], vertexCount));
        geo.setAttribute(inspectorAttributeName, int16BufferFrom([0, 0], vertexCount));
        geos.push(geo);
        geoInfo.push({ vertexCount, vertexOffset, geom: null });
        return geoInfo[geoInfo.length - 1];
    };

    const addFlatGeometry = (geo: BufferGeometry, sectorNum: number) => {
        const vertexCount = geo.attributes.position.count;
        const vertexOffset = numVertex;
        numVertex += vertexCount;

        for (let i = 0; i < geo.attributes.uv.array.length; i++) {
            geo.attributes.uv.array[i] /= 64;
        }
        geo.setAttribute('texN', int16BufferFrom([0], vertexCount));
        geo.setAttribute('doomLight', int16BufferFrom([sectorNum], vertexCount));
        geo.setAttribute('doomOffset', sInt16BufferFrom([0, 0], vertexCount));
        geo.setAttribute(inspectorAttributeName, int16BufferFrom([1, sectorNum], vertexCount));
        geos.push(geo);
        geoInfo.push({ vertexCount, vertexOffset, geom: null });
        return geoInfo[geoInfo.length - 1];
    };

    const emptyPlane = () => new PlaneGeometry(0, 0)
        .setAttribute('texN', int16BufferFrom([0], 4))
        .setAttribute('doomLight', int16BufferFrom([0], 4))
        .setAttribute('doomOffset', sInt16BufferFrom([0, 0], 4))
        .setAttribute(inspectorAttributeName, int16BufferFrom([0, 0], 4));
    function build(name: string) {
        // NB: BufferGeometryUtils.mergeGeometries() fails if array is empty
        const geometry = geos.length ? BufferGeometryUtils.mergeGeometries(geos) : emptyPlane();
        geoInfo.forEach(e => e.geom = geometry);
        geometry.name = name;
        return geometry;
    }

    return { createWallGeo, addWallGeometry, addFlatGeometry, build };
}

type MapGeometryUpdater = ReturnType<typeof mapGeometryUpdater>;
type MapUpdater = (m: MapGeometryUpdater) => void;
interface LindefUpdater{
    lower: MapUpdater;
    upper:  MapUpdater;
    midLeft: MapUpdater;
    midRight: MapUpdater;
    single: MapUpdater;
}

function mapGeometryBuilder(textures: MapTextureAtlas) {
    const geoBuilder = geometryBuilder();
    const skyBuilder = geometryBuilder();
    const translucencyBuilder = geometryBuilder();

    const flatGeoBuilder = (flatName: string) =>
        flatName === 'F_SKY1' ? skyBuilder : geoBuilder;

    const chooseTexture = (ld: LineDef, type: WallTextureType, useLeft = false) => {
        let textureL = ld.left?.[type];
        let textureR = ld.right[type];
        return useLeft ? (textureL ?? textureR) : (textureR ?? textureL);
    }

    const addLinedef = (ld: LineDef): LindefUpdater => {
        const vx = ld.v[1].x - ld.v[0].x;
        const vy = ld.v[1].y - ld.v[0].y;
        const width = Math.sqrt(vx * vx + vy * vy);
        const result: LindefUpdater = {
            lower: null,
            upper: null,
            midLeft: null,
            midRight: null,
            single: null,
        };
        if (width === 0) {
            return result;
        }

        const inspectVal = [0, ld.num];
        const mid = {
            x: (ld.v[1].x + ld.v[0].x) * 0.5,
            y: (ld.v[1].y + ld.v[0].y) * 0.5,
        };
        const angle = Math.atan2(vy, vx);

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
        const ceilFlatL = ld.left?.sector?.ceilFlat;
        const ceilFlatR = ld.right.sector.ceilFlat;
        const needSkyWall = ceilFlatR === 'F_SKY1';
        const skyHack = (ceilFlatL === 'F_SKY1' && needSkyWall);
        const skyHeight = ld.right.sector.skyHeight;

        let builder = geoBuilder;
        if (ld.special === 260) {
            builder = translucencyBuilder;
        }
        function applySpecials(geo: BufferGeometry) {
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
        }

        // texture alignment is complex https://doomwiki.org/wiki/Texture_alignment
        function pegging(type: WallTextureType, height: number) {
            let offset = 0;
            if (ld.left) {
                if (type === 'lower' && (ld.flags & 0x0010)) {
                    // unpegged so subtract higher floor from ceiling to get real offset
                    // NOTE: we use skyheight (if available) instead of zCeil because of the blue wall switch in E3M6.
                    offset = (skyHeight ?? ld.right.sector.zCeil) - Math.max(ld.left.sector.zFloor, ld.right.sector.zFloor);
                } else if (type === 'upper' && !(ld.flags & 0x0008)) {
                    offset = -height;
                } else if (type === 'middle' && (ld.flags & 0x0010)) {
                    offset = -height;
                }
            } else if (ld.flags & 0x0010) {
                // peg to floor (bottom left)
                offset = -height;
            }
            return offset;
        }

        if (needSkyWall && !skyHack) {
            const geo = skyBuilder.createWallGeo(width, skyHeight - ld.right.sector.zCeil, mid, skyHeight, angle);
            skyBuilder.addWallGeometry(geo, ld.right.sector.num);
            geo.setAttribute(inspectorAttributeName, int16BufferFrom(inspectVal, geo.attributes.position.count));
        }

        if (ld.left) {
            // two-sided so figure out top
            if (!skyHack) {
                let left = false;
                const geo = builder.createWallGeo(width, height, mid, top, angle);
                const idx = builder.addWallGeometry(geo, ld.right.sector.num);
                geo.setAttribute(inspectorAttributeName, int16BufferFrom(inspectVal, geo.attributes.position.count));
                applySpecials(geo);

                result.upper = m => {
                    let useLeft = ld.left.sector.zCeil > ld.right.sector.zCeil;
                    const top = Math.max(ld.right.sector.zCeil, ld.left.sector.zCeil);
                    const height = top - Math.min(ld.right.sector.zCeil, ld.left.sector.zCeil);
                    const side = useLeft ? ld.left : ld.right;
                    m.changeWallHeight(idx, top, height);
                    m.applyWallTexture(idx, chooseTexture(ld, 'upper', useLeft),
                        width, height,
                        side.xOffset.initial, side.yOffset.initial + pegging('upper', height));
                    if (left !== useLeft) {
                        m.flipWallFace(idx, side.sector.num);
                        left = useLeft;
                    }
                };
            }
            // And bottom
            if (true) {
                let left = false;
                const geo = builder.createWallGeo(width, height, mid, top, angle);
                const idx = builder.addWallGeometry(geo, ld.right.sector.num);
                geo.setAttribute(inspectorAttributeName, int16BufferFrom(inspectVal, geo.attributes.position.count));
                applySpecials(geo);

                result.lower = m => {
                    let useLeft = ld.right.sector.zFloor > ld.left.sector.zFloor;
                    // FIXME: LD#40780 in Sunder MAP20 has zfighting. I think it's from big negative yoffset which pushes
                    // the middle wall down and perhaps it should push the top of this wall down too. I'm not sure.
                    // The sector floors also have problems in that area so something isn't right. (special 242)
                    const side = useLeft ? ld.left : ld.right;
                    const top = Math.max(ld.right.sector.zFloor, ld.left.sector.zFloor);
                    const height = top - Math.min(ld.right.sector.zFloor, ld.left.sector.zFloor);
                    m.changeWallHeight(idx, top, height);
                    m.applyWallTexture(idx, chooseTexture(ld, 'lower', useLeft),
                        width, height,
                        side.xOffset.initial, side.yOffset.initial + pegging('lower', height));
                    if (left !== useLeft) {
                        m.flipWallFace(idx, side.sector.num);
                        left = useLeft;
                    }
                };
            }

            // And middle(s)
            const middleUpdater = (idx: GeoInfo, side: SideDef) => (m: MapGeometryUpdater) => {
                const tx = chooseTexture(ld, 'middle', side === ld.left);
                const pic = textures.wallTexture(tx)[1];
                const zFloor = Math.max(ld.left.sector.zFloor, ld.right.sector.zFloor);
                const zCeil = Math.min(ld.left.sector.zCeil, ld.right.sector.zCeil);
                // double sided linedefs (generally for semi-transparent textures like gates/fences) do not repeat vertically
                // and lower unpegged sticks to the ground
                let top = ((ld.flags & 0x0010) ? Math.min(zFloor + pic.height, zCeil) : zCeil) + side.yOffset.val;
                // don't repeat so clip by height or floor/ceiling gap
                let height = Math.min(pic.height, zCeil - zFloor + side.yOffset.val);
                m.changeWallHeight(idx, top, height);
                m.applyWallTexture(idx, tx, width, height,
                    side.xOffset.initial, pegging('middle', height));
            };
            if (ld.left.middle) {
                const geo = builder.createWallGeo(width, height, mid, top, angle + Math.PI);
                const idx = builder.addWallGeometry(geo, ld.left.sector.num);
                geo.setAttribute(inspectorAttributeName, int16BufferFrom(inspectVal, geo.attributes.position.count));
                applySpecials(geo);

                result.midLeft = middleUpdater(idx, ld.left);
            }
            if (ld.right.middle) {
                const geo = builder.createWallGeo(width, height, mid, top, angle);
                const idx = builder.addWallGeometry(geo, ld.right.sector.num);
                geo.setAttribute(inspectorAttributeName, int16BufferFrom(inspectVal, geo.attributes.position.count));
                applySpecials(geo);

                result.midRight = middleUpdater(idx, ld.right);
            }

        } else {
            const geo = builder.createWallGeo(width, height, mid, top, angle);
            const idx = builder.addWallGeometry(geo, ld.right.sector.num);
            geo.setAttribute(inspectorAttributeName, int16BufferFrom(inspectVal, geo.attributes.position.count));
            applySpecials(geo);

            result.single = m => {
                const height = ld.right.sector.zCeil - ld.right.sector.zFloor;
                m.changeWallHeight(idx, ld.right.sector.zCeil, height);
                m.applyWallTexture(idx, chooseTexture(ld, 'middle'),
                    width, height,
                    ld.right.xOffset.initial, ld.right.yOffset.initial + pegging('middle', height));
            };
        }
        return result;
    }

    const addSector = (rs: RenderSector): [GeoInfo, GeoInfo, GeoInfo[]] => {
        const floorGeo =  rs.geometry.clone();
        const floor = flatGeoBuilder(rs.sector.floorFlat).addFlatGeometry(floorGeo, rs.sector.num);

        const ceilGeo = rs.geometry.clone();
        // flip over triangles for ceiling
        flipWindingOrder(ceilGeo);
        const ceil = flatGeoBuilder(rs.sector.ceilFlat).addFlatGeometry(ceilGeo, rs.sector.num);

        let extras: GeoInfo[] = [];
        for (const extra of rs.extraFlats) {
            const geo = extra.geometry.clone();
            if (extra.ceil) {
                flipWindingOrder(geo);
            }
            const flat = extra.ceil ? extra.flatSector.ceilFlat : extra.flatSector.floorFlat;
            extras.push(flatGeoBuilder(flat).addFlatGeometry(geo, extra.lightSector.num));
        }
        return [ceil, floor, extras];
    }

    function build() {
        const skyGeometry = skyBuilder.build('sky');
        const translucentGeometry = translucencyBuilder.build('map-translucent');
        const geometry = geoBuilder.build('map');
        return { geometry, skyGeometry, translucentGeometry, updater: mapGeometryUpdater(textures) };
    }

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
            flipWallFace: (idx, n) => pendingUpdates.push(m => m.flipWallFace(idx, n)),
        };
    })();

    const mapBuilder = mapGeometryBuilder(textureAtlas);

    // We're going to subscribe to a whole bunch of property change events so we better keep track of
    // the unsubscribes so we don't leak memory in HMR situation (or when reloading a map)
    let disposables: (() => void)[] = [];
    let linedefUpdaters = new Map<number, LindefUpdater>();
    const sectorZChanges = new Map<number, (() => void)[]>();
    const sectorFlatChanges = new Map<number, (() => void)[]>();
    const appendUpdater = (map: typeof sectorZChanges, sector: Sector, updater: () => void) => {
        const list = map.get(sector.num) ?? [];
        list.push(updater);
        map.set(sector.num, list);
    }

    for (const rs of renderSectors) {
        rs.linedefs.map(ld => {
            const updaters = mapBuilder.addLinedef(ld);
            linedefUpdaters.set(ld.num, updaters);

            if (ld.left) {
                if (updaters.lower) {
                    ld.left.renderData['lower'] = () => updaters.lower(mapUpdater);
                    ld.right.renderData['lower'] = () => updaters.lower(mapUpdater);
                }
                if (updaters.upper) {
                    ld.left.renderData['upper'] = () => updaters.upper(mapUpdater);
                    ld.right.renderData['upper'] = () => updaters.upper(mapUpdater);
                }
                if (updaters.midLeft) {
                    ld.left.renderData['middle'] = () => updaters.midLeft(mapUpdater);
                }
            }
            ld.right.renderData['middle'] = () => {
                updaters.midRight?.(mapUpdater);
                updaters.single?.(mapUpdater);
            }
        });
        if (!rs.geometry) {
            // Plutonia MAP29?
            continue;
        }

        let [ceil, floor, extras] = mapBuilder.addSector(rs);

        appendUpdater(sectorZChanges, rs.sector, () => {
            mapUpdater.moveFlat(floor, rs.sector.zFloor);
            mapUpdater.moveFlat(ceil, rs.sector.skyHeight ?? rs.sector.zCeil);
        });
        appendUpdater(sectorFlatChanges, rs.sector, () => {
            mapUpdater.applyFlatTexture(ceil, rs.sector.ceilFlat);
            mapUpdater.applyFlatTexture(floor, rs.sector.floorFlat);
        });

        for (let i = 0; i < extras.length; i++) {
            let extra = rs.extraFlats[i];
            let idx = extras[i];
            // add a tiny offset to z to make sure extra flat is rendered below (floor) or above) ceil) the actual
            // flat to avoid z-fighting. We can use a small offset because doom z values are integers except when the
            // platform is moving but we can tolerate a small error for moving platforms.
            let zOffset = extra.ceil ? 0.0001 : -0.0001;
            appendUpdater(sectorZChanges, extra.zSector, () => mapUpdater.moveFlat(idx, zOffset + (extra.ceil ? extra.zSector.zCeil : extra.zSector.zFloor)));
            appendUpdater(sectorFlatChanges, extra.flatSector, () => mapUpdater.applyFlatTexture(idx, (extra.ceil ? extra.flatSector.ceilFlat : extra.flatSector.floorFlat)));
        }
    }

    const updateSidedefTexture = (side: SideDef, prop: WallTextureType) => side.renderData[prop]?.();
    mapRuntime.events.on('wall-texture', updateSidedefTexture);
    disposables.push(() => mapRuntime.events.off('wall-texture', updateSidedefTexture));

    // try to minimize subscriptions by grouping lindefs that listen to a sector change
    // and only subscribing to that sector once. I'm not sure it's worth it. Actually, I'm
    // not sure using svelte store makes sense anymore at all and I'll probably remove it
    // which should make this all simpler (I hope)
    for (const rs of renderSectors) {
        const updaters = [...new Set([
            ...rs.sector.portalSegs?.map(seg => seg.linedef) ?? [],
            ...rs.linedefs.map(ld => ld)
        ])];

        const lowers = updaters.map(e => linedefUpdaters.get(e.num)?.lower).filter(e => e);
        const uppers = updaters.map(e => linedefUpdaters.get(e.num)?.upper).filter(e => e);
        const midLefts = updaters.map(e => linedefUpdaters.get(e.num)?.midLeft).filter(e => e);
        const midRights = updaters.map(e => linedefUpdaters.get(e.num)?.midRight).filter(e => e);
        const singles = updaters.map(e => linedefUpdaters.get(e.num)?.single).filter(e => e);
        appendUpdater(sectorZChanges, rs.sector, () => {
            lowers.forEach(fn => fn(mapUpdater));
            uppers.forEach(fn => fn(mapUpdater));
            midLefts.forEach(fn => fn(mapUpdater));
            midRights.forEach(fn => fn(mapUpdater));
            singles.forEach(fn => fn(mapUpdater));
        });
    }

    const updateSectorFlat = (sector: Sector) => sectorFlatChanges.get(sector.num).forEach(fn => fn());
    mapRuntime.events.on('sector-flat', updateSectorFlat);
    disposables.push(() => mapRuntime.events.off('sector-flat', updateSectorFlat));

    const updateSectorZ = (sector: Sector) => sectorZChanges.get(sector.num).forEach(fn => fn());
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

        // apply new sector light
        geo.attributes.doomLight.array.fill(sectorNum, info.vertexOffset, info.vertexOffset + info.vertexCount);
        geo.attributes.doomLight.needsUpdate = true;

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

    return {
        moveFlat,
        applyFlatTexture,
        applyWallTexture,
        changeWallHeight,
        flipWallFace,
    }
}
