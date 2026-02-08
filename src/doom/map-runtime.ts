import { store, type Store } from "./store";
import { type MapData, type LineDef, type Thing, type Action, type Sector, linedefSlope } from "./map-data";
import { Vector3 } from "three";
import { ToRadians, ticksPerSecond } from "./math";
import { PlayerMapObject, MapObject } from "./map-object";
import { sectorChangeFunctions, pusherAction, sectorLightAnimations, triggerSpecial, type SpecialDefinition, type TriggerType, type SectorChanger } from "./specials";
import { type Game, type GameTime } from "./game";
import { mapObjectInfo, MapObjectIndex, MFFlags, SoundIndex } from "./doom-things-info";
import { thingSpec, inventoryWeapon } from "./things";
import type { Sprite } from "./sprite";
import { EventEmitter } from "./events";
import type { Lump } from "../doom";
import { GameInput } from "./game-input";
import { captureInitialMapState, type InitialMapState } from "./map-save";

export type LineSide = 'left' | 'right';
export type WallTextureType = 'upper' | 'lower' | 'middle';
type MapEvents = {
    // mobj changes
    ['mobj-added']: [MapObject];
    ['mobj-removed']: [MapObject];
    ['mobj-updated-sprite']: [MapObject, Sprite];
    ['mobj-updated-position']: [MapObject];
    // player weapon (sprite and flashSprite)
    ['weapon-sprite']: [Sprite, Sprite];
    // map changes
    ['sector-light']: [Sector],
    ['sector-z']: [Sector],
    ['sector-flat']: [Sector],
    ['wall-texture']: [LineDef],
}

const episode4MusicMap = [
    'D_E3M4',
    'D_E3M2',
    'D_E3M3',
    'D_E1M5',
    'D_E2M7',
    'D_E2M4',
    'D_E2M6',
    'D_E2M5',
    'D_E1M9',
];
const doom2MusicMap = [
    "D_RUNNIN",
    "D_STALKS",
    "D_COUNTD",
    "D_BETWEE",
    "D_DOOM",
    "D_THE_DA",
    "D_SHAWN",
    "D_DDTBLU",
    "D_IN_CIT",
    "D_DEAD",
    "D_STLKS2",
    "D_THEDA2",
    "D_DOOM2",
    "D_DDTBL2",
    "D_RUNNI2",
    "D_DEAD2",
    "D_STLKS3",
    "D_ROMERO",
    "D_SHAWN2",
    "D_MESSAG",
    "D_COUNT2",
    "D_DDTBL3",
    "D_AMPIE",
    "D_THEDA3",
    "D_ADRIAN",
    "D_MESSG2",
    "D_ROMER2",
    "D_TENSE",
    "D_SHAWN3",
    "D_OPENIN",
    "D_EVIL",
    "D_ULTIMA",
];
export function mapMusicTrack(game: Game, mapName: string) {
    const mapNum = parseInt(mapName.substring(3, 5)) - 1;
    const trackName = mapName.startsWith('E4') ? episode4MusicMap[mapNum] :
        game.episodic ? 'D_' + mapName :
        doom2MusicMap[mapNum];
    return trackName;
}

interface AnimatedTexture {
    frames: string[];
    index: number;
    speed: number;
    line: LineDef;
    side: LineSide
    prop: WallTextureType;
}

// Rename to AnimatedTexture when we've removed stores from wall textures
interface AnimatedTexture2 {
    frames: string[];
    index: number;
    speed: number;
    sector: Sector;
    prop: 'ceilFlat' | 'floorFlat';
}

interface ShotTrace {
    id: number;
    start: Vector3;
    end: Vector3;
    ticks: Store<number>;
}

type MapAction = Action | SectorChanger | LineChanger;
export class MapRuntime {
    readonly actions = new Set<MapAction>();
    private animatedTextures = new Map<string, AnimatedTexture>();
    private animatedFlats = new Map<string, AnimatedTexture2>();

    readonly player: PlayerMapObject;
    readonly input: GameInput;
    readonly stats = {
        totalItems: 0,
        totalKills: 0,
        totalSecrets: 0,
        elapsedTime: 0,
    };

    // Random: It's nice to have a typed event emitter but on/off always feels a little clunky.
    // I don't know of a better option now (and I just now saw svelte5 is released though I don't think it would help)
    readonly events = new EventEmitter<MapEvents>();

