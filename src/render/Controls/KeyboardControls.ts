import type { Action, ActionReturn } from 'svelte/action';
import type { ControllerInput } from '../../doom';
import type { KeyMap } from '../DoomContext';

interface Params {
    input: ControllerInput;
    keymap: KeyMap;
}

export const keyboardControls: Action<HTMLElement, Params> =
(node, params): ActionReturn => {
    const doc = node.ownerDocument;
    let { input } = params;

    const propFromFn = {
        'mf': 'forward',
        'mb': 'backward',
        'ml': 'left',
        'mr': 'right',
        'mu': 'up',
        'md': 'down',
        'u': 'use',
        'a': 'attack',
        'r': 'run',
        's': 'slow',
    }
    type KeyFunctions = keyof KeyMap;
    const buildKeyMap = (km: KeyMap) =>
        Object.entries(km).reduce((map, k) => {
            k[1].forEach(key => map[key] = k[0] as KeyFunctions);
            return map;
        }, {} as { [key: string]: KeyFunctions });
    let keyMapping = buildKeyMap(params.keymap);

    const moveKeys = {
        left: 0,
        right: 0,
        up: 0,
        down: 0,
        forward: 0,
        backward: 0,
    }
    function updateMovement() {
        input.move.set(
            moveKeys.right - moveKeys.left,
            moveKeys.forward - moveKeys.backward,
            moveKeys.up - moveKeys.down
        );
    }

    clearInputState();
    doc.addEventListener('keydown', keydown);
    doc.addEventListener('keyup', keyup);
    const update = (params: Params) => {
        input = params.input;
        keyMapping = buildKeyMap(params.keymap);
    };
    const destroy = () => {
        doc.removeEventListener('keydown', keydown);
        doc.removeEventListener('keyup', keyup);
    }
    return { update, destroy };

    function keydown(ev: KeyboardEvent) {
        const fn = keyMapping[ev.code];
        if (ev.code === 'Slash') {
            // on firefox, slash opens up a quick find and we don't want that during gameplay
            ev.preventDefault();
        }
        if (!fn) {
            return;
        } else if (fn[0] === 'm') {
            moveKeys[propFromFn[fn]] = 1;
            updateMovement();
        } else if (fn[0] === 'w') {
            input.weaponKeyNum = fn.charCodeAt(1) - 48;
        } else {
            input[propFromFn[fn]] = true;
        }
    }

    function keyup(ev: KeyboardEvent) {
        const fn = keyMapping[ev.code];
        if (!fn) {
            return;
        } else if (fn[0] === 'm') {
            moveKeys[propFromFn[fn]] = 0;
            updateMovement();
        } else if (fn[0] === 'w') {
            // ignore because we switch weapons on key down
        } else {
            input[propFromFn[fn]] = false;
        }
    }

    function clearInputState() {
        input.move.set(0, 0, 0);
        Object.keys(propFromFn).filter(fn => fn[0] !== 'm')
            .forEach(fn => input[propFromFn[fn]] = false);
    }
};
