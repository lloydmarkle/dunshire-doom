// kind of based on p_spec.c
import { MapObject, PlayerMapObject } from "./map-object";
import { MFFlags, MapObjectIndex, SoundIndex, StateIndex } from "./doom-things-info";
import type { MapRuntime } from "./map-runtime";
import { zeroVec, type LineDef, type Sector, hittableThing } from "./map-data";
import { _T } from "./text";

// TODO: this whole thing could be a fun candidate for refactoring. I honestly think we could write
// all this stuff in a much cleaner way but first step would be to add some unit tests and then get to it!

// General
export function triggerSpecial(mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1) {
    if (linedef.special === 9) {
        return donut(mobj, linedef, trigger, side);
    }
    // TODO: soooo many warnings from doing it this way. It would be better to have a single array rather than one per action type
    return (
        createDoorAction(mobj, linedef, trigger, side) ??
        createLiftAction(mobj, linedef, trigger) ??
        createFloorAction(mobj, linedef, trigger) ??
        createCeilingAction(mobj, linedef, trigger) ??
        createCrusherCeilingAction(mobj, linedef, trigger) ??
        createLightingAction(mobj, linedef, trigger) ??
        applyTeleportAction(mobj, linedef, trigger, side) ??
        createRisingStairAction(mobj, linedef, trigger) ??
        createLevelExitAction(mobj, linedef, trigger, side)
    );
}

// Push, Switch, Walk, Gun (shoot)
export type TriggerType = 'P' | 'S' | 'W' | 'G';
const ticksPerSecond = 35;
const floorMax = 32000;
export interface SpecialDefinition {
    repeatable: boolean;
}

type TargetValueFunction = (map: MapRuntime, sector: Sector) => number;

const findLowestCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zCeil.val), floorMax)
const lowestNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zFloor.val), sector.zFloor.val);
const highestNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zFloor.val), -floorMax);
const nextNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => sec.zFloor.val > sector.zFloor.val ? Math.min(last, sec.zFloor.val) : last, floorMax);
const lowestNeighbourCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zCeil.val), sector.zCeil.val);
const highestNeighbourCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zCeil.val), -floorMax);
const floorHeight = (map: MapRuntime, sector: Sector) => sector.zFloor.val;

const shortestLowerTexture = (map: MapRuntime, sector: Sector) => {
    let target = floorMax;
    // https://www.doomworld.com/forum/topic/95030-why-does-raise-floor-by-shortest-lower-texture-only-half-work-on-older-ports/#comment-1770824
    // solves a bug in Doom2's MAP15 but it really doesn't feel right. I'm guessing almost every doom "shortest lower texture"
    // lindef out there expects 64px (or less) rise because, in my opinion, it's highly unlikely both side lower textures are set
    const missingTextureSize = 64;
    for (const ld of map.data.linedefs) {
        if (ld.left?.sector === sector || ld.right.sector === sector) {
            const ltx = map.game.wad.wallTextureData(ld.left.lower.val);
            const rtx = map.game.wad.wallTextureData(ld.right.lower.val);
            target = Math.min(target, (ltx?.height ?? missingTextureSize), (rtx?.height ?? missingTextureSize));
        }
    }
    return sector.zFloor.val + target;
};
const floorValue = (map: MapRuntime, sector: Sector) => sector.zFloor.val;
const adjust = (fn: TargetValueFunction, change: number) => (map: MapRuntime, sector: Sector) => fn(map, sector) + change;

type SectorSelectorFunction = (map: MapRuntime, sector: Sector, linedef: LineDef) => Sector;
const selectNum = (map: MapRuntime, sector: Sector) => {
    let line: LineDef = null;
    for (const ld of map.data.linedefs) {
        if (ld.left) {
            if (ld.left.sector === sector && ld.right.sector.zFloor.val === sector.zFloor.val) {
                line = (line && line.num < ld.num) ? line : ld;
            }
        }
    }
    return line ? line.right.sector : sector;
}

const selectTrigger = (map: MapRuntime, sector: Sector, linedef: LineDef) => {
    return (!linedef.left || sector === linedef.left.sector) ? linedef.right.sector : linedef.left.sector;
}

// effects
type EffectFunction = (map: MapRuntime, sector: Sector, linedef: LineDef) => void;
type SectorEffectFunction = (map: MapRuntime, from: Sector, to: Sector) => void;
const effect = (effects: SectorEffectFunction[], select: SectorSelectorFunction) =>
    (map: MapRuntime, to: Sector, linedef: LineDef) => {
        const from = select(map, to, linedef);
        effects.forEach(ef => ef(map, from, to))
    };

const assignFloorFlat = (map: MapRuntime, from: Sector, to: Sector) => {
    to.floorFlat.set(from.floorFlat.val);
    map.initializeTextureAnimation(to.floorFlat, 'flat');
}

const assignSectorType = (map: MapRuntime, from: Sector, to: Sector) => {
    to.type = from.type;
}

const zeroSectorType = (map: MapRuntime, from: Sector, to: Sector) => {
    to.type = 0;
}

const sectorObjects = (map: MapRuntime, sector: Sector) =>
    map.objs.filter(e => e.touchingSector(sector));

function crunchMapObject(mobj: MapObject) {
    if (mobj.info.flags & MFFlags.MF_DROPPED) {
        // dropped items get destroyed
        mobj.map.destroy(mobj);
        return false;
    }

    if (mobj.isDead) {
        // crunch any bodies into blood pools
        mobj.setState(StateIndex.S_GIBS);
        mobj.info.flags &= ~MFFlags.MF_SOLID;
        mobj.info.height = 0;
        return false;
    }
    // we must have hit something solid
    return true;
}

