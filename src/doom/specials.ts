// kind of based on p_spec.c
import { MapObject, PlayerMapObject } from "./map-object";
import { MFFlags, MapObjectIndex, SoundIndex, StateIndex } from "./doom-things-info";
import type { MapRuntime } from "./map-runtime";
import { zeroVec, type LineDef, type Sector, linedefSlope, type LineTraceHit } from "./map-data";
import { _T } from "./text";
import { findMoveBlocker } from "./things/monsters";
import { Vector3 } from "three";
import { ticksPerSecond } from "./math";

// TODO: this whole thing could be a fun candidate for refactoring. I honestly think we could write
// all this stuff in a much cleaner way but first step would be to add some unit tests and then get to it!

// General
type SpecialAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1) => SpecialDefinition | undefined;
export function triggerSpecial(mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1) {
    if (linedef.special === 9) {
        return donut(mobj, linedef, trigger, side);
    }

    const action =
        doorDefinitions[linedef.special] ??
        liftDefinitions[linedef.special] ??
        floorDefinitions[linedef.special] ??
        ceilingDefinitions[linedef.special] ??
        crusherCeilingDefinitions[linedef.special] ??
        lightingDefinitions[linedef.special] ??
        teleportDefinitions[linedef.special] ??
        risingStairs[linedef.special] ??
        levelExits[linedef.special];
    if (action) {
        return action(mobj, linedef, trigger, side);
    }
    console.warn('unsupported linedef special:', linedef.special);
}

// Push, Switch, Walk, Gun (shoot)
export type TriggerType = 'P' | 'S' | 'W' | 'G';
const floorMax = 32000;
export interface SpecialDefinition {
    repeatable: boolean;
}

type TargetValueFunction = (map: MapRuntime, sector: Sector) => number;

const findLowestCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zCeil), floorMax)
const lowestNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zFloor), sector.zFloor);
const highestNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zFloor), -floorMax);
const highestNeighbourFloorInclusive = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zFloor), sector.zFloor);
const nextNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zFloor > sector.zFloor ? sec.zFloor : last), sector.zFloor);
const lowestNeighbourCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zCeil), sector.zCeil);
const highestNeighbourCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zCeil), -floorMax);
const floorHeight = (map: MapRuntime, sector: Sector) => sector.zFloor;

const shortestLowerTexture = (map: MapRuntime, sector: Sector) => {
    let target = floorMax;
    // https://www.doomworld.com/forum/topic/95030-why-does-raise-floor-by-shortest-lower-texture-only-half-work-on-older-ports/#comment-1770824
    // solves a bug in Doom2's MAP15 but it really doesn't feel right. I'm guessing almost every doom "shortest lower texture"
    // linedef out there expects 64px (or less) rise because, in my opinion, it's highly unlikely both side lower textures are set
    const missingTextureSize = 64;
    for (const ld of map.data.linedefs) {
        if (ld.left?.sector === sector || ld.right.sector === sector) {
            const ltx = map.game.wad.wallTextureData(ld.left.lower);
            const rtx = map.game.wad.wallTextureData(ld.right.lower);
            target = Math.min(target, (ltx?.height ?? missingTextureSize), (rtx?.height ?? missingTextureSize));
        }
    }
    return sector.zFloor + target;
};
const floorValue = (map: MapRuntime, sector: Sector) => sector.zFloor;
const adjust = (fn: TargetValueFunction, change: number) => (map: MapRuntime, sector: Sector) => fn(map, sector) + change;

type SectorSelectorFunction = (map: MapRuntime, sector: Sector, linedef: LineDef) => Sector;
const triggerModel = (map: MapRuntime, sector: Sector, linedef: LineDef) => linedef.right.sector;
const numModel = (map: MapRuntime, sector: Sector) => {
    let line: LineDef = null;
    for (const ld of map.data.linedefs) {
        if (ld.left) {
            if (ld.left.sector === sector && ld.right.sector.zFloor === sector.zFloor) {
                line = (line && line.num < ld.num) ? line : ld;
            }
        }
    }
    return line ? line.right.sector : sector;
}

const playMoveSound = (map: MapRuntime, sector: Sector) => {
    if ((Math.trunc(map.game.time.tick.val) & 7) === 0) {
        map.game.playSound(SoundIndex.sfx_stnmov, sector);
    }
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
    to.floorFlat = from.floorFlat;
    map.events.emit('sector-flat', to);
    map.initializeFlatTextureAnimation(to, 'floorFlat');
}

const assignSectorType = (map: MapRuntime, from: Sector, to: Sector) => {
    to.type = from.type;
}

const zeroSectorType = (map: MapRuntime, from: Sector, to: Sector) => {
    to.type = 0;
}

const sectorObjects = (map: MapRuntime, sector: Sector) => [...map.sectorObjs.get(sector)];

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
        mobj.info.radius = 0;
        return false;
    }
    // check if we hit something solid
    return Boolean(mobj.info.flags & MFFlags.MF_SOLID);
}

