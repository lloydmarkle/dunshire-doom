import { Euler, Vector2, Vector3 } from "three";
import type { ThingType } from ".";
import { ActionIndex, MFFlags, MapObjectIndex, SoundIndex, StateIndex } from "../doom-things-info";
import { store } from "../store";
import { HALF_PI, QUARTER_PI, ticksPerSecond } from '../math';
import { PlayerMapObject, type PlayerInventory, MapObject, angleBetween, missileMover } from '../map-object';
import { SpriteStateMachine } from '../sprite';
import { giveAmmo } from "./ammunitions";
import { hitSkyFlat, type Sector, hitSkyWall, type TraceParams, zeroVec } from "../map-data";
import { itemPickedUp, noPickUp } from "./pickup";
import type { MessageId } from "../text";
import { propagateSound } from "./monsters";
import type { MapRuntime } from "../map-runtime";

export const weaponTop = 32;
const weaponBottom = 32 - 128;

type WeaponName =
    'chainsaw' | 'fist' | 'pistol' | 'super shotgun' | 'shotgun' | 'chaingun' | 'rocket launcher' | 'plasma rifle' | 'bfg';
export interface InventoryWeapon {
    keynum: number;
    name: WeaponName;
    pickupMessage?: MessageId;
    fn: () => PlayerWeapon;
}

export class PlayerWeapon {
    private player: PlayerMapObject;
    private _sprite = new SpriteStateMachine(
        sprite => this.player.map.events.emit('mobj-updated-sprite', this.player, sprite),
        action => weaponActions[action]?.(this.player, this),
        self => self.sprite.set(null));
    private _flashSprite = new SpriteStateMachine(
        sprite => this.player.map.events.emit('mobj-updated-sprite', this.player, sprite),
        action => weaponActions[action]?.(this.player, this),
        self => self.sprite.set(null));
    readonly position = store<Vector2>(new Vector2(0, weaponBottom));
    readonly sprite = this._sprite.sprite;
    readonly flashSprite = this._flashSprite.sprite;
    get state() { return this._sprite.index; }

    constructor(
        readonly name: WeaponName,
        readonly ammoType: keyof PlayerInventory['ammo'] | 'none',
        readonly ammoPerShot: number,
        private upState: StateIndex,
        private downState: StateIndex,
        private readyState: StateIndex,
        private attackState: StateIndex,
        private flashState: StateIndex,
    ) {}

    tick() {
        this._sprite.tick();
        this._flashSprite.tick();
    }

    activate(player: PlayerMapObject) {
        this.player = player;
        this.player.refire = false;
        this._sprite.setState(this.upState);

        if (this.name === 'chainsaw') {
            player.map.game.playSound(SoundIndex.sfx_sawup, player);
        }
    }
    deactivate() { this._sprite.setState(this.downState); }
    ready() { this._sprite.setState(this.readyState); }
    flash(offset = 0) { this._flashSprite.setState(this.flashState + offset); }
    fire() {
        if (this.player.nextWeapon) {
            // once weapon is down, nextWeapon will be activated
            this.deactivate();
            return;
        }

        if (this.ammoType === 'none' || this.player.inventory.val.ammo[this.ammoType].amount >= this.ammoPerShot) {
            this.player.setState(StateIndex.S_PLAY_ATK1);
            this._sprite.setState(this.attackState);
            propagateSound(this.player);
        } else {
            chooseNewWeapon(this.player)
        }
    }
}