const crushVelocity = 255 * (1 << 12) / (1 << 16);
function crunchAndDamageMapObject(mobj: MapObject) {
    let hitSolid = crunchMapObject(mobj);
    if ((mobj.info.flags & MFFlags.MF_SHOOTABLE) && (mobj.map.game.time.tick.val & 3) === 0) {
        hitSolid = true;
        mobj.damage(10, null, null);
        // spray blood
        const pos = mobj.position;
        const blood = mobj.map.spawn(MapObjectIndex.MT_BLOOD, pos.x, pos.y, pos.z + mobj.info.height * .5);
        blood.velocity.set(
            crushVelocity * mobj.rng.real2(),
            crushVelocity * mobj.rng.real2(),
            0);
    }
    return hitSolid;
}

// Doors
const normal = 2;
const blaze = 4 * normal;
type DoorFunction = 'openWaitClose' | 'openAndStay' | 'closeAndStay' | 'closeWaitOpen';
const doorDefinition = (type: number, trigger: string, key: 'R' | 'Y' | 'B' | 'No', speed: number, topWaitS: number, func: DoorFunction) => ({
    type,
    function: func,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    speed,
    key: key === 'No' ? undefined : key,
    topWait: topWaitS * ticksPerSecond,
    monsterTrigger: type === 1,
});

// https://doomwiki.org/wiki/Linedef_type#Door_linedef_types
const doorDefinitions = [
    doorDefinition(1, 'PR', 'No', normal, 4, 'openWaitClose'),
    doorDefinition(117, 'PR', 'No', blaze, 4, 'openWaitClose'),
    doorDefinition(63, 'SR', 'No', normal, 4, 'openWaitClose'),
    doorDefinition(114, 'SR', 'No', blaze, 4, 'openWaitClose'),
    doorDefinition(29, 'S1', 'No', normal, 4, 'openWaitClose'),
    doorDefinition(111, 'S1', 'No', blaze, 4, 'openWaitClose'),
    doorDefinition(90, 'WR', 'No', normal, 4, 'openWaitClose'),
    doorDefinition(105, 'WR', 'No', blaze, 4, 'openWaitClose'),
    doorDefinition(4, 'W1', 'No', normal, 4, 'openWaitClose'),
    doorDefinition(108, 'W1', 'No', blaze, 4, 'openWaitClose'),
    doorDefinition(31, 'P1', 'No', normal, -1, 'openAndStay'),
    doorDefinition(118, 'P1', 'No', blaze, -1, 'openAndStay'),
    doorDefinition(61, 'SR', 'No', normal, -1, 'openAndStay'),
    doorDefinition(115, 'SR', 'No', blaze, -1, 'openAndStay'),
    doorDefinition(103, 'S1', 'No', normal, -1, 'openAndStay'),
    doorDefinition(112, 'S1', 'No', blaze, -1, 'openAndStay'),
    doorDefinition(86, 'WR', 'No', normal, -1, 'openAndStay'),
    doorDefinition(106, 'WR', 'No', blaze, -1, 'openAndStay'),
    doorDefinition(2, 'W1', 'No', normal, -1, 'openAndStay'),
    doorDefinition(109, 'W1', 'No', blaze, -1, 'openAndStay'),
    doorDefinition(46, 'GR', 'No', normal, -1, 'openAndStay'),
    doorDefinition(42, 'SR', 'No', normal, -1, 'closeAndStay'),
    doorDefinition(116, 'SR', 'No', blaze, -1, 'closeAndStay'),
    doorDefinition(50, 'S1', 'No', normal, -1, 'closeAndStay'),
    doorDefinition(113, 'S1', 'No', blaze, -1, 'closeAndStay'),
    doorDefinition(75, 'WR', 'No', normal, -1, 'closeAndStay'),
    doorDefinition(107, 'WR', 'No', blaze, -1, 'closeAndStay'),
    doorDefinition(3, 'W1', 'No', normal, -1, 'closeAndStay'),
    doorDefinition(110, 'W1', 'No', blaze, -1, 'closeAndStay'),
    doorDefinition(76, 'WR', 'No', normal, 30, 'closeWaitOpen'),
    doorDefinition(16, 'W1', 'No', normal, 30, 'closeWaitOpen'),
    // Key doors
    doorDefinition(26, 'PR', 'B', normal, 4, 'openWaitClose'),
    doorDefinition(28, 'PR', 'R', normal, 4, 'openWaitClose'),
    doorDefinition(27, 'PR', 'Y', normal, 4, 'openWaitClose'),
    doorDefinition(32, 'P1', 'B', normal, 1, 'openAndStay'),
    doorDefinition(33, 'P1', 'R', normal, -1, 'openAndStay'),
    doorDefinition(34, 'P1', 'Y', normal, -1, 'openAndStay'),
    doorDefinition(99, 'SR', 'B', blaze, -1, 'openAndStay'),
    doorDefinition(134, 'SR', 'R', blaze, -1, 'openAndStay'),
    doorDefinition(136, 'SR', 'Y', blaze, -1, 'openAndStay'),
    doorDefinition(133, 'S1', 'B', blaze, -1, 'openAndStay'),
    doorDefinition(135, 'S1', 'R', blaze, -1, 'openAndStay'),
    doorDefinition(137, 'S1', 'Y', blaze, -1, 'openAndStay'),
];

