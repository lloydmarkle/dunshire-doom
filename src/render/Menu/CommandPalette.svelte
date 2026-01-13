<script lang="ts" context="module">
    let recentlyUsed: MenuSetting[] = [];
    const maxRecentlyUsed = 5;

    function useSetting(item: MenuSetting) {
        const filteredUsed = recentlyUsed.filter((e, i) => e.text !== item.text && i < maxRecentlyUsed);
        recentlyUsed = [item, ...filteredUsed];
    }
</script>
<script lang="ts">
    import { MagnifyingGlass } from "@steeze-ui/heroicons";
    import { Icon } from "@steeze-ui/svelte-icon";
    import { useAppContext, useDoom, type MenuSetting } from "../DoomContext";
    import MenuItem from "./MenuItem.svelte";
    import { store } from "../../doom";
    import { applySoundsToDOM, menuSoundPlayer } from "./Menu.svelte";
    import { createSoundBufferCache } from "../SoundPlayer.svelte";
    import { tick } from "svelte";

    export let active: boolean;

    const { wad } = useDoom();
    const { settingsMenu, editor, audio, soundGain } = useAppContext();
    const { muted, simulate486 } = useAppContext().settings;

    const inspectorEnabled = store($editor.active);
    inspectorEnabled.subscribe(val => $editor.active = val);
    const settingsIndex: (MenuSetting & { searchText: string })[] = [
        ...settingsMenu,
        { type: 'toggle', cat: 'normal', val: muted, text: 'Mute sound' },
        { type: 'toggle', cat: 'advanced', val: simulate486, text: '486 simulator' },
        // { type: 'toggle', cat: 'advanced', val: fullscreen, text: 'Fullscreen' },
        { type: 'toggle', cat: 'advanced', val: inspectorEnabled, text: 'Debug inspector' },
    ].map<any>(e => ({ ...e, searchText: e.text.toLocaleLowerCase() + (e.type === 'option' ? (e as any).options.join(' ') : '') }));

    let activeItem = 0;
    let searchText = '';
    $: if (active) {
        activeItem = 0;
    } else {
        searchText = '';
        activeItem = -1;
    }
    $: lcSearchText = searchText.toLocaleLowerCase();
    $: menuItems = searchText ? settingsIndex.filter(e => e.searchText.includes(lcSearchText)) : recentlyUsed;

    const sounds = menuSoundPlayer(audio, soundGain, createSoundBufferCache(audio, wad));
    $: (active ? sounds.sfx.swtchn : sounds.sfx.swtchx)();
    let menuRoot: HTMLDivElement;
    $: if (!searchText && recentlyUsed.length) tick().then(() => applySoundsToDOM(menuRoot, sounds));

    const wrapAround = (n: number, max: number) => n > max - 1 ? 0 : n < 0 ? max - 1 : n;
    const slide = (item: MenuSetting, direction: -1 | 1) => {
        if (!item) {
            return;
        }
        if (item.type !== 'color') {
            useSetting(item);
        }
        if (item.type === 'option') {
            sounds.sfx.pistol();
            item.val.update(v => {
                let index = item.options.findIndex(e => e === v);
                index = wrapAround(index + direction, item.options.length);
                return item.options[index];
            });
        } else if (item.type === 'range') {
            sounds.sfx.stnmov();
            item.val.update(v => Math.max(item.min, Math.min(item.max, v + item.step * direction)));
        } else if (item.type === 'toggle') {
            sounds.sfx.pistol();
            item.val.update(v => !v);
        }
    };
    const verticalMove = (dir: -1 | 1) => {
        sounds.sfx.pstop();
        activeItem = wrapAround(activeItem + dir, menuItems.length);
    };
    const tap = (item: MenuSetting) => (item.type !== 'range') ? slide(item, 1) : null;

    const keys = {
        'ArrowLeft': () => slide(menuItems[activeItem], -1),
        'ArrowRight': () => slide(menuItems[activeItem], 1),
        'ArrowUp': () => verticalMove(-1),
        'ArrowDown': () => verticalMove(1),
        'Enter': () => tap(menuItems[activeItem]),
        'Return': () => tap(menuItems[activeItem]),
    };

    let searchBox: HTMLInputElement;
    function keydown(ev: KeyboardEvent) {
        if (ev.code === 'Slash') {
            if (!active) {
                ev.preventDefault();
            }
            active = true;
            tick().then(() => searchBox.focus());
        }
        if (keys[ev.code] && !ev.metaKey && !ev.altKey && !ev.ctrlKey) {
            ev.preventDefault();
            keys[ev.code]?.();
        }
    }
    function keyup(ev: KeyboardEvent) {
        if (!active) {
            return;
        }
        switch (ev.code) {
            case 'Escape':
                active = false;
                ev.preventDefault();
                ev.stopImmediatePropagation();
                break;
        }
    }
</script>

<svelte:window
    on:keyup={keyup}
    on:keydown={keydown}
/>

<div
    bind:this={menuRoot}
>
    <label
        class="input input-bordered flex items-center gap-2 text-sm"
        class:hidden={!active}
    >
        <Icon src={MagnifyingGlass} theme='outline' size="12px" />
        <input
            type="text"
            class="grow" placeholder="Search settings"
            bind:this={searchBox}
            bind:value={searchText}
            on:input={() => activeItem = 0}
        />
        <kbd class="kbd">/</kbd>
    </label>

    <div class="menu cp-menu">
        {#if !searchText && recentlyUsed.length}
            <div class="divider my-2 top-12 md:top-0">Recently used</div>
        {/if}
        {#each menuItems as item, i}
            <li><MenuItem {item} active={i === activeItem} /></li>
        {/each}
    </div>
</div>