export const allWeapons: InventoryWeapon[] = [
    {
        name: 'fist',
        keynum: 1,
        fn: () => new PlayerWeapon('fist', 'none', 0, StateIndex.S_PUNCHUP, StateIndex.S_PUNCHDOWN, StateIndex.S_PUNCH, StateIndex.S_PUNCH1, StateIndex.S_NULL),
    },
    {
        name: 'chainsaw',
        keynum: 1,
        pickupMessage: 'GOTCHAINSAW',
        fn: () => new PlayerWeapon('chainsaw', 'none', 0, StateIndex.S_SAWUP, StateIndex.S_SAWDOWN, StateIndex.S_SAW, StateIndex.S_SAW1, StateIndex.S_NULL),
    },
    {
        name: 'pistol',
        keynum: 2,
        fn: () => new PlayerWeapon('pistol', 'bullets', 1, StateIndex.S_PISTOLUP, StateIndex.S_PISTOLDOWN, StateIndex.S_PISTOL, StateIndex.S_PISTOL1, StateIndex.S_PISTOLFLASH),
    },
    {
        name: 'shotgun',
        keynum: 3,
        pickupMessage: 'GOTSHOTGUN',
        fn: () => new PlayerWeapon('shotgun', 'shells', 1, StateIndex.S_SGUNUP, StateIndex.S_SGUNDOWN, StateIndex.S_SGUN, StateIndex.S_SGUN1, StateIndex.S_SGUNFLASH1),
    },
    {
        name: 'super shotgun',
        keynum: 3,
        pickupMessage: 'GOTSHOTGUN2',
        fn: () => new PlayerWeapon('super shotgun', 'shells', 2, StateIndex.S_DSGUNUP, StateIndex.S_DSGUNDOWN, StateIndex.S_DSGUN, StateIndex.S_DSGUN1, StateIndex.S_DSGUNFLASH1),
    },
    {
        name: 'chaingun',
        keynum: 4,
        pickupMessage: 'GOTCHAINGUN',
        fn: () => new PlayerWeapon('chaingun', 'bullets', 1, StateIndex.S_CHAINUP, StateIndex.S_CHAINDOWN, StateIndex.S_CHAIN, StateIndex.S_CHAIN1, StateIndex.S_CHAINFLASH1),
    },
    {
        name: 'rocket launcher',
        keynum: 5,
        pickupMessage: 'GOTLAUNCHER',
        fn: () => new PlayerWeapon('rocket launcher', 'rockets', 1, StateIndex.S_MISSILEUP, StateIndex.S_MISSILEDOWN, StateIndex.S_MISSILE, StateIndex.S_MISSILE1, StateIndex.S_MISSILEFLASH1),
    },
    {
        name: 'plasma rifle',
        keynum: 6,
        pickupMessage: 'GOTPLASMA',
        fn: () => new PlayerWeapon('plasma rifle', 'cells', 1, StateIndex.S_PLASMAUP, StateIndex.S_PLASMADOWN, StateIndex.S_PLASMA, StateIndex.S_PLASMA1, StateIndex.S_PLASMAFLASH1),
    },
    {
        name: 'bfg',
        keynum: 7,
        pickupMessage: 'GOTBFG9000',
        fn: () => new PlayerWeapon('bfg', 'cells', 40, StateIndex.S_BFGUP, StateIndex.S_BFGDOWN, StateIndex.S_BFG, StateIndex.S_BFG1, StateIndex.S_BFGFLASH1),
    },
];
export const inventoryWeapon = (name: WeaponName) => allWeapons.find(e => e.name === name);

export const weaponItems: ThingType[] = [
    { type: 82, class: 'W', description: 'Super shotgun', onPickup: giveWeapon('super shotgun') },
    { type: 2001, class: 'W', description: 'Shotgun', onPickup: giveWeapon('shotgun') },
    { type: 2002, class: 'W', description: 'Chaingun', onPickup: giveWeapon('chaingun') },
    { type: 2003, class: 'W', description: 'Rocket launcher', onPickup: giveWeapon('rocket launcher') },
    { type: 2004, class: 'W', description: 'Plasma gun', onPickup: giveWeapon('plasma rifle') },
    { type: 2005, class: 'W', description: 'Chainsaw', onPickup: giveWeapon('chainsaw') },
    { type: 2006, class: 'W', description: 'BFG9000', onPickup: giveWeapon('bfg') },
];