    tracers: ShotTrace[] = [];
    readonly trev = store(1);
    players: MapObject[] = [];
    readonly objs = new Set<MapObject>();
    readonly musicTrack: Store<string>;
    readonly musicChangeSectors: { sector: Sector, track: string }[] = [];
    // for things that subscribe to game state (like settings) but are tied to the lifecycle of a map should push themselves here
    readonly disposables: (() => void)[] = [];
    get isActive() { return Boolean(this.disposables.length); }

    // save games need to keep track of changed sectors and linedefs (switches)
    // (animated textures kind of mess this up but it's not a huge deal)
    // We also use this to reset map geometry during game load
    readonly initialMapState: InitialMapState;

    // some caches to help speed up game computations
    readonly teleportMobjs: MapObject[] = [];
    readonly sectorsByTag = new Map<number, Sector[]>();
    readonly sectorObjs = new Map<Sector, Set<MapObject>>();
    readonly linedefsByTag = new Map<number, LineDef[]>();

    constructor(
        readonly name: string,
        readonly data: MapData, // TODO: make this non-public?
        readonly game: Game,
    ) {
        this.musicTrack = store(mapMusicTrack(game, name));

        this.initialMapState = captureInitialMapState(this);
        this.updateCaches();
        this.synchronizeSpecials();

        let playerThing: MapObject;
        this.disposables.push(this.game.settings.spawnMode.subscribe(() => {
            this.players.length = 0;
            this.objs.forEach(mo => this.destroy(mo));
            for (const thing of this.data.things) {
                this.initialThingSpawn(thing);
            }

            // some maps (plutonia MAP28 or many community maps) have multiple player 1 starts for "voodoo dolls" so make sure to findLast()
            playerThing = this.players[this.players.length - 1];
            // destroy old mobj because we will replace it with PlayerMobj below
            this.destroy(playerThing);
        }));

        if (game.settings.pistolStart.val) {
            game.resetInventory();
        }
        const inv = Object.assign(game.inventory, {
            items: {
                berserkTicks: 0,
                invincibilityTicks: 0,
                invisibilityTicks: 0,
                nightVisionTicks: 0,
                radiationSuitTicks: 0,
                computerMap: false,
                berserk: false,
            },
            keys: '',
        });
        this.player = new PlayerMapObject(store(inv), playerThing);
        this.player.initializeStateMachine();
        this.players[this.players.length - 1] = this.player;
        this.objs.add(this.player);
        this.events.emit('mobj-added', this.player);
        // reset monster chase targets for monsters already chasing the player
        this.objs.forEach(mo => mo.chaseTarget = mo.chaseTarget === playerThing ? this.player : mo.chaseTarget);
        // restore values from last level (and subscribe to preserve values for next level)
        this.player.health.set(game.inventory.health);
        this.player.health.subscribe(health => game.inventory.health = health);
        this.player.weapon.set(game.inventory.lastWeapon.fn());
        this.player.weapon.subscribe(weapon => {
            game.inventory.lastWeapon = inventoryWeapon(weapon.name);
            weapon.activate(this.player);
        });

        this.input = new GameInput(this, game.input);
    }

    static transfer(currentMap: MapRuntime) {
        // CAUTION: the order of each step in thi method can be sensitive
        currentMap.objs.forEach(o => currentMap.destroy(o));
        currentMap.initialMapState.restore();
        const newMap = new MapRuntime(currentMap.name, currentMap.data, currentMap.game);
        // HACK! There are sector/linedef update events we want to keep
        (newMap as any).events = currentMap.events
        return newMap;
    }

    dispose() {
        this.disposables.forEach(sub => sub());
        this.disposables.length = 0;
    }

