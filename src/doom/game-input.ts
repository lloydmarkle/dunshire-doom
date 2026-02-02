import { derived } from "svelte/store";
import { MFFlags, SoundIndex } from "./doom-things-info";
import type { GameTime } from "./game";
import { ComputedRNG, HALF_PI, TableRNG, tickTime } from "./math";
import type { InventoryWeapon } from "./things/weapons";
import type { MapRuntime } from "./map-runtime";
import type { Store } from "./store";
import { Object3D, Vector3 } from "three";

const playerSpeeds = { // per-tick
    'run': 50,
    'walk': 25,
    'crawl?': 5,
    'gravity': 35,
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

const vec = new Vector3();
export class GameInput {
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
                [this.map.game.settings.freelook, this.map.game.settings.freeFly, this.map.game.settings.cameraMode],
                ([freelook, freeFly, cameraMode]) => (freelook || freeFly) && cameraMode !== 'bird' && cameraMode !== 'ortho'
            ).subscribe(canPitch => {
                if (canPitch) {
                    this.minPolarAngle = -HALF_PI;
                    this.maxPolarAngle = HALF_PI;
                } else {
                    this.minPolarAngle = this.maxPolarAngle = 0;
                }
            }));
    }

    evaluate(time: GameTime) {
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
        if (this.player.reactiontime) {
            // frozen from teleport so don't allow movement
            this.input.move.set(0, 0, 0);
        }

        const freeFly = this.player.info.flags & MFFlags.MF_NOGRAVITY;
        const dt = time.delta * time.delta / tickTime;
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
                // apply separate friction during freefly (also scale friction slightly for lower timescale)
                const friction = .95 + (time.scale < 1 ? .05 * (1 - time.scale) : 0);
                this.player.velocity.multiplyScalar(friction);
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
