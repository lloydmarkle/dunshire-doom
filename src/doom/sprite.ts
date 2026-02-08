import { ActionIndex, StateIndex, states, type State } from "./doom-things-info";
import { MapObject } from "./map-object";
import type { RNG } from "./math";
import { store } from "./store";
import { stateChangeAction } from "./things";

const FF_FULLBRIGHT = 0x8000;
const FF_FRAMEMASK = 0x7fff;

export interface Sprite {
    name: string;
    frame: number;
    spriteIndex: number;
    fullbright: boolean;
    ticks: number;
}

export const createSprite = () => ({ name: '', frame: 0, fullbright: false, ticks: 0, spriteIndex: 0 });
const stateSprite = (() => {
    const _sprite = createSprite();
    return (state: State, tics: number, sp?: Sprite) => {
        sp = sp ?? _sprite;
        sp.ticks = tics;
        sp.name = state.spriteName;
        sp.frame = state.frame & FF_FRAMEMASK;
        sp.spriteIndex = state.spriteIndex;
        sp.fullbright = (state.frame & FF_FULLBRIGHT) !== 0;
        return sp;
    };
})();

export type SpriteState = { stateIndex: StateIndex, stateTics: number };
export const stateMachine = <T extends SpriteState>(
    setState: (m: T, stateIndex: StateIndex, ticOffset?: number) => void,
) => ({
    set: setState,
    tick: (m: T) => {
        if (m.stateIndex === StateIndex.S_NULL || m.stateTics < 0) {
            return;
        }
        m.stateTics -= 1;
        if (m.stateTics === 0) {
            setState(m, states[m.stateIndex].nextState);
        }
    },
    sprite: (m: T, sprite?: Sprite) =>
        stateSprite(states[m.stateIndex], m.stateTics, sprite),
});

export const mobjStateMachine = stateMachine<MapObject>(
    (mo: MapObject, stateIndex: StateIndex, ticOffset = 0) => {
        let state: State;
        do {
            mo.stateIndex = stateIndex;
            if (stateIndex === StateIndex.S_NULL) {
                mo.map.destroy(mo);
                return;
            }
            state = states[stateIndex];
            stateChangeAction(state.action, mo);
            stateIndex = state.nextState;
        } while (!state.tics)

        mo.stateTics = Math.max(0, state.tics + ticOffset);
        mo.map.events.emit('mobj-updated-sprite', mo, stateSprite(state, mo.stateTics));
    });
