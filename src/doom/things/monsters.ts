import type { ThingType } from '.';
import { ActionIndex, MFFlags, MapObjectIndex, SoundIndex, StateIndex, states } from '../doom-things-info';
import { angleBetween, xyDistanceBetween, type MapObject, maxStepSize, maxFloatSpeed } from '../map-object';
import { EIGHTH_PI, HALF_PI, QUARTER_PI, ToRadians, normalizeAngle, signedLineDistance, xyDistSqr } from '../math';
import { hasLineOfSight, radiusDamage } from './obstacles';
import { Vector3 } from 'three';
import { hittableThing, zeroVec, type LineTraceHit, type TraceHit, type Sector, vecFromMovement } from '../map-data';
import { attackRange, meleeRange, meleeRangeSqr, shotTracer, spawnPuff } from './weapons';
import { exitLevel, telefragTargets, teleportReorientMove } from '../specials';

export const monsters: ThingType[] = [
    { type: 7, class: 'M', description: 'Spiderdemon' },
    { type: 9, class: 'M', description: 'Shotgun guy' },
    { type: 16, class: 'M', description: 'Cyberdemon' },
    { type: 58, class: 'M', description: 'Spectre' },
    { type: 64, class: 'M', description: 'Arch-vile' },
    { type: 65, class: 'M', description: 'Heavy weapon dude' },
    { type: 66, class: 'M', description: 'Revenant' },
    { type: 67, class: 'M', description: 'Mancubus' },
    { type: 68, class: 'M', description: 'Arachnotron' },
    { type: 69, class: 'M', description: 'Hell knight' },
    { type: 71, class: 'M', description: 'Pain elemental' },
    { type: 72, class: 'M', description: 'Commander Keen' },
    { type: 84, class: 'M', description: 'Wolfenstein SS' },
    { type: 3001, class: 'M', description: 'Imp' },
    { type: 3002, class: 'M', description: 'Demon' },
    { type: 3003, class: 'M', description: 'Baron of Hell' },
    { type: 3004, class: 'M', description: 'Zombieman' },
    { type: 3005, class: 'M', description: 'Cacodemon' },
    { type: 3006, class: 'M', description: 'Lost soul' },
];

export enum MoveDirection {
    East = 0,
    NorthEast = QUARTER_PI,
    North = HALF_PI,
    NorthWest = HALF_PI + QUARTER_PI,
    West = Math.PI,
    SouthWest = Math.PI + QUARTER_PI,
    South = Math.PI + HALF_PI,
    SouthEast = Math.PI + HALF_PI + QUARTER_PI,
    None = -1,
}

const smallDeathSounds = [SoundIndex.sfx_podth1, SoundIndex.sfx_podth2, SoundIndex.sfx_podth3];
const bigDeathSounds = [SoundIndex.sfx_bgdth1, SoundIndex.sfx_bgdth2];

const smallSeeYouSounds = [SoundIndex.sfx_posit1, SoundIndex.sfx_posit2, SoundIndex.sfx_posit3];
const bigSeeYouSounds = [SoundIndex.sfx_bgsit1, SoundIndex.sfx_bgsit2];

const mancubusMissileSpread = HALF_PI / 8;
const halfMancubusMissileSpread = mancubusMissileSpread * .5;

type MonsterAction = (mobj: MapObject) => void;
type ActionMap = { [key: number]: MonsterAction };

let brainSpitToggle = false;
let currentBrainTarget = 0;
let brainTargets: MapObject[] = [];
const brainExplosionVelocity = 255 * 512 / (1 << 16);
const doom2BossActions: ActionMap = {
	[ActionIndex.A_BrainDie]: mobj => {
        exitLevel(mobj, 'normal');
    },
	[ActionIndex.A_BrainPain]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_bospn);
    },
	[ActionIndex.A_BrainScream]: mobj => {
        for (let x = mobj.position.x - 196; x < mobj.position.x + 320; x += 8) {
            const explode = mobj.map.spawn(MapObjectIndex.MT_ROCKET,
                x, mobj.position.y - 320, 128 + mobj.rng.int(0, 510));
            explode.velocity.z = mobj.rng.real() * brainExplosionVelocity;
            explode.setState(StateIndex.S_BRAINEXPLODE1, -mobj.rng.int(0, 7));
        }
        mobj.map.game.playSound(SoundIndex.sfx_bosdth);
    },
    [ActionIndex.A_BrainExplode]: mobj => {
        const explode = mobj.map.spawn(MapObjectIndex.MT_ROCKET,
            mobj.position.x + 2048 * mobj.rng.real2(),
            mobj.position.y,
            128 + mobj.rng.int(0, 510));
        explode.velocity.z = mobj.rng.real() * brainExplosionVelocity;
        explode.setState(StateIndex.S_BRAINEXPLODE1, -mobj.rng.int(0, 7));
    },
	[ActionIndex.A_BrainAwake]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_bossit);
        // find all brain targets (ideally we could attach this to the map but I guess it's okay to use a global variable)
        currentBrainTarget = 0;
        brainTargets = mobj.map.objs.filter(mo => mo.type === MapObjectIndex.MT_BOSSTARGET);
    },
	[ActionIndex.A_BrainSpit]: mobj => {
        brainSpitToggle = !brainSpitToggle;
        if (mobj.map.game.skill < 3 && !brainSpitToggle) {
            return;
        }

        const target = brainTargets[currentBrainTarget];
        currentBrainTarget = (currentBrainTarget + 1) % brainTargets.length;

        const missile = shootMissile(mobj, target, MapObjectIndex.MT_SPAWNSHOT);
        missile.chaseTarget = target;
        missile.reactiontime = Math.floor((target.position.y - mobj.position.y) / missile.velocity.y / states[missile.info.spawnstate].tics);
        mobj.map.game.playSound(SoundIndex.sfx_bospit);
    },
	[ActionIndex.A_SpawnSound]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_boscub, mobj);
        allActions[ActionIndex.A_SpawnFly](mobj);
    },
	[ActionIndex.A_SpawnFly]: mobj => {
        mobj.reactiontime -= 1;
        if (mobj.reactiontime) {
            return;	// still flying
        }

        const target = mobj.chaseTarget;
        const tpos = target.position;

        // choose monster type (see https://doomwiki.org/wiki/Monster_spawner)
        const chance = mobj.rng.real() * 256;
        const type =
            chance < 50 ? MapObjectIndex.MT_TROOP :
            chance < 90 ? MapObjectIndex.MT_SERGEANT :
            chance < 120 ? MapObjectIndex.MT_SHADOWS :
            chance < 130 ? MapObjectIndex.MT_PAIN :
            chance < 160 ? MapObjectIndex.MT_HEAD :
            chance < 162 ? MapObjectIndex.MT_VILE :
            chance < 172 ? MapObjectIndex.MT_UNDEAD :
            chance < 192 ? MapObjectIndex.MT_BABY :
            chance < 222 ? MapObjectIndex.MT_FATSO :
            chance < 246 ? MapObjectIndex.MT_KNIGHT :
            MapObjectIndex.MT_BRUISER;
        const monster = mobj.map.spawn(type, tpos.x, tpos.y, tpos.z);
        monster.chaseTarget = findPlayerTarget(monster, true);
        if (monster.chaseTarget) {
            monster.setState(monster.info.seestate);
        }
        // call teleport to telefrag anything in the way
        teleportReorientMove(monster, target);
        telefragTargets(monster);

        // teleport flame
        const fog = mobj.map.spawn(MapObjectIndex.MT_SPAWNFIRE, tpos.x, tpos.y, tpos.z);
        mobj.map.game.playSound(SoundIndex.sfx_telept, fog);
        // remove ourself
        mobj.map.destroy(mobj);
    },
};