const crushVelocity = 255 * (1 << 12) / (1 << 16);
function crunchAndDamageMapObject(mobj: MapObject) {
    let hitSolid = crunchMapObject(mobj);
    if ((mobj.info.flags & MFFlags.MF_SHOOTABLE) && (mobj.map.game.time.tickN.val & 3) === 0) {
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
const doorDefinition = (trigger: string, key: 'R' | 'Y' | 'B' | 'No', speed: number, topWaitS: number, func: DoorFunction) => ({
    function: func,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    speed,
    sounds: speed < 8 ? [SoundIndex.sfx_doropn, SoundIndex.sfx_dorcls] : [SoundIndex.sfx_bdopn, SoundIndex.sfx_bdcls],
    key: key === 'No' ? undefined : key,
    topWait: topWaitS * ticksPerSecond,
    monsterTrigger: trigger.includes('m'),
});

const createDoorAction =
        (def: ReturnType<typeof doorDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    const map = mobj.map;
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
        sector.specialData && mobj.map.game.playSound(sector.specialData > 0 ? def.sounds[0] : def.sounds[1], sector);

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

        const topHeight = linedef.special === 16 || linedef.special === 76
            ? sector.zCeil : (findLowestCeiling(map, sector) - 4);
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
            let original = sector.zCeil;
            sector.zCeil += def.speed * sector.specialData;

            let finished = false;
            if (sector.zCeil > topHeight) {
                // hit ceiling
                finished = def.function === 'closeWaitOpen' || def.function === 'openAndStay';
                ticks = def.topWait;
                sector.zCeil = topHeight;
                sector.specialData = 0;
            } else if (sector.zCeil < sector.zFloor) {
                // hit floor
                finished = def.function === 'openWaitClose' || def.function === 'closeAndStay';
                ticks = def.topWait;
                sector.zCeil = sector.zFloor;
                sector.specialData = 0;
            }

            // crush (and reverse direction)
            if (sector.specialData === -1) {
                const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor, sector.zCeil));
                if (crushing.length) {
                    let hitSolid = crushing.reduce((res, mo) => crunchMapObject(mo) || res, false);
                    if (hitSolid) {
                        // force door to open
                        sector.specialData = 1;
                        sector.zCeil = original;
                        return;
                    }
                }
            }

            if (finished) {
                map.removeAction(action);
                sector.specialData = null;
            }
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
            map.events.emit('sector-z', sector);
        };
        map.addAction(action);
    }

    return triggered ? def : undefined;
};

// https://doomwiki.org/wiki/Linedef_type#Door_linedef_types
const doorDefinitions = {
    1: createDoorAction(doorDefinition('PRm', 'No', normal, 4, 'openWaitClose')),
    2: createDoorAction(doorDefinition('W1', 'No', normal, -1, 'openAndStay')),
    3: createDoorAction(doorDefinition('W1', 'No', normal, -1, 'closeAndStay')),
    4: createDoorAction(doorDefinition('W1', 'No', normal, 4, 'openWaitClose')),
    16: createDoorAction(doorDefinition('W1', 'No', normal, 30, 'closeWaitOpen')),
    29: createDoorAction(doorDefinition('S1', 'No', normal, 4, 'openWaitClose')),
    31: createDoorAction(doorDefinition('P1', 'No', normal, -1, 'openAndStay')),
    42: createDoorAction(doorDefinition('SR', 'No', normal, -1, 'closeAndStay')),
    46: createDoorAction(doorDefinition('GR', 'No', normal, -1, 'openAndStay')),
    50: createDoorAction(doorDefinition('S1', 'No', normal, -1, 'closeAndStay')),
    61: createDoorAction(doorDefinition('SR', 'No', normal, -1, 'openAndStay')),
    63: createDoorAction(doorDefinition('SR', 'No', normal, 4, 'openWaitClose')),
    75: createDoorAction(doorDefinition('WR', 'No', normal, -1, 'closeAndStay')),
    76: createDoorAction(doorDefinition('WR', 'No', normal, 30, 'closeWaitOpen')),
    86: createDoorAction(doorDefinition('WR', 'No', normal, -1, 'openAndStay')),
    90: createDoorAction(doorDefinition('WR', 'No', normal, 4, 'openWaitClose')),
    103: createDoorAction(doorDefinition('S1', 'No', normal, -1, 'openAndStay')),
    105: createDoorAction(doorDefinition('WR', 'No', blaze, 4, 'openWaitClose')),
    106: createDoorAction(doorDefinition('WR', 'No', blaze, -1, 'openAndStay')),
    107: createDoorAction(doorDefinition('WR', 'No', blaze, -1, 'closeAndStay')),
    108: createDoorAction(doorDefinition('W1', 'No', blaze, 4, 'openWaitClose')),
    109: createDoorAction(doorDefinition('W1', 'No', blaze, -1, 'openAndStay')),
    110: createDoorAction(doorDefinition('W1', 'No', blaze, -1, 'closeAndStay')),
    111: createDoorAction(doorDefinition('S1', 'No', blaze, 4, 'openWaitClose')),
    112: createDoorAction(doorDefinition('S1', 'No', blaze, -1, 'openAndStay')),
    113: createDoorAction(doorDefinition('S1', 'No', blaze, -1, 'closeAndStay')),
    114: createDoorAction(doorDefinition('SR', 'No', blaze, 4, 'openWaitClose')),
    115: createDoorAction(doorDefinition('SR', 'No', blaze, -1, 'openAndStay')),
    116: createDoorAction(doorDefinition('SR', 'No', blaze, -1, 'closeAndStay')),
    117: createDoorAction(doorDefinition('PR', 'No', blaze, 4, 'openWaitClose')),
    118: createDoorAction(doorDefinition('P1', 'No', blaze, -1, 'openAndStay')),
    // Key doors
    26: createDoorAction(doorDefinition('PR', 'B', normal, 4, 'openWaitClose')),
    28: createDoorAction(doorDefinition('PR', 'R', normal, 4, 'openWaitClose')),
    27: createDoorAction(doorDefinition('PR', 'Y', normal, 4, 'openWaitClose')),
    32: createDoorAction(doorDefinition('P1', 'B', normal, 1, 'openAndStay')),
    33: createDoorAction(doorDefinition('P1', 'R', normal, -1, 'openAndStay')),
    34: createDoorAction(doorDefinition('P1', 'Y', normal, -1, 'openAndStay')),
    99: createDoorAction(doorDefinition('SR', 'B', blaze, -1, 'openAndStay')),
    134: createDoorAction(doorDefinition('SR', 'R', blaze, -1, 'openAndStay')),
    136: createDoorAction(doorDefinition('SR', 'Y', blaze, -1, 'openAndStay')),
    133: createDoorAction(doorDefinition('S1', 'B', blaze, -1, 'openAndStay')),
    135: createDoorAction(doorDefinition('S1', 'R', blaze, -1, 'openAndStay')),
    137: createDoorAction(doorDefinition('S1', 'Y', blaze, -1, 'openAndStay')),
};

