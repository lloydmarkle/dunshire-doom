import { ActionIndex, MapObjectIndex, mapObjectInfo, type MapObjectInfo } from '../doom-things-info';
import type { MapObject} from '../map-object';
import { weaponItems, weaponActions } from './weapons';
import { monsters, monsterActions, monsterAiActions, monsterMoveActions } from './monsters';
import { ammunitions } from './ammunitions';
import { items, powerups } from './items+powerups';
import { keys } from './keys';
import { obstacles, actions as obstacleActions } from './obstacles';
import { decorations } from './decorations';
import { other } from './other';
import type { PickupFunction } from './pickup';

export { inventoryWeapon, weaponTop, PlayerWeapon } from './weapons';

export interface ThingType {
    type: number;
    // Adapted from https://doomwiki.org/wiki/Thing_types
    class:
        'M'   // monster
        | 'W' // weapon
        | 'A' // ammo
        | 'I' // item
        | 'P' // powerup
        | 'K' // key
        | 'O' // obstacle
        | 'D' // decoration
        | 'S'; // player (start/teleport)
    description: string;
    onPickup?: PickupFunction;
}

export interface ThingSpec extends ThingType {
    mo: MapObjectInfo;
    moType: MapObjectIndex;
}

const specCache: { [key in MapObjectIndex]?: ThingSpec } = {};
const things = [monsters, weaponItems, ammunitions, items, powerups, keys, obstacles, decorations, other].flat();
export function thingSpec(moType: MapObjectIndex): ThingSpec {
    let spec = specCache[moType];
    if (!spec) {
        const mo = mapObjectInfo[moType];
        // TODO: changes needed to support coop
        const t = moType === MapObjectIndex.MT_PLAYER ? other[0]
            : things.find(e => e.type === mo.doomednum);
        specCache[moType] = spec = { ...t, moType, mo };
    }
    return spec;
}

const noActions = {};
const actions = {
    ...obstacleActions,
    ...monsterActions,
    [ActionIndex.A_BFGSpray]: weaponActions[ActionIndex.A_BFGSpray],
}
export const stateChangeAction = (action: ActionIndex, mobj: MapObject) => {
    // disable ai actions based on setting (but we must not disable BOSSPIT because that is the thing that triggers the MAP30 spawning)
    const aiActions =
        // enable full AI for MAP30 boss to feel pain and fire cubes (what the cubes do is up to the other conditions here)
        mobj.type === MapObjectIndex.MT_BOSSSPIT ? monsterAiActions :
        mobj.map.game.settings.monsterAI.val === 'move-only' ? monsterMoveActions :
        mobj.map.game.settings.monsterAI.val === 'disabled' ? noActions :
        monsterAiActions;
    const fn = actions[action] ?? aiActions[action];
    return fn?.(mobj);
};