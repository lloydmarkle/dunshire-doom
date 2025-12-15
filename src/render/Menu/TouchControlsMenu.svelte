<script lang="ts">
    import { get, type Writable } from "svelte/store";
    import { createDefaultSettings, useAppContext, useDoom } from "../DoomContext";
    import type { Size } from "@threlte/core";
    import type { EventHandler } from "svelte/elements";
    import type { Action, ActionReturn } from "svelte/action";
    import TouchControls from "../Controls/TouchControls.svelte";
    import { fly } from "svelte/transition";

    export let visible = false;
    export let viewSize: Size;

    const settings = useAppContext().settings;
    const game = useDoom().game;
    const { touchDeadZone, tapTriggerTime, touchLookSpeed, analogMovement, touchTargetHzPadding, touchTargetVPadding, touchTargetSize } = settings;

    type SettingsKey = keyof typeof settings;
    const originalValues: { [key in SettingsKey]?: any } = {
        'touchDeadZone': $touchDeadZone,
        'tapTriggerTime': $tapTriggerTime,
        'touchLookSpeed': $touchLookSpeed,
        'analogMovement': $analogMovement,
        'touchTargetHzPadding': $touchTargetHzPadding,
        'touchTargetVPadding': $touchTargetVPadding,
        'touchTargetSize': $touchTargetSize,
    }
    function resetValues() {
        Object.keys(originalValues).forEach((key: SettingsKey) => (settings[key] as Writable<any>).set(originalValues[key]));
        visible = false;
    }
    function resetDefaults() {
        const defaults = createDefaultSettings();
        $touchDeadZone = get(defaults.touchDeadZone);
        $tapTriggerTime = get(defaults.tapTriggerTime);
        $touchLookSpeed = get(defaults.touchLookSpeed);
        $analogMovement = get(defaults.analogMovement);
        $touchTargetHzPadding = get(defaults.touchTargetHzPadding);
        $touchTargetVPadding = get(defaults.touchTargetVPadding);
        $touchTargetSize = get(defaults.touchTargetSize);
    }

    function findTouch(tl: TouchList, id: number) {
        for (let i = 0; i < tl.length; i++) {
            if (tl[i].identifier === id) {
                return tl[i];
            }
        }
        return tl[0];
    }

    type Point = { x: number, y: number };
    interface Params { viewSize: Size, controlSize: number, side: 'start' | 'end' }
    interface Attributes {
        'on:tdrag': EventHandler<CustomEvent<Point>>;
        'on:tdrag-start': EventHandler;
        'on:tdrag-stop': EventHandler;
    }

    const touchDragControls: Action<HTMLElement, Params, Attributes> = (node, params): ActionReturn<Params, Attributes> => {
        let touchNum: number;
        let point = { x: 0, y: 0 };
        let boxInfo = { halfWidth: 0, halfHeight: 0 };
        let side = params.side;
        resize();

        node.addEventListener('touchstart', touchstart);
        node.addEventListener('touchmove', touchmove);
        node.addEventListener('touchend', touchend);
        node.addEventListener('touchcancel', touchend);
        const update = (params: Params) => {
            side = params.side;
            resize();
        };
        const destroy = () => {
            node.removeEventListener('touchstart', touchstart);
            node.removeEventListener('touchmove', touchmove);
            node.removeEventListener('touchend', touchend);
            node.removeEventListener('touchcancel', touchend);
        }
        return { destroy, update };

        function resize() {
            let bounds = node.getBoundingClientRect();
            boxInfo.halfWidth = bounds.width * .5;
            boxInfo.halfHeight = bounds.height * .5;
        }

        function touchstart(ev: TouchEvent) {
            ev.preventDefault();
            touchNum = ev.changedTouches[0].identifier;
            updateTouch(findTouch(ev.touches, touchNum));
            node.dispatchEvent(new Event('tdrag-start'));
        }

        function touchmove(ev: TouchEvent) {
            ev.preventDefault();
            updateTouch(findTouch(ev.touches, touchNum));
        }

        function touchend(ev: TouchEvent) {
            ev.preventDefault();
            node.dispatchEvent(new Event('tdrag-stop'));
        }

        function updateTouch(t: Touch) {
            point.x = side === 'start' ? t.clientX - boxInfo.halfWidth : t.clientX + boxInfo.halfWidth;
            point.y = t.clientY + boxInfo.halfHeight;
            node.dispatchEvent(new CustomEvent('tdrag', { detail: point }));
        }
    };

    const clipDragPoint = (n: number, dimension: number, fontSize: number) =>
        Math.min(dimension / fontSize * .5, Math.max(0, n / fontSize));
    function dragPad(ev: CustomEvent<Point>) {
        // Adjust hzPadding (distance from side of screen) and vPadding (distance from bottom)
        const fs = window.getComputedStyle(ev.target as HTMLElement).fontSize;
        const fontSize = fs.endsWith('px') ? parseFloat(fs) : 16;
        $touchTargetHzPadding = clipDragPoint(ev.detail.x, viewSize.width, fontSize);
        $touchTargetVPadding = clipDragPoint(viewSize.height - ev.detail.y, viewSize.height, fontSize);
    }

    function dragPad2(ev: CustomEvent<Point>) {
        // Adjust hzPadding (distance from side of screen) and vPadding (distance from bottom)
        const fs = window.getComputedStyle(ev.target as HTMLElement).fontSize;
        const fontSize = fs.endsWith('px') ? parseFloat(fs) : 16;
        $touchTargetHzPadding = clipDragPoint(viewSize.width - ev.detail.x, viewSize.width, fontSize);
        $touchTargetVPadding = clipDragPoint(viewSize.height - ev.detail.y, viewSize.height, fontSize);
    }

    let showDeadZone = false;

    // tap test
    let tapTestState: 'clear' | 'active' | 'hold' = 'clear';
    let tapTest: HTMLDivElement;
    let tapTestStartTime = 0;
    function testStart() {
        const now = new Date().getTime() / 1000;
        if (now - tapTestStartTime < 2 * $tapTriggerTime) {
            tapTest.innerText = 'Hold';
            tapTestState = 'hold';
        } else {
            tapTestState = 'active';
        }
        tapTestStartTime = now;
    }
    function testEnd() {
        const elapsed = (new Date().getTime() / 1000) - tapTestStartTime;
        tapTest.innerText = elapsed < $tapTriggerTime ? 'Tapped' : 'Too slow';
        tapTestState = 'clear';
    }