    private initialThingSpawn(thing: Thing): MapObject | undefined {
        const isPlayer = thing.type >= 1 && thing.type <= 4;
        const noSpawn = (false
            || thing.type === 0 // plutonia map 12, what?!
            || (thing.type >= 2 && thing.type <= 4) // coop-player spawns
            || thing.type === 11
        );
        if (noSpawn) {
            return;
        }
        if (!isPlayer && thing.flags & 0x0010 && this.game.mode === 'solo') {
            return; // multiplayer only
        }
        const skillMatch = (false
            || (thing.flags & 0x0001 && (this.game.skill === 1 || this.game.skill === 2))
            || (thing.flags & 0x0002 && (this.game.skill === 3))
            || (thing.flags & 0x0004 && (this.game.skill === 4 || this.game.skill === 5))
            || (thing.type === 1) // players don't check skill (Freedoom1 E2M2)
        );
        if (!skillMatch) {
            return;
        }
        if (thing.type >= 14100 && thing.type <= 14164) {
            return; // music changers do not get spawned
        }

        const type = thing.type === 1 ? MapObjectIndex.MT_PLAYER :
            mapObjectInfo.findIndex(e => e.doomednum === thing.type);
        if (type === -1) {
            console.warn('unable to spawn thing type', thing.type);
            return;
        }
        // always spawn special things (players and teleports) even with skipInitialSpawn
        const allowSpawnMode = (this.game.settings.spawnMode.val === 'everything'
            || (this.game.settings.spawnMode.val === 'players-only' && thingSpec(type).class === 'S')
            || (this.game.settings.spawnMode.val === 'items-only' && thingSpec(type).class !== 'M'));
        if (!allowSpawnMode) {
            return;
        }

        const mobj = this.spawn(type, thing.x, thing.y, undefined, thing.angle * ToRadians);
        if (thing.flags & 0x0008) {
            mobj.info.flags |= MFFlags.MF_AMBUSH;
        }
        if (mobj.info.flags & MFFlags.MF_COUNTKILL) {
            this.stats.totalKills += 1;
        }
        if (mobj.info.flags & MFFlags.MF_COUNTITEM) {
            this.stats.totalItems += 1;
        }
    }

    spawn(moType: MapObjectIndex, x: number, y: number, z?: number, direction?: number) {
        let mobj = new MapObject(this, thingSpec(moType), { x, y }, direction ?? 0);
        mobj.initializeStateMachine();
        if (z !== undefined) {
            mobj.position.z = z;
        }
        if (moType === MapObjectIndex.MT_PLAYER) {
            this.players.push(mobj);
        }
        if (moType === MapObjectIndex.MT_TELEPORTMAN) {
            // teleports are spawned then destroyed immediately and not removed from this list but that's okay.
            // We only want to have a reference to them and they don't need to be processed during map tick
            this.teleportMobjs.push(mobj);
        }
        this.objs.add(mobj);
        this.events.emit('mobj-added', mobj);
        return mobj;
    }

    destroy(mobj: MapObject) {
        mobj.dispose();
        this.objs.delete(mobj);
        this.events.emit('mobj-removed', mobj);
    }

    timeStep(time: GameTime) {
        this.stats.elapsedTime += time.delta;
        this.input.evaluate(time);
        this.player.updateViewHeight(time);
    }

    tick() {
        this.actions.forEach(actionState => {
            // having multiple types of actions is a bit messy. I need to keep all the actionState separate
            // to save/restore map state
            if (typeof actionState === 'function') {
                actionState();
            } else if ('sectorNum' in actionState) {
                sectorChangeFunctions[actionState.type](this, this.data.sectors[actionState.sectorNum], actionState);
            } else if ('linedefNum' in actionState) {
                lineChangeFunctions[actionState.type](this, this.data.linedefs[actionState.linedefNum], actionState);
            } else {
                this.actions.delete(actionState);
            }
        });

        this.objs.forEach(thing => thing.tick());

        // FIXME: this is apparently very expensive with lots of hit scanners
        // and rarely used. Do we need it?
        // let len = this.tracers.length;
        // this.tracers.forEach(tr => tr.ticks.update(v => v - 1));
        // this.tracers = this.tracers.filter(tr => tr.ticks.val > 0);
        // if (len !== this.tracers.length) {
        //     this.trev.update(v => v + 1);
        // }
    }

    initializeFlatTextureAnimation(sector: Sector, prop: 'ceilFlat' | 'floorFlat') {
        const textureName = sector[prop];
        if (!textureName) {
            return;
        }
        const key = prop[0] + sector.num;
        const animInfo = this.game.wad.animatedFlats.get(textureName);
        if (!animInfo) {
            // remove animation that was applied to this target
            this.animatedFlats.delete(key);
            return;
        }
        const { frames, speed } = animInfo
        const index = animInfo.frames.indexOf(textureName);
        this.animatedFlats.set(key, { index, prop, frames, speed, sector });
    }

    initializeWallTextureAnimation(line: LineDef, side: LineSide, prop: WallTextureType) {
        const textureName = line[side][prop];
        if (!textureName) {
            return;
        }
        const key = side[0] + prop[0] + line.num;
        const animInfo = this.game.wad.animatedWalls.get(textureName);
        if (!animInfo) {
            // remove animation that was applied to this target
            this.animatedTextures.delete(key);
            return;
        }
        const { frames, speed } = animInfo
        const index = animInfo.frames.indexOf(textureName);
        this.animatedTextures.set(key, { index, line, side, prop, frames, speed });
    }

