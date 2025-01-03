import { store, type Store } from "./store";
import { PlayerMapObject, type PlayerInventory, MapObject } from "./map-object";
import type { DoomWad } from "./wad/doomwad";
import { MapRuntime } from "./map-runtime";
import { inventoryWeapon, type InventoryWeapon } from "./things/weapons";
import { Vector3 } from "three";
import { SoundIndex } from "./doom-things-info";
import type { Sector } from "./map-data";
import { type RNG, TableRNG } from "./math";
import type { GameLogicFailure, InvalidMap, MissingMap } from "./error";

export type GameTime = Game['time'];
export interface GameSettings {
    timescale: Store<number>;
    freelook: Store<boolean>;
    skipInitialSpawn: Store<boolean>;
    xyAimAssist: Store<boolean>;
    zAimAssist: Store<boolean>;
    noclip: Store<boolean>;
    alwaysRun: Store<boolean>;
    freeFly: Store<boolean>;
    maxLostSouls: Store<number>;
    randomNumbers: Store<'table' | 'computed'>,
    monsterAI: Store<'enabled' | 'disabled' | 'move-only' | 'fast'>;
    shotTraceSeconds: Store<number>;
    // useful for birds eye view where we may not want to rotate the camera when the player rotates
    compassMove: Store<boolean>;
    invicibility: Store<boolean>;
    cameraMode: Store<'1p' | '3p' | '3p-noclip' | 'bird' | 'ortho' | 'svg'>;
}
export type Skill = 1 | 2 | 3 | 4 | 5;

export const ticksPerSecond = 35;
export const tickTime = 1 / ticksPerSecond;
// Using a fixed time slice for physics makes it SOOOO much easier to reason about player movement and for the times we
// need to convert it to DOOM's standard 35 tics
const physicsTickTime = 1 / 60;

// player info persisted between levels
interface PlayerInfo extends Omit<PlayerInventory, 'keys' | 'items'> {
    health: number;
    lastWeapon: InventoryWeapon;
}

export interface ControllerInput {
    // why vector? so a joystick (or something) can move slower and faster
    move: Vector3;
    aim: Vector3;
    run: boolean;
    slow: boolean;
    use: boolean;
    attack: boolean;
    // select a weapon by slot number (eg. 1 maps to both chainsaw and fist)
    weaponKeyNum: number;
    // directly select a weapon
    weaponIndex: number;
}

export interface IntermissionScreen {
    nextMapName: string;
    finishedMap: MapRuntime;
    playerStats: PlayerMapObject['stats'][];
}

type SoundHandler = (snd: SoundIndex, position?: MapObject | Sector) => void;
export interface SoundEmitter {
    onSound(handler: SoundHandler): void;
    playSound(snd: SoundIndex, location?: MapObject | Sector): void;
    time: { tickN: Store<number> };
}

const defaultInventory = (): PlayerInfo => ({
    health: 100,
    armor: 0,
    armorType: 0,
    ammo: {
        bullets: { amount: 50, max: 200 },
        shells: { amount: 0, max: 50 },
        rockets: { amount: 0, max: 50 },
        cells: { amount: 0, max: 300 },
    },
    lastWeapon: inventoryWeapon('pistol'),
    // null reserves a slot for the chainsaw to keep weapons in order
    weapons: ['fist', null, 'pistol'].map(inventoryWeapon),
});

export class Game implements SoundEmitter {
    private remainingTime = 0; // seconds
    private nextTickTime = 0; // seconds
    time = {
        playTime: 0,
        elapsed: 0, // seconds
        delta: 0, // seconds
        tickN: store(0),
        tick: store(0), // tick as a real number
        partialTick: store(0), // TODO: remove when we remove R1
        isTick: false, // if we have elapsed a tick (1/35 of a second)
    }

    readonly input: ControllerInput = {
        move: new Vector3(),
        aim: new Vector3(),
        run: false,
        slow: false,
        use: false,
        attack: false,
        weaponKeyNum: 0,
        weaponIndex: -1,
    };
    readonly inventory = defaultInventory();
    readonly map = store<MapRuntime>(null);
    readonly intermission = store<IntermissionScreen>(null);
    get episodic() { return !this.wad.mapNames.includes('MAP01'); }
    readonly rng: RNG = new TableRNG();

    constructor(
        readonly wad: DoomWad,
        readonly skill: Skill,
        readonly settings: GameSettings,
        readonly mode: 'solo' | 'coop' | 'deathmatch' = 'solo',
    ) {}

    tick(delta: number, timescale = 1) {
        if (delta > 2) {
            // if time is too long (maybe a big GC or switch tab?), just skip it and try again next time
            console.warn('time interval too long', delta);
            return;
        }

        const dt = physicsTickTime * timescale;
        delta += this.remainingTime;
        while (delta > dt) {
            delta -= physicsTickTime;
            this.time.delta = dt;
            this.time.elapsed += dt;
            this.time.isTick = this.time.elapsed > this.nextTickTime;
            this.time.tick.set(1 + this.time.elapsed / tickTime);
            if (this.time.isTick) {
                this.nextTickTime += tickTime;
                this.time.tickN.update(tick => tick += 1);
                this.time.partialTick.set(0);
            } else {
                const partial = 1 - Math.max(0, (this.nextTickTime - this.time.elapsed) / tickTime)
                this.time.partialTick.set(partial);
            }

            try {
                this.map.val?.timeStep(this.time);
            } catch (exception) {
                const err: GameLogicFailure = {
                    code: 4,
                    details: { game: this, exception },
                    message: 'Game logic failed',
                };
                throw err;
            }
        }
        this.remainingTime = delta;
    }

    resetInventory() {
        Object.assign(this.inventory, defaultInventory());
    }

    startMap(mapName: string) {
        this.map.val?.dispose();

        if (!this.wad.hasMap(mapName)) {
            const err: MissingMap = {
                code: 2,
                details: { mapName, game: this },
                message: `Map not found: ${name}`,
            }
            throw err;
        }

        try {
            const mapData = this.wad.readMap(mapName);
            this.map.set(new MapRuntime(mapName, mapData, this));
        } catch (exception) {
            const err: InvalidMap = {
                code: 1,
                details: { mapName, exception, game: this },
                message: `Invalid map: ${mapName}; ${exception.message}`
            }
            throw err;
        }
        this.intermission.set(null);
    }

    private soundHandler: SoundHandler;
    onSound(handler: SoundHandler) {
        this.soundHandler = handler;
    }
    playSound(snd: SoundIndex, location?: MapObject | Sector) {
        if (snd === undefined || snd === SoundIndex.sfx_None) {
            return;
        }
        this.soundHandler?.(snd, location ?? this.map.val?.player);
    }
}
