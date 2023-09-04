import { store, type Store } from "./store";
import { MapData, type HandleCollision, type LineDef, type Thing, type Action } from "./map-data";
import { Euler, Object3D, Vector3 } from "three";
import { HALF_PI, lineLineIntersect, signedLineDistance } from "./math";
import { PlayerMapObject, MapObject } from "./map-object";
import { sectorAnimations, triggerSpecial, type SpecialDefinition, type TriggerType } from "./specials";
import { MFFlags } from "./doom-things-info";
import { ticksPerSecond, type Game, type GameTime, type ControllerInput, frameTickTime } from "./game";

interface AnimatedTexture {
    frames: string[];
    current: number;
    speed: number;
    target: Store<string>;
}

export class MapRuntime {
    readonly data: MapData; // TODO: make this non-public?
    private actions: Action[] = [];
    private animatedTextures: AnimatedTexture[] = [];

    readonly player: PlayerMapObject;
    readonly camera: Camera;
    readonly input: GameInput;

    objs: MapObject[]; // TODO: readonly?
    // don't love this rev hack... we need a list with a subscribe method
    readonly rev = store(1);
    // for things that subscribe to game state (like settings) but are tied to the lifecycle of a map should push themselves here
    readonly disposables: (() => void)[] = [];

    constructor(
        readonly name: string,
        readonly game: Game,
    ) {
        this.data = game.wad.readMap(name);

        const playerThing = this.data.things.find(e => e.type === 1);
        this.player = new PlayerMapObject(store(game.inventory), this, playerThing);
        this.player.health.set(game.inventory.health);
        this.player.weapon.set(game.inventory.lastWeapon);

        this.camera = new Camera(this.player, this, game);
        this.input = new GameInput(this, game.input);

        this.objs = this.data.things.map(e => this.spawnThing(e)).filter(e => e);
        this.objs.forEach(o => this.data.blockmap.watch(o));

        this.synchronizeActions();

        // initialize animated textures
        for (const sector of this.data.sectors) {
            this.initializeTextureAnimation(sector.ceilFlat, 'flat');
            this.initializeTextureAnimation(sector.floorFlat, 'flat');
        }
        for (const linedef of this.data.linedefs) {
            this.initializeTextureAnimation(linedef.right.lower, 'wall');
            this.initializeTextureAnimation(linedef.right.middle, 'wall');
            this.initializeTextureAnimation(linedef.right.upper, 'wall');
            if (linedef.left) {
                this.initializeTextureAnimation(linedef.left.lower, 'wall');
                this.initializeTextureAnimation(linedef.left.middle, 'wall');
                this.initializeTextureAnimation(linedef.left.upper, 'wall');
            }
        }
    }

    dispose() {
        this.disposables.forEach(sub => sub());
        this.disposables.length = 0;
    }

    private spawnThing(thing: Thing): MapObject | undefined {
        const noSpawn = (false
            || thing.type === 0 // plutonia map 12, what?!
            || thing.type === 1
            || thing.type === 2
            || thing.type === 3
            || thing.type === 4
            || thing.type === 11
            || thing.type === 14
            || thing.type === 87
            || thing.type === 89
        );
        if (noSpawn) {
            return;
        }
        if (thing.flags & 0x0010 && this.game.mode === 'solo') {
            return; // multiplayer only
        }
        const skillMatch = (
            (thing.flags & 0x0001 && (this.game.skill === 1 || this.game.skill === 2)) ||
            (thing.flags & 0x0002 && (this.game.skill === 3)) ||
            (thing.flags & 0x0004 && (this.game.skill === 4 || this.game.skill === 5))
        );
        if (!skillMatch) {
            return;
        }
        return new MapObject(this, thing);
    }

    spawn(mobj: MapObject) {
        this.data.blockmap.watch(mobj);
        this.objs.push(mobj);
        this.rev.update(v => v += 1);
        return mobj;
    }

    destroy(mobj: MapObject) {
        this.data.blockmap.unwatch(mobj);
        // TODO: perf?
        this.objs = this.objs.filter(e => e !== mobj);
        this.rev.update(rev => rev += 1);
    }