export function giveWeapon(name: WeaponName) {
    const factory = inventoryWeapon(name);
    const weapon = factory.fn();
    return (player: PlayerMapObject, mobj: MapObject) => {
        let pickedup = false;
        player.inventory.update(inv => {
            if (weapon.ammoType !== 'none') {
                // only give 1 clip for droped weapon
                const clipCount = (mobj.info.flags & MFFlags.MF_DROPPED) ? 1 : 2;
                pickedup = giveAmmo(player, inv, weapon.ammoType, clipCount);
            }
            const wIndex = Object.values(allWeapons).indexOf(factory);
            if (!inv.weapons[wIndex]) {
                pickedup = true;
                // keep weapons in the same order as the above weapons list so select works properly
                // (ie. select chainsaw before fist if we have a chainsaw)
                inv.weapons[wIndex] = factory;
                player.nextWeapon = factory;
            }
            return inv;
        });
        return pickedup
            ? itemPickedUp(SoundIndex.sfx_wpnup, factory.pickupMessage, player.map.game.mode === 'solo')
            : noPickUp();
    }
}

function chooseNewWeapon(player: PlayerMapObject) {
    const ammo = player.inventory.val.ammo;
    const [ chainsaw, fist, pistol, superShotgun, shotgun, chaingun, rocketLauncher, plasma, bfg ] = player.inventory.val.weapons;
    player.nextWeapon =
        (plasma && ammo.cells.amount) ? plasma :
        (superShotgun && ammo.shells.amount >= superShotgun.fn().ammoPerShot) ? superShotgun :
        (chaingun && ammo.bullets.amount) ? chaingun :
        (shotgun && ammo.shells.amount) ? shotgun :
        (pistol && ammo.bullets.amount) ? pistol :
        (chainsaw) ? chainsaw :
        (rocketLauncher && ammo.rockets.amount) ? rocketLauncher :
        (bfg && ammo.cells.amount >= bfg.fn().ammoPerShot) ? bfg :
        fist; // good ol' rock, nothing beats that!
}

export const meleeRange = 1 * 64;
export const meleeRangeSqr = meleeRange * meleeRange;
export const scanRange = 16 * 64;
export const attackRange = 32 * 64;
const bulletDamage = (mobj: MapObject) => 5 * mobj.rng.int(1, 3);
const bulletAngle = (player: MapObject, trace: ShotTracer) =>
    player.map.game.settings.xyAimAssist.val ? trace.lastAngle : player.direction;

