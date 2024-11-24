import { store, type Store } from "./store";
import { thingSpec, stateChangeAction } from "./things";
import { StateIndex, MFFlags, type MapObjectInfo, MapObjectIndex, SoundIndex, states } from "./doom-things-info";
import { Vector3 } from "three";
import { HALF_PI, signedLineDistance, ToRadians, type Vertex, randInt } from "./math";
import { hittableThing, zeroVec, type Sector, type SubSector, type Thing, type TraceHit, hitSkyFlat, hitSkyWall, type TraceParams } from "./map-data";
import { ticksPerSecond, type GameTime, tickTime } from "./game";
import { SpriteStateMachine } from "./sprite";
import type { MapRuntime } from "./map-runtime";
import type { PlayerWeapon, ThingSpec } from "./things";
import type { InventoryWeapon } from "./things/weapons";
import { exitLevel } from "./specials";
import { _T } from "./text";
import { MoveDirection } from "./things/monsters";

export const angleBetween = (mobj1: MapObject, mobj2: MapObject) =>
    Math.atan2(
        mobj2.position.y - mobj1.position.y,
        mobj2.position.x - mobj1.position.x);

const _distVec = new Vector3();
export const xyDistanceBetween = (mobj1: MapObject, mobj2: MapObject) => {
    _distVec.copy(mobj2.position).sub(mobj1.position);
    return Math.sqrt(_distVec.x * _distVec.x + _distVec.y * _distVec.y);
}

const velocityPerSecond = (time: number, vel: number) => vel * time / tickTime;
const velocityPerTick = (time: number, vel: number) => vel * tickTime / time;

const vec = new Vector3();
export const maxFloatSpeed = 4;
export const maxStepSize = 24;
const stopVelocity = 0.001;
const friction = .90625;
let hitCount = 0;
export class MapObject {
    private static objectCounter = 0;
    readonly id = MapObject.objectCounter++;

    // check for already hit lines/mobjs
    private hitC: number;
    // set of subsectors we are touching
    private subsecRev = 0;
    private subsectorMap = new Map<SubSector, number>();

    protected _state = new SpriteStateMachine(
        sprite => this.map.events.emit('mobj-updated-sprite', this, sprite),
        action => stateChangeAction(action, this),
        () => this.map.destroy(this));
    protected _zFloor = -Infinity;
    protected _zCeil = Infinity;
    get zCeil() { return this._zCeil; }
    get zFloor() { return this._zFloor; }
    get rng() { return this.map.game.rng; }

    protected _attacker: MapObject;
    get attacker() { return this._attacker; }

    // ai stuff
    movedir = MoveDirection.None;
    movecount = 0;
    reactiontime = 0;
    chaseThreshold = 0;
    chaseTarget: MapObject;
    tracerTarget: MapObject;

    readonly resurrect: () => void;
    readonly canSectorChange: (sector: Sector, zFloor: number, zCeil: number) => boolean;
    readonly sectorChanged: (sector: Sector) => void;
    readonly positionChanged: () => void;

    readonly info: MapObjectInfo;
    readonly health: Store<number>;
    readonly position: Vector3;
    direction: number;
    readonly sector = store<Sector>(null);
    readonly sprite = this._state.sprite;
    readonly velocity = new Vector3();
    readonly renderShadow = store(false);
    // misc data set and used by the renderer
    readonly renderData = {};

    get isDead() { return this.health.val <= 0; }
    protected _isMoving = false;
    protected _onGround = true;
    get onGround() { return this.position.z <= this._zFloor; }
    get isMonster() { return this.spec.class === 'M'; }
    get type() { return this.spec.moType; }
    get description() { return this.spec.description; }
    get class() { return this.spec.class; }
    get onPickup() { return this.spec.onPickup; }

