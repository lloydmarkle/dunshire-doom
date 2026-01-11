<script lang="ts">
    import type { DoomWad } from "../doom";
    import AppInfo from "../render/Components/AppInfo.svelte";
    import WadDropbox from "../render/Components/WadDropbox.svelte";
    import LauncherScreen from "./LauncherScreen.svelte";
    import { useAppContext } from "../render/DoomContext";
    import { menuCategories } from "../render/Menu/Menu.svelte";
    import type { WadStore } from "../WadStore";
    import MenuItem from "../render/Menu/MenuItem.svelte";
    import WadManagerScreen from "./WadManagerScreen.svelte";
    import { onMount } from "svelte";

    export let wadStore: WadStore;
    export let wad: DoomWad = null;
    const { settingsMenu, pointerLock } = useAppContext();
    const settings = menuCategories(settingsMenu);
    onMount(pointerLock.releaseLock);

    const wads = wadStore.wads;
    $: haveIWads = $wads.some(wad => wad.iwad);
    $: screens = haveIWads ? [
        ['Play', ''],
        ['WADs', 'tab=wads'],
        ['Settings', 'tab=settings'],
    ] : [];
    let screen = 'Play';

    function parseUrlHash(hash: string, scs: string[][]) {
        const params = new URLSearchParams(hash.substring(1));
        const sc = params.get('tab');
        screen = scs.find(e => e[1].split('=')[1] === sc)?.[0] ?? 'Play';
    }
    $: parseUrlHash(window.location.hash, screens ?? []);
</script>

<svelte:window on:popstate={() => parseUrlHash(window.location.hash, screens)} />

<div class="grid grid-cols-1 grid-rows-[min-content_1fr] h-full bg-honeycomb">
    <div class="navbar bg-base-100 hidden sm:flex">
        <div class="navbar-start">
            <a class="btn btn-ghost text-xl" href={'#'}>Dunshire DOOM</a>
        </div>

        <div class="navbar-center">
            <div role="tablist" class="tabs tabs-bordered">
                {#each screens as [name, url]}
                    <a role="tab" class="tab" class:tab-active={screen === name} href="#{url}">{name}</a>
                {/each}
            </div>
        </div>

        <div class="navbar-end"><AppInfo /></div>
    </div>

    <div class="grid grid-cols-1 grid-rows-1 w-full max-h-full overflow-y-scroll">
        {#await wadStore.ready}
            <div class="flex justify-center pt-24">
                <span class="loading loading-spinner loading-md"></span>
            </div>
        {:then _}
            {#if !haveIWads}
                <div class="flex flex-col gap-2 sm:items-center justify-center p-8">
                    <div class="flex flex-col gap-2 justify-center">
                        <p>No game <a class="link link-primary" href="https://doomwiki.org/wiki/IWAD" target="_blank" rel="noreferrer" >IWADs</a> found.</p>
                        <p>To start playing DOOM, drag and drop DOOM WAD files into the drop box below.</p>
                        <p>
                            Don't have any DOOM WADs?
                            Try out <a class="link link-primary" href="https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip">FreeDoom</a>
                            or the <a class="link link-primary" href="https://distro.ibiblio.org/slitaz/sources/packages/d/doom1.wad">DOOM shareware WAD</a>.
                        </p>
                    </div>
                    <div class="py-8 px-2 mx-auto">
                        <WadDropbox {wadStore} />
                    </div>
                </div>
            {/if}
        {/await}

        {#if screen === 'Play'}
            <LauncherScreen {wad} wads={$wads} />
        {:else if screen === 'WADs'}
            <WadManagerScreen {wadStore} />
        {:else if screen === 'Settings'}
        <div class="max-w-2xl mx-auto ">
            <ul class="menu bg-base-100 flex-nowrap pb-24">
                {#each Object.entries(settings) as [category, values]}
                <div class="divider sticky my-2 z-10 top-0 bg-base-100">{category}</div>
                    {#each values as item}
                        <li><MenuItem {item} /></li>
                    {/each}
                {/each}
            </ul>
        </div>
        {/if}
    </div>

    {#if haveIWads && !wad}
        <div class="btm-nav sm:hidden z-10 bg-base-300">
            {#each screens as [name, url]}
                <a role="tab" class:active={screen === name} href="#{url}">{name}</a>
            {/each}
        </div>
    {/if}
</div>