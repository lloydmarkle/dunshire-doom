<script lang="ts">
    import { type DoomWad } from "../doom";
    import AppInfo from "../render/Components/AppInfo.svelte";
    import WadDropbox from "../render/Components/WadDropbox.svelte";
    import LauncherScreen from "./LauncherScreen.svelte";
    import { useAppContext } from "../render/DoomContext";
    import { menuCategories } from "../render/Menu/Menu.svelte";
    import { type WadStore } from "../WadStore";
    import MenuItem from "../render/Menu/MenuItem.svelte";
    import WadManagerScreen from "./WadManagerScreen.svelte";
    import { onMount } from "svelte";
    import PreloadedWad, { preloadedWads } from './Launcher/PreloadWad.svelte';

    interface Props {
        wadStore: WadStore;
        wad: DoomWad;
    }
    let { wadStore, wad = null }: Props = $props();
    const { settingsMenu, pointerLock } = useAppContext();
    const settings = menuCategories(settingsMenu);
    onMount(pointerLock.releaseLock);

    let wads = $derived(wadStore.wads);
    let haveIWads = $derived($wads.some(wad => wad.iwad));
    let screens = $derived(haveIWads ? [
        ['Play', ''],
        ['WADs', 'tab=wads'],
        ['Settings', 'tab=settings'],
    ] : []);

    let screen = $state('Play');
    function parseUrlHash(hash: string, scs: string[][]) {
        const params = new URLSearchParams(hash.substring(1));
        const sc = params.get('tab');
        screen = scs.find(e => e[1].split('=')[1] === sc)?.[0] ?? 'Play';
    }
    $effect(() => parseUrlHash(window.location.hash, screens ?? []));
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
                    </div>
                    <div class="py-8 px-2 mx-auto">
                        <p>To start playing DOOM, drag and drop DOOM WAD files into the drop box.</p>
                        <WadDropbox {wadStore} />
                    </div>
                    <div class="divider max-w-4xl w-full self-center">OR</div>
                    <p>Don't have any DOOM WADs? Try out Freedoom 1 or Freedoom 2.</p>
                    <div class="flex gap-4 flex-wrap">
                        {#each preloadedWads as wad}
                            <PreloadedWad {wadStore} {wad} />
                        {/each}
                    </div>
                </div>
            {/if}
        {/await}

        {#if screen === 'Play' && haveIWads}
            <LauncherScreen {wadStore} {wad} wads={$wads} />
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