    constructor(readonly map: MapRuntime, protected spec: ThingSpec, pos: Vertex, direction: number) {
        // create a copy because we modify stuff (especially flags but also radius, height, maybe mass?)
        this.info = { ...spec.mo };
        this.health = store(this.info.spawnhealth);
        this.reactiontime = map.game.skill === 5 ? 0 : this.info.reactiontime;

        if (this.info.flags & MFFlags.MF_SHADOW) {
            this.renderShadow.set(true);
        }

        this.resurrect = () => {
            this.velocity.set(0, 0, 0);
            this.setState(spec.mo.raisestate)
            this.info.height = spec.mo.height;
            this.health.set(spec.mo.spawnhealth);
            this.info.flags = spec.mo.flags;
        }

        // only players, monsters, and missiles are moveable which affects how we choose zFloor and zCeil
        const moveable = spec.class === 'M' || (this.info.flags & MFFlags.MF_MISSILE) || spec.moType === MapObjectIndex.MT_PLAYER;
        const highestZFloor = !moveable
            ? (sector: Sector, zFloor: number) => (this.sector.val ?? sector).zFloor
            : (sector: Sector, zFloor: number) => {
                const ceil = lowestZCeil(sector, sector.zCeil);
                this.subsectors(subsector => {
                    const floor = (sector === subsector.sector) ? zFloor : subsector.sector.zFloor;
                    const step = floor - this.position.z;
                    // only allow step if it's small and we can fit in the ceiling/floor gap
                    // (see imp near sector 75 in E1M7)
                    if (step >= 0 && step <= maxStepSize && ceil - floor >= this.info.height) {
                        zFloor = Math.max(floor, zFloor);
                    }
                });
                return zFloor;
            };

        const lowestZCeil = !moveable
            ? (sector: Sector, zCeil: number) => (this.sector.val ?? sector).zCeil
            : (sector: Sector, zCeil: number) => {
                this.subsectors(subsector => {
                    const ceil = (sector === subsector.sector) ? zCeil : subsector.sector.zCeil;
                    zCeil = Math.min(ceil, zCeil);
                });
                return zCeil;
            };

        this.canSectorChange = (sector, zFloor, zCeil) => {
            const floor = highestZFloor(sector, zFloor);
            const ceil = lowestZCeil(sector, zCeil);
            return ((ceil - floor) >= this.info.height);
        };

        const fromCeiling = (this.info.flags & MFFlags.MF_SPAWNCEILING);
        this.sectorChanged = sector => {
            // check that we are on the ground before updating zFloor because if we were on the ground before
            // change, we want to force object to the ground after the change
            const onGround = this.position.z <= this._zFloor;
            this._zCeil = lowestZCeil(sector, sector.zCeil);
            this._zFloor = fromCeiling
                ? this.zCeil - this.info.height
                : highestZFloor(sector, sector.zFloor);
            // ceiling things or things on the ground always update
            if (fromCeiling || onGround) {
                this.position.z = this.zFloor;
                this.positionChanged();
            }
        };

        this.direction = direction;

        this.position = new Vector3(pos.x, pos.y, 0);
        // Use a slightly smaller radius for monsters (see reasoning as note in monsters.ts findMoveBlocker())
        // TODO: I'd like to find a more elegant solution to this but nothing is coming to mind
        const radius = this.class === 'M' ? this.info.radius - 1 : this.info.radius;
        this.positionChanged = () => {
            const p = this.position;

            this.subsecRev += 1;
            // add any subsectors we are currently touching
            this.map.data.traceSubsectors(p, zeroVec, radius,
                subsector => Boolean(this.subsectorMap.set(subsector, this.subsecRev)));
            // add mobj to touched sectors or remove from untouched sectors
            this.subsectorMap.forEach((rev, subsector) => {
                if (rev === this.subsecRev && !(this.info.flags & MFFlags.MF_NOBLOCKMAP)) {
                    subsector.mobjs.add(this);
                } else {
                    subsector.mobjs.delete(this);
                    this.subsectorMap.delete(subsector);
                }
            });

            const sector = this.map.data.findSector(p.x, p.y);
            this._zCeil = lowestZCeil(sector, sector.zCeil);
            const lastZFloor = this._zFloor;
            this._zFloor = fromCeiling && !this.isDead //<-- for keens
                ? this.zCeil - this.info.height
                // we want the sector with the highest floor which means we float a little when standing on an edge
                : highestZFloor(sector, sector.zFloor);
            if (!this.sector.val) {
                // first time setting sector so set zpos based on sector containing the object center
                p.z = sector.zFloor;
            }
            this._onGround = p.z <= this._zFloor;
            if (this.sector.val !== sector) {
                this.sector.set(sector);
            }
            if (lastZFloor !== this._zFloor) {
                this.applyGravity();
            }
            map.events.emit('mobj-updated-position', this);
        };
        this.positionChanged();

        // set state last because it may trigger other actions (like find player or play a sound)
        this._state.setState(this.info.spawnstate);
        // initial spawn sets ticks a little randomly so animations don't all move at the same time
        this._state.randomizeTicks(map.game.rng);
    }


    get spriteTics() { return states[this._state.index].tics; }
    get spriteTime() { return 1 / states[this._state.index].tics; }
    get spriteCompletion() { return 1 - this._state.ticsRemaining * this.spriteTime; }

