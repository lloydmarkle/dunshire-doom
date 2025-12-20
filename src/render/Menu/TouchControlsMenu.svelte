<script lang="ts">
    import { get, type Writable } from "svelte/store";
    import { createDefaultSettings, useAppContext, useDoom } from "../DoomContext";
    import TouchControls from "../Controls/TouchControls.svelte";
    import { fly } from "svelte/transition";

    export let visible = false;
    const viewSize = useDoom().viewSize;

    const settings = useAppContext().settings;
    const { touchDeadZone, tapTriggerTime, touchLookSpeed, analogMovement, touchAreaSize } = settings;

    type SettingsKey = keyof typeof settings;
    const originalValues: { [key in SettingsKey]?: any } = {
        'touchDeadZone': $touchDeadZone,
        'tapTriggerTime': $tapTriggerTime,
        'touchLookSpeed': $touchLookSpeed,
        'analogMovement': $analogMovement,
        'touchAreaSize': $touchAreaSize,
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
        $touchAreaSize = get(defaults.touchAreaSize);
    }

    let showDeadZone = false;
    $: defaultTouchZonePosition = { x: $viewSize.width * .25, y: $viewSize.height * .6 };

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

<div class="pointer-events-none">
    <TouchControls {showDeadZone} {defaultTouchZonePosition} />
</div>

<div
    class="
        absolute inset-0 flex justify-between items-end
        text-center align-bottom pb-12 px-4 bottom-0
        pointer-events-none
    "
    style:--px="50%"
    style:--py="50%"
>
    <div class="px-2">
        <p>Move</p>
        <p>Tap: use[*]</p>
    </div>
    <div
        class="relative"
        style="padding-top:{$touchAreaSize * .8 + 4}rem; width:{$touchAreaSize}px;"
    >
        Weapon select
    </div>
    <div class="px-2">
        <p>Turn</p>
        <p>Tap: shoot[*]</p>
    </div>
    <div class="text-xs absolute bottom-0">[*] Quick tap to trigger the action. Double tap and hold to trigger the action continuously.</div>
</div>

<div
    transition:fly={{ y: '-100%', delay: 200 }}
    class="bg-base-100 rounded-box shadow-xl grid grid-rows-[minmax(0,1fr)_max-content] grid-cols-3 mx-2 gap-2 relative"
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
            <span class="label-text text-xs">Touch area <span class="text-primary">[{$touchAreaSize}]</span>px</span>
            <input type="range" class="range" bind:value={$touchAreaSize} min={4} max={0.5 * Math.min($viewSize.height, $viewSize.width)} />
        </label>
        <label class="label"
            on:touchstart={() => showDeadZone = true}
            on:touchend={() => showDeadZone = false}
            on:touchcancel={() => showDeadZone = false}
        >
            <span class="label-text text-xs">Dead zone <span class="text-primary">[{$touchDeadZone}]</span></span>
            <input type="range" class="range" bind:value={$touchDeadZone} min={0} max={1} step={0.05} />
        </label>
        <label class="label">
            <span class="label-text text-xs">Aim speed <span class="text-primary">[{$touchLookSpeed}]</span></span>
            <input type="range" class="range" bind:value={$touchLookSpeed} min={4} max={160} step={4} />
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
