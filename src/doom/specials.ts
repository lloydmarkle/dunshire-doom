// kind of based on p_spec.c
import { type MapObject, PlayerMapObject } from "./map-object";
import { MFFlags, MapObjectIndex, SoundIndex, StateIndex } from "./doom-things-info";
import type { MapRuntime } from "./map-runtime";
import { zeroVec, type LineDef, type Sector, type LineTraceHit, type TraceParams, baseMoveTrace } from "./map-data";
import { _T, type MessageId } from "./text";
import { findMoveBlocker } from "./things/monsters";
import { Matrix4, Vector3 } from "three";

// why functions? To get around lexical scoping rules. I could also use function instead of arrows
// or maybe remove the whole "definition" idea.
// Also I've used lots of nested objects to make it easier to collapse portions of this list in an IDE
const doomSpecials: { [key: number]: () => SpecialAction } = {
    // Donut!
    ...{
        9: () => donut('S1'),
        // Extended donuts
        146: () => donut('W1'),
        155: () => donut('WR'),
        191: () => donut('SR'),
    },
    // Doors https://doomwiki.org/wiki/Linedef_type#Door_linedef_types
    ...{
        1: () => createDoorAction(doorDefinition('PRm', '', 2, 150, 'openWaitClose')),
        2: () => createDoorAction(doorDefinition('W1', '', 2, -1, 'openAndStay')),
        3: () => createDoorAction(doorDefinition('W1', '', 2, -1, 'closeAndStay')),
        4: () => createDoorAction(doorDefinition('W1', '', 2, 150, 'openWaitClose')),
        16: () => createDoorAction(doorDefinition('W1', '', 2, 1050, 'closeWaitOpen')),
        29: () => createDoorAction(doorDefinition('S1', '', 2, 150, 'openWaitClose')),
        31: () => createDoorAction(doorDefinition('P1', '', 2, -1, 'openAndStay')),
        42: () => createDoorAction(doorDefinition('SR', '', 2, -1, 'closeAndStay')),
        46: () => createDoorAction(doorDefinition('GR', '', 2, -1, 'openAndStay')),
        50: () => createDoorAction(doorDefinition('S1', '', 2, -1, 'closeAndStay')),
        61: () => createDoorAction(doorDefinition('SR', '', 2, -1, 'openAndStay')),
        63: () => createDoorAction(doorDefinition('SR', '', 2, 150, 'openWaitClose')),
        75: () => createDoorAction(doorDefinition('WR', '', 2, -1, 'closeAndStay')),
        76: () => createDoorAction(doorDefinition('WR', '', 2, 1050, 'closeWaitOpen')),
        86: () => createDoorAction(doorDefinition('WR', '', 2, -1, 'openAndStay')),
        90: () => createDoorAction(doorDefinition('WR', '', 2, 150, 'openWaitClose')),
        103: () => createDoorAction(doorDefinition('S1', '', 2, -1, 'openAndStay')),
        105: () => createDoorAction(doorDefinition('WR', '', 8, 150, 'openWaitClose')),
        106: () => createDoorAction(doorDefinition('WR', '', 8, -1, 'openAndStay')),
        107: () => createDoorAction(doorDefinition('WR', '', 8, -1, 'closeAndStay')),
        108: () => createDoorAction(doorDefinition('W1', '', 8, 150, 'openWaitClose')),
        109: () => createDoorAction(doorDefinition('W1', '', 8, -1, 'openAndStay')),
        110: () => createDoorAction(doorDefinition('W1', '', 8, -1, 'closeAndStay')),
        111: () => createDoorAction(doorDefinition('S1', '', 8, 150, 'openWaitClose')),
        112: () => createDoorAction(doorDefinition('S1', '', 8, -1, 'openAndStay')),
        113: () => createDoorAction(doorDefinition('S1', '', 8, -1, 'closeAndStay')),
        114: () => createDoorAction(doorDefinition('SR', '', 8, 150, 'openWaitClose')),
        115: () => createDoorAction(doorDefinition('SR', '', 8, -1, 'openAndStay')),
        116: () => createDoorAction(doorDefinition('SR', '', 8, -1, 'closeAndStay')),
        117: () => createDoorAction(doorDefinition('PR', '', 8, 150, 'openWaitClose')),
        118: () => createDoorAction(doorDefinition('P1', '', 8, -1, 'openAndStay')),
        // Key doors
        26: () => createDoorAction(doorDefinition('PR', 'B', 2, 150, 'openWaitClose')),
        28: () => createDoorAction(doorDefinition('PR', 'R', 2, 150, 'openWaitClose')),
        27: () => createDoorAction(doorDefinition('PR', 'Y', 2, 150, 'openWaitClose')),
        32: () => createDoorAction(doorDefinition('P1', 'B', 2, 35, 'openAndStay')),
        33: () => createDoorAction(doorDefinition('P1', 'R', 2, -1, 'openAndStay')),
        34: () => createDoorAction(doorDefinition('P1', 'Y', 2, -1, 'openAndStay')),
        99: () => createDoorAction(doorDefinition('SR', 'B', 8, -1, 'openAndStay')),
        134: () => createDoorAction(doorDefinition('SR', 'R', 8, -1, 'openAndStay')),
        136: () => createDoorAction(doorDefinition('SR', 'Y', 8, -1, 'openAndStay')),
        133: () => createDoorAction(doorDefinition('S1', 'B', 8, -1, 'openAndStay')),
        135: () => createDoorAction(doorDefinition('S1', 'R', 8, -1, 'openAndStay')),
        137: () => createDoorAction(doorDefinition('S1', 'Y', 8, -1, 'openAndStay')),
        // Extended Doors
        175: () => createDoorAction(doorDefinition('S1', '', 2, 1050, 'closeWaitOpen')),
        196: () => createDoorAction(doorDefinition('SR', '', 2, 1050, 'closeWaitOpen')),
    },
    // Moving floors
    ...{
        5: () => flatMoverAction(floorDefinition('W1', 1, 1, null, lowestNeighbourCeiling)),
        18: () => flatMoverAction(floorDefinition('S1', 1, 1, null, nextNeighbourFloorUp)),
        19: () => flatMoverAction(floorDefinition('W1', -1, 1, null, highestNeighbourFloor)),
        23: () => flatMoverAction(floorDefinition('S1', -1, 1, null, lowestNeighbourFloor)),
        24: () => flatMoverAction(floorDefinition('G1', 1, 1, null, lowestNeighbourCeiling)),
        30: () => flatMoverAction(floorDefinition('W1', 1, 1, null, shortestLowerTexture(1))),
        36: () => flatMoverAction(floorDefinition('W1', -1, 4, null, offset(highestNeighbourFloor, 8))),
        37: () => flatMoverAction(floorDefinition('W1', -1, 1, effect([copyFloorFlat, copySectorType], numModel('zFloor')), lowestNeighbourFloor)),
        38: () => flatMoverAction(floorDefinition('W1', -1, 1, null, lowestNeighbourFloor)),
        45: () => flatMoverAction(floorDefinition('SR', -1, 1, null, highestNeighbourFloor)),
        55: () => flatMoverAction(floorDefinition('S1', 1, 1, null, offset(lowestNeighbourCeiling, -8), true)),
        56: () => flatMoverAction(floorDefinition('W1', 1, 1, null, offset(lowestNeighbourCeiling, -8), true)),
        58: () => flatMoverAction(floorDefinition('W1', 1, 1, null, offset(floorHeight, 24))),
        59: () => flatMoverAction(floorDefinition('W1', 1, 1, effect([copyFloorFlat, copySectorType], triggerModel), offset(floorHeight, 24))),
        60: () => flatMoverAction(floorDefinition('SR', -1, 1, null, lowestNeighbourFloor)),
        64: () => flatMoverAction(floorDefinition('SR', 1, 1, null, lowestNeighbourCeiling)),
        65: () => flatMoverAction(floorDefinition('SR', 1, 1, null, offset(lowestNeighbourCeiling, -8), true)),
        69: () => flatMoverAction(floorDefinition('SR', 1, 1, null, nextNeighbourFloorUp)),
        70: () => flatMoverAction(floorDefinition('SR', -1, 4, null, offset(highestNeighbourFloor, 8))),
        71: () => flatMoverAction(floorDefinition('S1', -1, 4, null, offset(highestNeighbourFloor, 8))),
        82: () => flatMoverAction(floorDefinition('WR', -1, 1, null, lowestNeighbourFloor)),
        83: () => flatMoverAction(floorDefinition('WR', -1, 1, null, highestNeighbourFloor)),
        84: () => flatMoverAction(floorDefinition('WR', -1, 1, effect([copyFloorFlat, copySectorType], numModel('zFloor')), lowestNeighbourFloor)),
        91: () => flatMoverAction(floorDefinition('WR', 1, 1, null, lowestNeighbourCeiling)),
        92: () => flatMoverAction(floorDefinition('WR', 1, 1, null, offset(floorHeight, 24))),
        93: () => flatMoverAction(floorDefinition('WR', 1, 1, effect([copyFloorFlat, copySectorType], triggerModel),  offset(floorHeight, 24))),
        94: () => flatMoverAction(floorDefinition('WR', 1, 1, null, offset(lowestNeighbourCeiling, -8), true)),
        95: () => flatMoverAction(floorDefinition('WR', 1, 0.5, effect([copyFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloorUp)),
        96: () => flatMoverAction(floorDefinition('WR', 1, 1, null, shortestLowerTexture(1))),
        98: () => flatMoverAction(floorDefinition('WR', -1, 4, null, offset(highestNeighbourFloor, 8))),
        101: () => flatMoverAction(floorDefinition('S1', 1, 1, null, lowestNeighbourCeiling)),
        102: () => flatMoverAction(floorDefinition('S1', -1, 1, null, highestNeighbourFloor)),
        119: () => flatMoverAction(floorDefinition('W1', 1, 1, null, nextNeighbourFloorUp)),
        128: () => flatMoverAction(floorDefinition('WR', 1, 1, null, nextNeighbourFloorUp)),
        129: () => flatMoverAction(floorDefinition('WR', 1, 4, null, nextNeighbourFloorUp)),
        130: () => flatMoverAction(floorDefinition('W1', 1, 4, null, nextNeighbourFloorUp)),
        131: () => flatMoverAction(floorDefinition('S1', 1, 4, null, nextNeighbourFloorUp)),
        132: () => flatMoverAction(floorDefinition('SR', 1, 4, null, nextNeighbourFloorUp)),
        140: () => flatMoverAction(floorDefinition('S1', 1, 1, null, offset(floorHeight, 512))),
        // Extended floors
        78: () => flatMoverAction(floorDefinition('SR', 0, 0, effect([copyFloorFlat, copySectorType], numModel('zFloor')), floorHeight)),
        142: () => flatMoverAction(floorDefinition('W1', 1, 1, null, offset(floorHeight, 512))),
        147: () => flatMoverAction(floorDefinition('WR', 1, 1, null, offset(floorHeight, 512))),
        153: () => flatMoverAction(floorDefinition('W1', 1, 1, effect([copyFloorFlat, copySectorType], triggerModel), floorHeight)),
        154: () => flatMoverAction(floorDefinition('WR', 1, 1, effect([copyFloorFlat, copySectorType], triggerModel), floorHeight)),
        158: () => flatMoverAction(floorDefinition('S1', 1, 1, null, shortestLowerTexture(1))),
        159: () => flatMoverAction(floorDefinition('S1', -1, 1, effect([copyFloorFlat, copySectorType], numModel('zFloor')), lowestNeighbourFloor)),
        160: () => flatMoverAction(floorDefinition('S1', 1, 1, effect([copyFloorFlat, copySectorType], triggerModel), offset(floorHeight, 24))),
        161: () => flatMoverAction(floorDefinition('S1', 1, 1, null, offset(floorHeight, 24))),
        176: () => flatMoverAction(floorDefinition('SR', 1, 1, null, shortestLowerTexture(1))),
        177: () => flatMoverAction(floorDefinition('SR', -1, 1, effect([copyFloorFlat, copySectorType], numModel('zFloor')), lowestNeighbourFloor)),
        178: () => flatMoverAction(floorDefinition('SR', 1, 1, null, offset(floorHeight, 512))),
        179: () => flatMoverAction(floorDefinition('SR', 1, 1, effect([copyFloorFlat, copySectorType], triggerModel), offset(floorHeight, 24))),
        180: () => flatMoverAction(floorDefinition('SR', 1, 1, null, offset(floorHeight, 24))),
        189: () => flatMoverAction(floorDefinition('S1', 0, 0, effect([copyFloorFlat, copySectorType], triggerModel), floorHeight)),
        190: () => flatMoverAction(floorDefinition('SR', 0, 0, effect([copyFloorFlat, copySectorType], triggerModel), floorHeight)),
        219: () => flatMoverAction(floorDefinition('W1', -1, 1, null, nextNeighbourFloorDown)),
        220: () => flatMoverAction(floorDefinition('WR', -1, 1, null, nextNeighbourFloorDown)),
        221: () => flatMoverAction(floorDefinition('S1', -1, 1, null, nextNeighbourFloorDown)),
        222: () => flatMoverAction(floorDefinition('SR', -1, 1, null, nextNeighbourFloorDown)),
        239: () => flatMoverAction(floorDefinition('W1', 0, 0, effect([copyFloorFlat, copySectorType], numModel('zFloor')), floorHeight)),
        240: () => flatMoverAction(floorDefinition('WR', 0, 0, effect([copyFloorFlat, copySectorType], numModel('zFloor')), floorHeight)),
        241: () => flatMoverAction(floorDefinition('S1', 0, 0, effect([copyFloorFlat, copySectorType], numModel('zFloor')), floorHeight)),
        // More moving floors
        // Note: DOOM wiki calls these lifts https://doomwiki.org/wiki/Linedef_type#Platforms_.28lifts.29
        // but they seem to better match a moving floor
        14: () => flatMoverAction(floorDefinition('S1', 1, .5, effect([copyFloorFlat, zeroSectorType], triggerModel), offset(floorHeight, 32))),
        15: () => flatMoverAction(floorDefinition('S1', 1, .5, effect([copyFloorFlat], triggerModel), offset(floorHeight, 24))),
        20: () => flatMoverAction(floorDefinition('S1', 1, .5, effect([copyFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloorUp)),
        22: () => flatMoverAction(floorDefinition('W1', 1, .5, effect([copyFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloorUp)),
        47: () => flatMoverAction(floorDefinition('G1', 1, .5, effect([copyFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloorUp)),
        66: () => flatMoverAction(floorDefinition('SR', 1, .5, effect([copyFloorFlat], triggerModel), offset(floorHeight, 24))),
        67: () => flatMoverAction(floorDefinition('SR', 1, .5, effect([copyFloorFlat, zeroSectorType], triggerModel), offset(floorHeight, 32))),
        68: () => flatMoverAction(floorDefinition('SR', 1, .5, effect([copyFloorFlat, zeroSectorType], triggerModel), nextNeighbourFloorUp)),
        // More Extended moving floors
        143: () => flatMoverAction(floorDefinition('W1', 1, 1, effect([copyFloorFlat], triggerModel), offset(floorHeight, 24))),
        144: () => flatMoverAction(floorDefinition('W1', 1, 1, effect([copyFloorFlat, zeroSectorType], triggerModel), offset(floorHeight, 32))),
        148: () => flatMoverAction(floorDefinition('WR', 1, 1, effect([copyFloorFlat], triggerModel), offset(floorHeight, 24))),
        149: () => flatMoverAction(floorDefinition('WR', 1, 1, effect([copyFloorFlat, zeroSectorType], triggerModel), offset(floorHeight, 32))),
    },

    // 211 	Ext 	SR 	-- 	Inst 	None 	-- 	No 	Ceiling (toggle)
    // 212 	Ext 	WR 	-- 	Inst 	None 	-- 	No 	Ceiling (toggle)

    // Moving ceilings
    ...{
        40: () => flatMoverAction(ceilingDefinition('W1', 1, 1, highestNeighbourCeiling)),
        41: () => flatMoverAction(ceilingDefinition('S1', -1, 2, floorHeight)),
        43: () => flatMoverAction(ceilingDefinition('SR', -1, 2, floorHeight)),
        44: () => flatMoverAction(ceilingDefinition('W1', -1, 1, offset(floorHeight, 8))),
        72: () => flatMoverAction(ceilingDefinition('WR', -1, 1, offset(floorHeight, 8))),
        // Extended ceilings
        145: () => flatMoverAction(ceilingDefinition('W1', -1, 2, floorHeight)),
        151: () => flatMoverAction(ceilingDefinition('WR', 1, 1, highestNeighbourCeiling)),
        152: () => flatMoverAction(ceilingDefinition('WR', -1, 2, floorHeight)),
        166: () => flatMoverAction(ceilingDefinition('S1', 1, 1, highestNeighbourCeiling)),
        167: () => flatMoverAction(ceilingDefinition('S1', -1, 1, offset(floorHeight, 8))),
        186: () => flatMoverAction(ceilingDefinition('SR', 1, 1, highestNeighbourCeiling)),
        187: () => flatMoverAction(ceilingDefinition('SR', -1, 1, offset(floorHeight, 8))),
        199: () => flatMoverAction(ceilingDefinition('W1', -1, 1, lowestNeighbourCeiling)),
        200: () => flatMoverAction(ceilingDefinition('W1', -1, 1, highestNeighbourFloor)),
        201: () => flatMoverAction(ceilingDefinition('WR', -1, 1, lowestNeighbourCeiling)),
        202: () => flatMoverAction(ceilingDefinition('WR', -1, 1, highestNeighbourFloor)),
        203: () => flatMoverAction(ceilingDefinition('S1', -1, 1, lowestNeighbourCeiling)),
        204: () => flatMoverAction(ceilingDefinition('S1', -1, 1, highestNeighbourFloor)),
        205: () => flatMoverAction(ceilingDefinition('SR', -1, 1, lowestNeighbourCeiling)),
        206: () => flatMoverAction(ceilingDefinition('SR', -1, 1, highestNeighbourFloor)),
    },
    // Elevators (kind of a moving floor that also moves the ceiling)
    ...{
        227: () => flatMoverAction(elevatorDefinition('W1', 1, nextNeighbourFloorUp)),
        228: () => flatMoverAction(elevatorDefinition('WR', 1, nextNeighbourFloorUp)),
        229: () => flatMoverAction(elevatorDefinition('S1', 1, nextNeighbourFloorUp)),
        230: () => flatMoverAction(elevatorDefinition('SR', 1, nextNeighbourFloorUp)),
        231: () => flatMoverAction(elevatorDefinition('W1', 1, nextNeighbourFloorDown)),
        232: () => flatMoverAction(elevatorDefinition('WR', 1, nextNeighbourFloorDown)),
        233: () => flatMoverAction(elevatorDefinition('S1', 1, nextNeighbourFloorDown)),
        234: () => flatMoverAction(elevatorDefinition('SR', 1, nextNeighbourFloorDown)),
        235: () => flatMoverAction(elevatorDefinition('W1', 1, triggerFloor)),
        236: () => flatMoverAction(elevatorDefinition('WR', 1, triggerFloor)),
        237: () => flatMoverAction(elevatorDefinition('S1', 1, triggerFloor)),
        238: () => flatMoverAction(elevatorDefinition('SR', 1, triggerFloor)),
    },
    // Lifts
    ...{
        // Some combination of the unofficial doom spec https://www.gamers.org/dhs/helpdocs/dmsp1666.html
        // and doomwiki https://doomwiki.org/wiki/Linedef_type#Platforms_.28lifts.29
        // Note doomwiki categorizes some floor movements as "lifts" while the doom spec calls them moving floors
        // We call them "floors" and keep lifts as strictly something moves and can reverse
        10: () => applySpecial(liftDefinition('W1m', 105, 4, lowestNeighbourFloor, floorHeight)),
        21: () => applySpecial(liftDefinition('S1', 105, 4, lowestNeighbourFloor, floorHeight)),
        53: () => applySpecial(liftDefinition('W1', 105, 1, lowestNeighbourFloor, highestNeighbourFloorInclusive, 'perpetual')),
        54: () => applySpecial(liftDefinition('W1', 0, 0, lowestNeighbourFloor, floorHeight, 'stop')),
        62: () => applySpecial(liftDefinition('SR', 105, 4, lowestNeighbourFloor, floorHeight)),
        87: () => applySpecial(liftDefinition('WR', 105, 1, lowestNeighbourFloor, highestNeighbourFloorInclusive, 'perpetual')),
        88: () => applySpecial(liftDefinition('WRm', 105, 4, lowestNeighbourFloor, floorHeight)),
        89: () => applySpecial(liftDefinition('WR', 0, 0, lowestNeighbourFloor, floorHeight, 'stop')),
        // 95 is moved to floorActions but is that correct? I could only find this linedef at the end of
        // Sigil E5M4 and sigil E6M6. Floor actions work just fine so may be it's okay?
        // 95: createLiftAction(liftDefinition('WR', 0, 0.5, 1, lowestNeighbourFloor, nextNeighbourFloor, 'normal', effect([assignFloorFlat, zeroSectorType], triggerModel))),
        // FIXME: should these be speed 4 or 8?
        120: () => applySpecial(liftDefinition('WR', 105, 8, lowestNeighbourFloor, floorHeight)),
        121: () => applySpecial(liftDefinition('W1', 105, 8, lowestNeighbourFloor, floorHeight)),
        122: () => applySpecial(liftDefinition('S1', 105, 8, lowestNeighbourFloor, floorHeight)),
        123: () => applySpecial(liftDefinition('SR', 105, 8, lowestNeighbourFloor, floorHeight)),
        // Extended lifts
        162: () => applySpecial(liftDefinition('S1', 105, 1, lowestNeighbourFloor, highestNeighbourFloorInclusive, 'perpetual')),
        181: () => applySpecial(liftDefinition('SR', 105, 1, lowestNeighbourFloor, highestNeighbourFloorInclusive, 'perpetual')),
        163: () => applySpecial(liftDefinition('S1', 0, 0, floorHeight, floorHeight, 'stop')),
        182: () => applySpecial(liftDefinition('SR', 0, 0, floorHeight, floorHeight, 'stop')),
    },
    // Crushers
    ...{
        6: () => applySpecial(crusherCeilingDefinition('W1', 2, 'start')),
        25: () => applySpecial(crusherCeilingDefinition('W1', 1, 'start')),
        49: () => applySpecial(crusherCeilingDefinition('S1', 1, 'start')),
        57: () => applySpecial(crusherCeilingDefinition('W1', 0, 'stop')),
        73: () => applySpecial(crusherCeilingDefinition('WR', 1, 'start')),
        74: () => applySpecial(crusherCeilingDefinition('WR', 0, 'stop')),
        77: () => applySpecial(crusherCeilingDefinition('WR', 2, 'start')),
        141: () => applySpecial(crusherCeilingDefinition('W1', 1, 'start')),
        // Extended crushers
        150: () => applySpecial(crusherCeilingDefinition('WR', 1, 'start', true)),
        164: () => applySpecial(crusherCeilingDefinition('S1', 2, 'start', false)),
        165: () => applySpecial(crusherCeilingDefinition('S1', 1, 'start', true)),
        168: () => applySpecial(crusherCeilingDefinition('S1', 0, 'stop')),
        183: () => applySpecial(crusherCeilingDefinition('SR', 2, 'start')),
        184: () => applySpecial(crusherCeilingDefinition('SR', 1, 'start')),
        185: () => applySpecial(crusherCeilingDefinition('SR', 1, 'start', true)),
        188: () => applySpecial(crusherCeilingDefinition('SR', 0, 'stop')),
    },
    // Lighting
    ...{
        12: () => lightChangeAction(createLightingDefinition('W1', maxNeighbourLight)),
        80: () => lightChangeAction(createLightingDefinition('WR', maxNeighbourLight)),
        104: () => lightChangeAction(createLightingDefinition('W1', minNeighbourLight)),
        // As far as I can tell, type 17 is only used in tnt 09. It's extra special
        13: () => lightChangeAction(createLightingDefinition('W1', setLightLevel(255))),
        17: () => lightChangeAction(createLightingDefinition('W1', null)),
        35: () => lightChangeAction(createLightingDefinition('W1', setLightLevel(35))),
        79: () => lightChangeAction(createLightingDefinition('WR', setLightLevel(35))),
        81: () => lightChangeAction(createLightingDefinition('WR', setLightLevel(255))),
        139: () => lightChangeAction(createLightingDefinition('SR',setLightLevel(35))),
        138: () => lightChangeAction(createLightingDefinition('SR', setLightLevel(255))),
        // extended
        156: () => lightChangeAction(createLightingDefinition('WR', null)),
        157: () => lightChangeAction(createLightingDefinition('WR', minNeighbourLight)),
        169: () => lightChangeAction(createLightingDefinition('S1', maxNeighbourLight)),
        170: () => lightChangeAction(createLightingDefinition('S1', setLightLevel(35))),
        171: () => lightChangeAction(createLightingDefinition('S1', setLightLevel(255))),
        172: () => lightChangeAction(createLightingDefinition('S1', null)),
        173: () => lightChangeAction(createLightingDefinition('S1', minNeighbourLight)),
        192: () => lightChangeAction(createLightingDefinition('SR', maxNeighbourLight)),
        193: () => lightChangeAction(createLightingDefinition('SR', null)),
        194: () => lightChangeAction(createLightingDefinition('SR', minNeighbourLight)),
    },
    // Teleports
    ...{
        39: () => applyTeleportAction(createTeleportDefinition('W1', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
        97: () => applyTeleportAction(createTeleportDefinition('WR', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
        126: () => applyTeleportAction(createTeleportDefinition('WR', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
        125: () => applyTeleportAction(createTeleportDefinition('W1', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
        // extended
        174: () => applyTeleportAction(createTeleportDefinition('S1', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
        195: () => applyTeleportAction(createTeleportDefinition('SR', teleportReorientMove, teleportSoundAndFog, teleportThingInSectorTarget)),
        207: () => applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
        208: () => applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
        209: () => applyTeleportAction(createTeleportDefinition('S1', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
        210: () => applyTeleportAction(createTeleportDefinition('SR', teleportPreserveMove, noSpecialEffects, teleportThingInSectorTarget)),
        243: () => applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTag)),
        244: () => applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTag)),
        262: () => applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
        263: () => applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
        264: () => applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
        265: () => applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTagReversed)),
        266: () => applyTeleportAction(createTeleportDefinition('W1', teleportPreserveMove, noSpecialEffects, lineWithTag)),
        267: () => applyTeleportAction(createTeleportDefinition('WR', teleportPreserveMove, noSpecialEffects, lineWithTag)),
        268: () => applyTeleportAction(createTeleportDefinition('W1', teleportReorientMove, noSpecialEffects, teleportThingInSectorTarget)),
        269: () => applyTeleportAction(createTeleportDefinition('WR', teleportReorientMove, noSpecialEffects, teleportThingInSectorTarget)),
    },
    // Stair builders (rising stairs)
    ...{
        7: () => stairBuilderAction(stairBuilderDefinition('S1', .25, 8)),
        8: () => stairBuilderAction(stairBuilderDefinition('W1', .25, 8)),
        127: () => stairBuilderAction(stairBuilderDefinition('S1', 4, 16)),
        100: () => stairBuilderAction(stairBuilderDefinition('W1', 4, 16)),
        // Extended
        256: () => stairBuilderAction(stairBuilderDefinition('WR', .25, 8)),
        257: () => stairBuilderAction(stairBuilderDefinition('WR', 4, 16)),
        258: () => stairBuilderAction(stairBuilderDefinition('SR', .25, 16)),
        259: () => stairBuilderAction(stairBuilderDefinition('SR', 4, 16)),
    },
    // Level exist
    ...{
        11: () => createLevelExitAction(levelExitDefinitions('S1', 'normal')),
        52: () => createLevelExitAction(levelExitDefinitions('W1', 'normal')),
        51: () => createLevelExitAction(levelExitDefinitions('S1', 'secret')),
        124: () => createLevelExitAction(levelExitDefinitions('W1', 'secret')),
        // Extended
        197: () => createLevelExitAction(levelExitDefinitions('G1', 'normal')),
        198: () => createLevelExitAction(levelExitDefinitions('G1', 'secret')),
    },
};

// General
type SpecialAction = (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1) => SpecialDefinition | undefined;
// Push, Switch, Walk, Gun (shoot)
export type TriggerType = 'P' | 'S' | 'W' | 'G';
const maxZ = 32000;

export function triggerSpecial(mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1) {
    if (ignoreLines.has(linedef.special)) {
        return;
    }

    let action = doomSpecials[linedef.special]?.();
    if (action) {
        return action(mobj, linedef, trigger, side);
    }

    const changeEffects = (model: SectorSelectorFunction) => [
        null,
        effect([copyFloorFlat, zeroSectorType], model),
        effect([copyFloorFlat], model),
        effect([copyFloorFlat, copySectorType], model),
    ]
    const triggerType = ['W1', 'WR', 'S1', 'SR', 'G1', 'GR', 'P1', 'PR'][linedef.special & 0x0007];
    if (linedef.special >= 0x2f80 && linedef.special < 0x3000) {
        // crushers
        const monsterTrigger = ((linedef.special & 0x0020) >> 5) ? 'm' : '';
        const def = crusherCeilingDefinition(
            triggerType + monsterTrigger,
            [1, 2, 4, 8][(linedef.special & 0x0018) >> 3],
            'start',
            Boolean((linedef.special & 0x0040) >> 6));
        action = applySpecial(def);
    } else if (linedef.special >= 0x3000 && linedef.special < 0x3400) {
        // stair builders
        const monsterTrigger = ((linedef.special & 0x0020) >> 5) ? 'm' : '';
        const def = stairBuilderDefinition(
            triggerType + monsterTrigger,
            [.25, .5, 2, 4][(linedef.special & 0x0018) >> 3],
            [4, 8, 16, 24][(linedef.special & 0x00c0) >> 6],
            ((linedef.special & 0x0100) >> 8) ? 1 : -1,
            Boolean((linedef.special & 0x0200) >> 9));
        action = stairBuilderAction(def);
    } else if (linedef.special >= 0x3400 && linedef.special < 0x3800) {
        // lifts
        const monsterTrigger = ((linedef.special & 0x0020) >> 5) ? 'm' : '';
        const [lowTarget, hightTarget] = ([
            [lowestNeighbourFloor, floorHeight],
            [nextLowestNeighbourFloor, floorHeight],
            [lowestNeighbourCeiling, floorHeight],
            [lowestNeighbourFloor, highestNeighbourFloorInclusive],
        ] as TargetValueFunction[][])[(linedef.special & 0x0300) >> 8];
        const def = liftDefinition(
            triggerType + monsterTrigger,
            [35, 105, 165, 350][(linedef.special & 0x00c0) >> 6],
            [1, 2, 4, 8][(linedef.special & 0x0018) >> 3],
            lowTarget,
            hightTarget,
            (hightTarget === highestNeighbourFloorInclusive) ? 'perpetual' : 'normal');
        action = applySpecial(def);
    } else if (linedef.special >= 0x3800 && linedef.special < 0x3c00) {
        // generalized locked doors
        const doorFunction = (['openWaitClose', 'openAndStay'] as DoorFunction[])[(linedef.special & 0x0020) >> 5];
        const differentiateSkullKeys = Boolean((linedef.special & 0x0200) >> 9);
        const keys = [
            '*', 'R', 'B', 'Y', 'r', 'b', 'y', (differentiateSkullKeys ? 'RBYrby' : 'RBY'),
        ][(linedef.special & 0x01c0) >> 6];
        const def = doorDefinition(
            triggerType,
            keys,
            [2, 4, 8, 16][(linedef.special & 0x0018) >> 3],
            150,
            doorFunction,
            differentiateSkullKeys);
        action = createDoorAction(def);
    } else if (linedef.special >= 0x3c00 && linedef.special < 0x4000) {
        // generalized doors
        const monsterTrigger = ((linedef.special & 0x0080) >> 7) ? 'm' : '';
        const doorFunction = ([
            'openWaitClose', 'openAndStay', 'closeWaitOpen', 'closeAndStay'
        ] as DoorFunction[])[(linedef.special & 0x0060) >> 5];
        const def = doorDefinition(
            triggerType + monsterTrigger,
            '',
            [2, 4, 8, 16][(linedef.special & 0x0018) >> 3],
            [35, 150, 315, 1050][(linedef.special & 0x0300) >> 8],
            doorFunction);
        action = createDoorAction(def);
    } else if (linedef.special >= 0x4000 && linedef.special < 0x6000) {
        // generalized ceilings
        const change = (linedef.special & 0x0c00) >> 10;
        const model = ((linedef.special & 0x0020) >> 5) ? numModel('zCeil') : triggerModel;
        const monsterTrigger = ((change === 0 && (linedef.special & 0x0020) >> 5) ? 'm' : '');
        const direction = ((linedef.special & 0x0040) >> 6) ? 1 : -1;
        const def = ceilingDefinition(
            triggerType + monsterTrigger,
            direction,
            [1, 2, 4, 8][(linedef.special & 0x0018) >> 3],
            [
                highestNeighbourCeiling,
                lowestNeighbourCeiling,
                direction > 0 ? nextNeighbourCeilingUp : nextNeighbourCeilingDown,
                highestNeighbourFloor,
                floorHeight,
                shortestLowerTexture(direction),
                offset(ceilingHeight, 24),
                offset(ceilingHeight, 32),
            ][(linedef.special & 0x0380) >> 7],
            changeEffects(model)[change],
            !Boolean((linedef.special & 0x1000) >> 12));
        action = flatMoverAction(def);
    } else if (linedef.special >= 0x6000 && linedef.special < 0x8000) {
        // generalized floors
        const change = (linedef.special & 0x0c00) >> 10;
        const model = ((linedef.special & 0x0020) >> 5) ? numModel('zFloor') : triggerModel;
        const direction = ((linedef.special & 0x0040) >> 6) ? 1 : -1;
        const monsterTrigger = ((change === 0 && (linedef.special & 0x0020) >> 5) ? 'm' : '');
        const def = floorDefinition(
            triggerType + monsterTrigger,
            direction,
            [1, 2, 4, 8][(linedef.special & 0x0018) >> 3],
            changeEffects(model)[change],
            [
                highestNeighbourFloor,
                lowestNeighbourFloor,
                direction > 0 ? nextNeighbourFloorUp : nextNeighbourFloorDown,
                lowestNeighbourCeiling,
                ceilingHeight,
                shortestLowerTexture(direction),
                offset(floorHeight, 24),
                offset(floorHeight, 32),
            ][(linedef.special & 0x0380) >> 7],
            !Boolean((linedef.special & 0x1000) >> 12));
        action = flatMoverAction(def);
    }

    if (action) {
        return action(mobj, linedef, trigger, side);
    }
    console.warn('unsupported linedef special:', linedef.special);
}
const ignoreLines = new Set([
    // scrollers can be walked over but they don't do anything (they don't start/stop) so ignore them
    48, 85, 255, 250, 251, 252, 253, 254,
    // transfer lines should generally be outside map bounds but better to ignore them too
    213, 242, 261,
    // transparent lines
    260,
]);

export interface SpecialDefinition {
    repeatable: boolean;
}

// misc helpers
const playMoveSound = (map: MapRuntime, sector: Sector) => {
    if ((Math.trunc(map.game.time.tick.val) & 7) === 0) {
        map.game.playSound(SoundIndex.sfx_stnmov, sector);
    }
}
const sectorObjects = (map: MapRuntime, sector: Sector) => [...map.sectorObjs.get(sector)];
const reduceEmpty = <T>(arr: T[], fn: (previousValue: T, currentValue: T, currentIndex: number, array: T[]) => T): T =>
    arr.length === 0 ? undefined : arr.reduce(fn);

// Flat mover target value functions
type TargetValueFunction = (map: MapRuntime, sector: Sector, linedef?: LineDef) => number;
const offset = (fn: TargetValueFunction, change: number) => (map: MapRuntime, sector: Sector) => fn(map, sector) + change;
const triggerFloor = (map: MapRuntime, sector: Sector, linedef: LineDef) => linedef.right.sector.zFloor
const floorHeight = (map: MapRuntime, sector: Sector) => sector.zFloor;
const ceilingHeight = (map: MapRuntime, sector: Sector) => sector.zCeil;
const findLowestCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zCeil), maxZ)
const lowestNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zFloor), sector.zFloor);
const highestNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zFloor), -maxZ);
const highestNeighbourFloorInclusive = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zFloor), sector.zFloor);
const nextNeighbourCeilingUp = (map: MapRuntime, sector: Sector) =>
    reduceEmpty(map.data.sectorNeighbours(sector).filter(sec => sec.zCeil > sector.zCeil), (last, sec) => sec.zCeil < last.zCeil ? sec : last)?.zCeil ?? sector.zCeil;
const nextNeighbourCeilingDown = (map: MapRuntime, sector: Sector) =>
    reduceEmpty(map.data.sectorNeighbours(sector).filter(sec => sec.zCeil < sector.zCeil), (last, sec) => sec.zCeil > last.zCeil ? sec : last)?.zCeil ?? sector.zCeil;
const nextLowestNeighbourFloor = (map: MapRuntime, sector: Sector) =>
    reduceEmpty(map.data.sectorNeighbours(sector).filter(sec => sec.zFloor < sector.zFloor), (last, sec) => sec.zFloor > last.zFloor ? sec : last)?.zFloor ?? sector.zFloor;
const nextNeighbourFloorUp = (map: MapRuntime, sector: Sector) =>
    reduceEmpty(map.data.sectorNeighbours(sector).filter(sec => sec.zFloor > sector.zFloor), (last, sec) => sec.zFloor < last.zFloor ? sec : last)?.zFloor ?? sector.zFloor;
const nextNeighbourFloorDown = (map: MapRuntime, sector: Sector) =>
    reduceEmpty(map.data.sectorNeighbours(sector).filter(sec => sec.zFloor < sector.zFloor), (last, sec) => sec.zFloor > last.zFloor ? sec : last)?.zFloor ?? sector.zFloor;
const lowestNeighbourCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.zCeil), sector.zCeil);
const highestNeighbourCeiling = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.zCeil), -maxZ);
const shortestLowerTexture = (direction: -1 | 1) => (map: MapRuntime, sector: Sector) =>
    sector.zFloor + direction * map.data.linedefs.reduce((target, ld) =>
        (ld.left?.sector !== sector && ld.right.sector !== sector) ? target :
            Math.min(target,
                (map.game.wad.wallTextureData(ld.left?.lower)?.height ?? missingTextureSize),
                (map.game.wad.wallTextureData(ld.right.lower)?.height ?? missingTextureSize)),
        maxZ);
// https://www.doomworld.com/forum/topic/95030-why-does-raise-floor-by-shortest-lower-texture-only-half-work-on-older-ports/#comment-1770824
// solves a bug in Doom2's MAP15 but it really doesn't feel right. I'm guessing almost every doom "shortest lower texture"
// linedef out there expects 64px (or less) rise because, in my opinion, it's highly unlikely both side lower textures are set
const missingTextureSize = 64;

// effect selectors
type SectorSelectorFunction = (map: MapRuntime, sector: Sector, linedef: LineDef, target: number) => Sector | undefined;
const triggerModel = (map: MapRuntime, sector: Sector, linedef: LineDef) => linedef.right.sector;
const numModel =
    (targetProperty: 'zFloor' | 'zCeil') =>
    (map: MapRuntime, sector: Sector, linedef: LineDef, target: number) => {
        let line: LineDef = null;
        for (const ld of map.data.linedefs) {
            if (ld.left) {
                if (ld.left.sector === sector && ld.right.sector[targetProperty] === target) {
                    line = (line && line.num < ld.num) ? line : ld;
                }
            }
        }
        return line?.right?.sector;
    }

// effects
interface ChangeEffect {
    newFloorFlat?: string;
    newSectorType?: number;
}
type EffectFunction = (map: MapRuntime, sector: Sector, linedef: LineDef, target: number) => ChangeEffect;
type SectorEffectFunction = (change: ChangeEffect, from?: Sector) => void;
const effect =
    (effects: SectorEffectFunction[], select: SectorSelectorFunction) =>
    (map: MapRuntime, to: Sector, linedef: LineDef, target: number) => {
        const from = select(map, to, linedef, target);
        if (from) {
            const change: ChangeEffect = {};
            effects.forEach(fx => fx(change, from));
            return change;
        }
    };
const applyChangeEffect = (map: MapRuntime, to: Sector, change?: ChangeEffect) => {
    if (change.newSectorType) {
        to.type = change.newSectorType;
    }
    if (change.newFloorFlat) {
        to.floorFlat = change.newFloorFlat;
        map.events.emit('sector-flat', to);
        map.initializeFlatTextureAnimation(to, 'floorFlat');
    }
}

const copyFloorFlat: SectorEffectFunction = (change: ChangeEffect, from: Sector) => change.newFloorFlat = from.floorFlat;
const copySectorType: SectorEffectFunction = (change: ChangeEffect, from: Sector) => change.newSectorType = from.type;
const zeroSectorType: SectorEffectFunction = (change: ChangeEffect) => change.newSectorType = 0;

// crush map objects
function crushNonSolid(mobj: MapObject) {
    if (mobj.info.flags & MFFlags.MF_DROPPED) {
        // dropped items get destroyed
        mobj.map.destroy(mobj);
        return false;
    } else if (mobj.isDead) {
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
function crushAndDamage(mobj: MapObject) {
    // NB: crush non-shootable happens first. This means we won't kill and squish in the same tic but that's how DOOM works
    let hitSolid = crushNonSolid(mobj);
    let damageShootable = (mobj.info.flags & MFFlags.MF_SHOOTABLE) && (mobj.map.game.time.tickN.val & 3) === 0;
    if (damageShootable) {
        mobj.damage(10, null, null);
        // spray blood
        const pos = mobj.position;
        const blood = mobj.map.spawn(MapObjectIndex.MT_BLOOD, pos.x, pos.y, pos.z + mobj.info.height * .5);
        blood.velocity.set(
            crushVelocity * mobj.rng.real2(),
            crushVelocity * mobj.rng.real2(),
            0);
    }
    return hitSolid || damageShootable;
}

const isCrushing = (sector: Sector, mobjs: MapObject[], crushMobj: (mobj: MapObject) => boolean) => {
    const crushing = mobjs.filter(mobj => !mobj.canSectorChange(sector, sector.zFloor, sector.zCeil));
    return crushing.reduce((res, mo) => crushMobj(mo) || res, false);
};

interface BaseMoverState extends SectorChanger {
    type: 'move-door' | 'move-lift' | 'move-crusher' | 'move-flat';
}
type LiftState = ReturnType<typeof liftState>;
type CrusherState = ReturnType<typeof crusherState>;
type FlatState = ReturnType<ReturnType<typeof flatMoverDefinition>['makeState']>;
type DoorState = ReturnType<ReturnType<typeof doorDefinition>['makeState']>;
type MoverFunction<T extends BaseMoverState> = (map: MapRuntime, sector: Sector, state: T) => void;
const moveActions: { [key in BaseMoverState['type']]: MoverFunction<any> } = {
    'move-door': (map, sector, state: DoorState) => {
        if (state.ticks) {
            if (!--state.ticks) {
                state.direction = -state.direction;
                playDoorSound(map, sector);
            }
            return;
        }

        // move door
        let original = sector.zCeil;
        sector.zCeil += state.speed * state.direction;

        let finished = false;
        if (sector.zCeil > state.topHeight) {
            finished = state.fn === 'closeWaitOpen' || state.fn === 'openAndStay';
            state.ticks = state.waitDelay;
            sector.zCeil = state.topHeight;
        } else if (sector.zCeil < state.bottomHeight) {
            finished = state.fn === 'openWaitClose' || state.fn === 'closeAndStay';
            state.ticks = state.waitDelay;
            sector.zCeil = state.bottomHeight;
        }

        // crush (and reverse direction)
        const mobjs = sectorObjects(map, sector);
        const hitSolid = state.direction === -1 && isCrushing(sector, mobjs, crushNonSolid);
        if (hitSolid) {
            // force door to open
            state.direction = 1;
            sector.zCeil = original;
            playDoorSound(map, sector);
            return;
        }

        mobjs.forEach(mobj => mobj.sectorChanged(sector));
        map.events.emit('sector-z', sector);
        if (finished) {
            sector.specialData = null;
            map.actions.delete(state);
        }
    },
    'move-lift': (map, sector, state: LiftState) => {
        if (state.ticks) {
            state.ticks -= 1;
            return;
        }
        if (state.nextSound) {
            map.game.playSound(state.nextSound, sector);
            state.nextSound = null;
        }

        // move lift
        let finished = false;
        let original = sector.zFloor;
        sector.zFloor += state.speed * state.direction;

        if (sector.zFloor < state.bottomHeight) {
            state.nextSound = SoundIndex.sfx_pstart;
            map.game.playSound(SoundIndex.sfx_pstop, sector);
            state.ticks = state.waitDelay;
            sector.zFloor = state.bottomHeight;
            state.direction = 1;
        } else if (sector.zFloor > state.topHeight) {
            state.nextSound = SoundIndex.sfx_pstart;
            map.game.playSound(SoundIndex.sfx_pstop, sector);
            finished = !state.perpetual;
            state.ticks = state.waitDelay;
            sector.zFloor = state.topHeight;
            state.direction = -1;
        }

        const mobjs = sectorObjects(map, sector);
        const hitSolid = state.direction === 1 && isCrushing(sector, mobjs, crushNonSolid);
        if (hitSolid) {
            // switch direction
            state.nextSound = SoundIndex.sfx_pstart;
            state.direction = -1;
            state.ticks = 0;
            sector.zFloor = original;
            return;
        }

        mobjs.forEach(mobj => mobj.sectorChanged(sector));
        map.events.emit('sector-z', sector);
        if (finished) {
            sector.specialData = null;
            map.actions.delete(state);
        }
    },
    'move-crusher': (map, sector, state: CrusherState) => {
        if (!state.vanillaMode || !state.silent) {
            playMoveSound(map, sector);
        }

        let finished = false;
        sector.zCeil += state.speed * state.direction;
        if (sector.zCeil < state.bottomHeight) {
            sector.zCeil = state.bottomHeight;
            finished = true;
        }
        if (sector.zCeil > state.topHeight) {
            sector.zCeil = state.topHeight;
            finished = true;
        }

        // crush
        const mobjs = sectorObjects(map, sector);
        // vanilla fast crushers (speed 2) and generalized slow/normal (speed 1/2) crushers
        // go even slower when they crush something
        const slowSpeed = state.vanillaMode ? 2 : 4;
        const hitSolid = state.direction === -1 && isCrushing(sector, mobjs, crushAndDamage);
        if (hitSolid && state.speed < slowSpeed && state.speed === state.originalSpeed) {
            state.speed /= 8;
        }

        mobjs.forEach(mobj => mobj.sectorChanged(sector));
        map.events.emit('sector-z', sector);
        if (finished) {
            if (state.vanillaMode || !state.silent) {
                map.game.playSound(SoundIndex.sfx_pstop, sector);
            }
            // crushers keep going
            state.speed = state.originalSpeed;
            state.direction = -state.direction;
        }
    },
    'move-flat': (map, sector, state: FlatState) => {
        let original = sector[state.prop];
        let ceilingGap = sector.zCeil - sector.zFloor;
        sector[state.prop] += state.direction * state.speed;
        playMoveSound(map, sector);

        const finished = (state.direction > 0 && sector[state.prop] > state.target)
            || (state.direction < 0 && sector[state.prop] < state.target);
        if (finished) {
            sector[state.prop] = state.target;
        }
        if (state.elevator) {
            sector.zCeil = sector.zFloor + ceilingGap;
        }

        // crush
        const mobjs = sectorObjects(map, sector);
        const hitSolid = state.checkCrush && isCrushing(sector, mobjs, state.crush ? crushAndDamage : crushNonSolid);
        if (hitSolid) {
            sector[state.prop] = original;
            if (state.elevator) {
                sector.zCeil = sector.zFloor + ceilingGap;
            }
            return;
        }

        mobjs.forEach(mobj => mobj.sectorChanged(sector));
        map.events.emit('sector-z', sector);
        if (finished) {
            if (state.change) {
                applyChangeEffect(map, sector, state.change);
            }
            map.game.playSound(SoundIndex.sfx_pstop, sector);
            sector.specialData = null;
            map.actions.delete(state);
        }
    },
};

// Doors
const keyMissingMessage = (playerKeys: string, def: ReturnType<typeof doorDefinition>) => {
    const compareKeys = def.differentiateSkullKeys ? playerKeys : playerKeys.toUpperCase();
    const keys = ['*', ...compareKeys.split('')];
    for (const key of def.keys) {
        if (!keys.includes(key)) {
            let message = (
                    def.keys.length === 3 ? 'PD_3KEY' :
                    def.keys.length === 6 ? 'PD_6KEY' :
                    key === 'B' ? 'PD_BLUE' :
                    key === 'b' ? 'PD_BLUES' :
                    key === 'R' ? 'PD_RED' :
                    key === 'r' ? 'PD_REDS' :
                    key === 'Y' ? 'PD_YELLOW' :
                    key === 'y' ? 'PD_YELLOWS' :
                    'PD_ANYKEY');
            return (def.trigger === 'S' || def.trigger === 'P'
                ? message : message + 'O') as MessageId;
        }
    }
};

type DoorFunction = 'openWaitClose' | 'openAndStay' | 'closeAndStay' | 'closeWaitOpen';
const doorDefinition = (trigger: string, keys: string, speed: number, waitDelay: number, fn: DoorFunction, differentiateSkullKeys = false) => ({
    trigger: trigger[0] as TriggerType,
    monsterTrigger: trigger.includes('m'),
    repeatable: (trigger[1] === 'R'),
    keys: (differentiateSkullKeys ? keys : keys.toUpperCase()).split(''),
    differentiateSkullKeys,
    makeState: (map: MapRuntime, sector: Sector): BaseMoverState =>
        ({ type: 'move-door', sectorNum: sector.num, fn, speed, waitDelay, ticks: 0,
            direction: (fn === 'openAndStay' || fn === 'openWaitClose') ? 1 : -1,
            topHeight: ((fn === 'openAndStay' || fn === 'openWaitClose') ? offset(findLowestCeiling, - 4) : ceilingHeight)(map, sector),
            bottomHeight: floorHeight(map, sector) }),
});

const doorSound = (state: DoorState) =>
    !state ? SoundIndex.sfx_None :
    state.speed < 8 ? (state.direction > 0 ? SoundIndex.sfx_doropn : SoundIndex.sfx_dorcls) :
    (state.direction > 0 ? SoundIndex.sfx_bdopn : SoundIndex.sfx_bdcls);
const playDoorSound = (map: MapRuntime, sector: Sector) =>
    map.game.playSound(doorSound(sector.specialData), sector);

const createDoorAction =
        (def: ReturnType<typeof doorDefinition>) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    const validTrigger =
        def.trigger === trigger
        // treat P === S because P is a special case (local door) and does not need a sector tag
        || (trigger === 'S' && def.trigger === 'P');
    if (!validTrigger) {
        return;
    }
    if (mobj.isMonster && !def.monsterTrigger) {
        return;
    }
    const missingKey = def.keys && mobj instanceof PlayerMapObject && keyMissingMessage(mobj.inventory.val.keys, def);
    if (missingKey) {
        mobj.hudMessage.set(_T(missingKey));
        mobj.map.game.playSound(SoundIndex.sfx_oof);
        return;
    }
    if (!def.repeatable) {
        linedef.special = 0; // one time action so clear special
    }

    // TODO: I really don't love the "DoorFunction" as a string. It might be fun to try to break it down into smaller functions to control start/stop actions
    // TODO: interpolate (actually, this needs to be solved in a general way for all moving things)

    let triggered = false;
    const sectors = def.trigger === 'P' ? [linedef.left.sector] : (mobj.map.sectorsByTag.get(linedef.tag) ?? [])
    for (const sector of sectors) {
        if (sector.specialData) {
            if (def.trigger === 'P') {
                const st: DoorState = sector.specialData;
                if (mobj.isMonster && st.direction > 0) {
                    continue; // monsters don't close doors
                }
                // some doors can be interrupted, others continue along
                if (st.fn === 'closeWaitOpen' || 'openWaitClose') {
                    st.direction = -st.direction;
                    st.ticks = 0;
                }
            }
            continue;
        }

        triggered = true;
        sector.specialData = def.makeState(mobj.map, sector);
        mobj.map.actions.add(sector.specialData);
        playDoorSound(mobj.map, sector);
    }
    return triggered ? def : undefined;
};

// Moving floors, ceilings, and elevators
const flatMoverState = (sectorNum: number, speed: number, direction: number, target: number, change?: ChangeEffect): FlatState =>
    ({ type: 'move-flat', sectorNum, speed, direction, target, change, prop: 'zFloor', elevator: false, crush: false, checkCrush: false });
const flatMoverDefinition = (trigger: string, direction: number, speed: number, effect: EffectFunction, targetFn: TargetValueFunction, prop: 'zCeil' | 'zFloor' = 'zFloor', crush = false) => ({
    trigger: trigger[0] as TriggerType,
    monsterTrigger: trigger.includes('m'),
    repeatable: (trigger[1] === 'R'),
    makeState: (map: MapRuntime, sector: Sector, linedef?: LineDef): BaseMoverState => {
        const target = targetFn(map, sector, linedef);
        const checkCrush = direction < 0 && prop === 'zCeil' || direction > 0 && prop === 'zFloor';
        return { type: 'move-flat', sectorNum: sector.num, elevator: false, checkCrush, speed, direction, target, prop, crush, change: effect?.(map, sector, linedef, target) };
    },
});
const floorDefinition = (trigger: string, direction: number, speed: number, effect: EffectFunction, targetFn: TargetValueFunction, crush = false) =>
    flatMoverDefinition(trigger, direction, speed, effect, targetFn, 'zFloor', crush);
const ceilingDefinition = (trigger: string, direction: number, speed: number, targetFn: TargetValueFunction, effect: EffectFunction = undefined, crush = false) =>
    flatMoverDefinition(trigger, direction, speed, effect, targetFn, 'zCeil', crush);
const elevatorDefinition = (trigger: string, speed: number, targetFn: TargetValueFunction) => {
    const def = flatMoverDefinition(trigger, 0, speed, null, targetFn, 'zFloor');
    const makeState = (map: MapRuntime, sector: Sector, linedef?: LineDef): BaseMoverState => {
        const state = def.makeState(map, sector, linedef);
        state.checkCrush = true;
        state.elevator = true;
        state.direction = Math.sign(state.target - sector.zFloor);
        return state;
    };
    return { ...def, makeState, };
};

const flatMoverAction =
        (def: ReturnType<typeof flatMoverDefinition>) =>
        (mobj: MapObject, linedef: LineDef,  trigger: TriggerType): SpecialDefinition | undefined => {
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
    const sectors = (mobj.map.sectorsByTag.get(linedef.tag) ?? []);
    for (const sector of sectors) {
        if (sector.specialData) {
            continue;
        }
        triggered = true;

        const state = def.makeState(mobj.map, sector, linedef);
        if (state.direction > 0 && state.change) {
            applyChangeEffect(map, sector, state.change);
        }
        sector.specialData = state;
        mobj.map.actions.add(state);
    }
    return triggered ? def : undefined;
};

// Crusher Ceilings
const crusherCeilingDefinition = (trigger: string, speed: number, triggerType: 'start' | 'stop', silent = false) => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    monsterTrigger: trigger.includes('m'),
    stopper: triggerType === 'stop',
    makeState: (map: MapRuntime, sector: Sector) => crusherState(sector.num, speed, silent, ceilingHeight(map, sector), offset(floorHeight, 8)(map, sector)),
});
const crusherState = (sectorNum: number, speed: number, silent: boolean, topHeight: number, bottomHeight: number): BaseMoverState =>
    ({ type: 'move-crusher', sectorNum, silent, originalSpeed: speed, speed, direction: -1, topHeight, bottomHeight, nextSound: SoundIndex.sfx_pstart, vanillaMode: false });

// Lifts
const liftDefinition = (trigger: string, waitTicks: number, speed: number, targetLowFn: TargetValueFunction, targetHighFn: TargetValueFunction, actionType: 'normal' | 'perpetual' | 'stop' = 'normal') => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    stopper: actionType === 'stop',
    monsterTrigger: trigger.includes('m'),
    makeState: (map: MapRuntime, sector: Sector) => liftState(sector.num, waitTicks, actionType === 'perpetual', speed, -1, targetHighFn(map, sector), targetLowFn(map, sector)),
});
const liftState = (sectorNum: number, waitDelay: number, perpetual: boolean, speed: number, direction: number, topHeight: number, bottomHeight: number): BaseMoverState =>
    ({ type: 'move-lift', sectorNum, perpetual, speed, direction, topHeight, bottomHeight, waitDelay, ticks: 0, nextSound: SoundIndex.sfx_pstart });