    tick() {
        this._isMoving = this.velocity.lengthSq() > stopVelocity;
        this._onGround = this.position.z <= this._zFloor;

        this.applyFriction();
        this.updatePosition();
        this.applyGravity();

        this._state.tick();
        // TODO: update movecount (+other nightmare-only handling)
    }

    protected applyFriction() {
        if (this._onGround && this._isMoving && !(this.info.flags & (MFFlags.MF_MISSILE | MFFlags.MF_SKULLFLY))) {
            // friction (not z because gravity)
            this.velocity.x *= friction;
            this.velocity.y *= friction;
        }
    }

    // kind of like P_DamageMobj
    // inflictor is the thing doing damage (thing or missle) or null for slime/crushing
    // source is the thing that shot the missle (or null)
    damage(amount: number, inflictor?: MapObject, source?: MapObject) {
        // make sure we are dealing integer damage
        amount = Math.round(amount);
        this._attacker = source;

        if (this.info.flags & MFFlags.MF_SKULLFLY) {
            this.velocity.set(0, 0, 0);
        }

        const shouldApplyThrust = (inflictor
            && !(this.info.flags & MFFlags.MF_NOCLIP)
            && (!source
                || !(source instanceof PlayerMapObject)
                || source.weapon.val.name !== 'chainsaw'));
        if (shouldApplyThrust) {
            let angle = angleBetween(inflictor, this);
            // 12.5 is (100 * (1 << 16 >> 3)) / (1<<16) (see P_DamageMobj)
            let thrust = amount * 12.5 / this.info.mass;
            // as a nifty effect, fall forwards sometimes on kill shots (when player is below thing they are shooting at)
            const shouldFallForward = (amount < 40
                && amount > this.health.val
                && this.position.z - inflictor.position.z > 64
                && (this.rng.real() < .5));
            if (shouldFallForward) {
                angle += Math.PI;
                thrust *= 4;
            }
            this.thrust(thrust * Math.cos(angle), thrust * Math.sin(angle), 0);
        }

        this.health.update(h => h - amount);
        if (this.health.val <= 0) {
            this.kill(source);
            return;
        }

        this.reactiontime = 0;
        if (this.rng.real() < this.info.painchance && !(this.info.flags & MFFlags.MF_SKULLFLY)) {
            this.info.flags |= MFFlags.MF_JUSTHIT;
            this.setState(this.info.painstate);
        }

        const setChaseTarget =
            (!this.chaseThreshold || this.type === MapObjectIndex.MT_VILE)
            && source && this !== source && source.type !== MapObjectIndex.MT_VILE
        if (setChaseTarget) {
            this.chaseTarget = source;
            this.chaseThreshold = 100;
            if (this._state.index === this.info.spawnstate && this.info.seestate !== StateIndex.S_NULL) {
                this.setState(this.info.seestate);
            }
        }
    }

    thrust(x: number, y: number, z: number) {
        this.velocity.x += x;
        this.velocity.y += y;
        this.velocity.z += z;
    }

    kill(source?: MapObject) {
        this.movedir = MoveDirection.None;
        this.info.flags |= MFFlags.MF_CORPSE | MFFlags.MF_DROPOFF;
        this.info.flags &= ~(MFFlags.MF_SHOOTABLE | MFFlags.MF_FLOAT | MFFlags.MF_SKULLFLY);
        if (this.type !== MapObjectIndex.MT_SKULL) {
            this.info.flags &= ~MFFlags.MF_NOGRAVITY;
        }

        if (this.info.flags & MFFlags.MF_COUNTKILL) {
            const player =
                source instanceof PlayerMapObject ? source :
                this.map.game.mode === 'solo' ? this.map.player : null;
            if (player) {
                player.stats.kills += 1;
            }
            // TODO: netgames need to do more (like count frags)
        }

        this.info.height *= .25;
        if (this.health.val < -this.info.spawnhealth && this.info.xdeathstate !== StateIndex.S_NULL) {
            this._state.setState(this.info.xdeathstate, -this.rng.int(0, 2));
        } else {
            this._state.setState(this.info.deathstate, -this.rng.int(0, 2));
        }

        // Some enemies drop things (guns or ammo) when they die
        let dropType =
            (this.type === MapObjectIndex.MT_WOLFSS || this.type === MapObjectIndex.MT_POSSESSED) ? MapObjectIndex.MT_CLIP :
            (this.type === MapObjectIndex.MT_SHOTGUY) ? MapObjectIndex.MT_SHOTGUN :
            (this.type === MapObjectIndex.MT_CHAINGUY) ? MapObjectIndex.MT_CHAINGUN :
            null;
        if (dropType) {
            const mobj = this.map.spawn(dropType, this.position.x, this.position.y);
            mobj.info.flags |= MFFlags.MF_DROPPED; // special versions of items

            // items pop up when dropped (gzdoom has this effect and I think it's pretty cool)
            // don't use pRandom() because it would affect demo playback (if we every implement that...)
            mobj.velocity.z = randInt(5, 7);
            // position slightly above the current floor otherwise it will immediately stick to floor
            mobj.position.z += 1;
        }
    }

