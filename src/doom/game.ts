import { store, type Store } from "./store";
import type { PlayerMapObject, PlayerInventory, MapObject } from "./map-object";
import type { DoomWad } from "./wad/doomwad";
import { MapRuntime } from "./map-runtime";
import { inventoryWeapon, type InventoryWeapon } from "./things/weapons";
import { Vector3 } from "three";
import { SoundIndex } from "./doom-things-info";
import { MapData, type Sector } from "./map-data";
import { type RNG, TableRNG, tickTime } from "./math";
import { throwDoomError } from "./error";
import type { ControllerInput } from "./game-input";

export type GameTime = Game['time'];
export interface GameSettings {
    freelook: Store<boolean>;
    pistolStart: Store<boolean>;
    moveChecksZ: Store<boolean>;
    stuckMonstersCanMove: Store<boolean>;
    ghostMonsters: Store<boolean>;
    spawnMode: Store<'everything' | 'items-only' | 'players-only'>;
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

// player info persisted between levels
interface PlayerInfo extends Omit<PlayerInventory, 'keys' | 'items'> {
    health: number;
    lastWeapon: InventoryWeapon;
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
        scale: 1,
        elapsed: 0, // seconds
        delta: 0, // seconds
        tickN: store(0),
        tick: store(0), // tick as a real number
        partialTick: store(0), // TODO: remove when we remove R1
    }
    // helpful for tests to allow long time deltas
    maxTimeDeltaSeconds = 2;

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
        if (delta > this.maxTimeDeltaSeconds) {
            // if time is too long (maybe a big GC or switch tab?), just skip it and try again next time
            console.warn('time interval too long', delta);
            return;
        }

        this.time.scale = timescale;
        let scaledDelta = delta * timescale + this.remainingTime;
        const step = Math.min(scaledDelta, delta, tickTime);
        while (scaledDelta >= step) {
            scaledDelta -= step;
            this.time.delta = step;
            this.time.elapsed += step;
            this.time.tick.set(1 + this.time.elapsed / tickTime);
            const isTick = this.time.elapsed > this.nextTickTime;
            if (isTick) {
                this.nextTickTime += tickTime;
                this.time.tickN.update(tick => tick += 1);
                this.time.partialTick.set(0);
            } else {
                const partial = 1 - Math.max(0, (this.nextTickTime - this.time.elapsed) / tickTime)
                this.time.partialTick.set(partial);
            }

            try {
                this.map.val?.timeStep(this.time);
                if (isTick) {
                    this.map.val?.tick();
                }
            } catch (exception) {
                throwDoomError({
                    code: 4,
                    details: { game: this, exception },
                    message: 'Logical error',
                });
            }
        }
        this.remainingTime = scaledDelta;
    }

    resetInventory() {
        Object.assign(this.inventory, defaultInventory());
    }

    startMap(mapName: string) {
        this.map.val?.dispose();

        const lumps = this.wad.mapLumps.get(mapName);
        if (!lumps) {
            throwDoomError({
                code: 2,
                details: { mapName, game: this },
                message: `Map not found: ${name}`,
            });
        }

        try {
            const mapData = new MapData(lumps);
            this.map.set(new MapRuntime(mapName, mapData, this));
        } catch (exception) {
            throwDoomError({
                code: 1,
                details: { mapName, exception, game: this },
                message: `Invalid map: ${mapName}; ${exception.message}`
            });
        }
        this.intermission.set(null);
        return this.map.val;
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
