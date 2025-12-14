<script lang="ts">
    import { WadStore, type WADInfo } from "../WadStore";
    import WadDropbox from "../render/Components/WadDropbox.svelte";
    import WadManagerScreen from "./WadManagerScreen.svelte";
	import { crossfade, fade, fly } from 'svelte/transition';
    import { useAppContext } from "../render/DoomContext";
    import Picture, { imageDataUrl } from '../render/Components/Picture.svelte';
    import { DoomWad, data } from "../doom";
    import AppInfo from "../render/Components/AppInfo.svelte";
    import MenuItem from "../render/Menu/MenuItem.svelte";
    import WadList from "../render/Components/WadList.svelte";
    import { Icon } from "@steeze-ui/svelte-icon";
    import { MagnifyingGlass } from "@steeze-ui/heroicons";
    import { menuCategories } from "../render/Menu/Menu.svelte";

    const [send, receive] = crossfade({
		duration: 300,
		fallback: fade,
	});

    export let wadStore: WadStore;
    export let wad: DoomWad = null;
    const { settingsMenu, pointerLock } = useAppContext();
    const settings = menuCategories(settingsMenu);

    const wads = wadStore.wads;
    // FIXME: There's a delay where the screen flickers from "no wads" to play during load. Hmmmm.....
    $: haveIWads = $wads.filter(wad => wad.iwad).length > 0;
    $: iWads = $wads.filter(wad => wad.iwad);
    $: pWads = $wads.filter(wad => !wad.iwad);

    let mapName: string;
    let selectedIWad: WADInfo;
    let selectedPWads: WADInfo[] = [];
    $: mapNames = wad?.mapNames ?? [];
    function parseUrlHash(hash: string, iwads: WADInfo[]) {
        const params = new URLSearchParams(hash.substring(1));

        const urlIWad = params.get('iwad') ?? params.get('wad');
        selectedIWad = iwads.find(e => e.name === urlIWad);
        if (!selectedIWad) {
            selectedPWads = [];
        }

        const urlMapName = params.get('map');
        if (urlMapName !== mapName) {
            mapName = urlMapName;
        }
    }
    $: parseUrlHash(window.location.hash, iWads);

    $: bgImage =
        wad ? imageDataUrl(wad, 'TITLEPIC', 'any', 'image/jpeg') : (
        selectedPWads.reduce<string>((img, pwad) => pwad.image ?? img, undefined)
        ?? selectedIWad?.image);

    function startGame() {
        pointerLock.requestLock();
    }

    let searchText = '';
    $: lowerCaseSearchText = searchText.toLowerCase();
    $: filteredWads = pWads.filter(wad => wad.name.includes(lowerCaseSearchText));

    let screen = 'Play';
    $: screens = haveIWads ? ['Play', 'WADs', 'Settings'] : [];
</script>

<svelte:window on:popstate={() => parseUrlHash(window.location.hash, iWads)} />