const archvileActions: ActionMap = {
    [ActionIndex.A_VileChase]: mobj => {
        // find corpse to resurrect
        if (mobj.movedir !== MoveDirection.None) {
            let corpseMobj: MapObject;
            _moveVec.copy(_directionTable[mobj.movedir]).multiplyScalar(mobj.info.speed);
            mobj.map.data.traceMove({
                start: mobj.position,
                move: _moveVec,
                radius: mobj.info.radius,
                height: mobj.info.height,
                hitObject: hit => {
                    const foundCorpse = ('mobj' in hit)
                        // TODO: Doom also check mobj.state.ticks, should we?
                        && (hit.mobj.info.flags & MFFlags.MF_CORPSE)
                        && hit.mobj.info.raisestate !== StateIndex.S_NULL
                        // don't resurrect something we are already touching otherwise we get stuck
                        && hit.fraction > 0
                        // mobj.kill() sets height to 1/4
                        && (hit.mobj.zCeil - hit.mobj.zFloor) >= (hit.mobj.info.height * 4)
                    if (foundCorpse) {
                        corpseMobj = hit.mobj;
                        return false;
                    }
                    return true;
                },
            });

            if (corpseMobj) {
                faceTarget(mobj, corpseMobj);
                mobj.setState(StateIndex.S_VILE_HEAL1);
                mobj.map.game.playSound(SoundIndex.sfx_slop, corpseMobj);

                corpseMobj.resurrect();
                corpseMobj.chaseTarget = mobj.chaseTarget;
            }
        }
        allActions[ActionIndex.A_Chase](mobj);
    },
	[ActionIndex.A_VileStart]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_vilatk, mobj);
    },
	[ActionIndex.A_VileTarget]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);

        const tpos = mobj.chaseTarget.position;
        const fire = mobj.map.spawn(MapObjectIndex.MT_FIRE, tpos.x, tpos.y, tpos.z);
        mobj.tracerTarget = fire;
        fire.chaseTarget = mobj;
        fire.tracerTarget = mobj.chaseTarget;
        allActions[ActionIndex.A_Fire](fire);
    },
	[ActionIndex.A_VileAttack]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);

        if (!hasLineOfSight(mobj, mobj.chaseTarget)) {
            return;
        }
        mobj.map.game.playSound(SoundIndex.sfx_barexp, mobj);
        mobj.chaseTarget.damage(20, mobj, mobj);
        mobj.chaseTarget.thrust(0, 0, 1000 / mobj.chaseTarget.info.mass);

        const fire = mobj.tracerTarget;
        if (!fire) {
            return;
        }
        positionVileFire(fire, mobj.tracerTarget);
        radiusDamage(70, fire, mobj);
    },
	[ActionIndex.A_StartFire]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_flamst, mobj);
        allActions[ActionIndex.A_Fire](mobj);
    },
	[ActionIndex.A_FireCrackle]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_flame, mobj);
        allActions[ActionIndex.A_Fire](mobj);
    },
	[ActionIndex.A_Fire]: mobj => {
        if (!mobj.tracerTarget) {
            return;
        }
        // make sure archvile (mobj.chaseTarget) can still see the enemeny (mobj.tracerTarget)
        if (!hasLineOfSight(mobj.chaseTarget, mobj.tracerTarget)) {
            return;
        }
        positionVileFire(mobj, mobj.tracerTarget);
    },
}

function positionVileFire(fire: MapObject, target: MapObject) {
    const targetPos = target.position;
    const targetDir = target.direction;
    fire.position.set(
        targetPos.x + 24 * Math.cos(targetDir),
        targetPos.y + 24 * Math.sin(targetDir),
        targetPos.z
    );
    fire.positionChanged();
}

let soundPropagateCount = 1;
export function propagateSound(emitter: MapObject) {
    propagateSoundRecursive(emitter, soundPropagateCount++, emitter.sector.val);
}