// Lifts
const liftDefinition = (trigger: string, waitTimeS: number, speed: number, direction: number, targetHighFn: TargetValueFunction, actionType: 'normal' | 'perpetual' | 'stop' = 'normal', effect?: EffectFunction) => ({
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

const createLiftAction =
        (def: ReturnType<typeof liftDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    const map = mobj.map;
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
    const sectors = map.sectorsByTag.get(linedef.tag) ?? [];
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

        let nextSound = SoundIndex.sfx_pstart;
        let ticks = 0;
        let direction = def.direction;
        const action = () => {
            if (ticks) {
                ticks--;
                return;
            }
            if (nextSound) {
                map.game.playSound(nextSound, sector);
                nextSound = null;
            }

            const mobjs = sectorObjects(map, sector);
            // move lift
            let finished = false;
            let original = sector.zFloor;
            sector.zFloor += def.speed * direction;

            if (sector.zFloor < low) {
                // hit bottom
                nextSound = SoundIndex.sfx_pstart;
                map.game.playSound(SoundIndex.sfx_pstop, sector);
                ticks = def.waitTime;
                sector.zFloor = low;
                direction = 1;
            } else if (sector.zFloor > high) {
                // hit top
                nextSound = SoundIndex.sfx_pstart;
                map.game.playSound(SoundIndex.sfx_pstop, sector);
                finished = !def.perpetual;
                ticks = def.waitTime;
                sector.zFloor = high;
                direction = -1;
            }

            if (direction === 1) {
                const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor, sector.zCeil));
                if (crushing.length) {
                    let hitSolid = crushing.reduce((res, mo) => crunchMapObject(mo) || res, false);
                    if (hitSolid) {
                        // switch direction
                        nextSound = SoundIndex.sfx_pstart;
                        direction = -1;
                        ticks = 0;
                        sector.zFloor = original;
                        return;
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
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
            map.events.emit('sector-z', sector);
        };
        sector.specialData = action;
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

// Some combination of the unofficial doom spec https://www.gamers.org/dhs/helpdocs/dmsp1666.html
// and doomwiki https://doomwiki.org/wiki/Linedef_type#Platforms_.28lifts.29
// Note doomwiki categorizes some floor movements as "lifts" while the doom spec calls them moving floors
// We call them "floors" and keep lifts as strictly something moves and can reverse
const liftDefinitions = {
    10: createLiftAction(liftDefinition('W1m', 3, 4, -1, floorValue)),
    21: createLiftAction(liftDefinition('S1', 3, 4, -1, floorValue)),
    53: createLiftAction(liftDefinition('W1', 3, 1, -1, highestNeighbourFloorInclusive, 'perpetual')),
    54: createLiftAction(liftDefinition('W1', 0, 0, 0, floorValue, 'stop')),
    62: createLiftAction(liftDefinition('SR', 3, 4, -1, floorValue)),
    87: createLiftAction(liftDefinition('WR', 3, 1, -1, highestNeighbourFloorInclusive, 'perpetual')),
    88: createLiftAction(liftDefinition('WRm', 3, 4, -1, floorValue)),
    89: createLiftAction(liftDefinition('WR', 0, 0, 0, floorValue, 'stop')),
    95: createLiftAction(liftDefinition('WR', 0, 0.5, 1, nextNeighbourFloor, 'normal', effect([assignFloorFlat, zeroSectorType], triggerModel))),
    120: createLiftAction(liftDefinition('WR', 3, 8, -1, floorValue)),
    121: createLiftAction(liftDefinition('W1', 3, 8, -1, floorValue)),
    122: createLiftAction(liftDefinition('S1', 3, 8, -1, floorValue)),
    123: createLiftAction(liftDefinition('SR', 3, 8, -1, floorValue)),
};

// Floors
const floorDefinition = (trigger: string, direction: number, speed: number, effect: EffectFunction, targetFn: TargetValueFunction, crush = false) => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction,
    effect,
    crush,
    targetFn,
    speed,
});

const createFloorAction =
        (def: ReturnType<typeof floorDefinition>) =>
        (mobj: MapObject, linedef: LineDef,  trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
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
            playMoveSound(map, sector);

            let finished = false;
            let original = sector.zFloor;
            sector.zFloor += def.direction * def.speed;

            if ((def.direction > 0 && sector.zFloor > target) || (def.direction < 0 && sector.zFloor < target)) {
                finished = true;
                sector.zFloor = target;
            }

            // crush
            if (def.direction === 1) {
                const crunch = def.crush ? crunchAndDamageMapObject : crunchMapObject;
                const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor, sector.zCeil));
                if (crushing.length) {
                    let hitSolid = crushing.reduce((res, mo) => crunch(mo) || res, false);
                    if (hitSolid) {
                        sector.zFloor = original;
                        return;
                    }
                }
            }

            if (finished) {
                map.game.playSound(SoundIndex.sfx_pstop, sector);
                sector.specialData = null;
                map.removeAction(action);
                if (def.direction < 0) {
                    def.effect?.(map, sector, linedef);
                }
            }
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
            map.events.emit('sector-z', sector);
        }
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

