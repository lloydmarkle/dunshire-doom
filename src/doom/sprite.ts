import { ActionIndex, StateIndex, states, type State } from "./doom-things-info";
import type { MapObject } from "./map-object";
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

const stateSprite = (() => {
    const _sprite = { name: '', frame: 0, fullbright: false, ticks: 0, spriteIndex: 0 };
    // TODO: the sp parameter is only needed for compatibility with r1. While it doesn't really
    // impact performance, it would be nice to remove it for simplicity.
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

export const spriteStateMachine = (() => {
    const tick = (mo: MapObject) => {
        if (mo.stateIndex === StateIndex.S_NULL || mo.stateTics < 0) {
            return;
        }
        mo.stateTics -= 1;
        if (mo.stateTics === 0) {
            set(mo, states[mo.stateIndex].nextState);
        }
    };

    const set = (mo: MapObject, stateIndex: StateIndex, ticOffset = 0) => {
        let state: State;
        do {
            mo.stateIndex = stateIndex;
            if (stateIndex === StateIndex.S_NULL) {
                mo.map.destroy(mo);
                return;
            }
            state = states[stateIndex];
            mo.stateTics = state.tics;
            stateChangeAction(state.action, mo);
            stateIndex = state.nextState;
        } while (!state.tics)

        mo.stateTics = Math.max(0, mo.stateTics + ticOffset);
        mo.map.events.emit('mobj-updated-sprite', mo, stateSprite(state, mo.stateTics));
    };

    const sprite = (mo: MapObject, sprite?: Sprite) =>
        stateSprite(states[mo.stateIndex], mo.stateTics, sprite);

    return { tick, sprite, set }
})();

export class SpriteStateMachine {
    private ticks: number;
    private stateIndex: StateIndex;
    private state: State;
    readonly sprite = store<Sprite>(null);
    get ticsRemaining() { return this.ticks; }
    get index() { return this.stateIndex; }

    constructor(
        private notify: (sprite: Sprite) => void,
        private stateAction: (action: ActionIndex) => void,
        // TODO: it would be nice not to need an action where state is null but weapons have one behaviour and monsters
        // have another and I'm not sure how to express them
        private onNull: (self: SpriteStateMachine) => void,
    ) {}

    tick() {
        if (!this.state || this.ticks < 0) {
            return;
        }
        this.ticks -= 1;
        if (this.ticks === 0) {
            this.setState(this.state.nextState);
        }
    }

    setState(stateIndex: StateIndex, tickOffset = 0) {
        do {
            this.stateIndex = stateIndex;
            if (stateIndex === StateIndex.S_NULL) {
                this.onNull(this);
                return;
            }

            this.state = states[stateIndex];
            this.ticks = this.state.tics;
            this.stateAction(this.state.action);
            stateIndex = this.state.nextState;
        } while (!this.ticks)

        this.ticks = Math.max(0, this.ticks + tickOffset);
        this.updateSprite();
    }

    updateSprite() {
        let sprite = this.sprite.val;
        if (!sprite) {
            sprite = { name: '', frame: 0, fullbright: false, ticks: 0, spriteIndex: 0 };
            this.sprite.set(sprite);
        }
        sprite.spriteIndex = this.state.spriteIndex;
        sprite.ticks = this.ticks;
        sprite.name = this.state.spriteName;
        sprite.frame = this.state.frame & FF_FRAMEMASK;
        sprite.fullbright = (this.state.frame & FF_FULLBRIGHT) !== 0;
        this.notify(sprite);
    }

    randomizeTicks(rng: RNG) {
        if (this.ticks > 0) {
            this.ticks = rng.int(1, this.ticks);
        }
    }
}