export const createDoorAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = doorDefinitions.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid door type', linedef.special);
        return;
    }
    const validTrigger = (
        def.trigger === trigger
        // treat P === S because P is a special case (local door) and does not need a sector tag
        || (trigger === 'S' && def.trigger === 'P')
    )
    if (!validTrigger) {
        return;
    }
    if (mobj.isMonster && !def.monsterTrigger) {
        return;
    }
    const missingKey = def.key && mobj instanceof PlayerMapObject && !mobj.inventory.val.keys.toUpperCase().includes(def.key);
    if (missingKey) {
        const msg = trigger === 'S'
            ? (
                def.key === 'B' ? 'PD_BLUEK' :
                def.key === 'R' ? 'PD_REDK' :
                'PD_YELLOWK')
            : (
                def.key === 'B' ? 'PD_BLUEO' :
                def.key === 'R' ? 'PD_REDO' :
                'PD_YELLOWO'
            )
        mobj.hudMessage.set(_T(msg));
        mobj.map.game.playSound(SoundIndex.sfx_oof);
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0; // one time action so clear special
    }

    const doorSound = (sector: Sector) =>
        sector.specialData && mobj.map.game.playSound(sector.specialData > 0 ? SoundIndex.sfx_doropn : SoundIndex.sfx_dorcls, sector);

    // TODO: interpolate (actually, this needs to be solved in a general way for all moving things)

    let triggered = false;
    const sectors = def.trigger === 'P' ? [linedef.left.sector] : map.data.sectors.filter(e => e.tag === linedef.tag)
    for (const sector of sectors) {
        if (sector.specialData !== null) {
            if (def.trigger === 'P') {
                // push doors can be interrupted:
                // close->open doors should go back open
                // open->close doors should close
                // other types continue along
                if (def.function === 'closeWaitOpen') {
                    sector.specialData = (sector.specialData === 0) ? 1 : -sector.specialData;
                }
                if (def.function === 'openWaitClose') {
                    sector.specialData = (sector.specialData === 0) ? -1 : -sector.specialData;
                }
                doorSound(sector);
            }
            continue;
        }
        triggered = true;
        sector.specialData = def.function === 'openAndStay' || def.function === 'openWaitClose' ? 1 : -1;
        doorSound(sector);

        const topHeight = def.type === 16 || def.type === 76
            ? sector.zCeil.val : (findLowestCeiling(map, sector) - 4);
        let ticks = 0;
        const action = () => {
            if (sector.specialData === 0) {
                // waiting
                if (ticks--) {
                    return;
                }
                if (def.function === 'closeWaitOpen' || def.function === 'openWaitClose') {
                    sector.specialData = def.function === 'openWaitClose' ? -1 : 1;
                }
                doorSound(sector);
                return;
            }

            // move door
            const mobjs = sectorObjects(map, sector);
            sector.zCeil.update(val => {
                let original = val;
                val += def.speed * sector.specialData;

                let finished = false;
                if (val > topHeight) {
                    // hit ceiling
                    finished = def.function === 'closeWaitOpen' || def.function === 'openAndStay';
                    ticks = def.topWait;
                    val = topHeight;
                    sector.specialData = 0;
                } else if (val < sector.zFloor.val) {
                    // hit floor
                    finished = def.function === 'openWaitClose' || def.function === 'closeAndStay';
                    ticks = def.topWait;
                    val = sector.zFloor.val;
                    sector.specialData = 0;
                }

                // crush (and reverse direction)
                if (sector.specialData === -1) {
                    const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor.val, val));
                    if (crushing.length) {
                        let hitSolid = crushing.reduce((res, mo) => crunchMapObject(mo) || res, false);
                        if (hitSolid) {
                            // force door to open
                            sector.specialData = 1;
                            return original;
                        }
                    }
                }

                if (finished) {
                    map.removeAction(action);
                    sector.specialData = null;
                }
                return val;
            });
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
        };
        map.addAction(action);
    }

    return triggered ? def : undefined;
};

// Lifts
const liftDefinition = (type: number, trigger: string, waitTimeS: number, speed: number, direction: number, targetHighFn: TargetValueFunction, actionType: 'normal' | 'perpetual' | 'stop' = 'normal', effect?: EffectFunction) => ({
    type,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    speed,
    direction,
    effect,
    perpetual: actionType === 'perpetual',
    targetHighFn,
    stopper: actionType === 'stop',
    monsterTrigger: trigger.includes('m'),
    waitTime: waitTimeS * ticksPerSecond,
});