</script>

<TouchControls {showDeadZone} />
<div
    class="
        absolute w-full flex justify-between
        text-center align-bottom pb-4
    "
    style="padding-inline:{$touchTargetHzPadding}rem; bottom: 0; --px:50%; --py:50%;"
>
    <div
        use:touchDragControls={{ viewSize, controlSize: $touchTargetSize, side: 'start' }}
        on:tdrag={dragPad}
        style="padding-top:{$touchTargetSize}rem; width:{$touchTargetSize}rem;"
    >
        <p>Move</p>
        <p>Tap: use[*]</p>
    </div>
    <div
        class="relative touch-none"
        style="padding-top:{$touchTargetSize * .8 + $touchTargetVPadding * .5}rem; width:{$touchTargetSize}rem;"
    >
        Weapon select
    </div>
    <div
        use:touchDragControls={{ viewSize, controlSize: $touchTargetSize, side: 'end' }}
        on:tdrag={dragPad2}
        style="padding-top:{$touchTargetSize}rem; width:{$touchTargetSize}rem;"
    >
        <p>Aim</p>
        <p>Tap: shoot[*]</p>
    </div>
    <div class="text-xs absolute bottom-0">[*] Double tap and hold to trigger the action continuously.</div>
</div>

<div
    transition:fly={{ y: '-100%', delay: 200 }}
    class="bg-base-100 rounded-box shadow-xl grid grid-rows-[minmax(0,1fr)_max-content] grid-cols-3 mx-2 gap-2"
>
    <button class="btn btn-primary" on:click={() => visible = false}>Save</button>
    <button class="btn" on:click={resetDefaults}>Defaults</button>
    <button class="btn" on:click={resetValues}>Cancel</button>
    <div class="
        col-span-3 justify-self-center text-xs p-2
        grid grid-cols-2 items-center
    ">
        <p>Drag the move or aim control to adjust the position.</p>
        <label on:touchstart class="label">
            <span class="label-text">Analog direction pad</span>
            <input class="checkbox" type="checkbox" bind:checked={$analogMovement} />
        </label>
        <label class="label">
            <span class="label-text text-xs">Size <span class="text-primary">[{$touchTargetSize}]</span></span>
            <input type="range" class="range" bind:value={$touchTargetSize} min={4} max={20} />
        </label>
        <label class="label"
            on:touchstart={() => showDeadZone = true}
            on:touchend={() => showDeadZone = false}
            on:touchcancel={() => showDeadZone = false}
        >
            <span class="label-text text-xs">Dead zone <span class="text-primary">[{$touchDeadZone}]</span></span>
            <input type="range" class="range" bind:value={$touchDeadZone} min={.1} max={1} step={0.05} />
        </label>
        <label class="label">
            <span class="label-text text-xs">Aim speed <span class="text-primary">[{$touchLookSpeed}]</span></span>
            <input type="range" class="range" bind:value={$touchLookSpeed} min={4} max={64} step={4} />
        </label>
        <div class="flex gap-2">
            <label class="label">
                <span class="label-text text-xs">Tap speed[*] <span class="text-primary">[{$tapTriggerTime}]</span></span>
                <input type="range" class="range" bind:value={$tapTriggerTime} min={.05} max={1} step={.05} />
            </label>
            <div class="btn w-24"
                class:btn-primary={tapTestState === 'hold'}
                class:btn-accent={tapTestState === 'active'}
                bind:this={tapTest}
                on:touchstart={testStart}
                on:touchend={testEnd}
                on:touchcancel={testEnd}
            >Test</div>
        </div>
    </div>
</div>
