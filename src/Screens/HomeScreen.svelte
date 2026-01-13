<script lang="ts">
    import { data, LumpPicture, type DoomWad } from "../doom";
    import AppInfo from "../render/Components/AppInfo.svelte";
    import WadDropbox from "../render/Components/WadDropbox.svelte";
    import LauncherScreen from "./LauncherScreen.svelte";
    import { useAppContext } from "../render/DoomContext";
    import { menuCategories } from "../render/Menu/Menu.svelte";
    import { defaultPalette, type WadStore } from "../WadStore";
    import MenuItem from "../render/Menu/MenuItem.svelte";
    import WadManagerScreen from "./WadManagerScreen.svelte";
    import { onMount } from "svelte";
    import { unzip } from "fflate";
    import Picture, { pictureDataUrl } from "../render/Components/Picture.svelte";

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

    // TODO: generate this in build-scripts/remote-download ?
    type DefaultWad = typeof defaultWads[0];
    const defaultWads = $state([
        { name: 'Freedoom Phase 1', link: 'public/remotes/freedoom1.zip', size: '10MB', installProgress: 0 },
        { name: 'Freedoom Phase 2', link: 'public/remotes/freedoom2.zip', size: '10.5MB', installProgress: 0 },
    ]);
    async function installWad(wad: DefaultWad) {
        const response = await fetch(wad.link);
        const totalSize = parseInt(response.headers.get('content-length') ?? '1');
        const zippedWad = new Uint8Array(totalSize);
        let progress = 0;
        for await (const chunk of response.body) {
            zippedWad.set(chunk, progress);
            progress += chunk.byteLength;
            wad.installProgress = progress / totalSize;
        }

        unzip(zippedWad, {}, (err, data) => {
            const wadName = wad.link.split('/').pop().split('.').shift();
            wadStore.saveWad(wadName, data[wadName + '.wad'] as any)
                // it would be cool to use <a href..> in the markup instead of navigating like this but if we do that
                // navigation happens before we download/install the wad so we see an error instead
                .then(() => history.pushState(null, null, `#wad=${wadName}`));
        });
    }

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
                        <p>To start playing DOOM, drag and drop DOOM WAD files into the drop box.</p>
                    </div>
                    <div class="py-8 px-2 mx-auto">
                        <WadDropbox {wadStore} />
                    </div>
                    <p>Don't have any DOOM WADs? Try out Freedoom 1 or Freedoom 2.</p>
                    <div class="flex gap-4 flex-wrap">
                        {#each defaultWads as wad}
                            <button
                                class="btn wad-install h-auto no-animation p-0 overflow-hidden shadow-2xl relative"
                                style:--wad-install-progress="{wad.installProgress}turn"
                                onclick={() => installWad(wad)}
                            >
                                {@render lumpPicture(wad)}
                                <div
                                    class="download-info absolute bottom-2 left-2 p-2 items-end text-secondary bg-black rounded-lg gap-2"
                                    style:--tw-bg-opacity={.5}
                                >
                                    <span>{wad.size} download</span>
                                </div>
                            </button>
                        {/each}
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

{#snippet lumpPicture(wad: DefaultWad)}
    {@const titlepic = wad.link.replace('.zip', '.titlepic.lump')}
    {@const dataUrl = fetch(titlepic)
        .then(res => res.bytes())
        .then(bytes => new LumpPicture(bytes, defaultPalette))
        .then(pic => pictureDataUrl(pic, 'image/png'))}
    {#await dataUrl}
        <div class="flex justify-center">
            <span class="loading loading-spinner loading-md"></span>
        </div>
    {:then data}
        <img width="320" height="200" src={data} alt={wad.name} />
    {/await}
{/snippet}

<style>
    .wad-install:before {
        content: '';
        position: absolute;
        inset: 0;
        background: conic-gradient(
            transparent 0deg,
            transparent var(--wad-install-progress),
            rgba(0, 0, 0, 0.3) var(--wad-install-progress)
        );
    }

    .download-info {
        transition: transform .2s;
        transform: translate(0, 150%);
    }
    .wad-install:hover .download-info {
        transform: translate(0, 0);
    }
</style>