<div class="navbar bg-base-100 hidden sm:flex">
    <div class="navbar-start">
        <a class="btn btn-ghost text-xl" href={'#'}>Dunshire DOOM</a>
    </div>

    <div class="navbar-center">
        <div role="tablist" class="tabs tabs-bordered">
            {#each screens as sc}
                <input type="radio" name="screen" role="tab" class="tab" aria-label={sc} value={sc} bind:group={screen} />
            {/each}
        </div>
    </div>

    <div class="navbar-end"><AppInfo /></div>
</div>

<div class="grid grid-cols-1 grid-rows-1 justify-center">
    {#if !haveIWads}
        <div class="flex flex-col gap-2 sm:items-center justify-center p-8">
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
    {/if}

    {#if screen === 'Play'}
        <div class="
            mx-auto py-2 grid grid-cols-2 gap-4 px-4
            md:grid-cols-3 sm:gap-8 sm:px-8
            lg:grid-cols-4
        ">
            {#each iWads as iwad (iwad.name)}
                {#if selectedIWad !== iwad}
                    <a
                        class="btn h-auto no-animation p-0 overflow-hidden shadow-2xl hover:scale-105"
                        href="#iwad={iwad.name}"
                        in:receive={{ key: iwad.name }}
                        out:send={{ key: iwad.name }}
                    >
                        <img width="320" height="200" src={iwad.image} alt={iwad.name} />
                    </a>
                {/if}
            {/each}
        </div>

        {#if selectedIWad}

        <div out:fly={{ y: '-100%' }} in:fly={{ delay: 200, y: '-100%' }} class="flex gap-2 absolute sm:top-2 sm:left-2 z-30">
            <a class="btn btn-secondary w-48 shadow-xl" href={"#"}>❮ Select IWAD</a>
        </div>

        {@const selectedWadName = selectedIWad.name}
        <div class="card image-full bg-base-200 shadow-xl absolute inset-0"
            class:show-background={!Boolean(wad)}
            in:receive={{ key: selectedWadName }}
            out:send={{ key: selectedWadName }}
        >
            {#key bgImage}
            <figure transition:fade>
                <img class="flex-grow object-cover"
                    width="320" height="200"
                    src={bgImage} alt={'TITLEPIC'} />
            </figure>
            {/key}

            {#if wad}
                <div class="card-body justify-self-center pt-12">
                    <div
                        class="h-40 grid justify-items-center items-center"
                        class:grid-cols-[1fr_auto_1fr]={mapName?.startsWith('E')}
                    >
                        <span class="scale-[2]"><Picture {wad} name="M_DOOM" /></span>
                        {#if mapName?.startsWith('E')}
                            <div class="divider divider-horizontal"></div>
                            {@const ep = parseInt(mapName[1])}
                            <a class="btn h-full relative overflow-hidden" href="#{wad.name}">
                                <span class="scale-[2]"><Picture {wad} name={ep === 4 ? 'INTERPIC' : `WIMAP${ep - 1}`} /></span>
                                <span class="absolute bottom-0"><Picture {wad} name="M_EPI{ep}" /></span>
                            </a>
                        {/if}
                    </div>

                    <div class="bg-base-300 rounded-box shadow-xl p-4 flex flex-col gap-2">
                        {#if mapNames.includes('E1M1') && !mapName}
                            <span class="divider"><Picture {wad} name="M_EPISOD" /></span>
                            <div class="grid sm:grid-cols-2 gap-4 mx-auto">
                                {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as ep}
                                    {#if mapNames.includes(`E${ep}M1`)}
                                        <a class="btn h-full relative overflow-hidden" href="#{wad.name}&map=E{ep}M1">
                                            <span class="scale-[2]"><Picture {wad} name={ep > 3 ? 'INTERPIC' : `WIMAP${ep - 1}`} /></span>
                                            <span class="absolute bottom-0"><Picture {wad} name="M_EPI{ep}" /></span>
                                        </a>
                                    {/if}
                                {/each}
                            </div>
                        {:else}
                            <span class="divider"><Picture {wad} name="M_SKILL" /></span>
                            {#each data.skills as skill, i}
                                <a class="btn no-animation pulse-on-hover" in:fly={{ y: '-100%', delay: i * 50 }}
                                    href="#{wad.name}&skill={i + 1}&map={mapName ?? 'MAP01'}"
                                    on:click={startGame}
                                >
                                    <Picture {wad} name={skill.pic} />
                                </a>
                            {/each}
                        {/if}
                    </div>
                </div>

            {:else}
                <div class="card-body justify-end">
                    <h2 class="card-title">
                        <span>{selectedIWad.name}</span>
                        {#if selectedPWads.length}
                        <div class="divider sm:divider-horizontal">+</div>
                        <div class="flex flex-wrap gap-2 p-4 bg-base-300 rounded-box place-items-center">
                            {#each selectedPWads as pwad}
                                <div class="badge badge-primary badge-lg">{pwad.name}</div>
                            {/each}
                        </div>
                        {/if}
                    </h2>
                    <div class="card-actions">
                        <div in:fly={{ delay: 200, y: '100%' }} class="flex flex-col sm:flex-row gap-2 w-full">
                            <a
                                class="btn btn-primary btn-lg flex-grow no-animation shadow-xl"
                                href="#{[selectedIWad, ...selectedPWads].map(p => `wad=${p.name}`).join('&')}"
                            >Play</a>
                            {#if pWads.length}
                            <div class="dropdown dropdown-top">
                                <div tabindex="0" role="button" class="btn btn-lg min-w-80 shadow-xl">
                                    Mods (<a class="link link-primary" href="https://doomwiki.org/wiki/PWAD" target="_blank" rel="noreferrer" >PWADs</a>)
                                </div>
                                <div tabindex="-1"
                                    class="
                                        dropdown-content h-96 overflow-scroll bg-base-300 shadow rounded-t-xl
                                        absolute left-0 w-full
                                        sm:w-screen sm:max-w-[150%] sm:-left-1/2
                                    "
                                    style:--wadlist-boxHeight=".5rem"
                                >
                                    <div class="flex flex-wrap gap-1 items-center px-4 py-2 z-10 bg-base-100 sticky top-0 shadow-2xl">
                                        <button class="btn btn-sm" on:click={() => selectedPWads = []}>Clear selection</button>
                                        <label class="input input-bordered input-sm flex items-center gap-2 ms-auto">
                                            <input type="text" class="grow" placeholder="Search" bind:value={searchText} />
                                            <Icon src={MagnifyingGlass} theme='outline' size=".5rem" />
                                        </label>
                                    </div>
                                    <WadList wads={filteredWads} bind:selected={selectedPWads} />
                                </div>
                            </div>
                            {/if}
                        </div>
                    </div>
                </div>
            {/if}
        </div>
        {/if}
    {:else if screen === 'WADs'}
        <WadManagerScreen {wadStore} />
    {:else if screen === 'Settings'}
        <ul class="menu max-w-2xl mx-auto">
            {#each Object.entries(settings) as [category, values]}
               <div class="divider sticky my-2 z-10 top-0 bg-honeycomb">{category}</div>
                {#each values as item}
                    <li><MenuItem {item} /></li>
                {/each}
            {/each}
        </ul>
    {/if}
</div>

{#if haveIWads && !selectedIWad}
    <div class="btm-nav sm:hidden">
        {#each screens as sc}
            <button on:click={() => screen = sc} class:active={screen === sc}>{sc}</button>
        {/each}
    </div>
{/if}

<style>
    .card.image-full::before {
        transition: opacity .3s;
    }
    .show-background::before {
        opacity: 0;
    }

    .pulse-on-hover:hover {
        animation: pulse-saturate .5s infinite alternate-reverse;
    }

    @keyframes pulse-saturate {
        0% { filter: saturate(1); }
        100% { filter: saturate(1.5); }
    }
</style>