// Some combination of the unofficial doom spec https://www.gamers.org/dhs/helpdocs/dmsp1666.html
// and doomwiki https://doomwiki.org/wiki/Linedef_type#Platforms_.28lifts.29
// Note doomwiki categorizes some floor movements as "lifts" while the doom spec calls them moving floors
const liftDefinitions = [
    liftDefinition(14, 'S1', 0, .5, 1, adjust(floorValue, 32), 'normal', effect([assignFloorFlat, zeroSectorType], selectTrigger)),
    liftDefinition(15, 'S1', 0, .5, 1, adjust(floorValue, 24), 'normal', effect([assignFloorFlat], selectTrigger)),
    liftDefinition(20, 'S1', 0, .5, 1, nextNeighbourFloor, 'normal', effect([assignFloorFlat, zeroSectorType], selectTrigger)),
    liftDefinition(22, 'W1', 0, .5, 1, nextNeighbourFloor, 'normal', effect([assignFloorFlat, zeroSectorType], selectTrigger)),
    liftDefinition(47, 'G1', 0, .5, 1, nextNeighbourFloor, 'normal', effect([assignFloorFlat, zeroSectorType], selectTrigger)),
    liftDefinition(66, 'SR', 0, 0.5, 1, adjust(floorValue, 24), 'normal', effect([assignFloorFlat], selectTrigger)),
    liftDefinition(67, 'SR', 0, 0.5, 1, adjust(floorValue, 32), 'normal', effect([assignFloorFlat, zeroSectorType], selectTrigger)),
    liftDefinition(68, 'SR', 0, 0.5, 1, nextNeighbourFloor, 'normal', effect([assignFloorFlat, zeroSectorType], selectTrigger)),
    liftDefinition(95, 'WR', 0, 0.5, 1, nextNeighbourFloor, 'normal', effect([assignFloorFlat, zeroSectorType], selectTrigger)),
    liftDefinition(54, 'W1', 0, 0, 0, floorValue, 'stop'),
    liftDefinition(89, 'WR', 0, 0, 0, floorValue, 'stop'),
    liftDefinition(10, 'W1m', 3, 4, -1, floorValue),
    liftDefinition(21, 'S1', 3, 4, -1, floorValue),
    liftDefinition(53, 'SR', 3, 1, -1, highestNeighbourFloor, 'perpetual'),
    liftDefinition(62, 'SR', 3, 4, -1, floorValue),
    liftDefinition(87, 'WR', 3, 1, -1, highestNeighbourFloor, 'perpetual'),
    liftDefinition(88, 'WRm', 3, 4, -1, floorValue),
    liftDefinition(120, 'WR', 3, 8, -1, floorValue),
    liftDefinition(121, 'W1', 3, 8, -1, floorValue),
    liftDefinition(122, 'S1', 3, 8, -1, floorValue),
    liftDefinition(123, 'SR', 3, 8, -1, floorValue),
];

export const createLiftAction = ( mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = liftDefinitions.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid lift type', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster && !def.monsterTrigger) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    const sectors = map.data.sectors.filter(e => e.tag === linedef.tag);
    for (const sector of sectors) {
        if (def.stopper || sector.specialData !== null) {
            if (def.stopper) {
                map.removeAction(sector.specialData);
            } else {
                map.addAction(sector.specialData);
            }
            // sector is already running an action so don't add another one
            continue;
        }

        triggered = true;

        const low = lowestNeighbourFloor(map, sector);
        const high = def.targetHighFn(map, sector);

        if (def.direction > 0) {
            def.effect?.(map, sector, linedef);
        }

        let ticks = 0;
        let direction = def.direction;
        const action = () => {
            if (ticks) {
                ticks--;
                return;
            }

            const mobjs = sectorObjects(map, sector);
            // move lift
            sector.zFloor.update(val => {
                let finished = false;
                let original = val;
                val += def.speed * direction;

                if (val < low) {
                    // hit bottom
                    ticks = def.waitTime;
                    val = low;
                    direction = 1;
                } else if (val > high) {
                    // hit top
                    finished = !def.perpetual;
                    ticks = def.waitTime;
                    val = high;
                    direction = -1;
                }

                if (direction === 1) {
                    const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, val, sector.zCeil.val));
                    if (crushing.length) {
                        let hitSolid = crushing.reduce((res, mo) => crunchMapObject(mo) || res, false);
                        if (hitSolid) {
                            // switch direction
                            direction = -1;
                            ticks = 0;
                            return original;
                        }
                    }
                }

                if (finished) {
                    map.removeAction(action);
                    sector.specialData = null;
                    if (def.direction < 0) {
                        def.effect?.(map, sector, linedef);
                    }
                }

                return val;
            });
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
        };
        sector.specialData = action;
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

// Floors
const floorDefinition = (type: number, trigger: string, direction: number, speed: number, effect: EffectFunction, crush: boolean, targetFn: TargetValueFunction) => ({
    type,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction,
    effect,
    crush,
    targetFn,
    speed,
});