interface SpecialDefinition2 extends SpecialDefinition {
    monsterTrigger: boolean;
    trigger: string;
    stopper: boolean;
    makeState: (map: MapRuntime, sector: Sector, linedef?: LineDef) => BaseMoverState;
}
const applySpecial =
        (def: SpecialDefinition2) =>
        (mobj: MapObject, linedef: LineDef, trigger: TriggerType): SpecialDefinition | undefined => {
    if (def.trigger !== trigger) {
        return;
    }
    if (mobj.isMonster && !def.monsterTrigger) {
        return;
    }
    const isVanillaSpecial = linedef.special < 0x100;
    if (!def.repeatable) {
        linedef.special = 0;
    }

    let triggered = false;
    const sectors = (mobj.map.sectorsByTag.get(linedef.tag) ?? []);
    for (const sector of sectors) {
        // NOTE: E3M4 has an interesting behaviour in the outdoor room because a sector has only 1 special data.
        // If you start the crusher before flipping the switch, you cannot flip the switch to get the bonus items.
        // gzDoom actually handles this but chocolate doom (and I assume the original) did not
        if (def.stopper || sector.specialData) {
            if (def.stopper) {
                mobj.map.actions.delete(sector.specialData);
            } else if (sector.specialData) {
                mobj.map.actions.add(sector.specialData);
            }
            // TODO: should triggered be true here?
            continue;
        }

        triggered = true;
        const state = def.makeState(mobj.map, sector, linedef);
        state.vanillaMode = isVanillaSpecial;
        sector.specialData = state;
        mobj.map.actions.add(state);
    }
    return triggered ? def : undefined;
};