    timeStep(time: GameTime) {
        this.input.evaluate(time.delta);

        if (time.isTick) {
            this.tick();
        }
    }

    initializeTextureAnimation(target: Store<string>, type: 'wall' | 'flat') {
        if (!target) {
            return;
        }
        // wall/flat animations are all 8 ticks each
        const animInfoFn = type === 'wall' ? 'animatedWallInfo' : 'animatedFlatInfo';
        const speed = 8;
        target.subscribe(v => {
            const animInfo = this.game.wad[animInfoFn](v);
            if (animInfo) {
                this.animatedTextures.push({ frames: animInfo[1], current: animInfo[0], target, speed });
            } else {
                // remove animation that was applied to this target
                this.animatedTextures = this.animatedTextures.filter(e => e.target !== target);
            }
        })();
    }

    private tick() {
        this.actions.forEach(action => action(this.game.time));

        // update wall/flat animations
        this.animatedTextures.forEach(anim => {
            if (this.game.time.tick.val % anim.speed === 0) {
                anim.current = (anim.current + 1) % anim.frames.length;
                anim.target.set(anim.frames[anim.current]);
            }
        });

        this.player.tick();
        this.objs.forEach(thing => thing.tick());
    }

    addAction(action: Action) {
        if (action && this.actions.indexOf(action) === -1) {
            this.actions.push(action);
        }
    }

    removeAction(action: Action) {
        // TODO: perf: recreating an array?
        this.actions = this.actions.filter(e => e !== action);
    }

    // Why a public function? Because "edit" mode can change these while
    // rendering the map and we want them to update
    synchronizeActions() {
        this.actions = [];
        for (const wall of this.data.linedefs) {
            if (wall.special === 48) {
                wall.xOffset = store(0);
                this.actions.push(() => wall.xOffset.update(n => n += 1));
            } else if (wall.special === 85) {
                wall.xOffset = store(0);
                this.actions.push(() => wall.xOffset.update(n => n -= 1));
            }
        }

        for (const sector of this.data.sectors) {
            const type = sector.type;
            const action = sectorAnimations[type]?.(this, sector);
            if (action) {
                this.actions.push(action);
            }
        }
    }

    triggerSpecial(linedef: LineDef, mobj: MapObject, trigger: TriggerType, side: -1 | 1 = -1) {
        const special = triggerSpecial(mobj, linedef, trigger, side);
        if (special && trigger !== 'W') {
            // TODO: if special is already triggered (eg. by walking over a line) the switch shouldn't trigger
            if (this.tryToggle(special, linedef, linedef.right.upper)) {
                return;
            }
            if (this.tryToggle(special, linedef, linedef.right.middle)) {
                return;
            }
            if (this.tryToggle(special, linedef, linedef.right.lower)) {
                return;
            }
        }
    }

    private tryToggle(special: SpecialDefinition, linedef: LineDef, tex: Store<string>) {
        const name = tex.val;
        const toggle = this.game.wad.switchToggle(name);
        if (toggle) {
            if (special.repeatable && !linedef.buttonTimer) {
                let ticks = ticksPerSecond; // 1 sec
                const action = () => {
                    if (--ticks) {
                        return;
                    }
                    // restore original state
                    tex.set(name);
                    linedef.buttonTimer = null;
                    this.removeAction(action);
                }

                linedef.buttonTimer = action;
                this.addAction(action);
            }
            tex.set(toggle);
            return true;
        }
        return false;
    }

    trace(start: Vector3, move: Vector3, radius: number, onThing: HandleCollision<MapObject>, onLinedef: HandleCollision<LineDef>) {
        return this.data.trace(start, move, radius, onThing, onLinedef);
    }
}

const slideMove = (vel: Vector3, x: number, y: number) => {
    // slide along wall instead of moving through it
    vec.set(x, y, 0);
    // we are only interested in cancelling xy movement so preserve z
    const z = vel.z;
    vel.projectOnVector(vec);
    vel.z = z;
};