const floorDefinitions = {
    5: createFloorAction(floorDefinition('W1', 1, 1, null, lowestNeighbourCeiling)),
    18: createFloorAction(floorDefinition('S1', 1, 1, null, nextNeighbourFloor)),
    19: createFloorAction(floorDefinition('W1', -1, 1, null, highestNeighbourFloor)),
    23: createFloorAction(floorDefinition('S1', -1, 1, null, lowestNeighbourFloor)),
    24: createFloorAction(floorDefinition('G1', 1, 1, null, lowestNeighbourCeiling)),
    30: createFloorAction(floorDefinition('W1', 1, 1, null, shortestLowerTexture)),
    36: createFloorAction(floorDefinition('W1', -1, 4, null, adjust(highestNeighbourFloor, 8))),
    37: createFloorAction(floorDefinition('W1', -1, 1, effect([assignFloorFlat, assignSectorType], numModel), lowestNeighbourFloor)),
    38: createFloorAction(floorDefinition('W1', -1, 1, null, lowestNeighbourFloor)),
    45: createFloorAction(floorDefinition('SR', -1, 1, null, highestNeighbourFloor)),
    55: createFloorAction(floorDefinition('S1', 1, 1, null, adjust(lowestNeighbourCeiling, -8), true)),
    56: createFloorAction(floorDefinition('W1', 1, 1, null, adjust(lowestNeighbourCeiling, -8), true)),
    58: createFloorAction(floorDefinition('W1', 1, 1, null, adjust(floorValue, 24))),
    59: createFloorAction(floorDefinition('W1', 1, 1, effect([assignFloorFlat, assignSectorType], triggerModel), adjust(floorValue, 24))),
    60: createFloorAction(floorDefinition('SR', -1, 1, null, lowestNeighbourFloor)),
    64: createFloorAction(floorDefinition('SR', 1, 1, null, lowestNeighbourCeiling)),
    65: createFloorAction(floorDefinition('SR', 1, 1, null, adjust(lowestNeighbourCeiling, -8), true)),
    69: createFloorAction(floorDefinition('SR', 1, 1, null, nextNeighbourFloor)),
    70: createFloorAction(floorDefinition('SR', -1, 4, null, adjust(highestNeighbourFloor, 8))),
    71: createFloorAction(floorDefinition('S1', -1, 4, null, adjust(highestNeighbourFloor, 8))),
    82: createFloorAction(floorDefinition('WR', -1, 1, null, lowestNeighbourFloor)),
    83: createFloorAction(floorDefinition('WR', -1, 1, null, highestNeighbourFloor)),
    84: createFloorAction(floorDefinition('WR', -1, 1, effect([assignFloorFlat, assignSectorType], numModel), lowestNeighbourFloor)),
    91: createFloorAction(floorDefinition('WR', 1, 1, null, lowestNeighbourCeiling)),
    92: createFloorAction(floorDefinition('WR', 1, 1, null, adjust(floorValue, 24))),
    93: createFloorAction(floorDefinition('WR', 1, 1, effect([assignFloorFlat, assignSectorType], triggerModel),  adjust(floorValue, 24))),
    94: createFloorAction(floorDefinition('WR', 1, 1, null, adjust(lowestNeighbourCeiling, -8), true)),
    96: createFloorAction(floorDefinition('WR', 1, 1, null, shortestLowerTexture)),
    98: createFloorAction(floorDefinition('WR', -1, 4, null, adjust(highestNeighbourFloor, 8))),
    101: createFloorAction(floorDefinition('S1', 1, 1, null, lowestNeighbourCeiling)),
    102: createFloorAction(floorDefinition('S1', -1, 1, null, highestNeighbourFloor)),
    119: createFloorAction(floorDefinition('W1', 1, 1, null, nextNeighbourFloor)),
    128: createFloorAction(floorDefinition('WR', 1, 1, null, nextNeighbourFloor)),
    129: createFloorAction(floorDefinition('WR', 1, 4, null, nextNeighbourFloor)),
    130: createFloorAction(floorDefinition('W1', 1, 4, null, nextNeighbourFloor)),
    131: createFloorAction(floorDefinition('S1', 1, 4, null, nextNeighbourFloor)),
    132: createFloorAction(floorDefinition('SR', 1, 4, null, nextNeighbourFloor)),
    140: createFloorAction(floorDefinition('S1', 1, 1, null, adjust(floorValue, 512))),

    // DOOM wiki calls these lifts https://doomwiki.org/wiki/Linedef_type#Platforms_.28lifts.29
    // but they seem to better match a moving floor
    14: createFloorAction(floorDefinition('S1', 1, .5, effect([assignFloorFlat, zeroSectorType], triggerModel), adjust(floorValue, 32))),
    15: createFloorAction(floorDefinition('S1', 1, .5, effect([assignFloorFlat], triggerModel), adjust(floorValue, 24))),
    20: createFloorAction(floorDefinition('S1', 1, .5, effect([assignFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloor)),
    22: createFloorAction(floorDefinition('W1', 1, .5, effect([assignFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloor)),
    47: createFloorAction(floorDefinition('G1', 1, .5, effect([assignFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloor)),
    66: createFloorAction(floorDefinition('SR', 1, .5, effect([assignFloorFlat], triggerModel), adjust(floorValue, 24))),
    67: createFloorAction(floorDefinition('SR', 1, .5, effect([assignFloorFlat, zeroSectorType], triggerModel), adjust(floorValue, 32))),
    68: createFloorAction(floorDefinition('SR', 1, .5, effect([assignFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloor)),
};

// Ceilings
const ceilingSlow = 1;
const ceilingFast = ceilingSlow * 2;
const ceilingDefinition = (trigger: string, direction: number, speed: number, targetFn: TargetValueFunction) => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction,
    targetFn,
    speed,
});

const createCeilingAction =
        (def: ReturnType<typeof ceilingDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
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
            let finished = false;
            let original = sector.zCeil;
            sector.zCeil += def.speed * def.direction;
            playMoveSound(map, sector);

            if ((def.direction > 0 && sector.zCeil > target) || (def.direction < 0 && sector.zCeil < target)) {
                finished = true;
                sector.zCeil = target;
            }

            // crush
            if (def.direction === -1) {
                const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor, sector.zCeil));
                if (crushing.length) {
                    let hitSolid = crushing.reduce((res, mo) => crunchMapObject(mo) || res, false);
                    if (hitSolid) {
                        sector.zCeil = original;
                        return;
                    }
                }
            }

            if (finished) {
                map.game.playSound(SoundIndex.sfx_pstop, sector);
                sector.specialData = null;
                map.removeAction(action);
            }
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
            map.events.emit('sector-z',sector)
        }
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

const ceilingDefinitions = {
    40: createCeilingAction(ceilingDefinition('W1', 1, ceilingSlow, highestNeighbourCeiling)),
    41: createCeilingAction(ceilingDefinition('S1', -1, ceilingFast, floorHeight)),
    43: createCeilingAction(ceilingDefinition('SR', -1, ceilingFast, floorHeight)),
    44: createCeilingAction(ceilingDefinition('W1', -1, ceilingSlow, adjust(floorHeight, 8))),
    72: createCeilingAction(ceilingDefinition('WR', -1, ceilingSlow, adjust(floorHeight, 8))),
};

// Crusher Ceilings
const crusherCeilingDefinition = (trigger: string, speed: number, triggerType: 'start' | 'stop') => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction: -1,
    targetFn: adjust(floorHeight, 8),
    stopper: triggerType === 'stop',
    speed,
});

const createCrusherCeilingAction =
        (def: ReturnType<typeof crusherCeilingDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
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
        const top = sector.zCeil;
        const bottom = def.targetFn(map, sector);
        const action = () => {
            let finished = false;
            const mobjs = sectorObjects(map, sector);
            if (linedef.special !== 141) {
                playMoveSound(map, sector);
            }

            let original = sector.zCeil;
            sector.zCeil += def.speed * direction;
            if (sector.zCeil < bottom) {
                finished = true;
                sector.zCeil = bottom;
            }
            if (sector.zCeil > top) {
                finished = true;
                sector.zCeil = top;
            }

            // crush
            if (direction === -1) {
                const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor, sector.zCeil));
                if (crushing.length) {
                    const hitSolid = crushing.reduce((res, mo) => crunchAndDamageMapObject(mo) || res, false);
                    if (hitSolid && def.speed === ceilingSlow) {
                        // slow crushers go even slowing when they crush something
                        sector.zCeil = original + (def.speed / 8) * direction
                    }
                }
            }

            if (finished) {
                map.game.playSound(SoundIndex.sfx_pstop, sector);
                // crushers keep going
                direction = -direction;
            }
            mobjs.forEach(mobj => mobj.sectorChanged(sector));
            map.events.emit('sector-z', sector);
        };
        sector.specialData = action;
        map.addAction(action);
    }
    return triggered ? def : undefined;
};

