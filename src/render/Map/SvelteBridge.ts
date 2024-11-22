import type { Vector3 } from 'three';
import { MapRuntime, PlayerMapObject as PMO, store, type MapObject as MO, type Sprite, type Store } from '../../doom';


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
    const dispose = () => {
        map.events.off('mobj-added', addMobj);
        map.events.off('mobj-updated-position', updateMobjPosition);
        map.events.off('mobj-updated-sprite', updateSprite);
    };
    return { dispose };
}