    setState(stateIndex: number, tickOffset: number = 0) {
        this._state.setState(stateIndex, tickOffset);
    }

    teleport(target: MapObject, sector: Sector) {
        this.velocity.set(0, 0, 0);
        this.position.set(target.position.x, target.position.y, sector.zFloor);
        this.positionChanged();
        this.direction = target.direction;

        if (this.isMonster && this.map.name !== 'MAP30') {
            return; // monsters only telefrag in level 30
        }
        // telefrag anything in our way
        this.map.data.traceMove({
            start: this.position,
            move: zeroVec,
            radius: this.info.radius,
            height: this.info.height,
            hitObject: hit => {
                // skip non shootable things and (obviously) don't hit ourselves
                if (!(hit.mobj.info.flags & MFFlags.MF_SHOOTABLE) || hit.mobj === this) {
                    return true;
                }
                hit.mobj.damage(10_000, this, this);
                return true;
            }
        });
    }

    touchingSector(sector: Sector) {
        // Why won't this work with nodejs 22? It won't work for iOS anyway
        // return this.subsectorMap.keys().find(ss => ss.sector === sector) !== undefined;
        for (const ss of this.subsectorMap.keys()) {
            if (ss.sector === sector) {
                return true;
            }
        }
        return false;
    }

    subsectors(fn: (subsector: SubSector) => void) {
        this.subsectorMap.forEach((val, key) => fn(key));
    }

    protected pickup(mobj: MapObject) {
        // this is only imlemented by PlayerMapObject (for now)
    }

    // kind of P_ZMovement
    protected applyGravity() {
        if (this.info.flags & MFFlags.MF_FLOAT && this.chaseTarget) {
            if (!(this.info.flags & (MFFlags.MF_SKULLFLY | MFFlags.MF_INFLOAT))) {
                const dist = xyDistanceBetween(this, this.chaseTarget);
                const zDelta = 3 * ((this.chaseTarget.position.z + this.chaseTarget.info.height * .5) - this.position.z);
                if (zDelta < 0 && dist < -zDelta) {
                    this.velocity.z = Math.max(-maxFloatSpeed, this.velocity.z - maxFloatSpeed * this.map.game.time.delta);
                } else if (zDelta > 0 && dist < zDelta) {
                    this.velocity.z = Math.min(maxFloatSpeed, this.velocity.z + maxFloatSpeed * this.map.game.time.delta);
                } else {
                    this.velocity.z *= friction;
                }
            }
        }
        if (this._onGround) {
            this.velocity.z = 0;
            this.position.z = this._zFloor;
        } else {
            if (this.info.flags & MFFlags.MF_NOGRAVITY) {
                return;
            }
            this.velocity.z -= 1;
        }
    }