const weaponBobTime = 128 / ticksPerSecond;
const ssgNoiseVariation = (255 << 5) / (1 << 16);
const puffNoiseVariation = (255 << 10) / (1 << 16);
// TODO: I'd actually like to remove these from ActionIndex and instead make them completely local to weapon.ts
// I'd like to do the same thing with StateIndex (move all weapon states to this file so that all weapon related stuff
// is isolated from other things). Long term, we could also move enemy and other bits to their own files too so that
// all the declarations for a type of "thing" are in a single place. Something to aspire to.
type WeaponAction = (player: PlayerMapObject, weapon: PlayerWeapon) => void
export const weaponActions: { [key: number]: WeaponAction } = {
    [ActionIndex.NULL]: (player, weapon) => {},
    [ActionIndex.A_Light0]: (player, weapon) => {
        player.extraLight.set(0);
    },
    [ActionIndex.A_Light1]: (player, weapon) => {
        player.extraLight.set(16);
    },
    [ActionIndex.A_Light2]: (player, weapon) => {
        // really?? light up every sector everywhere?
        player.extraLight.set(32);
    },
    [ActionIndex.A_GunFlash]: (player, weapon) => {
        player.setState(StateIndex.S_PLAY_ATK2);
        weapon.flash();
    },
    [ActionIndex.A_Lower]: (player, weapon) => {
        weapon.position.update(pos => {
            if (player.isDead) {
                pos.y = weaponBottom;
                return pos;
            }

            pos.y -= 6;
            if (pos.y < weaponBottom) {
                pos.y = weaponBottom;
                player.weapon.set(player.nextWeapon.fn());
                player.nextWeapon = null;
            }
            return pos;
        });
    },
    [ActionIndex.A_Raise]: (player, weapon) => {
        weapon.position.update(pos => {
            pos.y += 6;
            if (pos.y > weaponTop) {
                pos.y = weaponTop;
                weapon.ready();
            }
            return pos;
        });
    },
    [ActionIndex.A_WeaponReady]: (player, weapon) => {
        if (player.nextWeapon) {
            // once weapon is down, nextWeapon will be activated
            weapon.deactivate();
            return;
        }

        if (player.attacking) {
            weapon.fire();
        }

        if (weapon.name === 'chainsaw' && weapon.state === StateIndex.S_SAW) {
            player.map.game.playSound(SoundIndex.sfx_sawidl, player);
        }

        // bob the weapon based on movement speed
        weapon.position.update(pos => {
            let angle = (weaponBobTime * player.map.game.time.elapsed) * HALF_PI;
            pos.x = Math.cos(angle) * player.bob;
            pos.y = weaponTop - (Math.cos(angle * 2 - Math.PI) + 1) * .5 * player.bob;
            return pos;
        });
    },
    [ActionIndex.A_ReFire]: (player, weapon) => {
        if (player.attacking) {
            player.refire = true;
            weapon.fire();
        } else {
            player.refire = false;
        }
    },

    [ActionIndex.A_Punch]: (player, weapon) => {
        let damage = player.rng.int(1, 10) * 2;
        if (player.inventory.val.items.berserk) {
            damage *= 10;
        }

        const slope = shotTracer.zAim(player, meleeRange);
        const angle = bulletAngle(player, shotTracer) + player.rng.angleNoise(18);
        shotTracer.fire(damage, angle, slope, meleeRange);

        // turn to face target
        if (shotTracer.lastTarget) {
            player.map.game.playSound(SoundIndex.sfx_punch, player);
            player.direction = angleBetween(player, shotTracer.lastTarget);
        }
    },
    [ActionIndex.A_Saw]: (player, weapon) => {
        let damage = player.rng.int(1, 10) * 2;

        // use meleerange + 1 so the puff doesn't skip the flash
        const slope = shotTracer.zAim(player, meleeRange + 1);
        const angle = bulletAngle(player, shotTracer) + player.rng.angleNoise(18);
        shotTracer.fire(damage, angle, slope, meleeRange + 1);

        if (!shotTracer.lastTarget) {
            player.map.game.playSound(SoundIndex.sfx_sawful, player);
            return;
        }
        player.map.game.playSound(SoundIndex.sfx_sawhit, player);

        // turn to face target
        const dir = player.direction;
        const newAngle = angleBetween(player, shotTracer.lastTarget);
        if (newAngle - dir > Math.PI) {
            player.direction = (newAngle - dir > -HALF_PI / 20)
                ? newAngle + HALF_PI / 21
                : dir - HALF_PI / 20;
        } else {
            player.direction = (newAngle - player.direction < HALF_PI / 20)
                ? newAngle - HALF_PI / 21
                : dir + HALF_PI / 20;
        }
        // TODO: player think needs to read this to move the player forward
        ///  ... or we could do it another way (like just adjust velocity here toward the target)
        player.info.flags |= MFFlags.MF_JUSTATTACKED;
    },
    [ActionIndex.A_FirePistol]: (player, weapon) => {
        weaponActions[ActionIndex.A_GunFlash](player, weapon);
        useAmmo(player, weapon);
        player.map.game.playSound(SoundIndex.sfx_pistol, player);

        const slope = shotTracer.zAim(player, scanRange);
        let angle = bulletAngle(player, shotTracer);
        if (player.refire) {
            // mess up angle slightly for refire
            angle += player.rng.angleNoise(18);
        }
        shotTracer.fire(bulletDamage(player), angle, slope, attackRange);
    },
    [ActionIndex.A_FireShotgun]: (player, weapon) => {
        weaponActions[ActionIndex.A_GunFlash](player, weapon);
        useAmmo(player, weapon);
        player.map.game.playSound(SoundIndex.sfx_shotgn, player);

        const slope = shotTracer.zAim(player, scanRange);
        const angle = bulletAngle(player, shotTracer);
        for (let i = 0; i < 7; i++) {
            shotTracer.fire(bulletDamage(player), angle + player.rng.angleNoise(18), slope, attackRange);
        }
    },

    [ActionIndex.A_FireShotgun2]: (player, weapon) => {
        // BUG: A_GunFlash goes to flash state but super shotgun has 2 flashes (5 tics and 4 ticks)
        // but we only show the gun frame for 7 so we get an artifact on screen. We can see this bug in
        // chocolate doom but not gzdoom
        weaponActions[ActionIndex.A_GunFlash](player, weapon);
        useAmmo(player, weapon);
        player.map.game.playSound(SoundIndex.sfx_dshtgn, player);

        const slope = shotTracer.zAim(player, scanRange);
        const angle = bulletAngle(player, shotTracer);
        for (let i = 0; i < 20; i++) {
            const slopeNoise = player.rng.real2() * ssgNoiseVariation;
            shotTracer.fire(bulletDamage(player), angle + player.rng.angleNoise(19), slope + slopeNoise, attackRange);
        }
    },
    [ActionIndex.A_OpenShotgun2]: (player, weapon) => {
        player.map.game.playSound(SoundIndex.sfx_dbopn, player)
    },
    [ActionIndex.A_LoadShotgun2]: (player, weapon) => {
        player.map.game.playSound(SoundIndex.sfx_dbload, player)
    },
    [ActionIndex.A_CloseShotgun2]: (player, weapon) => {
        player.map.game.playSound(SoundIndex.sfx_dbcls, player)
        weaponActions[ActionIndex.A_ReFire](player, weapon);
    },

    [ActionIndex.A_FireCGun]: (player, weapon) => {
        weapon.flash(weapon.sprite.val.frame);
        player.setState(StateIndex.S_PLAY_ATK2);
        useAmmo(player, weapon);
        player.map.game.playSound(SoundIndex.sfx_pistol, player);

        const slope = shotTracer.zAim(player, scanRange);
        let angle = bulletAngle(player, shotTracer);
        if (player.refire) {
            // mess up angle slightly for refire
            angle += player.rng.angleNoise(18);
        }
        shotTracer.fire(bulletDamage(player), angle, slope, attackRange);
    },

    [ActionIndex.A_FireMissile]: (player, weapon) => {
        useAmmo(player, weapon);
        shootMissile(player, MapObjectIndex.MT_ROCKET);
    },

    [ActionIndex.A_FirePlasma]: (player, weapon) => {
        weapon.flash(player.rng.int(0, 1));
        // don't go to S_PLAY_ATK2... was that intentional in doom?
        useAmmo(player, weapon);
        shootMissile(player, MapObjectIndex.MT_PLASMA);
    },

    [ActionIndex.A_BFGsound]: (player, weapon) => {
        player.map.game.playSound(SoundIndex.sfx_bfg, player);
    },
    [ActionIndex.A_FireBFG]: (player, weapon) => {
        useAmmo(player, weapon);
        shootMissile(player, MapObjectIndex.MT_BFG);
    },

    // This isn't really a "weapon" thing (the BFG spray comes frmm the missile) but because the trace is so
    // similar to firing a weapon, I'm leaving it here for now.
    [ActionIndex.A_BFGSpray]: (mobj, weapon) => {
        // shooter is the chaseTarget who fired this missile
        const tDir = new Vector3();
        const shooter = mobj.chaseTarget;
        const dir = mobj.direction;
        const aim = aimTrace(shooter, shooter.position, tDir, scanRange);
        for (let i = 0; i < 40; i++) {
            let angle = dir - QUARTER_PI + HALF_PI / 40 * i;

            // scan from the direction of the _missile_ but the position of the _shooter_ (!)
            // https://doomwiki.org/wiki/BFG9000
            tDir.set(
                Math.cos(angle) * scanRange,
                Math.sin(angle) * scanRange,
                0);
            const target = aim();
            if (!target.mobj) {
                continue;
            }

            const pos = target.mobj.position;
            mobj.map.spawn(MapObjectIndex.MT_EXTRABFG, pos.x, pos.y, pos.z + target.mobj.info.height * .5);

            let damage = 0;
            for (let j = 0; j < 15; j++) {
                damage += mobj.rng.int(1, 8);
            }
            target.mobj.damage(damage, shooter, shooter);
        }
    },
};