function propagateSoundRecursive(emitter: MapObject, count: number, sector: Sector, depth = 0) {
    for (const seg of sector.portalSegs) {
        const sector = (seg.direction ? seg.linedef.right : seg.linedef.left).sector;
        // already visited sector
        if (sector.soundC === count) {
            continue;
        }
        sector.soundC = count;

        const gap = Math.min(seg.linedef.left.sector.zCeil, seg.linedef.right.sector.zCeil)
            - Math.max(seg.linedef.left.sector.zFloor, seg.linedef.right.sector.zFloor);
        if (gap <= 0) {
            continue;
        }
        sector.soundTarget = emitter;

        // Sound block doesn't work as I'd expect. See Doom2 MAP01:
        // https://doomwiki.org/wiki/Sound_propagation and https://www.doomworld.com/forum/topic/109773-block-sound-not-working/
        if (seg.linedef.flags & 0x0040 && depth > 0) {
            continue;
        }
        propagateSoundRecursive(emitter, count, sector, depth + 1);
    }
}

// monsters can only open certain kinds of doors
// As usual, doom wiki is very helpful https://doomwiki.org/wiki/Monster_behavior
const doorTypes = [1, 32, 33, 34];
const moveSpecials: LineTraceHit[] = [];
const activeSoundChance = 3 / 255;
export const monsterMoveActions: ActionMap = {
    [ActionIndex.A_Look]: mobj => {
        mobj.chaseThreshold = 0;

        const soundTarget = mobj.sector.val.soundTarget;
        if (soundTarget && soundTarget.info.flags & MFFlags.MF_SHOOTABLE) {
            mobj.chaseTarget = soundTarget;
            if (mobj.info.flags & MFFlags.MF_AMBUSH && !hasLineOfSight(mobj, soundTarget)) {
                return;
            }
        }

        mobj.chaseTarget = mobj.chaseTarget ?? findPlayerTarget(mobj);
        if (!mobj.chaseTarget) {
            return;
        }

        const sound =
            smallSeeYouSounds.includes(mobj.info.seesound) ? mobj.rng.choice(smallSeeYouSounds) :
            bigSeeYouSounds.includes(mobj.info.seesound) ? mobj.rng.choice(bigSeeYouSounds) :
            mobj.info.seesound;
        const soundActor = mobj.type === MapObjectIndex.MT_SPIDER || mobj.type === MapObjectIndex.MT_CYBORG ? null : mobj;
        mobj.map.game.playSound(sound, soundActor);
        mobj.setState(mobj.info.seestate);
    },
    [ActionIndex.A_Chase]: mobj => {
        const game = mobj.map.game;
        const fastMonsters = game.skill === 5 || game.settings.monsterAI.val === 'fast';

        mobj.reactiontime = mobj.reactiontime > 0 ? mobj.reactiontime - 1 : 0;

        if (mobj.chaseThreshold) {
            if (!mobj.chaseTarget || mobj.chaseTarget.isDead) {
                mobj.chaseThreshold = 0;
            } else {
                mobj.chaseThreshold -= 1;
            }
        }

        // make a small turns when mobj.direction !== mobj.movedir
        if (mobj.movedir !== MoveDirection.None) {
            const diff = normalizeAngle(mobj.direction - mobj.movedir) - Math.PI;
            if (Math.abs(diff) > EIGHTH_PI) { // only update if we're off by large-ish amount
                mobj.direction += ((diff < 0) ? QUARTER_PI : -QUARTER_PI);
            }
        }

        // no target or target is not shootable (dead)? find a new one
        if (!mobj.chaseTarget || !(mobj.chaseTarget.info.flags & MFFlags.MF_SHOOTABLE)) {
            // no target or target is no longer shootable (dead?) so find a new target
            mobj.chaseTarget = findPlayerTarget(mobj, true);
            if (!mobj.chaseTarget) {
                // no target? go back to default state
                mobj.setState(mobj.info.spawnstate);
                mobj.movedir = MoveDirection.None;
            }
            return;
        }

        // do not attack twice in a row
        if (mobj.info.flags & MFFlags.MF_JUSTATTACKED) {
            mobj.info.flags &= ~MFFlags.MF_JUSTATTACKED;
            if (!fastMonsters) {
                newChaseDir(mobj, mobj.chaseTarget);
            }
            return;
        }

        // melee attack
        if (mobj.info.meleestate && canMeleeAttack(mobj, mobj.chaseTarget)) {
            mobj.map.game.playSound(mobj.info.attacksound, mobj);
            mobj.setState(mobj.info.meleestate);
            mobj.movedir = MoveDirection.None;
            return;
        }

        // missile attack
        const canShoot = mobj.info.missilestate && (fastMonsters || !mobj.movecount) && canShootAttack(mobj, mobj.chaseTarget);
        if (canShoot) {
            mobj.setState(mobj.info.missilestate);
            mobj.movedir = MoveDirection.None;
            mobj.info.flags |= MFFlags.MF_JUSTATTACKED;
            return;
        }

        // in net games, try to find another target when we can no longer see the current one
        if (game.mode !== 'solo' && !mobj.chaseThreshold && !hasLineOfSight(mobj, mobj.chaseTarget)) {
            const newTarget = findPlayerTarget(mobj, true);
            if (newTarget) {
                mobj.chaseTarget = newTarget;
                return;	// got a new target
            }
        }

        // sometimes play "active" sound
        if (mobj.rng.real() < activeSoundChance) {
            mobj.map.game.playSound(mobj.info.activesound, mobj);
        }

        // continue chase or find new chase direction
        mobj.movecount -= 1;
        moveSpecials.length = 0;
        if (mobj.movecount < 0 || !canMove(mobj, mobj.movedir, moveSpecials)) {
            newChaseDir(mobj, mobj.chaseTarget);
        }

        if (!(mobj.info.flags & MFFlags.MF_INFLOAT) && canMove(mobj, mobj.movedir)) {
            // NOTE: _moveVec is already set correctly by canMove()
            mobj.position.add(_moveVec);
            mobj.positionChanged();
        }
        // only trigger specials once per move otherwise we may open/close doors rapidly which looks silly
        moveSpecials.forEach(hit =>
            mobj.map.triggerSpecial(hit.line, mobj, doorTypes.includes(hit.line.special) ? 'S' : 'W', hit.side));
    },
    [ActionIndex.A_FaceTarget]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        faceTarget(mobj, mobj.chaseTarget);
    },
}