// Lighting
const setLightLevel = (val: number) => (map: MapRuntime, sec: Sector) => val;
const maxNeighbourLight = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.max(last, sec.light), 0);
const minNeighbourLight = (map: MapRuntime, sector: Sector) =>
    map.data.sectorNeighbours(sector).reduce((last, sec) => Math.min(last, sec.light), 255);
const lowestLight = (sectors: Sector[], max: number) =>
    sectors.reduce((last, sec) => Math.min(last, sec.light), max);

interface LightChanger extends SectorChanger {
    type: 'light-strobe' | 'light-flicker' | 'light-glow' | 'light-fire';
    min: number;
    max: number;
    ticks?: number;
    step?: number;
    timing?: { brightTicks: number, darkTicks: number };
}
const lightActions: { [key in LightChanger['type']]: (map: MapRuntime, sector: Sector, state: LightChanger) => void } = {
    'light-strobe': (map, sector, state) => {
        if (--state.ticks) {
            return;
        }
        if (sector.light === state.min) {
            state.ticks = state.timing.brightTicks;
            sector.light = state.max;
        } else {
            state.ticks = state.timing.darkTicks;
            sector.light = state.min;
        }
        map.events.emit('sector-light', sector);
    },
    'light-flicker': (map, sector, state) => {
        if (--state.ticks) {
            return;
        }
        if (sector.light === state.max) {
            state.ticks = map.game.rng.int(1, 7);
            sector.light = state.min;
        } else {
            state.ticks = map.game.rng.int(1, 64);
            sector.light = state.max;
        }
        map.events.emit('sector-light', sector);
    },
    'light-glow': (map, sector, state) => {
        let val = sector.light + state.step;
        const hitBoundary = (state.step < 0 && val <= state.min) || (state.step > 0 && val >= state.max);
        if (hitBoundary) {
            state.step = -state.step;
            val += state.step;
        }
        sector.light = val;
        map.events.emit('sector-light', sector);
    },
    'light-fire': (map, sector, state) => {
        if (--state.ticks) {
            return;
        }
        state.ticks = 4;
        const amount = map.game.rng.int(0, 2) * 16;
        sector.light = Math.max(state.max - amount, state.min);
        map.events.emit('sector-light', sector);
    }
};