    // kind of P_XYMovement
    protected updatePosition() {
        if (!this._isMoving) {
            return;
        }

        if (this.info.flags & MFFlags.MF_NOCLIP) {
            this.position.add(this.velocity);
            this.positionChanged();
            return;
        }

        // TODO: we handle blood this way so it doesn't collide with player but... can't we do better?
        if (this.info.spawnstate === StateIndex.S_BLOOD1) {
            this.position.add(this.velocity);
            this.positionChanged();
            return;
        }

        // cyclomatic complexity of the code below: about 1 bazillion.
        const isMissile = this.info.flags & MFFlags.MF_MISSILE;
        const start = this.position;
        let blocker: TraceHit = 1 as any;
        hitCount += 1;
        const traceParams: TraceParams = {
            start,
            move: this.velocity,
            radius: this.info.radius,
            height: this.info.height,
            hitObject: hit => {
                // kind of like PIT_CheckThing
                const ignoreHit = (false
                    || (hit.mobj === this) // don't collide with yourself
                    || (!(hit.mobj.info.flags & hittableThing)) // not hittable
                    || (start.z + this.info.height < hit.mobj.position.z) // passed under target
                    || (start.z > hit.mobj.position.z + hit.mobj.info.height) // passed over target
                    || (hit.mobj.hitC === hitCount) // already hit this mobj
                );
                if (ignoreHit) {
                    return true;
                }
                hit.mobj.hitC = hitCount;

                if (isMissile) {
                    if (!(hit.mobj.info.flags & MFFlags.MF_SHOOTABLE)) {
                        return !(hit.mobj.info.flags & MFFlags.MF_SOLID);
                    }
                    if (this.chaseTarget === hit.mobj) {
                        return true; // don't hit shooter, continue trace
                    }
                    // same species does not damage hit.mobj but still explodes missile
                    // this is quite clever because bullets shooters (chaingun guys, shotgun guys, etc.) don't shoot
                    // missiles and therefore will still attack each other
                    const sameSpecies = this.chaseTarget && (
                        this.chaseTarget.type === hit.mobj.type ||
                        (this.chaseTarget.type === MapObjectIndex.MT_KNIGHT && hit.mobj.type === MapObjectIndex.MT_BRUISER)||
                        (this.chaseTarget.type === MapObjectIndex.MT_BRUISER && hit.mobj.type === MapObjectIndex.MT_KNIGHT)
                    );
                    if (!sameSpecies) {
                        const damage = this.info.damage * this.rng.int(1, 8);
                        hit.mobj.damage(damage, this, this.chaseTarget);
                    }
                    this.explode();
                    return false;
                }
                if (hit.mobj.info.flags & MFFlags.MF_SPECIAL) {
                    this.pickup(hit.mobj);
                    return true;
                }
                blocker = hit;
                if (hit.axis === 'y') {
                    slideMove(this.velocity, 1, 0);
                } else {
                    slideMove(this.velocity, 0, 1);
                }
                return !blocker;
            },
            hitLine: hit => {
                const isMissile = this.info.flags & MFFlags.MF_MISSILE;
                const twoSided = Boolean(hit.line.left);
                if (isMissile) {
                    let explode = false;
                    if (twoSided) {
                        const front = (hit.side === -1 ? hit.line.right : hit.line.left).sector;
                        const back = (hit.side === -1 ? hit.line.left : hit.line.right).sector;
                        if (hitSkyWall(start.z, front, back)) {
                            this.map.destroy(this);
                            return false;
                        }

                        explode = explode || (start.z < back.zFloor);
                        explode = explode || (start.z + this.info.height > back.zCeil);
                    }

                    if (!twoSided || explode) {
                        if (hit.line.special) {
                            this.map.triggerSpecial(hit.line, this, 'G', hit.side);
                        }
                        this.explode();
                        return false;
                    }
                    return true;
                }

                const blocking = (hit.line.flags & 0x0001) !== 0;
                if (twoSided && !blocking) {
                    const back = hit.side <= 0 ? hit.line.left.sector : hit.line.right.sector;

                    const floorChangeOk = (back.zFloor - start.z <= maxStepSize);
                    const transitionGapOk = (back.zCeil - start.z >= this.info.height);
                    const newCeilingFloorGapOk = (back.zCeil - back.zFloor >= this.info.height);
                    const dropOffOk =
                        (this.info.flags & (MFFlags.MF_DROPOFF | MFFlags.MF_FLOAT)) ||
                        (start.z - back.zFloor <= maxStepSize);

                    // console.log('[sz,ez], [f,t,cf,do]',[start.z, back.zFloor.val], [floorChangeOk,transitionGapOk,newCeilingFloorGapOk,dropOffOk])
                    if (newCeilingFloorGapOk && transitionGapOk && floorChangeOk && dropOffOk) {
                        if (hit.line.special) {
                            const startSide = signedLineDistance(hit.line.v, start) < 0 ? -1 : 1;
                            const endSide = signedLineDistance(hit.line.v, vec) < 0 ? -1 : 1
                            if (startSide !== endSide) {
                                this.map.triggerSpecial(hit.line, this, 'W', hit.side);
                            }
                        }

                        return true; // step/ceiling/drop-off collision is okay so try next line
                    }
                }

                // TODO: hmmm.. if we check for double hits here (after hitting specials), we risk triggering specials multiple times.
                // maybe we should trigger specials after this? (that is how doom actually does it)
                if (hit.line.hitC === hitCount) {
                    // we've already hit this wall? stop moving because we're in a concave corner (e1m1 imp platform or e1m3 near blue key door)
                    this.velocity.set(0, 0, 0);
                    return true;
                }
                hit.line.hitC = hitCount;

                blocker = hit;
                slideMove(this.velocity, hit.line.v[1].x - hit.line.v[0].x, hit.line.v[1].y - hit.line.v[0].y);
                return !blocker;
            },
            hitFlat: hit => {
                // hit a floor or ceiling
                this.hitFlat(hit.point.z);

                if (this.info.flags & MFFlags.MF_SKULLFLY) {
                    blocker = hit;
                }

                if (isMissile) {
                    if (hitSkyFlat(hit)) {
                        this.map.destroy(this);
                    } else {
                        this.explode();
                    }
                    return false;
                }
                return !blocker;
            }
        };

        while (blocker) {
            blocker = null;
            vec.copy(start).add(this.velocity);
            this.map.data.traceMove(traceParams);

            if (blocker && this.info.flags & MFFlags.MF_SKULLFLY) {
                // skull hit something so stop flying
                this.info.flags &= ~MFFlags.MF_SKULLFLY;
                this.setState(this.info.spawnstate);
                // if hit is a mobj, then damage it
                if ('mobj' in blocker) {
                    const damage = this.info.damage * this.rng.int(1, 8);
                    blocker.mobj.damage(damage, this, this);
                    this.velocity.set(0, 0, 0);
                }
            }
        }

        this.position.add(this.velocity);
        this.positionChanged();
    }

