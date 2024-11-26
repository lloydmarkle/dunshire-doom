import { ActionIndex, SpriteNames, StateIndex, states, type State } from "./doom-things-info";
import type { RNG } from "./math";
import { store } from "./store";

const FF_FULLBRIGHT = 0x8000;
const FF_FRAMEMASK = 0x7fff;

export interface Sprite {
    name: string;
    frame: number;
    state: State;
    fullbright: boolean;
    ticks: number;
}

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
        let sprite = this.sprite.val;
        if (!sprite) {
            sprite = { name: '', frame: 0, fullbright: false, ticks: 0, state: this.state };
            this.sprite.set(sprite);
        }
        sprite.state = this.state;
        sprite.ticks = this.ticks;
        sprite.name = SpriteNames[this.state.sprite];
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