const createLightingDefinition = (trigger: string, targetValueFn: TargetValueFunction) => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    targetValueFn,
});

const lightChangeAction =
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
    let targetValue: number = undefined;
    const sectors = map.sectorsByTag.get(linedef.tag) ?? [];
    for (const sector of sectors) {
        if (!def.targetValueFn) {
            map.actions.add(strobeFlash(5, 35)(map, sector));
        } else {
            targetValue = targetValue ?? def.targetValueFn(map, sector);
            sector.light = targetValue;
            map.events.emit('sector-light', sector);
        }
        triggered = true;
    }
    return triggered ? def : undefined;
};

const strobeFlash =
    (brightTicks: number, darkTicks: number, synchronized = false) =>
    (map: MapRuntime, sector: Sector): LightChanger => {
        const max = sector.light;
        const nearestMin = lowestLight(map.data.sectorNeighbours(sector), max);
        const min = (nearestMin === max) ? 0 : nearestMin;
        let ticks = synchronized ? 1 : map.game.rng.int(1, 7);
        return { type: 'light-strobe', sectorNum: sector.num, min, max, ticks, timing: { brightTicks, darkTicks } };
    };

const randomFlicker = (map: MapRuntime, sector: Sector): LightChanger => {
    const max = sector.light;
    const min = lowestLight(map.data.sectorNeighbours(sector), max);
    return { type: 'light-flicker', sectorNum: sector.num, min, max, ticks: 1 };
};