const floorDefinitions = [
    floorDefinition(23, 'S1', -1, 1, null, false, lowestNeighbourFloor),
    floorDefinition(60, 'SR', -1, 1, null, false, lowestNeighbourFloor),
    floorDefinition(82, 'WR', -1, 1, null, false, lowestNeighbourFloor),
    floorDefinition(38, 'W1', -1, 1, null, false, lowestNeighbourFloor),
    floorDefinition(84, 'WR', -1, 1, effect([assignFloorFlat, assignSectorType], selectNum), false, lowestNeighbourFloor),
    floorDefinition(37, 'W1', -1, 1, effect([assignFloorFlat, assignSectorType], selectNum), false, lowestNeighbourFloor),
    floorDefinition(69, 'SR', 1, 1, null, false, nextNeighbourFloor),
    floorDefinition(18, 'S1', 1, 1, null, false, nextNeighbourFloor),
    floorDefinition(128, 'WR', 1, 1, null, false, nextNeighbourFloor),
    floorDefinition(119, 'W1', 1, 1, null, false, nextNeighbourFloor),
    floorDefinition(132, 'SR', 1, 4, null, false, nextNeighbourFloor),
    floorDefinition(131, 'S1', 1, 4, null, false, nextNeighbourFloor),
    floorDefinition(129, 'WR', 1, 4, null, false, nextNeighbourFloor),
    floorDefinition(130, 'W1', 1, 4, null, false, nextNeighbourFloor),
    floorDefinition(64, 'SR', 1, 1, null, false, lowestNeighbourCeiling),
    floorDefinition(101, 'S1', 1, 1, null,  false, lowestNeighbourCeiling),
    floorDefinition(91, 'WR', 1, 1, null, false, lowestNeighbourCeiling),
    floorDefinition(5, 'W1', 1, 1, null, false, lowestNeighbourCeiling),
    floorDefinition(24, 'G1', 1, 1, null, false, lowestNeighbourCeiling),
    floorDefinition(65, 'SR', 1, 1, null, true, adjust(lowestNeighbourCeiling, -8)),
    floorDefinition(55, 'S1', 1, 1, null, true, adjust(lowestNeighbourCeiling, -8)),
    floorDefinition(94, 'WR', 1, 1, null, true, adjust(lowestNeighbourCeiling, -8)),
    floorDefinition(56, 'W1', 1, 1, null, true, adjust(lowestNeighbourCeiling, -8)),
    floorDefinition(45, 'SR', -1, 1, null,  false, highestNeighbourFloor),
    floorDefinition(102, 'S1', -1, 1, null, false, highestNeighbourFloor),
    floorDefinition(83, 'WR', -1, 1, null,  false, highestNeighbourFloor),
    floorDefinition(19, 'W1', -1, 1, null,  false, highestNeighbourFloor),
    floorDefinition(70, 'SR', -1, 4, null,  false, adjust(highestNeighbourFloor, 8)),
    floorDefinition(71, 'S1', -1, 4, null,  false, adjust(highestNeighbourFloor, 8)),
    floorDefinition(98, 'WR', -1, 4, null,  false, adjust(highestNeighbourFloor, 8)),
    floorDefinition(36, 'W1', -1, 4, null,  false, adjust(highestNeighbourFloor, 8)),
    floorDefinition(92, 'WR', 1, 1, null, false, adjust(floorValue, 24)),
    floorDefinition(58, 'W1', 1, 1, null, false, adjust(floorValue, 24)),
    floorDefinition(93, 'WR', 1, 1, effect([assignFloorFlat, assignSectorType], selectTrigger),  false, adjust(floorValue, 24)),
    floorDefinition(59, 'W1', 1, 1, effect([assignFloorFlat, assignSectorType], selectTrigger),  false, adjust(floorValue, 24)),
    floorDefinition(96, 'WR', 1, 1, null, false, shortestLowerTexture),
    floorDefinition(30, 'W1', 1, 1, null, false, shortestLowerTexture),
    floorDefinition(140, 'S1', 1, 1, null, false, adjust(floorValue, 512)),
];

export const createFloorAction = (mobj: MapObject, linedef: LineDef,  trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = floorDefinitions.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid floor special', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    const sectors = map.data.sectors.filter(e => e.tag === linedef.tag);
    for (const sector of sectors) {
        if (sector.specialData !== null) {
            continue;
        }

        triggered = true;
        if (def.direction > 0) {
            def.effect?.(map, sector, linedef);
        }

        sector.specialData = def.direction;
        const target = def.targetFn(map, sector);
        const action = () => {
            const mobjs = sectorObjects(map, sector);
            // SND: sfx_stnmov (leveltime&7)

            sector.zFloor.update(val => {
                let finished = false;
                let original = val;
                val += def.direction * def.speed;

                if ((def.direction > 0 && val > target) || (def.direction < 0 && val < target)) {
                    // SND: sfx_pstop
                    finished = true;
                    val = target;
                }

                // crush
                if (def.direction === 1) {
                    const crunch = def.crush ? crunchAndDamageMapObject : crunchMapObject;
                    const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, val, sector.zCeil.val));
                    if (crushing.length) {
                        let hitSolid = crushing.reduce((res, mo) => crunch(mo) || res, false);
                        if (hitSolid) {
                            return original;
                        }
                    }
                }

                if (finished) {
                    sector.specialData = null;
                    map.removeAction(action);
                    if (def.direction < 0) {
                        def.effect?.(map, sector, linedef);
                    }
                }

                return val;
            });
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
        }
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

// Ceilings
const ceilingSlow = 1;
const ceilingFast = ceilingSlow * 2;
const ceilingDefinition = (type: number, trigger: string, direction: number, speed: number, targetFn: TargetValueFunction) => ({
    type,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction,
    targetFn,
    speed,
});

const ceilingDefinitions = [
    ceilingDefinition(40, 'W1', 1, ceilingSlow, highestNeighbourCeiling),
    ceilingDefinition(41, 'S1', -1, ceilingFast, floorHeight),
    ceilingDefinition(43, 'SR', -1, ceilingFast, floorHeight),
    ceilingDefinition(44, 'W1', -1, ceilingSlow, adjust(floorHeight, 8)),
    ceilingDefinition(72, 'WR', -1, ceilingSlow, adjust(floorHeight, 8)),
];

export const createCeilingAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = ceilingDefinitions.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid ceiling special', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    const sectors = map.data.sectors.filter(e => e.tag === linedef.tag);
    for (const sector of sectors) {
        if (sector.specialData !== null) {
            continue;
        }

        triggered = true;

        sector.specialData = def.direction;
        const target = def.targetFn(map, sector);
        const action = () => {
            const mobjs = sectorObjects(map, sector);
            sector.zCeil.update(val => {
                let finished = false;
                let original = val;
                val += def.speed * def.direction;

                if ((def.direction > 0 && val > target) || (def.direction < 0 && val < target)) {
                    finished = true;
                    val = target;
                }

                // crush
                if (def.direction === -1) {
                    const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor.val, val));
                    if (crushing.length) {
                        let hitSolid = crushing.reduce((res, mo) => crunchMapObject(mo) || res, false);
                        if (hitSolid) {
                            return original;
                        }
                    }
                }

                if (finished) {
                    sector.specialData = null;
                    map.removeAction(action);
                }

                return val;
            });
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
        }
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