const _shotEuler = new Euler(0, 0, 0, 'ZXY');
class ShotTracer {
    private _lastTarget: MapObject;
    get lastTarget() { return this._lastTarget; }
    private _lastAngle: number;
    get lastAngle() { return this._lastAngle; }

    private traceNum = 0;
    private map: MapRuntime;
    private shooter: MapObject;
    private start = new Vector3();
    private direction = new Vector3();
    zAim(shooter: MapObject | PlayerMapObject, range: number) {
        this.shooter = shooter;
        this.map = shooter.map;
        this.start.copy(shooter.position);
        this.start.z += shooter.info.height * .5 + 8;
        let dir = shooter.direction;
        this.direction.set(
            Math.cos(dir) * range,
            Math.sin(dir) * range,
            0);

        const aim = aimTrace(shooter, this.start, this.direction, range);
        let target = aim();
        if (!target.mobj) {
            // try aiming slightly left to see if we hit a target
            dir = shooter.direction + Math.PI / 40;
            this.direction.x = Math.cos(dir) * range;
            this.direction.y = Math.sin(dir) * range;
            target = aim();
        }
        if (!target.mobj) {
            // try aiming slightly right to see if we hit a target
            dir = shooter.direction - Math.PI / 40;
            this.direction.x = Math.cos(dir) * range;
            this.direction.y = Math.sin(dir) * range;
            target = aim();
        }

        this._lastAngle = target.mobj ? dir : shooter.direction;
        this._lastTarget = target.mobj;
        if (shooter instanceof PlayerMapObject && !shooter.map.game.settings.zAimAssist.val) {
            // ignore all the tracing we did (except set last target for punch/saw) and simply use the camera angle
            return shooter.pitch;
        }
        return target.mobj ? target.slope : 0;
    }