const glowLight = (map: MapRuntime, sector: Sector): LightChanger => {
    const max = sector.light;
    const min = lowestLight(map.data.sectorNeighbours(sector), max);
    return { type: 'light-glow', sectorNum: sector.num, min, max, step: -8 };
};

const fireFlicker = (map: MapRuntime, sector: Sector): LightChanger => {
    const max = sector.light;
    const min = lowestLight(map.data.sectorNeighbours(sector), max) + 16;
    return { type: 'light-fire', sectorNum: sector.num, min, max, ticks: 4 };
};

export const sectorLightAnimations: { [key: number]: (map: MapRuntime, sector: Sector) => LightChanger } = {
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
    mobj.velocity.set(0, 0, 0);

    if (mobj.type === MapObjectIndex.MT_PLAYER) {
        // freeze player after teleporting
        mobj.reactiontime = 18;
    }
}
const teleportPreserveMove = (mobj: MapObject, dest: MapObject) => {
    mobj.position.set(dest.position.x, dest.position.y, dest.sector.zFloor);
    mobj.applyPositionChanged();
    mobj.velocity.set(0, 0, 0);
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

const lineWithTag = (() => {
    const v1 = new Vector3();
    const v2 = new Vector3();
    const mat = new Matrix4();
    return (mobj: MapObject, linedef: LineDef, applyFn: (tp: MapObject) => boolean, angleOffset = Math.PI) => {
        const lines = mobj.map.linedefsByTag.get(linedef.tag);
        for (const ld of lines) {
            if (ld === linedef) {
                continue;
            }

            // rotate player and velocity based on angle between teleport lines
            v1.set(linedef.dx, linedef.dy, 0);
            v2.set(ld.dx, ld.dy, 0);
            const angleDelta = v1.angleTo(v2) + angleOffset;
            mobj.direction += angleDelta;
            mobj.velocity.applyMatrix4(mat.makeRotationZ(angleDelta))

            // position player on exit line based on relative position on entry line
            const frac = 1 - ((linedef.dx < 0.000001 && linedef.dx > -0.000001)
                ? (mobj.position.y - linedef.y) / linedef.dy
                : (mobj.position.x - linedef.x) / linedef.dx);
            mobj.position.set(
                ld.x + ld.dx * frac,
                ld.y + ld.dy * frac,
                (ld.left?.sector?.zFloor ?? ld.right.sector.zFloor) + (mobj.position.z - linedef.right.sector.zFloor),
            );
            mobj.applyPositionChanged();
            return true;
        }
        return false;
    }
})();
const lineWithTagReversed = (mobj: MapObject, linedef: LineDef, applyFn: (tp: MapObject) => boolean) =>
    lineWithTag(mobj, linedef, applyFn, 0);

export const telefragTargets = (() => {
    let self: MapObject;
    const traceParams: TraceParams = {
        ...baseMoveTrace,
        move: zeroVec,
        hitObject: hit => {
            // skip non shootable things and (obviously) don't hit ourselves
            if (!(hit.mobj.info.flags & MFFlags.MF_SHOOTABLE) || hit.mobj === self) {
                return true;
            }
            hit.mobj.damage(10_000, self, self);
            return true;
        }
    }
    return (mobj: MapObject) => {
        // monsters only telefrag in level 30
        if (mobj.isMonster && mobj.map.name !== 'MAP30') {
            return true;
        }
        // telefrag anything in our way
        self = mobj;
        traceParams.start = mobj.position;
        traceParams.radius = mobj.info.radius
        traceParams.height = mobj.info.height
        mobj.map.data.traceMove(traceParams);
    };
})();

const moveBlocker = MFFlags.MF_SOLID | MFFlags.MF_SHOOTABLE;
export const isMonsterMoveBlocked = (() => {
    let blocked = false;
    const traceParams: TraceParams = {
        ...baseMoveTrace,
        move: zeroVec,
        hitObject: hit => !(blocked = Boolean(hit.mobj.info.flags & moveBlocker)),
    }
    return (mobj: MapObject, position: Vector3) => {
        blocked = false;
        traceParams.start = position;
        traceParams.radius = mobj.info.radius;
        traceParams.height = mobj.info.height;
        mobj.map.data.traceMove(traceParams);
        return blocked;
    }
})();

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

    let triggered = false;
    def.targetFn(mobj, linedef, tp => {
        // monsters cannot teleport if a hittable mobj is blocking teleport landing
        if (mobj.isMonster && isMonsterMoveBlocked(mobj, tp.position)) {
            return false;
        }
        // teleport success so apply fog in old and new locations
        def.specialEffects(mobj, tp);
        // move mobj
        def.translateFn(mobj, tp);
        telefragTargets(mobj);

        if (!def.repeatable) {
            linedef.special = 0;
        }
        triggered = true;
        return true;
    });
    return triggered ? def : undefined;
};

