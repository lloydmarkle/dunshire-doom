import { Vector3 } from 'three';
import type { ThingType } from '.';
import { ActionIndex, MFFlags, MapObjectIndex } from '../doom-things-info';
import { MapObject } from '../map-object';
import { zeroVec } from '../map-data';

export const obstacles: ThingType[] = [
    { type: 25, class: 'O', description: 'Impaled human' },
    { type: 26, class: 'O', description: 'Twitching impaled human' },
    { type: 27, class: 'O', description: 'Skull on a pole' },
    { type: 28, class: 'O', description: 'Five skulls "shish kebab"' },
    { type: 29, class: 'O', description: 'Pile of skulls and candles' },
    { type: 30, class: 'O', description: 'Tall green pillar' },
    { type: 31, class: 'O', description: 'Short green pillar' },
    { type: 32, class: 'O', description: 'Tall red pillar' },
    { type: 33, class: 'O', description: 'Short red pillar' },
    { type: 35, class: 'O', description: 'Candelabra' },
    { type: 36, class: 'O', description: 'Short green pillar with beating heart' },
    { type: 37, class: 'O', description: 'Short red pillar with skull' },
    { type: 41, class: 'O', description: 'Evil eye' },
    { type: 42, class: 'O', description: 'Floating skull' },
    { type: 43, class: 'O', description: 'Burnt tree' },
    { type: 44, class: 'O', description: 'Tall blue firestick' },
    { type: 45, class: 'O', description: 'Tall green firestick' },
    { type: 46, class: 'O', description: 'Tall red firestick' },
    { type: 47, class: 'O', description: 'Brown stump' },
    { type: 48, class: 'O', description: 'Tall techno column' },
    { type: 49, class: 'O', description: 'Hanging victim, twitching' },
    { type: 50, class: 'O', description: 'Hanging victim, arms out' },
    { type: 51, class: 'O', description: 'Hanging victim, one- legged' },
    { type: 52, class: 'O', description: 'Hanging pair of legs' },
    { type: 53, class: 'O', description: 'Hanging leg' },
    { type: 54, class: 'O', description: 'Large brown tree' },
    { type: 55, class: 'O', description: 'Short blue firestick' },
    { type: 56, class: 'O', description: 'Short green firestick' },
    { type: 57, class: 'O', description: 'Short red firestick' },
    { type: 70, class: 'O', description: 'Burning barrel' },
    { type: 73, class: 'O', description: 'Hanging victim, guts removed' },
    { type: 74, class: 'O', description: 'Hanging victim, guts and brain removed' },
    { type: 75, class: 'O', description: 'Hanging torso, looking down' },
    { type: 76, class: 'O', description: 'Hanging torso, open skull' },
    { type: 77, class: 'O', description: 'Hanging torso, looking up' },
    { type: 78, class: 'O', description: 'Hanging torso, brain removed' },
    { type: 85, class: 'O', description: 'Tall techno floor lamp' },
    { type: 86, class: 'O', description: 'Short techno floor lamp' },
    { type: 2028, class: 'O', description: 'Floor lamp' },
    { type: 2035, class: 'O', description: 'Exploding barrel' },
];

type StateChangeAction = (mobj: MapObject) => void
export const actions: { [key: number]: StateChangeAction } = {
    [ActionIndex.A_Explode]: mobj => radiusDamage(128, mobj, mobj.chaseTarget),
}

export function radiusDamage(damage: number, mobj: MapObject, source: MapObject) {
    // use a map so we don't hit the same object multiple times
    let hits = new Map<MapObject, number>();
    const height = Infinity; // explosions don't check z in doom
    mobj.map.data.traceMove({
        start: mobj.position,
        move: zeroVec,
        radius: damage + 32,
        height,
        hitObject: hit => {
            const skipHit = (false
                || !(hit.mobj.info.flags & MFFlags.MF_SHOOTABLE) // not shootable
                || hits.has(hit.mobj) // already hit this, so continue to next
                // spider boss and cyberdemon do not take damage from explosions
                || (hit.mobj.type === MapObjectIndex.MT_CYBORG || hit.mobj.type === MapObjectIndex.MT_SPIDER));
            if (skipHit) {
                return true;
            }

            let dist = Math.max(
                Math.abs(hit.mobj.position.x - mobj.position.x),
                Math.abs(hit.mobj.position.y - mobj.position.y)) - hit.mobj.info.radius;
            if (dist < 0) {
                dist = 0;
            }
            if (dist >= damage) {
                return true; // out of range
            }
            hits.set(hit.mobj, dist);
            return true;
        },
    });

    // don't apply damage in traceMove() because hasLineOfSight() also performs a trace and nested traces don't work
    for (const [hitMobj, dist] of hits.entries()) {
        if (hasLineOfSight(mobj, hitMobj)) {
            hitMobj.damage(damage - dist, mobj, source);
        }
    }
}

const _losStart = new Vector3();
const _losVec = new Vector3();
export function hasLineOfSight(mobj1: MapObject, mobj2: MapObject): boolean {
    const rj = mobj1.map.data.rejects;
    const idx = (mobj1.sector.val.num * mobj1.map.data.sectors.length) + mobj2.sector.val.num;
    if (rj[idx >> 3] & (1 << (idx & 7))) {
        return false;
    }

    // Kind of like P_CheckSight
    let los = true;
    // start from the "eyes" of mobj1 (or about 75% of height)
    _losStart.copy(mobj1.position);
    _losStart.z += mobj1.info.height * .75;
    _losVec.copy(mobj2.position).sub(_losStart);
    let zTop = (mobj2.position.z + mobj2.info.height) - _losStart.z;
    let zBottom = mobj2.position.z - _losStart.z;

    mobj1.map.data.traceRay({
        start: mobj1.position,
        move: _losVec,
        hitLine: hit => {
            if (!hit.line.left) {
                // we've hit a solid wall so line of sight is false
                los = false;
                return false;
            }

            const front = hit.side === -1 ? hit.line.right : hit.line.left;
            const back = hit.side === -1 ? hit.line.left : hit.line.right;
            const openTop = Math.min(front.sector.zCeil, back.sector.zCeil);
            const openBottom = Math.max(front.sector.zFloor, back.sector.zFloor);
            if (openBottom >= openTop) {
                // it's a two-sided line but there is no opening (eg. a closed door)
                los = false;
                return false;
            }

            // Doom2 MAP01: the zombie on the left is sitting on line 29 which means hit-fraction is zero
            // but that does not impact his view. If a monster is sitting on a 2-sided line, we should just ignore that
            // line and assume they see both sides
            if (hit.fraction > 0) {
                if (front.sector.zCeil !== back.sector.zCeil) {
                    zTop = Math.min(zTop, (openTop - _losStart.z) / hit.fraction);
                }
                if (front.sector.zFloor !== back.sector.zFloor) {
                    zBottom = Math.max(zBottom, (openBottom - _losStart.z) / hit.fraction);
                }
            }

            if (zTop <= zBottom) {
                // no room means no line of sight so stop searching
                los = false;
                return false;
            }
            return true; // keep searching...
        },
    });
    return los;
}