const playerSpeeds = { // per-tick
    'run': 50,
    'walk': 25,
    'crawl?': 5,
    'gravity': 35,
}

const vec = new Vector3();
class GameInput {
    public pointerSpeed = 1.0;
    // Set to constrain the pitch of the camera
    public minPolarAngle = -HALF_PI;
    public maxPolarAngle = HALF_PI;

    private freeFly: Store<boolean>;
    private handledUsePress = false; // only one use per button press
    private get enablePlayerCollisions() { return !this.map.game.settings.noclip.val; }
    private get player() { return this.map.player };
    private obj = new Object3D();
    private direction = new Vector3();

    constructor(private map: MapRuntime, readonly input: ControllerInput) {
        const euler = this.map.camera.rotation.val;
        euler.x = HALF_PI;
        this.player.direction.subscribe(dir => {
            euler.z = dir + HALF_PI;
            this.obj.quaternion.setFromEuler(euler);
            this.obj.updateMatrix();
        });

        this.freeFly = this.map.game.settings.freeFly;
        this.map.disposables.push(
            this.map.game.settings.freelook.subscribe(val => {
                if (val) {
                    this.minPolarAngle = -HALF_PI;
                    this.maxPolarAngle = HALF_PI;
                } else {
                    this.minPolarAngle = this.maxPolarAngle = 0;
                }
            }));
    }

    evaluate(delta: number) {
        // change weapon
        if (this.input.weaponSelect) {
            let nextWeapon = this.player.inventory.val.weapons.filter(e => e.num === this.input.weaponSelect);
            let weapon = this.player.weapon.val;
            let selectedWeapon =
                // key press for a weapon we haven't picked up (yet)
                nextWeapon.length === 0 ? null :
                nextWeapon.length === 1 ? nextWeapon[0] :
                // chainsaw and shotgun use the same number slot so we toggle
                (weapon === nextWeapon[0]) ? nextWeapon[1] : nextWeapon[0];
            if (selectedWeapon && selectedWeapon !== weapon) {
                this.player.nextWeapon = selectedWeapon;
            }
            this.input.weaponSelect = 0;
        }

        // attack
        this.player.attacking = this.input.attack;

        // handle rotation movements
        const euler = this.map.camera.rotation.val;
        euler.z -= this.input.mouse.x * 0.002 * this.pointerSpeed;
        euler.x -= this.input.mouse.y * 0.002 * this.pointerSpeed;
        euler.x = Math.max(HALF_PI - this.maxPolarAngle, Math.min(HALF_PI - this.minPolarAngle, euler.x));
        this.player.direction.set(euler.z - HALF_PI);

        // clear for next eval
        this.input.mouse.x = 0;
        this.input.mouse.y = 0;

        // handle direction movements
        this.direction.x = Number(this.input.moveRight) - Number(this.input.moveLeft);
        this.direction.y = Number(this.input.moveForward) - Number(this.input.moveBackward);
        this.direction.normalize(); // ensure consistent movements in all directions
        // ^^^ this isn't very doom like but I'm not sure I want to change it

        const dt = delta * delta / frameTickTime;
        let speed = this.input.slow ? playerSpeeds['crawl?'] :
            this.input.run ? playerSpeeds['run'] : playerSpeeds['walk'];
        if (this.player.onGround || this.freeFly.val) {
            if (this.freeFly.val && !this.input.slow) {
                speed *= 2;
            }
            if (this.input.moveForward || this.input.moveBackward) {
                this.player.velocity.addScaledVector(this.forwardVec(), this.direction.y * speed * dt);
            }
            if (this.input.moveLeft || this.input.moveRight) {
                this.player.velocity.addScaledVector(this.rightVec(), this.direction.x * speed * dt);
            }
            if (this.freeFly.val) {
                // apply separate friction during freefly
                this.player.velocity.multiplyScalar(0.95);
            }
        } else {
            this.player.velocity.z -= playerSpeeds['gravity'] * dt;
        }

        const pos = this.player.position.val;
        if (this.enablePlayerCollisions) {
            this.map.data.xyCollisions(this.player, this.player.velocity,
                mobj => {
                    if (mobj.info.flags & MFFlags.MF_SPECIAL) {
                        this.player.pickup(mobj);
                        return true;
                    }
                    const dx = pos.x - mobj.position.val.x;
                    const dy = pos.y - mobj.position.val.y;
                    slideMove(this.player.velocity, -dy, dx);
                    return true;
                },
                linedef => {
                    slideMove(this.player.velocity, linedef.v[1].x - linedef.v[0].x, linedef.v[1].y - linedef.v[0].y);
                    return true;
                },
                (linedef, side) => {
                    this.map.triggerSpecial(linedef, this.player, 'W', side)
                    return true;
                });
        }
        this.player.position.update(pos => pos.add(this.player.velocity));

        // use stuff (switches, doors, etc)
        if (this.input.use && !this.handledUsePress) {
            this.handledUsePress = false;

            const ang = euler.z + HALF_PI;
            vec.set(Math.cos(ang) * 64, Math.sin(ang) * 64, 0);
            const collisions = this.map.data.blockmap.trace(pos, 0, vec);
            vec.add(pos);
            const useLine = [pos, vec];
            for (const linedef of collisions.linedefs) {
                if (signedLineDistance(linedef.v, pos) < 0) {
                    // don't hit walls from behind
                    continue;
                }

                const hit = lineLineIntersect(linedef.v, useLine, true);
                if (!hit) {
                    continue;
                }

                if (linedef.special) {
                    this.map.triggerSpecial(linedef, this.player, 'S');
                    break;
                }
            }
        }
        this.handledUsePress = this.input.use;
    }