// Donut (apparently only in E1M2, E2M2 and MAP21 of tnt (none in Doom2 or plutonia)
const donut =
        (trigger: string) =>
        (mobj: MapObject, linedef: LineDef, hitTrigger: TriggerType, side: -1 | 1): SpecialDefinition | undefined => {
    const def = { trigger: trigger[0], repeatable: (trigger[1] === 'R') };
    const map = mobj.map;
    if (hitTrigger !== def.trigger || mobj.isMonster) {
        return;
    }
    if (!def.repeatable) {
        // What does a repeatable donut look like anyway? I can't find an example
        linedef.special = 0;
    }

    let triggered = false;
    const speed = 0.5;
    const sectors = (mobj.map.sectorsByTag.get(linedef.tag) ?? []);
    for (const pillar of sectors) {
        if (pillar.specialData !== null) {
            continue;
        }
        triggered = true;

        const donut = map.data.sectorNeighbours(pillar)[0];
        const model = map.data.sectorNeighbours(donut).filter(e => e !== pillar)[0];
        const target = floorHeight(map, model);

        pillar.specialData = flatMoverState(pillar.num, speed, -1, target);
        map.actions.add(pillar.specialData);

        const sectorEffect = effect([copyFloorFlat, copySectorType], () => model)(map, donut, linedef, target);
        donut.specialData = flatMoverState(donut.num, speed, 1, target, sectorEffect);
        map.actions.add(donut.specialData);
    }
    return triggered ? def : undefined;
};