function faceTarget(mobj: MapObject, target: MapObject) {
    mobj.info.flags &= ~MFFlags.MF_AMBUSH;
    let angle = angleBetween(mobj, target);
    if (target.info.flags & MFFlags.MF_SHADOW) {
        angle += mobj.rng.angleNoise(21);
    }
    mobj.direction = angle;
}

const revenantTracerAngleAdjustment = 384 * 360 / 8192 * ToRadians;
const revenantTracerZAdjust = 1 / 8;
const chaingunTargetCheckChance = 40 / 255;
const spiderTargetCheckChance = 10 / 255;

export const monsterAttackActions: ActionMap = {
    ...archvileActions,

    // Movement actions
    // Attack actions
    // TODO: it would be a fun exercise to write some unit tests for these and then see if these could be
    // written in a functional way by combining smaller functions
    [ActionIndex.A_PosAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        mobj.map.game.playSound(SoundIndex.sfx_pistol, mobj);

        const slope = shotTracer.zAim(mobj, attackRange);
        const angle = mobj.direction + mobj.rng.angleNoise(20);
        const damage = 3 * mobj.rng.int(1, 5);
        shotTracer.fire(mobj, damage, angle, slope, attackRange);
    },
	[ActionIndex.A_SPosAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        mobj.map.game.playSound(SoundIndex.sfx_shotgn, mobj);

        const slope = shotTracer.zAim(mobj, attackRange);
        for (let i = 0; i < 3; i++) {
            const angle = mobj.direction + mobj.rng.angleNoise(20);
            const damage = 3 * mobj.rng.int(1, 5);
            shotTracer.fire(mobj, damage, angle, slope, attackRange);
        }
    },
    [ActionIndex.A_SkelWhoosh]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        mobj.map.game.playSound(SoundIndex.sfx_skeswg, mobj);
    },
	[ActionIndex.A_SkelFist]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        if (canMeleeAttack(mobj, mobj.chaseTarget)) {
            const damage = 6 * mobj.rng.int(1, 10);
            mobj.chaseTarget.damage(damage, mobj, mobj);
            mobj.map.game.playSound(SoundIndex.sfx_skepch, mobj);
        }
    },
	[ActionIndex.A_SkelMissile]: mobj => {
        allActions[ActionIndex.A_FaceTarget](mobj);
        const tracer = shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_TRACER);
        tracer.tracerTarget = mobj.chaseTarget;
        // revenant missiles are spawned a little higher than most things so adjust the z and re-launch the projectile
        tracer.position.setZ(tracer.position.z + 16);
        tracer.positionChanged();
        launchMapObject(tracer, mobj.chaseTarget, shotZOffset, tracer.info.speed);
    },
	[ActionIndex.A_CPosAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        mobj.map.game.playSound(SoundIndex.sfx_shotgn, mobj);

        const angle = mobj.direction + mobj.rng.angleNoise(20);
        const damage = 3 * mobj.rng.int(1, 5);
        const slope = shotTracer.zAim(mobj, attackRange);
        shotTracer.fire(mobj, damage, angle, slope, attackRange);
    },
	[ActionIndex.A_CPosRefire]: mobj => {
        allActions[ActionIndex.A_FaceTarget](mobj);
        if (mobj.rng.real() < chaingunTargetCheckChance) {
            return; // only check for active target occasionally (about 16% of the time)
        }
        const stopShooting = !mobj.chaseTarget || mobj.chaseTarget.isDead || !hasLineOfSight(mobj, mobj.chaseTarget)
        if (stopShooting) {
            mobj.setState(mobj.info.seestate);
        }
    },
	[ActionIndex.A_TroopAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);

        if (canMeleeAttack(mobj, mobj.chaseTarget)) {
            const damage = 3 * mobj.rng.int(1, 8);
            mobj.chaseTarget.damage(damage, mobj, mobj);
            mobj.map.game.playSound(SoundIndex.sfx_claw, mobj);
            return;
        }
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_TROOPSHOT);
    },
	[ActionIndex.A_SargAttack]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);

        if (canMeleeAttack(mobj, mobj.chaseTarget)) {
            const damage = 4 * mobj.rng.int(1, 10);
            mobj.chaseTarget.damage(damage, mobj, mobj);
        }
    },
	[ActionIndex.A_HeadAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);

        if (canMeleeAttack(mobj, mobj.chaseTarget)) {
            const damage = 10 * mobj.rng.int(1, 6);
            mobj.chaseTarget.damage(damage, mobj, mobj);
            return;
        }
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_HEADSHOT);
    },
	[ActionIndex.A_BruisAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);

        if (canMeleeAttack(mobj, mobj.chaseTarget)) {
            const damage = 10 * mobj.rng.int(1, 8);
            mobj.chaseTarget.damage(damage, mobj, mobj);
            mobj.map.game.playSound(SoundIndex.sfx_claw, mobj);
            return;
        }
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_BRUISERSHOT);
    },
	[ActionIndex.A_SkullAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);

        mobj.info.flags |= MFFlags.MF_SKULLFLY;
        mobj.map.game.playSound(mobj.info.attacksound, mobj);
        launchMapObject(mobj, mobj.chaseTarget, mobj.chaseTarget.info.height * .5, 20);
    },
    [ActionIndex.A_FatRaise]: mobj => {
        allActions[ActionIndex.A_FaceTarget](mobj);
        mobj.map.game.playSound(SoundIndex.sfx_manatk, mobj);
    },
	[ActionIndex.A_FatAttack1]: mobj => {
        allActions[ActionIndex.A_FaceTarget](mobj);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_FATSHOT);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_FATSHOT, mobj.direction + mancubusMissileSpread);
    },
	[ActionIndex.A_FatAttack2]: mobj => {
        allActions[ActionIndex.A_FaceTarget](mobj);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_FATSHOT);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_FATSHOT, mobj.direction - mancubusMissileSpread);
    },
	[ActionIndex.A_FatAttack3]: mobj => {
        allActions[ActionIndex.A_FaceTarget](mobj);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_FATSHOT, mobj.direction - halfMancubusMissileSpread);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_FATSHOT, mobj.direction + halfMancubusMissileSpread);
    },
	[ActionIndex.A_SpidRefire]: mobj => {
        allActions[ActionIndex.A_FaceTarget](mobj);
        if (mobj.rng.real() < spiderTargetCheckChance) {
            return; // only check for active target occasionally (about 4% of the time)
        }
        const stopShooting = !mobj.chaseTarget || mobj.chaseTarget.isDead || !hasLineOfSight(mobj, mobj.chaseTarget)
        if (stopShooting) {
            mobj.setState(mobj.info.seestate);
        }
    },
	[ActionIndex.A_BspiAttack]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_ARACHPLAZ);
    },
	[ActionIndex.A_CyberAttack]: mobj => {
        if (!mobj.chaseTarget) {
	        return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        shootMissile(mobj, mobj.chaseTarget, MapObjectIndex.MT_ROCKET);
    },
	[ActionIndex.A_PainAttack]: mobj => {
        if (!mobj.chaseTarget) {
            return;
        }
        allActions[ActionIndex.A_FaceTarget](mobj);
        spawnLostSoul(mobj, mobj.direction);
    },

    // revenant missiles (tracking and smoke)
    [ActionIndex.A_Tracer]: missile => {
        // I never noticed that some revenant missiles do not emit smoke and do not track the player. Wow!
        // This condition creates a really subtle behaviour. https://zdoom.org/wiki/A_Tracer
        if (missile.map.game.time.tick.val & 3) {
            return;
        }

        // decorations like puff and smoke
        spawnPuff(missile, missile.position);
        const smoke = missile.map.spawn(MapObjectIndex.MT_SMOKE,
                missile.position.x - missile.velocity.x,
                missile.position.y - missile.velocity.y,
                missile.position.z);
        smoke.velocity.z = 1;
        smoke.setState(smoke.info.spawnstate, -missile.rng.int(0, 2));

        const target = missile.tracerTarget;
        if (!target || target.isDead) {
            return;
        }

        // adjust direction
        const angle = angleBetween(missile, target);
        let missileAngle = missile.direction;
        if (normalizeAngle(angle - missileAngle) > Math.PI) {
            missileAngle += revenantTracerAngleAdjustment;
            missile.direction = normalizeAngle(angle - missileAngle) > Math.PI ? missileAngle : angle;
        } else {
            missileAngle -= revenantTracerAngleAdjustment;
            missile.direction = normalizeAngle(angle - missileAngle) < Math.PI ? missileAngle : angle;
        }
        missile.velocity.x = Math.cos(missile.direction) * missile.info.speed;
        missile.velocity.y = Math.sin(missile.direction) * missile.info.speed;

        const dist = xyDistanceBetween(missile, target);
        const slope = ((target.position.z + 40) - missile.position.z) / dist * missile.info.speed;
        missile.velocity.z += slope < missile.velocity.z ? -revenantTracerZAdjust : revenantTracerZAdjust;
    },
}

