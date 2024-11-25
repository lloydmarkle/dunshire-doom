import type { Vector3 } from 'three';
import { MapRuntime, PlayerMapObject as PMO, store, type MapObject as MO, type Sector, type SideDef, type Sprite, type Store, type WallTextureType } from '../../doom';


interface RenderData {
    position: Store<Vector3>
    direction: Store<number>
}

export interface MapObject1 extends MO {
    renderData: RenderData,
}

export interface PlayerMapObject extends PMO {
    renderData: RenderData,
}
export type MapObject = MapObject1 | PlayerMapObject;

export function bridgeEventsToReadables(map: MapRuntime) {
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
    }

    const updateMobjPosition = (mo: MapObject) => mo.renderData['position']?.set(mo.position);

    const addMobj = (mo: MapObject) => {
        mo.renderData['position'] = store(mo.position);
        mo.renderData['direction'] = store(mo.direction);
    }

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
    const updateTexture = (side: SideDef, prop: WallTextureType) => side.renderData[prop].set(side[prop]);
    map.events.on('sector-flat', updateSectorFlat);
    map.events.on('sector-light', updateSectorLight);
    map.events.on('sector-z', updateSectorZ);
    map.events.on('wall-texture', updateTexture);

    const dispose = () => {
        map.events.off('mobj-added', addMobj);
        map.events.off('mobj-updated-position', updateMobjPosition);
        map.events.off('mobj-updated-sprite', updateSprite);
        map.events.off('sector-flat', updateSectorFlat);
        map.events.off('sector-light', updateSectorLight);
        map.events.off('sector-z', updateSectorZ);
        map.events.off('wall-texture', updateTexture);
    };
    return { dispose };
}