    private rightVec() {
        return vec.setFromMatrixColumn(this.obj.matrix, 0);
    }

    private forwardVec() {
        if (this.freeFly.val) {
            // freelook https://stackoverflow.com/questions/63405094
            vec.set(0, 0, -1).applyQuaternion(this.obj.quaternion);
        } else {
            // move forward parallel to the xy-plane (camera.up is z-up)
            vec.setFromMatrixColumn(this.obj.matrix, 0);
            vec.crossVectors(this.obj.up, vec);
        }
        return vec;
    }
}

class Camera {
    private pos = new Vector3();
    private angle = new Euler(0, 0, 0, 'ZXY');
    private updatePosition: (pos: Vector3, angle: Euler) => void;

    readonly rotation = store(this.angle);
    readonly position = store(this.pos);
    readonly mode: Game['settings']['cameraMode'];

    constructor(player: PlayerMapObject, map: MapRuntime, game: Game) {
        this.mode = game.settings.cameraMode;
        let freeFly = game.settings.freeFly;
        const sub = game.settings.cameraMode.subscribe(mode => {
            if (mode === '3p' || mode === 'ortho') {
                const followDist = 200;
                this.updatePosition = (position, angle) => {
                    const playerViewHeight = freeFly.val ? 41 : player.computeViewHeight(game.time);
                    this.pos.x = -Math.sin(-angle.z) * followDist + position.x;
                    this.pos.y = -Math.cos(-angle.z) * followDist + position.y;
                    this.pos.z = Math.cos(-angle.x) * followDist + position.z + playerViewHeight;
                    this.position.set(this.pos);
                    this.rotation.set(angle);
                };
            } else if (mode === 'bird') {
                const followDist = 250;
                this.updatePosition = (position, angle) => {
                    this.pos.set(position.x, position.y, position.z + followDist);
                    this.position.set(this.pos);
                    angle.x = 0;
                    this.rotation.set(angle);
                }
            } else {
                this.updatePosition = (position, angle) => {
                    const playerViewHeight = freeFly.val ? 41 : player.computeViewHeight(game.time);
                    this.pos.set(position.x, position.y, position.z + playerViewHeight);
                    this.position.set(this.pos);
                    this.rotation.set(angle);
                };
            }
        });
        map.disposables.push(sub);

        player.position.subscribe(pos => this.updatePosition(pos, this.angle));
    }
}