    private fireRange = 0;
    private fireDamage = 0;
    private fireTrace: TraceParams = {
        start: this.start,
        move: this.direction,
        hitObject: hit => {
            const ignoreHit = (false
                || (hit.mobj === this.shooter) // can't shoot ourselves
                || !(hit.mobj.info.flags & MFFlags.MF_SHOOTABLE) // not shootable
                || (hit.mobj.position.z + hit.mobj.info.height < hit.point.z) // shoot over thing
                || (hit.mobj.position.z > hit.point.z) // shoot under thing
            )
            if (ignoreHit) {
                return true; // keep searching
            }

            const pos = this.bulletHitLocation(10, this.fireRange, hit.fraction);
            if (hit.mobj.info.flags & MFFlags.MF_NOBLOOD) {
                spawnPuff(this.shooter, pos);
            } else {
                this.spawnBlood(hit.mobj, pos, this.fireDamage);
            }
            hit.mobj.damage(this.fireDamage, this.shooter, this.shooter);
            return false;
        },
        hitLine: hit => {
            if (hit.line.special) {
                this.shooter.map.triggerSpecial(hit.line, this.shooter, 'G', hit.side);
            }

            if (!hit.line.left) {
                return this.hitWallOrSky(this.shooter, hit.line.right.sector, null, this.bulletHitLocation(4, this.fireRange, hit.fraction));
            }

            const front = (hit.side === -1 ? hit.line.right : hit.line.left).sector;
            const back = (hit.side === -1 ? hit.line.left : hit.line.right).sector;
            if (front.zCeil !== back.zCeil) {
                const wallBottom = Math.min(front.zCeil, back.zCeil);
                if (wallBottom < hit.point.z) {
                    return this.hitWallOrSky(this.shooter, front, back, this.bulletHitLocation(4, this.fireRange, hit.fraction));
                }
            }
            if (front.zFloor !== back.zFloor) {
                const wallTop = Math.max(front.zFloor, back.zFloor);
                if (wallTop > hit.point.z) {
                    return this.hitWallOrSky(this.shooter, front, back, this.bulletHitLocation(4, this.fireRange, hit.fraction));
                }
            }
            return true;
        },
        hitFlat: hit => {
            if (hitSkyFlat(hit)) {
                return false; // hit sky so don't spawn puff and don't keep searching, we're done.
            }
            const mobj = spawnPuff(this.shooter, this.bulletHitLocation(4, this.fireRange, hit.fraction));
            if (hit.flat === 'ceil') {
                // invert puff sprite when hitting ceiling
                mobj.info.flags |= MFFlags.InvertSpriteYOffset;
            }
            return false;
        }
    }
    // kind of like PTR_ShootTraverse from p_map.c
    fire(damage: number, angle: number, aimSlope: number, range: number) {
        // this scan function is almost the same as the one we use in zAim but it has a few differences:
        // 1) it spawns blood/puffs on impact
        // 2) it spawns nothing on impact with sky
        // 3) it has a longer range
        // 4) it does not impact aimSlope (it relies on it being set)
        // it's useful to have a separate aim and fire function because some weapons (notably the shotgun)
        // aim once and fire several bullets
        if (this.shooter && !this.shooter.map.game.settings.zAimAssist.val) {
            _shotEuler.set(0, -aimSlope, angle);
            this.direction.set(range, 0, 0).applyEuler(_shotEuler);
        } else {
            this.direction.set(
                Math.cos(angle) * range,
                Math.sin(angle) * range,
                aimSlope * range,
            );
        }
        this.fireDamage = damage;
        this.fireRange = range;
        this.shooter.map.data.traceRay(this.fireTrace);
    }

