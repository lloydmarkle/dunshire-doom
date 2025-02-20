import { store, type Store } from "./store";
import { type MapData, type LineDef, type Thing, type Action, type Sector } from "./map-data";
import { Object3D, Vector3 } from "three";
import { HALF_PI, ComputedRNG, TableRNG, ToRadians, ticksPerSecond, tickTime } from "./math";
import { PlayerMapObject, MapObject } from "./map-object";
import { pusherAction, sectorLightAnimations, triggerSpecial, type SpecialDefinition, type TriggerType } from "./specials";
import { type Game, type GameTime, type ControllerInput } from "./game";
import { mapObjectInfo, MapObjectIndex, MFFlags, SoundIndex } from "./doom-things-info";
import { thingSpec, inventoryWeapon } from "./things";
import type { InventoryWeapon } from "./things/weapons";
import { derived } from "svelte/store";
import type { Sprite } from "./sprite";
import { EventEmitter } from "./events";

export type LineSide = 'left' | 'right';
export type WallTextureType = 'upper' | 'lower' | 'middle';
type MapEvents = {
    // mobj changes
    ['mobj-added']: [MapObject];
    ['mobj-removed']: [MapObject];
    ['mobj-updated-sprite']: [MapObject, Sprite];
    ['mobj-updated-position']: [MapObject];
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

export class MapRuntime {
    private actions = new Set<Action>();
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
    // for things that subscribe to game state (like settings) but are tied to the lifecycle of a map should push themselves here
    readonly disposables: (() => void)[] = [];
    readonly musicTrack: Store<string>;

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

        this.updateCaches();
        this.synchronizeSpecials();

        let playerThing: MapObject;
        this.disposables.push(this.game.settings.skipInitialSpawn.subscribe(() => {
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
    }

    dispose() {
        this.disposables.forEach(sub => sub());
        this.disposables.length = 0;
    }

    private initialThingSpawn(thing: Thing): MapObject | undefined {
        const noSpawn = (false
            || thing.type === 0 // plutonia map 12, what?!
            || thing.type === 2
            || thing.type === 3
            || thing.type === 4
            || thing.type === 11
            // always spawn players (even with skipInitialSpawn)
            || (this.game.settings.skipInitialSpawn.val && thing.type !== 1)
        );
        if (noSpawn) {
            return;
        }
        if (thing.flags & 0x0010 && this.game.mode === 'solo') {
            return; // multiplayer only
        }
        const skillMatch = (false
            || (thing.flags & 0x0001 && (this.game.skill === 1 || this.game.skill === 2))
            || (thing.flags & 0x0002 && (this.game.skill === 3))
            || (thing.flags & 0x0004 && (this.game.skill === 4 || this.game.skill === 5))
            || (thing.type === 1 && thing.flags === 0)
        );
        if (!skillMatch) {
            return;
        }

        const type = thing.type === 1 ? MapObjectIndex.MT_PLAYER :
            mapObjectInfo.findIndex(e => e.doomednum === thing.type);
        if (type === -1) {
            console.warn('unable to spawn thing type', thing.type);
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
        if (z !== undefined) {
            mobj.position.z = z;
        }
        if (moType === MapObjectIndex.MT_PLAYER) {
            this.players.push(mobj);
        }
        if (moType === MapObjectIndex.MT_TELEPORTMAN) {
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
        this.input.evaluate(time.delta);
        this.player.updateViewHeight(time);

        if (time.isTick) {
            this.tick();
        }
    }

    private tick() {
        this.actions.forEach(action => action());

        // update wall/flat animations
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

    addAction(action: Action) {
        if (action) {
            this.actions.add(action);
        }
    }

    removeAction(action: Action) {
        this.actions.delete(action);
    }

    // Why a public function? Because "edit" mode can change these while
    // rendering the map and we want them to update
    synchronizeSpecials(renderMode: 'r1' | 'r2' = 'r2') {
        this.actions.clear();
        this.stats.totalSecrets = 0;
        if (renderMode === 'r1') {
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
                pusherAction(this, ld);
            }
        }

        for (const sector of this.data.sectors) {
            const type = sector.type;
            // first 4 bytes are for lighting effects (https://doomwiki.org/wiki/Sector#Boom)
            const action = sectorLightAnimations[type & 0xf]?.(this, sector);
            if (action) {
                this.actions.add(action);
            }

            if (type === 9) {
                this.stats.totalSecrets += 1;
            }
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
                return;
            }
            if (this.tryToggle(special, linedef, 'middle')) {
                return;
            }
            if (this.tryToggle(special, linedef, 'lower')) {
                return;
            }
        }
    }

    private tryToggle(special: SpecialDefinition, linedef: LineDef, prop: WallTextureType) {
        const textureName = linedef.right[prop];
        const toggleTexture = this.game.wad.switchToggle(textureName);
        if (!toggleTexture || linedef.switchAction) {
            return false;
        }

        // play a different sound on level exit
        const sound = (linedef.special === 11 || linedef.special === 51)
            ? SoundIndex.sfx_swtchx : SoundIndex.sfx_swtchn;
        this.game.playSound(sound, linedef.right.sector);
        linedef.right[prop] = toggleTexture;
        this.events.emit('wall-texture', linedef);
        if (!special.repeatable) {
            return true;
        }

        // it's a repeatable switch so restore the state after 1 second
        let ticks = ticksPerSecond; // 1 sec
        const action = () => {
            if (--ticks) {
                return;
            }
            // restore original state
            this.game.playSound(SoundIndex.sfx_swtchn, linedef.right.sector);
            linedef.right[prop] = textureName;
            this.events.emit('wall-texture', linedef);
            linedef.switchAction = null;
            this.removeAction(action);
        };
        linedef.switchAction = action;
        this.addAction(action);
        return true;
    }
}

const playerSpeeds = { // per-tick
    'run': 50,
    'walk': 25,
    'crawl?': 5,
    'gravity': 35,
}

const vec = new Vector3();
class GameInput {
    // Constrain the pitch of the camera
    public minPolarAngle = -HALF_PI;
    public maxPolarAngle = HALF_PI;

    private alwaysRun: Store<boolean>;
    private compassMove: Store<boolean>;
    private handledUsePress = false; // only one use per button press
    private get player() { return this.map.player };
    private obj = new Object3D();

    constructor(private map: MapRuntime, readonly input: ControllerInput) {
        this.obj.rotation.order = 'ZXY';
        this.obj.up.set(0, 0, 1);
        const euler = this.obj.rotation;
        euler.x = 0;
        euler.z = map.player.direction - HALF_PI;

        this.alwaysRun = this.map.game.settings.alwaysRun;
        this.compassMove = this.map.game.settings.compassMove;
        this.map.disposables.push(
            // TODO: this doesn't belong here but I can't think of a better place at the moment :(
            this.map.game.settings.randomNumbers.subscribe(randomNumberGenerator => {
                (this.map.game.rng as any) = (randomNumberGenerator === 'table')
                    ? new TableRNG() : new ComputedRNG();
            }),
            this.map.game.settings.noclip.subscribe(noclip => {
                if (noclip) {
                    this.player.info.flags |= MFFlags.MF_NOCLIP;
                } else {
                    this.player.info.flags &= ~MFFlags.MF_NOCLIP;
                }
            }),
            this.map.game.settings.freeFly.subscribe(freefly => {
                if (freefly) {
                    this.player.info.flags |= MFFlags.MF_NOGRAVITY;
                } else {
                    this.player.info.flags &= ~MFFlags.MF_NOGRAVITY;
                }
            }),
            derived(
                [this.map.game.settings.freelook, this.map.game.settings.cameraMode],
                ([freelook, cameraMode]) => freelook && cameraMode !== 'bird' && cameraMode !== 'ortho'
            ).subscribe(canPitch => {
                if (canPitch) {
                    this.minPolarAngle = -HALF_PI;
                    this.maxPolarAngle = HALF_PI;
                } else {
                    this.minPolarAngle = this.maxPolarAngle = 0;
                }
            }));
    }

    evaluate(delta: number) {
        if (this.player.isDead) {
            // wait till view height gets close to the ground before we allow restarting (so that the player doesn't miss out!)
            // also make sure the use/attack button has been freshly pressed since dying
            const canRestart = this.player.viewHeight.val < 10 &&
                ((this.input.attack && !this.player.attacking) || (this.input.use && this.handledUsePress));
            this.player.attacking = this.input.attack;
            this.handledUsePress = this.input.use;
            if (canRestart) {
                // clear input received from after dying
                this.input.aim.set(0, 0, 0);
                this.input.weaponIndex = -1;
                this.input.weaponKeyNum = 0;
                // restart the level
                this.map.game.resetInventory();
                this.map.game.startMap(this.map.name);
            }
            return;
        }

        // change weapon
        let selectedWeapon: InventoryWeapon;
        const weapon = this.player.weapon.val;
        if (this.input.weaponIndex !== -1) {
            selectedWeapon = this.player.inventory.val.weapons[this.input.weaponIndex];
        } else if (this.input.weaponKeyNum) {
            let candidates = this.player.inventory.val.weapons.filter(e => e?.keynum === this.input.weaponKeyNum);
            let weapon = this.player.weapon.val;
            selectedWeapon =
                // key press for a weapon we haven't picked up (yet)
                candidates.length === 0 ? null :
                // normal case where the key press is for a weapon we have
                candidates.length === 1 ? candidates[0] :
                // some weapons (chainsaw and shotgun) use the same number slot so toggle
                (weapon.name === candidates[1].name) ? candidates[0] : candidates[1];
        }
        if (selectedWeapon && selectedWeapon.name !== weapon.name) {
            this.player.nextWeapon = selectedWeapon;
        }
        // clear for next eval
        this.input.weaponIndex = -1;
        this.input.weaponKeyNum = 0;

        // handle rotation movements
        const euler = this.obj.rotation;
        // read player direction (in case of teleport)
        euler.z = this.player.direction - HALF_PI;
        euler.z -= this.input.aim.x * 0.001;
        euler.x -= this.input.aim.y * 0.001;
        euler.x = Math.min(this.maxPolarAngle, Math.max(this.minPolarAngle, euler.x));
        this.obj.updateMatrix();
        // write player direction based on input
        this.player.direction = euler.z + HALF_PI;
        this.player.pitch = euler.x;
        // clear for next eval (only xy, z is used for camera zoom and does not affect gameplay)
        this.input.aim.setX(0).setY(0);

        // After playing with DSDA doom for a bit, the movement doesn't feel quite right so need some tweaks
        // Some good info on: https://www.doomworld.com/forum/topic/87199-the-doom-movement-bible/
        this.input.move.x = Math.max(-1, Math.min(1, this.input.move.x));
        this.input.move.y = Math.max(-1, Math.min(1, this.input.move.y));
        this.input.move.z = Math.max(-1, Math.min(1, this.input.move.z));

        const freeFly = this.player.info.flags & MFFlags.MF_NOGRAVITY;
        const dt = delta * delta / tickTime;
        let speed = this.input.slow ? playerSpeeds['crawl?'] :
            this.alwaysRun.val !== this.input.run ? playerSpeeds['run'] : playerSpeeds['walk'];
        if (this.player.onGround || freeFly) {
            if (freeFly && !this.input.slow) {
                speed *= 2;
            }
            if (this.input.move.y) {
                this.player.velocity.addScaledVector(this.forwardVec(), this.input.move.y * speed * dt);
            }
            if (this.input.move.x) {
                this.player.velocity.addScaledVector(this.rightVec(), this.input.move.x * speed * dt);
            }
            if (this.input.move.z && freeFly) {
                this.player.velocity.addScaledVector(this.upVec(), this.input.move.z * speed * dt);
            }
            if (freeFly) {
                // apply separate friction during freefly
                this.player.velocity.multiplyScalar(0.95);
            }
        } else {
            this.player.velocity.z -= playerSpeeds['gravity'] * dt;
        }
        this.player.xyMove();

        // attack
        this.player.attacking = this.input.attack;

        // use stuff (switches, doors, etc)
        if (this.input.use && !this.handledUsePress) {
            this.handledUsePress = false;

            const ang = this.player.direction;
            vec.set(Math.cos(ang) * 64, Math.sin(ang) * 64, 0);
            this.map.data.traceRay({
                start: this.player.position,
                move: vec,
                hitLine: hit => {
                    if (hit.line.special && hit.side === -1) {
                        this.map.triggerSpecial(hit.line, this.player, 'S');
                        return false; // stop trace, we used a line
                    } else if (hit.line.left) {
                        const front = (hit.side === -1 ? hit.line.right : hit.line.left).sector;
                        const back = (hit.side === -1 ? hit.line.left : hit.line.right).sector;
                        const gap = Math.min(front.zCeil, back.zCeil) - Math.max(front.zFloor, back.zFloor);
                        if (gap > 0) {
                            return true; // allow trace to continue
                        }
                    }
                    this.map.game.playSound(SoundIndex.sfx_noway, this.player);
                    return false; // always stop on the first line (unless above says we can continue)
                },
            });
        }
        this.handledUsePress = this.input.use;
    }

    private rightVec() {
        return this.compassMove.val
            ? vec.set(1, 0, 0)
            : vec.setFromMatrixColumn(this.obj.matrix, 0);
    }

    private upVec() {
        return vec.set(0, 0, 1);
    }

    private forwardVec() {
        return (
            this.compassMove.val ? vec.set(0, 1, 0) :
            this.player.info.flags & MFFlags.MF_NOGRAVITY ? vec.set(0, 1, 0).applyQuaternion(this.obj.quaternion) :
            vec.setFromMatrixColumn(this.obj.matrix, 0).crossVectors(this.obj.up, vec)
        );
    }
}
