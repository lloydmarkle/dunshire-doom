<script lang="ts">
    import { fly } from "svelte/transition";
    import { createDefaultSettings, useAppContext } from "../DoomContext";
    import { get } from "svelte/store";

    const { alwaysRun, keymap, mouseSensitivity, mouseInvertY, mouseSwitchLeftRightButtons, freelook } = useAppContext().settings;

    $: keyMapping = buildKeymap($keymap, $alwaysRun);
    $: groups = keyMapping.map(e => e.group).filter((e, i, arr) => arr.indexOf(e) === i);
    $: conflicts = updateConflicts(keyMapping);

    let remapping = false;
    const remap = (mappedKey: typeof keyMapping[0], index: number) => (ev: Event) => {
        function captureKey(kev: KeyboardEvent) {
            remapping = false;
            kev.preventDefault();
            kev.stopPropagation();
            if (kev.code === 'Escape') {
                return;
            }

            ev.target.removeEventListener('keydown', captureKey);
            if (kev.code === 'Backspace') {
                mappedKey.keys[index] = undefined;
            } else {
                mappedKey.keys[index] = kev.code;
            }
            // update UI
            $keymap = $keymap;
        }
        remapping = true;
        ev.target.addEventListener('keydown', captureKey);
    }

    function resetDefaults() {
        const defaults = createDefaultSettings();
        $keymap = get(defaults.keymap);
        $alwaysRun = get(defaults.alwaysRun);
        $mouseSensitivity = get(defaults.mouseSensitivity);
        $mouseInvertY = get(defaults.mouseInvertY);
        $mouseSwitchLeftRightButtons = get(defaults.mouseSwitchLeftRightButtons);
        $freelook = get(defaults.freelook);
    }

    function buildKeymap(cfg: typeof keymap.initial, alwaysRun: boolean) {
        return [
            { name: 'Forward', group: 'Move', keys: cfg['mf'] },
            { name: 'Backward', group: 'Move', keys: cfg['mb'] },
            { name: 'Left', group: 'Move', keys: cfg['ml'] },
            { name: 'Right', group: 'Move', keys: cfg['mr'] },
            { name: 'Use', group: 'Move', keys: cfg['u'] },
            { name: 'Shoot', group: 'Move', keys: cfg['a'] },

            { name: alwaysRun ? 'Walk' : 'Run', group: 'Additional movement', keys: cfg['r'] },
            { name: 'Slow movement', group: 'Additional movement', keys: cfg['s'] },
            { name: 'Fly up (cheats required)', group: 'Additional movement', keys: cfg['mu'] },
            { name: 'Fly down (cheats required)', group: 'Additional movement', keys: cfg['md'] },

            { name: 'Chainsaw/Fist', group: 'Weapons', keys: cfg['w1'] },
            { name: 'Pistol', group: 'Weapons', keys: cfg['w2'] },
            { name: 'Shotgun', group: 'Weapons', keys: cfg['w3'] },
            { name: 'Chaingun', group: 'Weapons', keys: cfg['w4'] },
            { name: 'Rocket launcher', group: 'Weapons', keys: cfg['w5'] },
            { name: 'Plasma rifle', group: 'Weapons', keys: cfg['w6'] },
            { name: 'BFG 9000', group: 'Weapons', keys: cfg['w7'] },
        ];
    }

    function updateConflicts(keyMap: typeof keyMapping) {
        let map = new Map<string, typeof keyMap[0][]>();
        keyMap.forEach(km => km.keys.forEach(key => {
            let values = map.get(key) ?? [];
            values.push(km);
            map.set(key, values);
        }));
        return Array.from(map.entries()).filter(e => e[1].length > 1).map(e => e[0]);
    }

    // mapping keys turned out to be a lot more complicated than I assumed because of keyboard layouts.
    // see https://developer.mozilla.org/en-US/docs/Web/API/KeyboardEvent/code for background.
    // It turns out using KeyboardEvent.code and this function to get more friendly names for keys is good enough (for now)
    function keyName(name: string) {
        if (!name) {
            return 'None';
        }
        return (
            name.startsWith('Page') ? 'Pg' + name.slice(4) :
            name.startsWith('Arrow') ? name.slice(5) :
            name.startsWith('Numpad') ? 'Num' + name.slice(6) :
            name.startsWith('Digit') ? name.slice(5) :
            name.endsWith('Left') ? 'L' + name.slice(0, -4) :
            name.endsWith('Right') ? 'R' + name.slice(0, -5) :
            name.startsWith('Key') ? name.slice(3) :
            name
        );
    }