export const monsterActions: ActionMap = {
    ...doom2BossActions,

    // Death Actions
	[ActionIndex.A_PainDie]: mobj => {
        allActions[ActionIndex.A_Fall](mobj);
        spawnLostSoul(mobj, mobj.direction + HALF_PI);
        spawnLostSoul(mobj, mobj.direction + Math.PI);
        spawnLostSoul(mobj, mobj.direction - HALF_PI);
    },
    [ActionIndex.A_Scream]: mobj => {
        const sound = smallDeathSounds.includes(mobj.info.deathsound) ? mobj.rng.choice(smallDeathSounds) :
            bigDeathSounds.includes(mobj.info.deathsound) ? mobj.rng.choice(bigDeathSounds) :
            mobj.info.deathsound;
        // don't set location for bosses so the sound plays at full volume
        const location = (mobj.type === MapObjectIndex.MT_SPIDER || mobj.type === MapObjectIndex.MT_CYBORG) ? null : mobj;
        mobj.map.game.playSound(sound, location);
    },
    // These two are related to sector tags 666 and 667
	[ActionIndex.A_KeenDie]: mobj => {
        allActions[ActionIndex.A_Fall](mobj);
        if (anyMonstersOfSameTypeAlive(mobj)) {
            return;
        }
        const fakeLine: any = { tag: 666, special: 2 };
        mobj.map.triggerSpecial(fakeLine, mobj.map.player, 'W');
    },
	[ActionIndex.A_BossDeath]: mobj => {
        let fakeLine: any = null;

        if (mobj.map.name === 'MAP07' && (mobj.type === MapObjectIndex.MT_FATSO || mobj.type === MapObjectIndex.MT_BABY)) {
            fakeLine =
                (mobj.type === MapObjectIndex.MT_FATSO) ? { tag: 666, special: 38 } :
                (mobj.type === MapObjectIndex.MT_BABY) ? { tag: 667, special: 30 } :
                null; // <-- we should never get here
        }
        if (mobj.map.name === 'E1M8' && mobj.type === MapObjectIndex.MT_BRUISER) {
            fakeLine = { tag: 666, special: 38 };
        }
        if (mobj.map.name === 'E2M8' && mobj.type === MapObjectIndex.MT_CYBORG) {
            fakeLine = { special: 52 };
        }
        if (mobj.map.name === 'E3M8' && mobj.type === MapObjectIndex.MT_SPIDER) {
            fakeLine = { special: 52 };
        }
        if (mobj.map.name === 'E4M6' && mobj.type === MapObjectIndex.MT_CYBORG) {
            fakeLine = { tag: 666, special: 109 };
        }
        if (mobj.map.name === 'E4M8' && mobj.type === MapObjectIndex.MT_SPIDER) {
            fakeLine = { tag: 666, special: 38 };
        }

        // only tigger when:
        // (1) above code needs to have set the line
        // (2) at least one player alive
        // (3) all monster of same type as mobj are dead
        const trigger = true
            && fakeLine
            && anyMonstersOfSameTypeAlive(mobj.map.player)
            && !anyMonstersOfSameTypeAlive(mobj);
        if (trigger) {
            mobj.map.triggerSpecial(fakeLine, mobj.map.player, 'W');
        }
    },

    // Mostly about playing a sound
    [ActionIndex.A_Metal]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_metal, mobj);
        allActions[ActionIndex.A_Chase](mobj);
    },
	[ActionIndex.A_BabyMetal]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_bspwlk, mobj);
        allActions[ActionIndex.A_Chase](mobj);
    },
	[ActionIndex.A_Hoof]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_hoof, mobj);
        allActions[ActionIndex.A_Chase](mobj);
    },
    [ActionIndex.A_Pain]: mobj => {
        mobj.map.game.playSound(mobj.info.painsound, mobj);
    },
	[ActionIndex.A_Fall]: mobj => {
        mobj.info.flags &= ~MFFlags.MF_SOLID;
    },
	[ActionIndex.A_XScream]: mobj => {
        mobj.map.game.playSound(SoundIndex.sfx_slop, mobj);
    },
    // player only so maybe it could be moved to a player specific place?
	[ActionIndex.A_PlayerScream]: player => {
        const sound = player.health.val < -50 && !player.map.game.episodic
            ? SoundIndex.sfx_pdiehi : SoundIndex.sfx_pldeth;
        player.map.game.playSound(sound, player);
    },
};

