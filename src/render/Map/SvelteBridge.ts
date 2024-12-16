import type { Vector3 } from 'three';
import { MapRuntime, MFFlags, PlayerMapObject as PMO, store, type LineDef, type MapObject as MO, type Sector, type Sprite, type Store } from '../../doom';
import type { RenderSector } from '../RenderData';

interface RenderData {
    position: Store<Vector3>
    direction: Store<number>
    sector: Store<Sector>
}

export interface MapObject1 extends MO {
    renderData: RenderData,
}

export interface PlayerMapObject extends PMO {
    renderData: RenderData,
}
export type MapObject = MapObject1 | PlayerMapObject;

export function bridgeEventsToReadables(map: MapRuntime, renderSectors: RenderSector[]) {
    // This is a hack to re-enable the $sprite readable for R1.
    const updateSprite = (mo: MapObject, sprite: Sprite) => {
        mo.renderData['direction']?.set(mo.direction);
        // NB: player needs special handling to update the weapon sprites
        if (mo === map.player) {
            map.player.sprite.set(map.player.sprite.val);
            map.player.weapon.val.sprite.set(map.player.weapon.val.sprite.val);
            map.player.weapon.val.flashSprite.set(map.player.weapon.val.flashSprite.val);
        } else {
            mo.sprite.set(sprite);
        }
    };
    const updateMobjPosition = (mo: MapObject) => {
        mo.renderData['position']?.set(mo.position);
        mo.renderData['sector']?.set(mo.sector);
    };
    const addMobj = (mo: MapObject) => {
        mo.renderData['position'] = store(mo.position);
        mo.renderData['direction'] = store(mo.direction);
        mo.renderData['sector'] = store(mo.sector);
    };

    map.objs.forEach(addMobj);
    map.events.on('mobj-added', addMobj);
    map.events.on('mobj-updated-position', updateMobjPosition);
    map.events.on('mobj-updated-sprite', updateSprite);

    map.data.sectors.forEach(sec => {
        sec.renderData['zFloor'] = store(sec.zFloor);
        sec.renderData['zCeil'] = store(sec.zCeil);
        sec.renderData['floorFlat'] = store(sec.floorFlat);
        sec.renderData['ceilFlat'] = store(sec.ceilFlat);
        sec.renderData['light'] = store(sec.light);
    });
    map.data.linedefs.forEach(ld => {
        if (ld.left) {
            ld.left.renderData['lower'] = store(ld.left.lower);
            ld.left.renderData['upper'] = store(ld.left.upper);
            ld.left.renderData['middle'] = store(ld.left.middle);
        }
        ld.right.renderData['lower'] = store(ld.right.lower);
        ld.right.renderData['upper'] = store(ld.right.upper);
        ld.right.renderData['middle'] = store(ld.right.middle);
    });
    const updateSectorZ = (sector: Sector) => {
        sector.renderData['zFloor'].set(sector.zFloor);
        sector.renderData['zCeil'].set(sector.zCeil);
    };
    const updateSectorFlat = (sector: Sector) => {
        sector.renderData['floorFlat'].set(sector.floorFlat);
        sector.renderData['ceilFlat'].set(sector.ceilFlat);
    };
    const updateSectorLight = (sector: Sector) => sector.renderData['light'].set(sector.light);
    const updateTexture = (line: LineDef) => {
        line.right.renderData['lower'].set(line.right.lower);
        line.right.renderData['middle'].set(line.right.middle);
        line.right.renderData['upper'].set(line.right.upper);
        if (line.left) {
            line.left.renderData['lower'].set(line.left.lower);
            line.left.renderData['middle'].set(line.left.middle);
            line.left.renderData['upper'].set(line.left.upper);
        }
    };
    map.events.on('sector-flat', updateSectorFlat);
    map.events.on('sector-light', updateSectorLight);
    map.events.on('sector-z', updateSectorZ);
    map.events.on('wall-texture', updateTexture);

    // keep render sector mobjs lists in sync with mobjs. The assumption here is that most objects won't change sectors
    // very often therefore it is cheaper to maintain the list this way rather than filtering the mobj list when
    // rendering the sector. On the other hand, we are updating lists when most sectors aren't even visible so...
    // TODO: Need some profiler input here,
    let secMap = new Map<Sector, RenderSector>();
    renderSectors.forEach(rs => secMap.set(rs.sector, rs));
    let mobjMap = new Map<MapObject, RenderSector>();
    const monitor = (mobj: MapObject) => {
        let sector: Sector = null;
        if (mobj.info.flags & MFFlags.MF_NOSECTOR) {
            return;
        }
        if (mobj.sector !== sector) {
            sector = mobj.sector;
            const lastRS = mobjMap.get(mobj);
            lastRS?.mobjs.update(s => { s.delete(mobj); return s });
            const nextRS = secMap.get(sector);
            mobjMap.set(mobj, nextRS)
            nextRS.mobjs.update(s => s.add(mobj));
        }
    }
    const unmonitor = (mobj: MapObject) => {
        const lastRS = mobjMap.get(mobj);
        lastRS?.mobjs.update(s => { s.delete(mobj); return s });
        mobjMap.delete(mobj);
    }
    map.objs.forEach(monitor);
    map.events.on('mobj-added', monitor);
    map.events.on('mobj-removed', unmonitor);
    map.events.on('mobj-updated-position', monitor);

    const dispose = () => {
        map.events.off('mobj-added', addMobj);
        map.events.off('mobj-updated-position', updateMobjPosition);
        map.events.off('mobj-updated-sprite', updateSprite);
        map.events.off('mobj-added', monitor);
        map.events.off('mobj-removed', unmonitor);
        map.events.off('mobj-updated-position', monitor);
        map.events.off('sector-flat', updateSectorFlat);
        map.events.off('sector-light', updateSectorLight);
        map.events.off('sector-z', updateSectorZ);
        map.events.off('wall-texture', updateTexture);
    };
    return { dispose };
}

// a common pattern with map.events is to watch for a specific object (mostly the player) to change so we
// create a little function to reduce the boiler plate code
export function monitorMapObject<T extends MO>(map: MapRuntime, mobj: T, fn: (mo: T) => void) {
    const onChange = (mo: T) => {
        if (mo === mobj) {
            fn(mo);
        }
    }
    fn(mobj);
    map.events.on('mobj-updated-position', onChange);
    return () => map.events.off('mobj-updated-position', onChange);
}