// Stair builders (rising stairs in vanilla doom)
const stairBuilderDefinition = (trigger: string, speed: number, stepSize: number, direction = 1, ignoreTexture = false) => ({
    trigger: trigger[0] as TriggerType,
    repeatable: (trigger[1] === 'R'),
    direction,
    stepSize: stepSize * direction,
    speed,
    ignoreTexture,
});

const stairBuilderAction =
        (def: ReturnType<typeof stairBuilderDefinition>) =>
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
    } else if (linedef.special >= 0x3000 && linedef.special < 0x3400) {
        // generalized stair builders reverse if they are repeatable so toggle the direction bit
        linedef.special ^= 0x0100;
    }

    let triggered = false;
    const sectors = (mobj.map.sectorsByTag.get(linedef.tag) ?? []);
    for (const sector of sectors) {
        if (sector.specialData) {
            continue;
        }

        triggered = true;
        let target = sector.zFloor;

        const flat = sector.floorFlat;
        let step = sector;
        let affected = new Set<Sector>();
        while (step) {
            target += def.stepSize;
            step.specialData = flatMoverState(step.num, def.speed, def.direction, target);
            map.actions.add(step.specialData);

            // find next step to raise
            if (def.ignoreTexture) {
                affected.add(step);
            }
            const stepSectors = stairBuilderSectorNeighbours(step, map.data.linedefs)
            step = null;
            for (const nextStep of stepSectors) {
                if (!def.ignoreTexture && nextStep.floorFlat !== flat || affected.has(nextStep)) {
                    continue;
                }
                // why not filter for sectors without specialData? Well, Doom has a "bug" of sorts where it raises the step height
                // before checking if the sector has special data. TNT MAP 30 takes advantage of this for two stair cases
                // https://github.com/id-Software/DOOM/blob/master/linuxdoom-1.10/p_floor.c#L533
                // https://www.doomworld.com/forum/topic/57014-tnt-map30-stairs/
                if (nextStep.specialData) {
                    target += def.stepSize;
                    continue;
                }
                step = nextStep;
                break;
            }
        }
    }
    return triggered ? def : undefined;
};