const anyMonstersOfSameTypeAlive = (mobj: MapObject) =>
    mobj.map.objs.filter(mo => mo.type === mobj.type).some(mo => !mo.isDead);

export const monsterAiActions = { ...monsterMoveActions, ...monsterAttackActions };
const allActions = { ...monsterActions, ...monsterAiActions, ...doom2BossActions, ...archvileActions };

// We get a 30-40% improvement in findPlayerTarget from this lookup table
const _directionTable = Object.fromEntries([
    MoveDirection.North, MoveDirection.NorthEast, MoveDirection.East, MoveDirection.SouthEast,
    MoveDirection.South, MoveDirection.SouthWest, MoveDirection.West, MoveDirection.NorthWest,
].map(d => [d, new Vector3(Math.cos(d), Math.sin(d), 0)]));
const _findPlayerVec1 = new Vector3();
const _findPlayerVec2 = new Vector3();
function findPlayerTarget(mobj: MapObject, allAround = false) {
    for (let i = 0; i < mobj.map.players.length; i++) {
        const player = mobj.map.players[i];
        if (player.isDead) {
            continue;
        }

        const distSqr = xyDistSqr(mobj.position, player.position);
        if (distSqr < meleeRangeSqr) {
            return player;
        }

        _findPlayerVec1.set(player.position.x - mobj.position.x, player.position.y - mobj.position.y, 0);
        const v2 = _directionTable[mobj.direction] ??
            _findPlayerVec2.set(Math.cos(mobj.direction), Math.sin(mobj.direction), 0);
        const dot = v2.dot(_findPlayerVec1);
        if (dot < 0 && !allAround) {
            continue;
        }

        const lineOfSight = hasLineOfSight(mobj, player);
        if (lineOfSight) {
            return player;
        }
    }
    return null;
}

const compassOpposite = {
    [MoveDirection.West]: MoveDirection.East,
    [MoveDirection.SouthWest]: MoveDirection.NorthEast,
    [MoveDirection.South]: MoveDirection.North,
    [MoveDirection.SouthEast]: MoveDirection.NorthWest,
    [MoveDirection.East]: MoveDirection.West,
    [MoveDirection.NorthEast]: MoveDirection.SouthWest,
    [MoveDirection.North]: MoveDirection.South,
    [MoveDirection.NorthWest]: MoveDirection.SouthEast,
    [MoveDirection.None]: MoveDirection.None
}
const searchDirections = [
    MoveDirection.East, MoveDirection.NorthEast, MoveDirection.North, MoveDirection.NorthWest,
    MoveDirection.West, MoveDirection.SouthWest, MoveDirection.South, MoveDirection.SouthEast,
];
const reverseSearchDirections = searchDirections.toReversed();
// A table like these feels more doom-like than a conditional expression
const compassDiagonals = {
    [MoveDirection.East]: {
        [MoveDirection.North]: MoveDirection.NorthEast,
        [MoveDirection.South]: MoveDirection.SouthEast,
    },
    [MoveDirection.West]: {
        [MoveDirection.North]: MoveDirection.NorthWest,
        [MoveDirection.South]: MoveDirection.SouthWest,
    }
};
const swapDirectionChance = 200 / 255;
let _moveDir = [0, 0];
function newChaseDir(mobj: MapObject, target: MapObject) {
    // Kind of P_NewChaseDir but also helped along by a doomworld discussion
    // https://www.doomworld.com/forum/topic/122794-source-code-monster-behavior-moving-around-objects/

    // set search direction baesd on location of target and mobj
    const dx = target.position.x - mobj.position.x;
    const dy = target.position.y - mobj.position.y;
    _moveDir[0] = dx > 10 ? MoveDirection.East : dx < -10 ? MoveDirection.West : MoveDirection.None;
    _moveDir[1] = dy > 10 ? MoveDirection.North : dy < -10 ? MoveDirection.South : MoveDirection.None;
    const originalDir = mobj.movedir;
    const oppositeDir = compassOpposite[originalDir];

    // diagonal is best, let's try that first
    if (_moveDir[0] !== MoveDirection.None && _moveDir[1] !== MoveDirection.None) {
        const moveDir = compassDiagonals[_moveDir[0]][_moveDir[1]];
        if (moveDir !== oppositeDir && setMovement(mobj, moveDir)) {
            return;
        }
    }

    // diagonal didn't work, let's try the longer of x or y movement
    // NOTE: horizontal/vertical are sometimes swapped too - just to keep things interesting.
    if (Math.abs(dy) > Math.abs(dx) || mobj.rng.real() > swapDirectionChance) {
        const t = _moveDir[0];
        _moveDir[0] = _moveDir[1];
        _moveDir[1] = t;
    }
    for (let i = 0; i < _moveDir.length; i++) {
        if (_moveDir[i] !== oppositeDir && setMovement(mobj, _moveDir[i])) {
            return;
        }
    }

    // new direction does not seem to work so try the original direction
    if (setMovement(mobj, originalDir)) {
        return;
    }

    // still can't find a good direction? move in the first direction we can
    const dirs = (mobj.rng.real() < .5) ? searchDirections : reverseSearchDirections;
    for (let i = 0; i < dirs.length; i++) {
        if (dirs[i] !== oppositeDir && setMovement(mobj, dirs[i])) {
            return;
        }
    }

    // as a last resort, maybe we can 180?
    if (setMovement(mobj, oppositeDir)) {
        return;
    }

    // nothing works, stop moving and we'll try again another time
    mobj.movedir = MoveDirection.None;
}