// Crusher Ceilings
const crusherCeilingDefinition = (type: number, trigger: string, speed: number, triggerType: 'start' | 'stop') => ({
    type,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction: -1,
    silent: type === 141 ? true : false,
    targetFn: adjust(floorHeight, 8),
    stopper: triggerType === 'stop',
    speed,
});

const crusherCeilingDefinitions = [
    crusherCeilingDefinition(49, 'S1', ceilingSlow, 'start'),
    crusherCeilingDefinition(73, 'WR', ceilingSlow, 'start'),
    crusherCeilingDefinition(25, 'W1', ceilingSlow, 'start'),
    crusherCeilingDefinition(77, 'WR', ceilingFast, 'start'),
    crusherCeilingDefinition(6, 'W1', ceilingFast, 'start'),
    crusherCeilingDefinition(141, 'W1', ceilingSlow, 'start'),
    crusherCeilingDefinition(74, 'WR', null, 'stop'),
    crusherCeilingDefinition(57, 'W1', null, 'stop'),
];

export const createCrusherCeilingAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = crusherCeilingDefinitions.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid crusher special', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    const sectors = map.data.sectors.filter(e => e.tag === linedef.tag);
    for (const sector of sectors) {
        // NOTE: E3M4 has an interesting behaviour in the outdoor room because a sector has only 1 special data.
        // If you start the crusher before flipping the switch, you cannot flip the switch to get the bonus items.
        // gzDoom actually handles this but chocolate doom (and I assume the original) did not
        if (def.stopper || sector.specialData !== null) {
            if (def.stopper) {
                map.removeAction(sector.specialData);
            } else {
                map.addAction(sector.specialData);
            }
            continue;
        }

        triggered = true;

        let direction = def.direction;
        const top = sector.zCeil.val;
        const bottom = def.targetFn(map, sector);
        const action = () => {
            let finished = false;
            const mobjs = sectorObjects(map, sector);

            sector.zCeil.update(val => {
                let original = val;
                val += def.speed * direction;

                if (val < bottom) {
                    finished = true;
                    val = bottom;
                }
                if (val > top) {
                    finished = true;
                    val = top;
                }

                // crush
                if (direction === -1) {
                    const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor.val, val));
                    if (crushing.length) {
                        crushing.forEach(crunchAndDamageMapObject);
                        // TODO: check if object is damaged before slowing speed?
                        if (def.speed === ceilingSlow) {
                            // slow crushers go even slowing when they crush something
                            val = original + (def.speed / 8) * direction
                        }
                    }
                }

                if (finished) {
                    // crushers keep going
                    direction = -direction;
                }
                return val;
            });
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
        };
        sector.specialData = action;
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

// Lighting
const setLightLevel = (val: number) =>
    (map: MapRuntime, sec: Sector) => val;
const maxNeighbourLight = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.light.val), 0);
const minNeighbourLight = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.light.val), 255);
export const lowestLight = (sectors: Sector[], max: number) =>
    sectors.reduce((last, sec) => Math.min(last, sec.light.val), max);

const createLightingDefinition = (type: number, trigger: string, targetValueFn: TargetValueFunction) => ({
    type,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    targetValueFn,
});

const lightingDefinitions = [
    createLightingDefinition(12, 'W1', maxNeighbourLight),
    createLightingDefinition(80, 'WR', maxNeighbourLight),
    createLightingDefinition(104, 'W1', minNeighbourLight),
    createLightingDefinition(17, 'W1', null),
    createLightingDefinition(35, 'W1', setLightLevel(35)),
    createLightingDefinition(79, 'WR', setLightLevel(35)),
    createLightingDefinition(139, 'SR',setLightLevel(35)),
    createLightingDefinition(13, 'W1', setLightLevel(255)),
    createLightingDefinition(81, 'WR', setLightLevel(255)),
    createLightingDefinition(138, 'SR', setLightLevel(255)),
];

export const createLightingAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = lightingDefinitions.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid light special', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    let targetValue = -1;
    const sectors = map.data.sectors.filter(e => e.tag === linedef.tag);
    for (const sector of sectors) {
        if (def.type === 17) {
            // As far as I can tell, type 17 is only used in tnt 09. It's extra special
            map.addAction(strobeFlash(5, 35)(map, sector));
        } else {
            if (targetValue === -1) {
                targetValue = def.targetValueFn(map, sector);
            }
            sector.light.set(targetValue);
        }
        triggered = true;
    }
    return triggered ? def : undefined;
};

const strobeFlash =
    (lightTicks: number, darkTicks: number, synchronized = false) =>
    (map: MapRuntime, sector: Sector) => {
        const max = sector.light.initial;
        const nearestMin = lowestLight(map.data.sectorNeighbours(sector), max);
        const min = (nearestMin === max) ? 0 : nearestMin;
        let ticks = synchronized ? 1 : map.game.rng.int(1, 7);
        return () => {
            if (--ticks) {
                return;
            }
            sector.light.update(val => {
                if (val === max) {
                    ticks = darkTicks;
                    return min;
                } else {
                    ticks = lightTicks;
                    return max;
                }
            });
        };
    };