const crusherCeilingDefinitions = {
    6: createCrusherCeilingAction(crusherCeilingDefinition('W1', ceilingFast, 'start')),
    25: createCrusherCeilingAction(crusherCeilingDefinition('W1', ceilingSlow, 'start')),
    49: createCrusherCeilingAction(crusherCeilingDefinition('S1', ceilingSlow, 'start')),
    57: createCrusherCeilingAction(crusherCeilingDefinition('W1', null, 'stop')),
    73: createCrusherCeilingAction(crusherCeilingDefinition('WR', ceilingSlow, 'start')),
    74: createCrusherCeilingAction(crusherCeilingDefinition('WR', null, 'stop')),
    77: createCrusherCeilingAction(crusherCeilingDefinition('WR', ceilingFast, 'start')),
    141: createCrusherCeilingAction(crusherCeilingDefinition('W1', ceilingSlow, 'start')),
};

// Lighting
const setLightLevel = (val: number) =>
    (map: MapRuntime, sec: Sector) => val;
const maxNeighbourLight = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.light), 0);
const minNeighbourLight = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.light), 255);
const lowestLight = (sectors: Sector[], max: number) =>
    sectors.reduce((last, sec) => Math.min(last, sec.light), max);

const createLightingDefinition = (trigger: string, targetValueFn: TargetValueFunction) => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    targetValueFn,
});