    private hitWallOrSky(shooter: MapObject, front: Sector, back: Sector, spot: Vector3) {
        if (hitSkyWall(spot.z, front, back)) {
            return false;
        }
        spawnPuff(shooter, spot);
    }

    private hitLocation = new Vector3();
    private bulletHitLocation(dist: number, range: number, frac: number) {
        const end = this.hitLocation.copy(this.start)
            // position the hit location little bit in front of the actual impact
            .addScaledVector(this.direction, frac - dist / range);
        if (range === attackRange && this.map.game.settings.shotTraceSeconds.val > 0) {
            this.map.tracers.push({
                id: this.traceNum++,
                start: this.start.clone(),
                end: end.clone(),
                ticks: store(this.map.game.settings.shotTraceSeconds.val * ticksPerSecond),
            });
            this.map.trev.update(v => v + 1);
        }
        return end;
    }

    private spawnBlood(source: MapObject, pos: Vector3, damage: number) {
        const mobj = source.map.spawn(MapObjectIndex.MT_BLOOD,
            pos.x, pos.y, pos.z + source.rng.real2() * puffNoiseVariation);
        mobj.setState(mobj.info.spawnstate, -source.rng.int(0, 2));

        if (damage <= 12 && damage >= 9) {
            mobj.setState(StateIndex.S_BLOOD2);
        } else if (damage < 9) {
            mobj.setState(StateIndex.S_BLOOD3);
        }
    }
}
export const shotTracer = new ShotTracer();

interface AimResult {
    mobj: MapObject;
    slope: number;
}