    // Why a public function? Because "edit" mode can change these while
    // rendering the map and we want them to update
    synchronizeSpecials(renderMode: 'r1' | 'r2' = 'r2') {
        this.actions.clear();
        this.stats.totalSecrets = 0;
        this.animatedTextures.clear();
        this.animatedFlats.clear();

        if (renderMode === 'r1') {
            // initialize animated textures
            for (const sector of this.data.sectors) {
                this.initializeFlatTextureAnimation(sector, 'ceilFlat');
                this.initializeFlatTextureAnimation(sector, 'floorFlat');
            }
            for (const linedef of this.data.linedefs) {
                this.initializeWallTextureAnimation(linedef, 'right', 'lower');
                this.initializeWallTextureAnimation(linedef, 'right', 'middle');
                this.initializeWallTextureAnimation(linedef, 'right', 'upper');
                if (linedef.left) {
                    this.initializeWallTextureAnimation(linedef, 'left', 'lower');
                    this.initializeWallTextureAnimation(linedef, 'left', 'middle');
                    this.initializeWallTextureAnimation(linedef, 'left', 'upper');
                }
            }

            // update wall/flat animations
            this.actions.add(() => {
                this.animatedTextures.forEach(anim => {
                    if (this.game.time.tickN.val % anim.speed === 0) {
                        anim.index = (anim.index + 1) % anim.frames.length;
                        anim.line[anim.side][anim.prop] = anim.frames[anim.index];
                        this.events.emit('wall-texture', anim.line);
                    }
                });
                this.animatedFlats.forEach(anim => {
                    if (this.game.time.tickN.val % anim.speed === 0) {
                        anim.index = (anim.index + 1) % anim.frames.length;
                        anim.sector[anim.prop] = anim.frames[anim.index];
                        this.events.emit('sector-flat', anim.sector);
                    }
                });
            });

            for (const wall of this.data.linedefs) {
                // TODO: disable these for R2?
                if (wall.special === 48) {
                    this.actions.add(() => wall.right.xOffset.update(n => n += 1));
                } else if (wall.special === 85) {
                    this.actions.add(() => wall.right.xOffset.update(n => n -= 1));
                }
                if (wall.special === 255) {
                    this.actions.add(() => {
                        wall.right.xOffset.update(n => n += wall.right.xOffset.initial);
                        wall.right.yOffset.update(n => n += wall.right.yOffset.initial);
                    });
                }
            }
        }

        for (const ld of this.data.linedefs) {
            if (ld.special === 252 || ld.special === 253) {
                pusherAction(this, ld, linedefScrollSpeed(ld));
            }

            // NOTE we create new objects here because otherwise we update the zeroScroll obejct and all lines change
            if (ld.special === 48) {
                ld.scrollSpeed = { dx: 1, dy: 0 };
            } else if (ld.special === 85) {
                ld.scrollSpeed = { dx: -1, dy: 0 };
            } else if (ld.special === 255) {
                ld.scrollSpeed = { dx: ld.right.xOffset.initial, dy: ld.right.yOffset.initial };
            } else if (ld.special === 1024) {
                for (const line of this.linedefsByTag.get(ld.tag) ?? []) {
                    line.scrollSpeed = { dx: ld.right.xOffset.initial / 8, dy: ld.right.yOffset.initial / 8 };
                }
            } else if (ld.special >= 250 && ld.special <= 253) {
                const scrollSpeed = linedefScrollSpeed(ld);
                for (const sector of this.sectorsByTag.get(ld.tag) ?? []) {
                    sector.scrollers = sector.scrollers ?? [];
                    sector.scrollers.push({ linedef: ld, scrollSpeed });
                }
            } else if (ld.special === 254 || ld.special === 1025) {
                const rate = 1.0 / (ld.special === 254 ? 32 : 8);
                const { dx, dy, length } = linedefSlope(ld);
                const angle = Math.atan2(dy, dx);
                for (const line of this.linedefsByTag.get(ld.tag) ?? []) {
                    if (line === ld) {
                        continue;
                    }

                    let { dx, dy } = linedefSlope(line);
                    const angleBetween = angle - Math.atan2(dy, dx);
                    dx = -Math.cos(angleBetween) * length * rate;
                    dy = Math.sin(angleBetween) * length * rate;
                    line.scrollSpeed = { dx, dy };
                }
            }
        }

        for (const sector of this.data.sectors) {
            const type = sector.type;
            // first 4 bytes are for lighting effects (https://doomwiki.org/wiki/Sector#Boom)
            const lightChanger = sectorLightAnimations[type & 0xf]?.(this, sector);
            if (lightChanger) {
                this.actions.add(lightChanger);
            }

            if (type === 9 || (type & 0x80)) {
                this.stats.totalSecrets += 1;
            }
        }

        this.musicChangeSectors.length = 0;
        const musicInfo = loadMapMusicInfo(this.name, this.game.wad.optionalLump('MUSINFO'));
        for (const thing of this.data.things.filter(e => e.type >= 14100 && e.type <= 14164)) {
            const sector = this.data.findSector(thing.x, thing.y);
            const track = musicInfo[thing.type - 14100] ?? mapMusicTrack(this.game, this.name);
            this.musicChangeSectors.push({ sector, track });
        }
    }