function setMovement(mobj: MapObject, dir: number) {
    if (!canMove(mobj, dir)) {
        return false;
    }
    // only set movedir and not direction (direction is adjusted gradually in A_Chase)
    mobj.movedir = dir;
    mobj.movecount = mobj.rng.int(0, 15);
    return true;
}

const _moveVec = new Vector3();
function canMove(mobj: MapObject, dir: number, specialLines?: LineTraceHit[]) {
    if (dir === MoveDirection.None) {
        return false; // don't allow None movements, monsters should move as much as possible
    }
    _moveVec.copy(_directionTable[dir]).multiplyScalar(mobj.info.speed);
    const blocker = findMoveBlocker(mobj, _moveVec, specialLines);
    // if we can float and we're blocked by a two-sided line then float!
    if (blocker && 'line' in blocker && blocker.line.left && mobj.info.flags & MFFlags.MF_FLOAT) {
        const dz = blocker.line.left.sector.zFloor - mobj.position.z;
        // float if the z-delta is reasonably far from the floor we're aiming for
        if (Math.abs(dz) > 0.0001) {
            const zmove = dz > 0 ? Math.min(dz, maxFloatSpeed) : Math.max(dz, -maxFloatSpeed);
            mobj.velocity.z = zmove * mobj.spriteTime;
            mobj.info.flags |= MFFlags.MF_INFLOAT;
            // actually we are blocked but return true so we don't chage direction. the last part of A_Chase will look at
            // MF_INFLOAT to decide if we should move along xy. Kind of messy :/
            return true;
        }
    }
    mobj.info.flags &= ~MFFlags.MF_INFLOAT;
    return !blocker;
}

const _moveEnd = new Vector3();
export function findMoveBlocker(mobj: MapObject, move: Vector3, specialLines?: LineTraceHit[]) {
    // a simplified (and subtly different) version of the move trace from MapObject.updatePosition()
    let blocker: TraceHit = null;
    const start = mobj.position;
    vecFromMovement(_moveEnd, start, move, mobj.info.radius);
    // NOTE: shrink the radius a bit to help the Barrons in E1M8 (also the pinkies at the start get stuck on steps)
    const moveRadius = mobj.info.radius - 1;
    // compute highest and lowest floor we are touching because monsters cannot climb narrow steps
    // (players nad floating monsters can though)
    const maxFloorChangeOK = (mobj.info.flags & MFFlags.MF_FLOAT) || maxFloorChange(mobj, move, moveRadius) <= maxStepSize;

    mobj.map.data.traceMove({
        start,
        move,
        radius: moveRadius,
        height: mobj.info.height,
        hitObject: hit => {
            const skipHit = false
                || (hit.mobj === mobj) // don't collide with yourself
                || !(hit.mobj.info.flags & hittableThing) // not hittable
                || (hit.mobj.info.flags & MFFlags.MF_SPECIAL) // skip pickupable things because monsters don't pick things up
                || (start.z + mobj.info.height < hit.mobj.position.z) // passed under target
                || (start.z > hit.mobj.position.z + hit.mobj.info.height) // passed over target
            if (skipHit) {
                return true; // continue search
            }
            return !(blocker = hit);
        },
        hitLine: hit => {
            const twoSided = Boolean(hit.line.left);
            if (twoSided) {
                const blocking = Boolean(hit.line.flags & (0x0002 | 0x0001)); // blocks monsters or players and monsters
                const front = hit.side <= 0 ? hit.line.right.sector : hit.line.left.sector;
                const back = hit.side <= 0 ? hit.line.left.sector : hit.line.right.sector;
                if (blocking) {
                    // if it's a blocking wall but the back sector is the same as the start sector, we allow the move
                    // because it means we are moving away from the wall. For example, many imps in E1M7 are stuck in
                    // blocking wall/window ledges so this lets them move.
                    // Make sure front and back sectors are not the same (see grate walls after the zigzag in E1M1)
                    if (mobj.sector.val === back && front !== back) {
                        return true;
                    }
                } else {
                    const stepUpOK =
                        (back.zFloor < front.zFloor) // not a step up
                        || (back.zFloor - start.z <= maxStepSize && maxFloorChangeOK);
                    const transitionGapOk = (back.zCeil - start.z >= mobj.info.height);
                    const newCeilingFloorGapOk = (back.zCeil - back.zFloor >= mobj.info.height);
                    const stepDownOK =
                        (back.zFloor > front.zFloor) // not a step down
                        || (mobj.info.flags & (MFFlags.MF_DROPOFF | MFFlags.MF_FLOAT))
                        || (start.z - back.zFloor <= maxStepSize);

                    if (!newCeilingFloorGapOk && doorTypes.includes(hit.line.special)) {
                        // stop moving and trigger the door and (hopefully) the door is open next time so we don't get here
                        mobj.movedir = MoveDirection.None;
                        specialLines?.push(hit);
                    }

                    if (newCeilingFloorGapOk && transitionGapOk && stepUpOK && stepDownOK) {
                        if (specialLines && hit.line.special) {
                            const startSide = signedLineDistance(hit.line.v, start) < 0 ? -1 : 1;
                            const endSide = signedLineDistance(hit.line.v, _moveEnd) < 0 ? -1 : 1;
                            if (startSide !== endSide) {
                                specialLines.push(hit);
                            }
                        }
                        return true; // step/ceiling/drop-off collision is okay so try next line
                    }
                }
            }
            return !(blocker = hit);
        },
        hitFlat: hit => {
            const sec = hit.subsector.sector;
            const crushed = (sec.zCeil - sec.zFloor < mobj.info.height)
            return !(blocker = crushed ? hit : null);
        }
    });
    return blocker;
}