// kind of like PTR_AimTraverse from p_map.c
const aimTrace = (() => {
    let slopeTop = 0;
    let slopeBottom = 0;
    const traceResult: AimResult = { mobj: null, slope: 0 };

    let shooter: MapObject = null;
    let range = 0;
    const traceParams: TraceParams = {
        start: null,
        move: null,
        hitObject: hit => {
            if (hit.mobj === shooter) {
                return true; // can't shoot ourselves
            }
            if (!(hit.mobj.info.flags & MFFlags.MF_SHOOTABLE)) {
                return true; // not shootable
            }

            const dist = range * hit.fraction;
            let thingSlopeTop = (hit.mobj.position.z + hit.mobj.info.height - traceParams.start.z) / dist;
            if (thingSlopeTop < slopeBottom) {
                return true; // shoot over
            }

            let thingSlopeBottom = (hit.mobj.position.z - traceParams.start.z) / dist;
            if (thingSlopeBottom > slopeTop) {
                return true; // shoot under
            }

            thingSlopeTop = Math.min(thingSlopeTop, slopeTop);
            thingSlopeBottom = Math.max(thingSlopeBottom, slopeBottom);
            traceResult.slope = (thingSlopeTop + thingSlopeBottom) * .5;
            traceResult.mobj = hit.mobj;
            return false;
        },
        hitLine: hit => {
            const oneSided = !Boolean(hit.line.left);
            if (oneSided) {
                return false; // single-sided linedefs always stop trace
            }

            const front = hit.side === -1 ? hit.line.right : hit.line.left;
            const back = hit.side === -1 ? hit.line.left : hit.line.right;
            const openTop = Math.min(front.sector.zCeil, back.sector.zCeil);
            const openBottom = Math.max(front.sector.zFloor, back.sector.zFloor);
            if (openBottom >= openTop) {
                // it's a two-sided line but there is no opening (eg. a closed door or a raised platform)
                return false;
            }

            const dist = range * hit.fraction;
            if (front.sector.zCeil !== back.sector.zCeil) {
                slopeTop = Math.min(slopeTop, (openTop - traceParams.start.z) / dist);
            }
            if (front.sector.zFloor !== back.sector.zFloor) {
                slopeBottom = Math.max(slopeBottom, (openBottom - traceParams.start.z) / dist);
            }
            if (slopeTop <= slopeBottom) {
                // we've run out of gap between top and bottom of walls
                return false;
            }
            return true;
        },
    };

    const tracer = () => {
        // reset trace
        traceResult.mobj = null;
        traceResult.slope = 0;
        slopeTop = 100 / 160
        slopeBottom = -100 / 160;

        shooter.map.data.traceRay(traceParams);
        return traceResult;
    };

    return (_shooter: MapObject, start: Vector3, direction: Vector3, _range: number) => {
        range = _range;
        shooter = _shooter;
        traceParams.start = start;
        traceParams.move = direction;
        return tracer;
    }
})();

type PlayerMissileType = MapObjectIndex.MT_PLASMA | MapObjectIndex.MT_ROCKET | MapObjectIndex.MT_BFG;
function shootMissile(shooter: MapObject, type: PlayerMissileType) {
    const pos = shooter.position;
    const slope = shotTracer.zAim(shooter, scanRange);

    const missile = shooter.map.spawn(type, pos.x, pos.y, pos.z + 32, shotTracer.lastAngle);
    // DOOM's physics are a little messed up here. XY-speed is independent of Z-speed which means missiles actually travel faster
    // when they are on a steeper up or down slope. Same for monster missiles too!
    missile.velocity.set(
        Math.cos(shotTracer.lastAngle) * missile.info.speed,
        Math.sin(shotTracer.lastAngle) * missile.info.speed,
        slope * missile.info.speed,
    );
    if (!shooter.map.game.settings.zAimAssist.val) {
        const vel = missile.velocity.length();
        _shotEuler.set(0, -slope, shotTracer.lastAngle);
        missile.velocity.set(vel, 0, 0).applyEuler(_shotEuler);
    }
    missile.map.game.playSound(missile.info.seesound, shooter);
    // this is kind of an abuse of "chaseTarget" but missles won't ever chase anyone anyway. It's used when a missile
    // hits a target to know who fired it.
    missile.chaseTarget = shooter;
    checkMissileSpawn(missile);
}

export function checkMissileSpawn(missile: MapObject) {
    // move missile just a little bit after spawning otherwise the missile explosion
    // won't always be visible (similar to DOOM's P_CheckMissileSpawn)
    missile.position.addScaledVector(missile.velocity, .5);
    missileMover(missile, zeroVec);
}

function useAmmo(player: PlayerMapObject, weapon: PlayerWeapon) {
    player.inventory.update(inv => {
        inv.ammo[weapon.ammoType].amount = Math.max(inv.ammo[weapon.ammoType].amount - weapon.ammoPerShot, 0);
        return inv;
    });
}

export function spawnPuff(parent: MapObject, spot: Vector3) {
    const zNoise = parent.rng.real2() * puffNoiseVariation;
    const mobj = parent.map.spawn(MapObjectIndex.MT_PUFF, spot.x, spot.y, spot.z + zNoise);
    mobj.setState(mobj.info.spawnstate, -parent.rng.int(0, 2));
    return mobj;
}