const randomFlicker = (map: MapRuntime, sector: Sector) => {
    const max = sector.light.initial;
    const min = lowestLight(map.data.sectorNeighbours(sector), max);
    let ticks = 1;
    return () => {
        if (--ticks) {
            return;
        }
        sector.light.update(val => {
            if (val === max) {
                ticks = map.game.rng.int(1, 7);
                return min;
            } else {
                ticks = map.game.rng.int(1, 64);
                return max;
            }
        });
    };
};

const glowLight = (map: MapRuntime, sector: Sector) => {
    const max = sector.light.initial;
    const min = lowestLight(map.data.sectorNeighbours(sector), max);
    let step = -8;
    return () => sector.light.update(val => {
        val += step;
        if (val <= min || val >= max) {
            step = -step;
            val += step;
        }
        return val;
    });
};

const fireFlicker = (map: MapRuntime, sector: Sector) => {
    const max = sector.light.initial;
    const min = lowestLight(map.data.sectorNeighbours(sector), max) + 16;
    let ticks = 4;
    return () => {
        if (--ticks) {
            return;
        }
        ticks = 4;
        const amount = map.game.rng.int(0, 2) * 16;
        sector.light.set(Math.max(max - amount, min));
    }
};

export const sectorLightAnimations = {
    1: randomFlicker,
    2: strobeFlash(5, 15),
    3: strobeFlash(5, 35),
    4: strobeFlash(5, 35),
    8: glowLight,
    12: strobeFlash(5, 35, true),
    13: strobeFlash(5, 15, true),
    17: fireFlicker,
};

// Teleports
const createTeleportDefinition = (type: number, trigger: string) => ({
    type,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    movePlayer: (type === 97 || type === 39),
    monsterTrigger: true,
});

const teleportDefinitions = [
    createTeleportDefinition(39, 'W1'),
    createTeleportDefinition(97, 'WR'),
    createTeleportDefinition(126, 'WR'),
    createTeleportDefinition(125, 'W1'),
];

export const applyTeleportAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    if (side === 1) {
        // don't triggering teleports when leaving the teleport space
        return;
    }
    const map = mobj.map;
    const def = teleportDefinitions.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid teleport special', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster && !def.monsterTrigger) {
        return;
    }
    if (mobj instanceof PlayerMapObject && !def.movePlayer) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    // FIXME: for maps with lots of mobjs and teleports, this is going to be slow
    const teleports = map.objs.filter(mo => mo.type === MapObjectIndex.MT_TELEPORTMAN);
    for (const tp of teleports) {
        const tpos = tp.position;
        const sector = map.data.findSector(tpos.x, tpos.y);

        if (mobj.isMonster) {
            // monsters cannot teleport if a hittable mobj is blocking teleport landing
            let blocked = false;
            map.data.traceMove({
                start: tpos,
                move: zeroVec,
                radius: mobj.info.radius,
                height: mobj.info.height,
                hitObject: hit => !(blocked = Boolean('mobj' in hit && hit.mobj.info.flags & hittableThing)),
            })
            if (blocked) {
                continue;
            }
        }

        if (sector.tag === linedef.tag) {
            // teleport fog in old and new locations
            const pos = mobj.position;
            const oldPlaceFog = map.spawn(MapObjectIndex.MT_TFOG, pos.x, pos.y);
            map.game.playSound(SoundIndex.sfx_telept, oldPlaceFog);
            const newPlaceFog = map.spawn(MapObjectIndex.MT_TFOG,
                tpos.x + 20 * Math.cos(tp.direction),
                tpos.y + 20 * Math.sin(tp.direction));
            map.game.playSound(SoundIndex.sfx_telept, newPlaceFog);

            mobj.teleport(tp, sector);
            triggered = true;
            break;
        }
    }
    return triggered ? def : undefined;
};

// Donut (apparently only in E1M2, E2M2 and MAP21 of tnt (none in Doom2 or plutonia)
export const donut = (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = { trigger: 'S', repeatable: false };
    if (trigger !== def.trigger) {
        return;
    }
    if (mobj.isMonster) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    const speed = 0.5;
    const sectors = map.data.sectors.filter(e => e.tag === linedef.tag);
    for (const pillar of sectors) {
        if (pillar.specialData !== null) {
            continue;
        }
        triggered = true;

        const donut = map.data.sectorNeighbours(pillar)[0];
        const model = map.data.sectorNeighbours(donut).filter(e => e !== pillar)[0];
        const target = model.zFloor.val;

        pillar.specialData = def;
        const pillarAction = () => {
            let finished = false;

            pillar.zFloor.update(val => {
                val += -speed;

                if (val < target) {
                    finished = true;
                    val = target;
                }

                if (finished) {
                    pillar.specialData = null;
                    map.removeAction(pillarAction);
                }

                return val;
            });
            sectorObjects(map, pillar).forEach(mobj => mobj.sectorChanged(pillar));
        };
        map.addAction(pillarAction);

        donut.specialData = def;
        const donutAction = () => {
            let finished = false;

            const mobjs = sectorObjects(map, pillar);
            donut.zFloor.update(val => {
                let original = val;
                val += speed;

                if (val > target) {
                    finished = true;
                    val = target;
                } else {
                    const crushing = mobjs.filter(mobj => !mobj.canSectorChange(pillar, val, pillar.zCeil.val));
                    if (crushing.length) {
                        // stop movement if we hit something
                        return original;
                    }
                }

                if (finished) {
                    assignFloorFlat(map, model, donut);
                    assignSectorType(map, model, donut);
                    donut.specialData = null;
                    map.removeAction(donutAction);
                }

                return val;
            });
            mobjs.forEach(mobj => mobj.sectorChanged(pillar));
        };
        map.addAction(donutAction);
    }
    return triggered ? def : undefined;
};