    protected hitFlat(zVal: number) {
        this.velocity.z = 0;
        this.position.z = zVal;
    }

    protected explode() {
        this.info.flags &= ~MFFlags.MF_MISSILE;
        this.velocity.set(0, 0, 0);
        this._state.setState(this.info.deathstate, -this.rng.int(0, 2));
        this.map.game.playSound(this.info.deathsound, this);
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

const tickingItems: (Exclude<keyof PlayerInventory['items'], 'computerMap' | 'berserk'>)[] =
    ['berserkTicks', 'invincibilityTicks', 'invisibilityTicks', 'nightVisionTicks', 'radiationSuitTicks'];

// interestingly, sector type 4 and 16 CAN hurt even with radiation suit
const superSlimePainChance = 5 / 255;
const bobTime = ticksPerSecond / 20;
const playerMaxBob = 16;
const playerViewHeightDefault = 41;
const playerViewHeightDefaultHalf = playerViewHeightDefault * .5;
export class PlayerMapObject extends MapObject {
    private viewHeightOffset = playerViewHeightDefault;
    private deltaViewHeight = 0;
    readonly viewHeight = store(this.viewHeightOffset);
    readonly viewHeightNoBob = store(this.viewHeightOffset);

    // head looking up/down
    pitch = 0;
    // Hmmm... also add roll for fun? or VR? or something?

    bob = 0;
    damageCount = store(0); // mostly for screen fading
    bonusCount = store(0); // mostly for screen fading
    attacking = false;
    refire = false;
    readonly stats = {
        kills: 0,
        items: 0,
        secrets: 0,
    };
    readonly extraLight = store(0);
    readonly weapon = store<PlayerWeapon>(null);
    nextWeapon: InventoryWeapon = null;
    hudMessage = store('');

    constructor(readonly inventory: Store<PlayerInventory>, map: MapRuntime, source: Thing) {
        super(map, thingSpec(MapObjectIndex.MT_PLAYER), source, 0);
        this.direction = source.angle * ToRadians;

        this.renderShadow.subscribe(shadow => {
            if (shadow) {
                this.info.flags |= MFFlags.MF_SHADOW;
            } else {
                this.info.flags &= ~MFFlags.MF_SHADOW;
            }
        });

        this.inventory.subscribe(inv => {
            const invisibleTime = inv.items.invisibilityTicks / ticksPerSecond;
            this.renderShadow.set(invisibleTime > 0);

            const nightVisionTime = inv.items.nightVisionTicks / ticksPerSecond;
            const invunlTime = inv.items.invincibilityTicks / ticksPerSecond;
            const lightOverride =
                invunlTime > 1.0 ? 255 :
                invunlTime > 0.0 ? 0 :
                // first 2 seconds we go from 0->255 then stay at 255 until last 5 seconds where we pulse a few times from 0 to 255
                nightVisionTime ? (
                    nightVisionTime > 60 ? 255 :
                    nightVisionTime > 58 ? 255 * Math.sin(HALF_PI * Math.max(0, (60 - nightVisionTime) / 2)) :
                    nightVisionTime > 4.5 ? 255 :
                    255 * (Math.sin(Math.PI * 2 * nightVisionTime - HALF_PI) * .5 + .5)
                ) :
                this.extraLight.val;
            this.extraLight.set(lightOverride);
        });
    }

    tick() {
        this._isMoving = this.velocity.manhattanLength() > 0.01;
        this._onGround = this.position.z <= this._zFloor;

        this.applyFriction();
        this.applyGravity();
        this._state.tick();

        this.reactiontime = Math.max(0, this.reactiontime - 1);
        this.damageCount.update(val => Math.max(0, val - 1));
        this.bonusCount.update(val => Math.max(0, val - 1));
        this.weapon.val.tick();
        if (this.isDead) {
            super.updatePosition();
            if (this.attacker && this.attacker !== this) {
                this.direction = angleBetween(this, this.attacker);
            }
            return;
        }

        this.inventory.update(inv => {
            for (const name of tickingItems) {
                if (inv.items[name]) {
                    inv.items[name] = Math.max(0, inv.items[name] - 1);
                }
            }
            return inv;
        });

        // check special sectors
        const sector = this.sector.val;
        // different from this.onGround because that depends on this.zFloor which takes into account surrounding sector
        // here we are only looking at the sector containing the player center
        const onGround = this.position.z <= sector.zFloor;
        if (sector.type && onGround) {
            const haveRadiationSuit = this.inventory.val.items.radiationSuitTicks > 0;
            // only cause pain every 31st tick or about .89s
            const isPainTick = (this.map.game.time.tick.val & 0x1f) === 0;
            const causePain = !haveRadiationSuit && isPainTick;
            if (sector.type === 9) {
                this.stats.secrets += 1;
                sector.type = 0;
            } else if (sector.type === 5 && causePain) {
                this.damage(10);
            } else if (sector.type === 7 && causePain) {
                this.damage(5);
            } else if (sector.type === 16 || sector.type === 4) {
                if ((!haveRadiationSuit || this.rng.real() < superSlimePainChance) && isPainTick) {
                    this.damage(20);
                }
            } else if (sector.type === 11) {
                // disable invincibility to force player to be killed
                this.map.game.settings.invicibility.set(false);
                if (causePain) {
                    this.damage(20);
                }
                if (this.health.val < 11) {
                    exitLevel(this, 'normal');
                }
            }
        }

        const vel = this.velocity.length();
        if (this._state.index === StateIndex.S_PLAY && vel > .5) {
            this.setState(StateIndex.S_PLAY_RUN1);
        } else if (this._state.index === StateIndex.S_PLAY_RUN1 && vel < .2) {
            this.setState(StateIndex.S_PLAY);
        }
    }

    damage(amount: number, inflictor?: MapObject, source?: MapObject) {
        let inv = this.inventory.val;
        if (inv.items.invincibilityTicks || this.map.game.settings.invicibility.val) {
            // TODO: doom does damage to invincible players if damage is above 1000 but... why?
            return;
        }
        if (this.map.game.skill === 1) {
            amount *= .5; // half damage in easy skill
        }
        if (inv.armor) {
            let saved = amount / (inv.armorType == 1 ? 3 : 2);
            if (inv.armor <= saved) {
                // armor is used up
                saved = inv.armor;
                inv.armorType = 0;
            }

            inv.armor -= saved;
            this.inventory.set(inv);
            amount -= saved;
        }

        // end of game hell hack
        if (this.sector.val.type == 11 && amount >= this.health.val) {
            amount = this.health.val - 1;
        }

        super.damage(amount, inflictor, source);

        this.damageCount.update(val => Math.min(val + amount, 100));
        // TODO: haptic feedback for controllers?
    }

    thrust(x: number, y: number, z: number) {
        const time = this.map.game.time.delta;
        super.thrust(velocityPerSecond(time, x), velocityPerSecond(time, y), velocityPerSecond(time, z));
    }

    kill(source?: MapObject) {
        super.kill(source);
        // when we die, we start processing moving at tick intervals so convert current velocity (in seconds) to ticks
        // I don't really love how we evaluate player movement
        const time = this.map.game.time.delta;
        this.velocity.set(velocityPerTick(time, this.velocity.x), velocityPerTick(time, this.velocity.y), velocityPerTick(time, this.velocity.z));

        // TODO: some map stats
        this.weapon.val.deactivate();
    }

    teleport(target: MapObject, sector: Sector): void {
        this.reactiontime = 18; // freeze player after teleporting
        super.teleport(target, sector);
    }

    xyMove(): void {
        super.updatePosition();
    }

    protected updatePosition(): void {
        // do nothing, super.updatePosition() can be called from game input handling (xyMove) or when we are dead (tick)
    }

    protected applyGravity(): void {
        if (this.isDead) {
            return super.applyGravity();
        }
        if (this.info.flags & MFFlags.MF_NOGRAVITY) {
            return;
        }
        if (this.onGround) {
            this.hitFlat(this.zFloor);
            this.positionChanged();
        }
    }

    protected hitFlat(zVal: number): void {
        // smooth step up
        if (this.position.z < zVal) {
            this.viewHeightOffset -= zVal - this.position.z;
            // this means we change view height by 1, 2, or 3 depending on the step
            // >> 3 is equivalent to divide by 8 but faster? Doom cleverly used integer math and I haven't tested the performance in JS
            this.deltaViewHeight = (playerViewHeightDefault - this.viewHeightOffset) >> 3;
        }
        // hit the ground so lower the screen
        if (this.position.z > zVal) {
            this.deltaViewHeight = this.velocity.z >> 3;
            // if we hit the ground hard, play a sound
            if (this.velocity.z < -8) {
                this.map.game.playSound(SoundIndex.sfx_oof, this);
            }
        }
        super.hitFlat(zVal);
    }

    // P_CalcHeight in p_user.c
    updateViewHeight(time: GameTime) {
        if (this.info.flags & MFFlags.MF_NOGRAVITY) {
            this.viewHeight.set(playerViewHeightDefault);
            return;
        }

        if (this.isDead) {
            // Doom player falls 1 unit per tick (or 35 units per second) until 6 units above the ground so...
            this.viewHeightOffset = Math.max(6, this.viewHeightOffset - 35 * time.delta);
            this.viewHeight.set(this.viewHeightOffset);
            return;
        }

        const delta = ticksPerSecond * time.delta;
        this.viewHeightOffset += this.deltaViewHeight * delta;

        if (this.viewHeightOffset > playerViewHeightDefault) {
            this.viewHeightOffset = playerViewHeightDefault;
            this.deltaViewHeight = 0;
        }
        if (this.viewHeightOffset < playerViewHeightDefaultHalf) {
            this.viewHeightOffset = playerViewHeightDefaultHalf;
            if (this.deltaViewHeight <= 0) {
                this.deltaViewHeight = 1;
            }
        }
        if (this.deltaViewHeight) {
            // small acceleration of delta over time
            this.deltaViewHeight += delta / 4;
        }

        if (this.viewHeightOffset < playerViewHeightDefault && this.deltaViewHeight === 0) {
            this.deltaViewHeight = 1;
        }

        this.bob = Math.min(this.velocity.lengthSq(), playerMaxBob);
        const bob = Math.sin(Math.PI * 2 * bobTime * time.elapsed) * this.bob * .5;

        let viewHeight = this.viewHeightOffset + bob;
        const maxHeight = this.zCeil - 4 - this.position.z;
        this.viewHeight.set(Math.min(maxHeight, viewHeight));
        this.viewHeightNoBob.set(Math.min(maxHeight, this.viewHeightOffset));
    }

    // kind of P_TouchSpecialThing in p_inter.c
    protected pickup(mobj: MapObject) {
        const pickedUp = mobj.onPickup?.(this, mobj);
        if (pickedUp) {
            // TODO: only play sound for local player, not remote players
            this.map.game.playSound(pickedUp.sound);
            this.hudMessage.set(_T(pickedUp.message));
            this.stats.items += mobj.info.flags & MFFlags.MF_COUNTITEM ? 1 : 0;
            this.bonusCount.update(val => val + 6);
            if (pickedUp.removeMapObject) {
                this.map.destroy(mobj);
            }
        }
    }
}

export interface Ammo {
    amount: number;
    max: number;
}

export type AmmoType = keyof PlayerInventory['ammo'];

export interface PlayerInventory {
    armor: number;
    armorType: 0 | 1 | 2;
    ammo: {
        bullets: Ammo;
        shells: Ammo;
        rockets: Ammo;
        cells: Ammo;
    },
    items: {
        invincibilityTicks: number,
        invisibilityTicks: number,
        radiationSuitTicks: number,
        berserkTicks: number,
        nightVisionTicks: number,
        computerMap: boolean,
        berserk: boolean,
    }
    // weapons: chainsaw, fist, pistol, [super shotgun,] shotgun, machine gun, rocket launcher, plasma rifle, bfg
    weapons: InventoryWeapon[];
    // keys
    keys: string; // RYB or RY or B or...
}