</script>

<div class="sticky top-0 z-20 p-2">
    {#if conflicts.length}
    <div transition:fly={{ y: '-100%' }} class="alert alert-error absolute">Key map conflicts</div>
    {/if}
    {#if remapping}
    <div transition:fly={{ y: '-100%' }} class="alert alert-info absolute flex flex-col gap-2">
        <span>Press a key</span>
        <span class="text-xs">(or backspace to clear)</span>
    </div>
    {/if}
</div>

<ul
    class="menu"
    class:shift-down={conflicts.length}
>
    <li><button class="btn btn-accent" on:click={resetDefaults}>Restore defaults</button></li>

    <div class="divider">Look</div>
    <li>
        <label class="label">
            <span class="label-text">Mouse sensitivity <span class="text-xs text-primary">[{$mouseSensitivity}]</span></span>
            <input type="range" class="range" min={.1} max={4} step={.1} bind:value={$mouseSensitivity} />
        </label>
    </li>
    <li>
        <label class="label cursor-pointer">
            <span class="label-text flex flex-col">Swap left and right mouse buttons
                <span class="text-xs">(current {$mouseSwitchLeftRightButtons ? 'R: Shoot, L: Use' : 'L: Shoot, R: Use'})</span>
            </span>
            <input type="checkbox" class="checkbox" bind:checked={$mouseSwitchLeftRightButtons} />
        </label>
    </li>
    <li>
        <label class="label cursor-pointer">
            <span class="label-text">Invert mouse Y <span class="text-xs">(requires free look)</span></span>
            <input type="checkbox" class="checkbox" bind:checked={$mouseInvertY} />
        </label>
    </li>
    <li>
        <label class="label cursor-pointer">
            <span class="label-text">Free look</span>
            <input type="checkbox" class="checkbox" bind:checked={$freelook} />
        </label>
    </li>

    <div class="flex items-center py-1 z-10 sticky top-0 bg-base-100">
        <span class="flex-grow ps-4">Action</span>
        <span class="w-24">Primary</span>
        <span class="w-24">Alternate</span>
    </div>
    {#each groups as group}
        <div class="divider sticky my-2 z-10 top-6 bg-base-100">{group}</div>
        <!-- a hack... do we really want this setting in two places? -->
        {#if group === 'Additional movement'}
        <li>
            <label class="label cursor-pointer">
                <span class="label-text">Always run</span>
                <input type="checkbox" class="checkbox" bind:checked={$alwaysRun} />
            </label>
        </li>
        {/if}

        {#each keyMapping.filter(e => e.group === group) as key}
            <li>
                <div class="flex items-center py-1 gap-4">
                    <span class="flex-grow">{key.name}</span>
                    {#each { length: 2 } as _, i }
                        <button
                            class="btn w-24"
                            class:btn-primary={conflicts.includes(key.keys[i])}
                            on:click={remap(key, i)}
                        >
                            <kbd class:kbd={key.keys[i]} class="bg-transparent pointer-events-none">{keyName(key.keys[i])}</kbd>
                        </button>
                    {/each}
                </div>
            </li>
        {/each}
    {/each}
    <div class="divider sticky my-2 z-10 top-6 bg-base-100">Automap</div>
    <div class="text-sm p-2 rounded-box bg-base-300">TODO...</div>
</ul>

<style>
    /* Shift content down when the conflict alert is visible so that it doesn't cover anything important */
    .menu {
        transform: translateY(0em);
        transition: transform .4s;
    }
    .shift-down {
        transform: translateY(4em);
    }
</style>