    updateCaches() {
        this.teleportMobjs.length = 0;

        this.sectorsByTag.clear();
        this.sectorObjs.clear();
        for (const sector of this.data.sectors) {
            // NOTE: sectorObjs is mostly managed by map-objects themselves
            this.sectorObjs.set(sector, new Set());
            if (sector.tag === 0) {
                continue;
            }

            const tagged = this.sectorsByTag.get(sector.tag) ?? []
            this.sectorsByTag.set(sector.tag, tagged);
            tagged.push(sector);
        }

        this.linedefsByTag.clear();
        for (const ld of this.data.linedefs) {
            if (ld.tag === 0) {
                continue;
            }
            const tagged = this.linedefsByTag.get(ld.tag) ?? [];
            this.linedefsByTag.set(ld.tag, tagged);
            tagged.push(ld);
        }
    }

    triggerSpecial(linedef: LineDef, mobj: MapObject, trigger: TriggerType, side: -1 | 1 = -1) {
        const special = triggerSpecial(mobj, linedef, trigger, side);
        if (special && trigger !== 'W') {
            // TODO: if special is already triggered (eg. by walking over a line) the switch shouldn't trigger
            if (this.tryToggle(special, linedef, 'upper')) {
                return special;
            }
            if (this.tryToggle(special, linedef, 'middle')) {
                return special;
            }
            if (this.tryToggle(special, linedef, 'lower')) {
                return special;
            }
        }
        return special;
    }

    private tryToggle(special: SpecialDefinition, linedef: LineDef, prop: WallTextureType) {
        const textureName = linedef.right[prop];
        const toggleTexture = this.game.wad.switchToggle(textureName);
        if (!toggleTexture || linedef.switchState) {
            return false;
        }

        // play a different sound on level exit
        const sound = (linedef.special === 11 || linedef.special === 51) ? SoundIndex.sfx_swtchx : SoundIndex.sfx_swtchn;
        this.game.playSound(sound, linedef.right.sector);
        linedef.right[prop] = toggleTexture;
        this.events.emit('wall-texture', linedef);
        if (!special.repeatable) {
            return true;
        }

        // it's a repeatable switch so restore the state after 1 second
        linedef.switchState = { type: 'line-texture', linedefNum: linedef.num, ticks: ticksPerSecond, toggleTexture, textureName, prop };
        this.actions.add(linedef.switchState);
        return true;
    }
}

interface LineChanger {
    type: 'line-texture';
    linedefNum: number;
    [key: string]: any;
}
const lineChangeFunctions: { [key in LineChanger['type']]: (map: MapRuntime, linedef: LineDef, state: LineChanger) => void } = {
    'line-texture': (map, linedef, state) => {
        if (--state.ticks) {
            return;
        }

        linedef.switchState = null;
        map.actions.delete(state);
        // restore original state
        map.game.playSound(SoundIndex.sfx_swtchn, linedef.right.sector);
        linedef.right[state.prop] = state.textureName;
        map.events.emit('wall-texture', linedef);
    },
}

const loadMapMusicInfo = (mapName: string, lump: Lump): { [key: number]: string } => {
    const result = {};
    if (!lump) {
        return result;
    }
    const text = new TextDecoder().decode(lump.data).split('\n').map(e => e.trim()).filter(e => e);
    for (let i = text.indexOf(mapName) + 1; i < text.length && isFinite(Number(text[i][0])); i++) {
        const [num, track] = text[i].split(' ');
        result[Number(num)] = track;
    }
    return result;
}

const linedefScrollSpeed = (ld: LineDef) =>{
    const slope = linedefSlope(ld);
    return {
        dx: Math.floor(slope.dx / 32),
        dy: Math.floor(slope.dy / 32),
    };
}