function maxFloorChange(mobj: MapObject, move: Vector3, radius: number) {
    let highestZFloor = -Infinity;
    let lowestZFloor = Infinity;
    mobj.map.data.traceSubsectors(mobj.position, move, radius, hit => {
        highestZFloor = Math.max(highestZFloor, hit.sector.zFloor);
        lowestZFloor = Math.min(lowestZFloor, hit.sector.zFloor);
        return true;
    });
    return (highestZFloor - lowestZFloor);
}

function canMeleeAttack(mobj: MapObject, target: MapObject) {
    const dist = mobj.position.distanceTo(target.position);
    // hmmm... why 20?
    if (dist >= meleeRange - 20 + target.info.radius) {
        return false;
    }
    if (!hasLineOfSight(mobj, target)) {
        // we are in range but we can't see the target (maybe we're behind a door or on a platform?)
        return false;
    }
    return true;
}

function canShootAttack(mobj: MapObject, target: MapObject) {
    if (!hasLineOfSight(mobj, target)) {
        // don't shoot if we can't see the target
        return false;
    }
    if (mobj.info.flags & MFFlags.MF_JUSTHIT) {
        // we were just hit so attack!
        mobj.info.flags &= ~MFFlags.MF_JUSTHIT;
        return true;
    }
    if (mobj.reactiontime) {
        return false;
    }

    // fire or not based on a complex heuristic...
    // why 64?
    let chance = mobj.position.distanceTo(target.position) - 64;
    if (!mobj.info.meleestate) {
	    chance -= 128; // no melee attack, so increase the chance of firing
    }
    if (mobj.type === MapObjectIndex.MT_VILE && chance > 14*64) {
        return false; // too far away
    }
    if (mobj.type === MapObjectIndex.MT_UNDEAD) {
        if (chance < 196) {
            return false;	// close for fist attack
        }
        chance *= 0.5;
    }
    if (mobj.type === MapObjectIndex.MT_CYBORG || mobj.type === MapObjectIndex.MT_SPIDER || mobj.type === MapObjectIndex.MT_SKULL) {
        chance *= 0.5;
    }
    if (chance > 200) {
        chance = 200;
    }
    if (mobj.type === MapObjectIndex.MT_CYBORG && chance > 160) {
	    chance = 160;
    }
    return (mobj.rng.real() * 256 > chance);
}

const shotZOffset = 32;
type MissileType =
    // doom
    MapObjectIndex.MT_TROOPSHOT | MapObjectIndex.MT_HEADSHOT | MapObjectIndex.MT_BRUISERSHOT | MapObjectIndex.MT_ROCKET |
    // doom 2
    MapObjectIndex.MT_ARACHPLAZ | MapObjectIndex.MT_FATSHOT | MapObjectIndex.MT_TRACER | MapObjectIndex.MT_SPAWNSHOT;
// TODO: similar (but also different) from player shootMissile in weapon.ts. Maybe we can combine these?
function shootMissile(shooter: MapObject, target: MapObject, type: MissileType, angle?: number) {
    let direction = angle ?? angleBetween(shooter, target);
    if (target.info.flags & MFFlags.MF_SHADOW) {
        // shadow objects (invisibility) should add error to angle
        direction += shooter.rng.angleNoise(20);
    }
    const pos = shooter.position;
    const missile = shooter.map.spawn(type, pos.x, pos.y, pos.z + shotZOffset, direction);
    missile.map.game.playSound(missile.info.seesound, missile);
    // this is kind of an abuse of "chaseTarget" but missles won't ever chase anyone anyway. It's used when a missile
    // hits a target to know who fired it.
    missile.chaseTarget = shooter;

    launchMapObject(missile, target, shotZOffset, missile.info.speed);
    return missile;
}

const _deltaVec = new Vector3;
function launchMapObject(mobj: MapObject, target: MapObject, zOffset: number, speed: number) {
    _deltaVec.copy(target.position).sub(mobj.position);
    const dist = Math.sqrt(_deltaVec.x * _deltaVec.x + _deltaVec.y * _deltaVec.y);
    mobj.velocity.set(
        Math.cos(mobj.direction) * speed,
        Math.sin(mobj.direction) * speed,
        (_deltaVec.z + zOffset) / dist * speed);
}

function spawnLostSoul(parent: MapObject, angle: number) {
    const lostSoulCount = parent.map.objs.reduce((count, m) => count + (m.type === MapObjectIndex.MT_SKULL ? 1 : 0), 0);
    const maxLostSouls = parent.map.game.settings.maxLostSouls.val;
    if (maxLostSouls > 0 && lostSoulCount > maxLostSouls) {
	    return;
    }

    const lostSoul = parent.map.spawn(MapObjectIndex.MT_SKULL, parent.position.x, parent.position.y, parent.position.z);
    const offset = 4 + 1.5 * (parent.info.radius + lostSoul.info.radius);

    lostSoul.position.x += Math.cos(angle) * offset;
    lostSoul.position.y += Math.sin(angle) * offset;
    lostSoul.position.z += 8;
    if (lostSoul.position.z + lostSoul.info.height > lostSoul.zCeil) {
        lostSoul.position.z = lostSoul.zCeil - lostSoul.info.height;
    }
    lostSoul.positionChanged();
    // if the lost soul can't move, destroy it
    if (findMoveBlocker(lostSoul, zeroVec)) {
        lostSoul.damage(10_000, parent, parent);
        return;
    }

    lostSoul.chaseTarget = parent.chaseTarget;
    monsterAiActions[ActionIndex.A_SkullAttack](lostSoul);
}