// rising floors needs a more strict implementation of sectorNeighbours(). Thanks Plutonia MAP24...
function stairBuilderSectorNeighbours(sector: Sector, mapLinedefs: LineDef[]): Sector[] {
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
export function pusherAction(map: MapRuntime, linedef: LineDef, scrollSpeed: { dx: number, dy: number }) {
    let specials: LineTraceHit[] = [];
    let movement = new Vector3();

    const sectors = map.sectorsByTag.get(linedef.tag);
    if (!sectors) {
        return;
    }
    movement.set(scrollSpeed.dx, scrollSpeed.dy, 0);
    let lastMoved = new Set<MapObject>()
    const action = () => {
        // group mobjs by sector _before_ moving because otherwise the mobj may be put into another sector
        // that also moves. Actually, that can still happen if the mobj moves to a different pusher but from the
        // little testing I've done (cchest MAP02), it's expected.
        let moved = new Set<MapObject>();
        const sectorMobjs = sectors.map(sector => sectorObjects(map, sector).filter(e => e.zFloor <= sector.zFloor && !(e.info.flags & MFFlags.MF_NOCLIP)));
        for (const mobjs of sectorMobjs) {
            for (let i = 0; i < mobjs.length; i++) {
                moved.add(mobjs[i])
                specials.length = 0;
                const blocker = findMoveBlocker(mobjs[i], movement, specials);
                if (mobjs[i].type === MapObjectIndex.MT_PLAYER) {
                    // players always update position so that voodoo dolls, even when stuck in a corner, still pick up items
                    mobjs[i].positionChanged();
                }
                if (!blocker) {
                    mobjs[i].position.add(movement);
                    mobjs[i].positionChanged();
                    specials.forEach(hit => map.triggerSpecial(hit.line, mobjs[i], 'W', hit.side));
                }
            }
        }

        // for mobjs that were pushed but now are not, we add velocity so they slide off
        // why .3? It seems to match the intro to SOD MAP12 but YMMV.
        const mScale = 0.3;
        const left = lastMoved.difference(moved);
        left.forEach(mobj => mobj.thrust(movement.x * mScale, movement.y * mScale, movement.z * mScale));
        lastMoved = moved;
    };
    map.actions.add(action);
}

export interface SectorChanger {
    type: string;
    sectorNum: number;
    [key: string]: any;
}
export const sectorChangeFunctions = {
    ...moveActions,
    ...lightActions,
}