const createLightingAction =
        (def: ReturnType<typeof createLightingDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
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
    const sectors = map.sectorsByTag.get(linedef.tag) ?? [];
    for (const sector of sectors) {
        if (!def.targetValueFn) {
            map.addAction(strobeFlash(5, 35)(map, sector));
        } else {
            if (targetValue === -1) {
                targetValue = def.targetValueFn(map, sector);
            }
            sector.light = targetValue;
            map.events.emit('sector-light', sector);
        }
        triggered = true;
    }
    return triggered ? def : undefined;
};

const lightingDefinitions = {
    12: createLightingAction(createLightingDefinition('W1', maxNeighbourLight)),
    80: createLightingAction(createLightingDefinition('WR', maxNeighbourLight)),
    104: createLightingAction(createLightingDefinition('W1', minNeighbourLight)),
    // As far as I can tell, type 17 is only used in tnt 09. It's extra special
    13: createLightingAction(createLightingDefinition('W1', setLightLevel(255))),
    17: createLightingAction(createLightingDefinition('W1', null)),
    35: createLightingAction(createLightingDefinition('W1', setLightLevel(35))),
    79: createLightingAction(createLightingDefinition('WR', setLightLevel(35))),
    81: createLightingAction(createLightingDefinition('WR', setLightLevel(255))),
    139: createLightingAction(createLightingDefinition('SR',setLightLevel(35))),
    138: createLightingAction(createLightingDefinition('SR', setLightLevel(255))),
    // extended
    156: createLightingAction(createLightingDefinition('WR', null)),
    157: createLightingAction(createLightingDefinition('WR', minNeighbourLight)),
    169: createLightingAction(createLightingDefinition('S1', maxNeighbourLight)),
    170: createLightingAction(createLightingDefinition('S1', setLightLevel(35))),
    171: createLightingAction(createLightingDefinition('S1', setLightLevel(255))),
    172: createLightingAction(createLightingDefinition('S1', null)),
    173: createLightingAction(createLightingDefinition('S1', minNeighbourLight)),
    192: createLightingAction(createLightingDefinition('SR', maxNeighbourLight)),
    193: createLightingAction(createLightingDefinition('SR', null)),
    194: createLightingAction(createLightingDefinition('SR', minNeighbourLight)),
};

const strobeFlash =
    (lightTicks: number, darkTicks: number, synchronized = false) =>
    (map: MapRuntime, sector: Sector) => {
        const max = sector.light;
        const nearestMin = lowestLight(map.data.sectorNeighbours(sector), max);
        const min = (nearestMin >= max) ? 0 : nearestMin;
        let ticks = synchronized ? 1 : map.game.rng.int(1, 7);
        return () => {
            if (--ticks) {
                return;
            }
            if (sector.light === min) {
                ticks = lightTicks;
                sector.light = max;
            } else {
                ticks = darkTicks;
                sector.light = min;
            }
            map.events.emit('sector-light', sector);
        };
    };

const randomFlicker = (map: MapRuntime, sector: Sector) => {
    const max = sector.light;
    const min = lowestLight(map.data.sectorNeighbours(sector), max);
    let ticks = 1;
    return () => {
        if (--ticks) {
            return;
        }
        if (sector.light === max) {
            ticks = map.game.rng.int(1, 7);
            sector.light = min;
        } else {
            ticks = map.game.rng.int(1, 64);
            sector.light = max;
        }
        map.events.emit('sector-light', sector);
    };
};

const glowLight = (map: MapRuntime, sector: Sector) => {
    const max = sector.light;
    const min = lowestLight(map.data.sectorNeighbours(sector), max);
    let step = -8;
    return () => {
        let val = sector.light + step;
        if ((step < 0 && val <= min) || (step > 0 && val >= max)) {
            step = -step;
            val += step;
        }
        sector.light = val;
        map.events.emit('sector-light', sector);
    };
};