// Rising Stairs
const risingStarDefinition = (type: number, trigger: string, speed: number, stepSize: number) => ({
    type,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction: 1,
    stepSize,
    speed,
});

const risingStairs = [
    risingStarDefinition(7, 'S1', .25, 8),
    risingStarDefinition(8, 'W1', .25, 8),
    risingStarDefinition(127, 'S1', 4, 16),
    risingStarDefinition(100, 'W1', 4, 16),
];

export const createRisingStairAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
    const def = risingStairs.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid riser special', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    const sectors = map.data.sectors.filter(e => e.tag === linedef.tag);
    for (const sector of sectors) {
        if (sector.specialData !== null) {
            continue;
        }

        triggered = true;
        let target = sector.zFloor.val;

        const flat = sector.floorFlat.val;
        let base = sector;
        while (base) {
            target += def.stepSize;
            raiseFloorAction(map, base, def, target);

            // find next step to raise
            const matches = raiseFloorsectors(base, map.data.linedefs).filter(e => e.floorFlat.val === flat);
            // why not filter for sectors without specialData? Well, Doom has a "bug" of sorts where it raises the step height
            // before checking if the sector has special data. TNT MAP 30 takes advantage of this for two stair cases
            // https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_floor.c#L533
            // https://www.doomworld.com/forum/topic/57014-tnt-map30-stairs/
            base = null;
            for (const match of matches) {
                if (match.specialData) {
                    target += def.stepSize;
                } else {
                    base = match;
                    break;
                }
            }
        }
    }
    return triggered ? def : undefined;
};

// rising floors needs a more strict implementation of sectorNeighbours(). Thanks Plutonia MAP24...
function raiseFloorsectors(sector: Sector, mapLinedefs: LineDef[]): Sector[] {
    const sectors = [];
    for (const ld of mapLinedefs) {
        if (ld.left) {
            if (ld.right.sector === sector) {
                sectors.push(ld.left.sector);
            }
        }
    }
    return sectors.filter((e, i, arr) => arr.indexOf(e) === i && e !== sector);
}

function raiseFloorAction(map: MapRuntime, sector: Sector, def: { speed: number, direction: number }, target: number) {
    sector.specialData = def;
    const action = () => {
        let finished = false;

        const mobjs = sectorObjects(map, sector);
        sector.zFloor.update(val => {
            let original = val;
            val += def.direction * def.speed;

            if (val > target) {
                finished = true;
                val = target;
            } else {
                const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, val, sector.zCeil.val));
                if (crushing.length) {
                    // stop movement if we hit something
                    return original;
                }
            }

            if (finished) {
                sector.specialData = null;
                map.removeAction(action);
            }

            return val;
        });
        mobjs.forEach(mobj => mobj.sectorChanged(sector));
    }
    map.addAction(action);
}

// Level exits
const levelExitDefinitions = (type: number, trigger: string, place: 'normal' | 'secret') => ({
    type,
    trigger: trigger[0] as TriggerType,
    place,
    repeatable: false,
});

const levelExits = [
    levelExitDefinitions(11, 'S1', 'normal'),
    levelExitDefinitions(52, 'W1', 'normal'),
    levelExitDefinitions(51, 'S1', 'secret'),
    levelExitDefinitions(124, 'W1', 'secret'),
];

export const createLevelExitAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    const def = levelExits.find(e => e.type === linedef.special);
    if (!def) {
        console.warn('invalid level exit special', linedef.special);
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster) {
        return;
    }

    exitLevel(mobj, def.place);
    // level exists always trigger the switch (but it won't be rendered anyway)
    return def;
};

export function exitLevel(mobj: MapObject, target: 'secret' | 'normal', nextMapOverride?: string) {
    // figure out next map based on current map name
    const mapName = mobj.map.name;
    const episodeFormat = mapName.startsWith('E');
    // E1M? and MAP?? both start the map number at index 3
    const prefix = mapName.substring(0, 3);
    const mapNum = parseInt(mapName.substring(3, 5));
    // a rather complex (but kind of fun to write...) ternary
    const nextMapName = nextMapOverride ?? (
        target === 'secret' ? (
            episodeFormat ? prefix + '9' :
            mapNum === 31 ? `MAP32` : 'MAP31'
        ) :
        (mapNum === 31 || mapNum == 32) ? 'MAP16' :
        (mapName === 'E1M9') ? 'E1M4' :
        (mapName === 'E2M9') ? 'E2M6' :
        (mapName === 'E3M9') ? 'E3M7' :
        (mapName === 'E4M9') ? 'E4M3' :
        `${prefix}${episodeFormat
            ? (mapNum + 1)
            : (mapNum + 1).toString().padStart(2, '0')}`
    );

    // intermission screen stats
    mobj.map.game.time.playTime += mobj.map.stats.elapsedTime;
    mobj.map.game.intermission.set({
        // TODO: network games should have multiple players
        playerStats: [mobj.map.player.stats],
        finishedMap: mobj.map,
        nextMapName,
    });
    mobj.map.game.map.set(null);
    mobj.map.dispose();
}