const fireFlicker = (map: MapRuntime, sector: Sector) => {
    const max = sector.light;
    const min = lowestLight(map.data.sectorNeighbours(sector), max) + 16;
    let ticks = 4;
    return () => {
        if (--ticks) {
            return;
        }
        ticks = 4;
        const amount = map.game.rng.int(0, 2) * 16;
        sector.light = Math.max(max - amount, min);
        map.events.emit('sector-light', sector);
    };
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
// Note: we use applyPositionChanged() for updating mobj position so that if
// others trying to teleport to the same spot, in the same tic, are blocked
const playerTeleportTypes = [39, 97, 174, 195, 207, 208, 209, 210, 243, 244, 262, 263];
const createTeleportDefinition = (trigger: string, translateFn: typeof teleportReorientMove, specialEffects: typeof teleportSoundAndFog, targetFn: typeof teleportThingInSectorTarget) => ({
    translateFn,
    specialEffects,
    targetFn,
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    monsterTrigger: true,
});

export const teleportReorientMove = (mobj: MapObject, dest: MapObject) => {
    mobj.velocity.set(0, 0, 0);
    mobj.direction = dest.direction;
    mobj.position.set(dest.position.x, dest.position.y, dest.sector.zFloor);
    mobj.applyPositionChanged();

    if (mobj.type === MapObjectIndex.MT_PLAYER) {
        // freeze player after teleporting
        mobj.reactiontime = 18;
    }
}
const teleportPreserveMove = (mobj: MapObject, dest: MapObject) => {
    mobj.position.set(dest.position.x, dest.position.y, dest.sector.zFloor);
    mobj.applyPositionChanged();
    // also freeze player?
}

const teleportSoundAndFog = (mobj: MapObject, dest: MapObject) => {
    const map = mobj.map;
    const oldPlaceFog = map.spawn(MapObjectIndex.MT_TFOG, mobj.position.x, mobj.position.y);
    map.game.playSound(SoundIndex.sfx_telept, oldPlaceFog);
    const newPlaceFog = map.spawn(MapObjectIndex.MT_TFOG,
        dest.position.x + 20 * Math.cos(dest.direction),
        dest.position.y + 20 * Math.sin(dest.direction));
    map.game.playSound(SoundIndex.sfx_telept, newPlaceFog);
}
const noSpecialEffects = (mobj: MapObject, dest: MapObject) => {};

const teleportThingInSectorTarget = (mobj: MapObject, linedef: LineDef, applyFn: (tp: MapObject) => boolean) => {
    for (const tp of mobj.map.teleportMobjs) {
        if (tp.sector.tag === linedef.tag && applyFn(tp)) {
            break; // done!
        }
    }
}

const lineWithTag = (mobj: MapObject, linedef: LineDef, applyFn: (tp: MapObject) => boolean) => {
    const lines = mobj.map.linedefsByTag.get(linedef.tag);
    for (const ld of lines) {
        if (ld === linedef) {
            continue;
        }
        // TODO: I don't think this calculation is complete...
        const dx = linedef.v[1].x - linedef.v[0].x;
        const frac = (dx < 0.000001 && dx > -0.000001)
            ? (mobj.position.y - linedef.v[0].y) / (linedef.v[1].y - linedef.v[0].y)
            : (mobj.position.x - linedef.v[0].x) / dx;
        const px = ld.v[0].x + (ld.v[1].x - ld.v[0].x) * frac;
        const py = ld.v[0].y + (ld.v[1].y - ld.v[0].y) * frac;
        mobj.position.set(px, py, mobj.position.z);
        mobj.applyPositionChanged();
        return true;
    }
    return false;
}
const lineWithTagReversed = (mobj: MapObject, linedef: LineDef, applyFn: (tp: MapObject) => boolean) => {
    const applied = lineWithTag(mobj, linedef, applyFn);
    if (applied) {
        // +180 turn
        mobj.direction = mobj.direction + Math.PI;
    }
}

export const telefragTargets = (mobj: MapObject) => {
    // monsters only telefrag in level 30
    if (mobj.isMonster && mobj.map.name !== 'MAP30') {
        return true;
    }
    // telefrag anything in our way
    mobj.map.data.traceMove({
        start: mobj.position,
        move: zeroVec,
        radius: mobj.info.radius,
        height: mobj.info.height,
        hitObject: hit => {
            // skip non shootable things and (obviously) don't hit ourselves
            if (!(hit.mobj.info.flags & MFFlags.MF_SHOOTABLE) || hit.mobj === mobj) {
                return true;
            }
            hit.mobj.damage(10_000, mobj, mobj);
            return true;
        }
    });
}

const moveBlocker = MFFlags.MF_SOLID | MFFlags.MF_SHOOTABLE;
export const isMonsterMoveBlocked = (mobj: MapObject, position: Vector3) => {
    let blocked = false;
    mobj.map.data.traceMove({
        start: position,
        move: zeroVec,
        radius: mobj.info.radius,
        height: mobj.info.height,
        hitObject: hit => !(blocked = Boolean(hit.mobj.info.flags & moveBlocker)),
    });
    return blocked;
};

const applyTeleportAction =
        (def: ReturnType<typeof createTeleportDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    if (side === 1) {
        // don't triggering teleports when leaving the teleport space
        return;
    }
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster && !def.monsterTrigger) {
        return;
    }
    const movePlayer = playerTeleportTypes.includes(linedef.special);
    if (mobj.type === MapObjectIndex.MT_PLAYER && !movePlayer) {
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    def.targetFn(mobj, linedef, tp => {
        if (mobj.isMonster) {
            // monsters cannot teleport if a hittable mobj is blocking teleport landing
            const blocked = isMonsterMoveBlocked(mobj, tp.position);
            if (blocked) {
                return false;
            }
        }

        // teleport success so apply fog in old and new locations
        def.specialEffects(mobj, tp);
        // move mobj
        // TODO: preserve or reverse orientation?
        def.translateFn(mobj, tp);
        telefragTargets(mobj);
        triggered = true;
        return true;
    });
    return triggered ? def : undefined;
};

const teleportDefinitions = {
    39: applyTeleportAction(createTeleportDefinition('W1', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
    97: applyTeleportAction(createTeleportDefinition('WR', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
    126: applyTeleportAction(createTeleportDefinition('WR', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
    125: applyTeleportAction(createTeleportDefinition('W1', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
    // extended
    174: applyTeleportAction(createTeleportDefinition('S1', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
    195: applyTeleportAction(createTeleportDefinition('SR', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
    207: applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
    208: applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
    209: applyTeleportAction(createTeleportDefinition('S1', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
    210: applyTeleportAction(createTeleportDefinition('SR', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
    243: applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTag)),
    244: applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTag)),
    262: applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
    263: applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
    264: applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
    265: applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
    266: applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTag)),
    267: applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTag)),
    268: applyTeleportAction(createTeleportDefinition('W1', teleportReorientMove, noSpecialEffects, teleportThingInSectorTarget)),
    269: applyTeleportAction(createTeleportDefinition('WR', teleportReorientMove, noSpecialEffects, teleportThingInSectorTarget)),
};

// Donut (apparently only in E1M2, E2M2 and MAP21 of tnt (none in Doom2 or plutonia)
const donut = (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
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
        const target = model.zFloor;

        pillar.specialData = def;
        const pillarAction = () => {
            let finished = false;
            playMoveSound(map, pillar);

            pillar.zFloor += -speed;
            if (pillar.zFloor < target) {
                finished = true;
                pillar.zFloor = target;
            }
            if (finished) {
                map.game.playSound(SoundIndex.sfx_pstop, pillar);
                pillar.specialData = null;
                map.removeAction(pillarAction);
            }
            sectorObjects(map, pillar).forEach(mobj => mobj.sectorChanged(pillar));
            map.events.emit('sector-z', pillar);
        };
        map.addAction(pillarAction);

        donut.specialData = def;
        const donutAction = () => {
            let finished = false;
            playMoveSound(map, donut);

            const mobjs = sectorObjects(map, pillar);
            let original = donut.zFloor;
            donut.zFloor += speed;

            if (donut.zFloor > target) {
                finished = true;
                donut.zFloor = target;
            } else {
                // FIXME: should this be pillar or donut (or both)?
                const crushing = mobjs.filter(mobj => !mobj.canSectorChange(pillar, donut.zFloor, pillar.zCeil));
                if (crushing.length) {
                    // stop movement if we hit something
                    donut.zFloor= original;
                    return;
                }
            }

            if (finished) {
                map.game.playSound(SoundIndex.sfx_pstop, donut);
                assignFloorFlat(map, model, donut);
                assignSectorType(map, model, donut);
                donut.specialData = null;
                map.removeAction(donutAction);
            }
            mobjs.forEach(mobj => mobj.sectorChanged(donut));
            map.events.emit('sector-z', donut);
        };
        map.addAction(donutAction);
    }
    return triggered ? def : undefined;
};

// Rising Stairs
const risingStairDefinition = (trigger: string, speed: number, stepSize: number) => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction: 1,
    stepSize,
    speed,
});

const createRisingStairAction =
        (def: ReturnType<typeof risingStairDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    const map = mobj.map;
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
        let target = sector.zFloor;

        const flat = sector.floorFlat;
        let base = sector;
        while (base) {
            target += def.stepSize;
            raiseFloorAction(map, base, def, target);

            // find next step to raise
            const matches = raiseFloorsectors(base, map.data.linedefs).filter(e => e.floorFlat === flat);
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

const risingStairs = {
    7: createRisingStairAction(risingStairDefinition('S1', .25, 8)),
    8: createRisingStairAction(risingStairDefinition('W1', .25, 8)),
    127: createRisingStairAction(risingStairDefinition('S1', 4, 16)),
    100: createRisingStairAction(risingStairDefinition('W1', 4, 16)),
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
        playMoveSound(map, sector);

        const mobjs = sectorObjects(map, sector);
        let original = sector.zFloor;
        sector.zFloor += def.direction * def.speed;
        if (sector.zFloor > target) {
            finished = true;
            sector.zFloor = target;
        } else {
            const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor, sector.zCeil));
            if (crushing.length) {
                // stop movement if we hit something
                sector.zFloor = original;
                return;
            }
        }

        if (finished) {
            map.game.playSound(SoundIndex.sfx_pstop, sector);
            sector.specialData = null;
            map.removeAction(action);
        }
        mobjs.forEach(mobj => mobj.sectorChanged(sector));
        map.events.emit('sector-z', sector);
    }
    map.addAction(action);
}

// Level exits
const levelExitDefinitions = (trigger: string, place: 'normal' | 'secret') => ({
    trigger: trigger[0] as TriggerType,
    place,
    repeatable: false,
});

const createLevelExitAction =
        (def: ReturnType<typeof levelExitDefinitions>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
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

const levelExits = {
    11: createLevelExitAction(levelExitDefinitions('S1', 'normal')),
    52: createLevelExitAction(levelExitDefinitions('W1', 'normal')),
    51: createLevelExitAction(levelExitDefinitions('S1', 'secret')),
    124: createLevelExitAction(levelExitDefinitions('W1', 'secret')),
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

// Pushers
export const linedefScrollSpeed = (linedef: LineDef) => {
    const slope = linedefSlope(linedef);
    const len = Math.floor(slope.length / 32);
    slope.dx = Math.sign(slope.dx) * len;
    slope.dy = Math.sign(slope.dy) * len;
    return slope;
}

export function pusherAction(map: MapRuntime, linedef: LineDef) {
    let specials: LineTraceHit[] = [];
    let movement = new Vector3();

    const sectors = map.sectorsByTag.get(linedef.tag);
    if (!sectors) {
        return;
    }
    const { dx, dy } = linedefScrollSpeed(linedef);
    movement.set(dx, dy, 0);
    const action = () => {
        // group mobjs by sector _before_ moving because otherwise the mobj may be put into another sector
        // that also moves. Actually, that can still happen if the mobj moves to a different pusher but from the
        // little testing I've done (cchest MAP02), it's expect.
        const sectorMobjs = sectors.map(sector => sectorObjects(map, sector).filter(e => e.onGround));
        for (const mobjs of sectorMobjs) {
            for (let i = 0; i < mobjs.length; i++) {
                specials.length = 0;
                const blocker = findMoveBlocker(mobjs[i], movement, specials);
                if (!blocker) {
                    mobjs[i].position.add(movement);
                    mobjs[i].positionChanged();
                    specials.forEach(hit => map.triggerSpecial(hit.line, mobjs[i], 'W', hit.side));
                }
            }
        }
    };
    map.addAction(action);
}