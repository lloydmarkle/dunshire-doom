<script lang="ts">
    import { WadStore, type WADInfo } from "./WadStore";
    import WadDropbox from "./WadDropbox.svelte";
	import { crossfade, fade, fly } from 'svelte/transition';
    import { useAppContext } from "./render/DoomContext";
    import Picture, { imageDataUrl } from './render/Components/Picture.svelte';
    import { DoomWad, data } from "./doom";

    const [send, receive] = crossfade({
		duration: 300,
		fallback: fade,
	});

    export let wadStore: WadStore;
    export let wad: DoomWad = null;

    const { pointerLock } = useAppContext();
    const wads = wadStore.wads;
    $: iWads = $wads.filter(wad => wad.iwad);
    $: pWads = $wads.filter(wad => !wad.iwad);

    // used for exit transition. For some reason selectedIWad.name is always null
    let selectedWadName: string;
    let mapName: string;
    let selectedIWad: WADInfo;
    // TODO: also manage pwads via url params?
    let selectedPWads: WADInfo[] = [];
    $: mapNames = wad?.mapNames ?? [];
    function parseUrlHash(hash: string, iwads: WADInfo[]) {
        const params = new URLSearchParams(hash.substring(1));

        const urlIWad = params.get('iwad') ?? params.get('wad');
        if (urlIWad) {
            selectedWadName = urlIWad;
            selectedIWad = iwads.find(e => e.name === selectedWadName);
            selectedPWads = [];
        } else {
            selectedIWad = null;
        }

        const urlMapName = params.get('map');
        if (urlMapName !== mapName) {
            mapName = urlMapName;
        }
    }
    $: parseUrlHash(window.location.hash, iWads);

    function togglePWad(pwad: WADInfo) {
        if (selectedPWads.includes(pwad)) {
            selectedPWads = selectedPWads.filter(pw => pw !== pwad)
        } else {
            selectedPWads = [...selectedPWads, pwad]
        }
    }

    function detailsString(wad: WADInfo) {
        return `${wad.mapCount} maps` + (wad.episodicMaps ? ' (episodic)' : '');
    }

    function startGame() {
        pointerLock.requestLock();
    }
</script>

<svelte:window on:popstate={() => parseUrlHash(window.location.hash, iWads)} />

<div out:fade class="
    container mx-auto grid grid-cols-1 grid-rows-1 p-2 bg-base-100 justify-center
    md:rounded-box md:shadow-2xl
">
    {#if !iWads.length}
    <div class="flex flex-col place-items-center justify-center min-h-48">
        <p>No game <a class="link link-primary" href="https://doomwiki.org/wiki/IWAD" target="_blank" rel="noreferrer" >IWADs</a> found.</p>
        <p>To start playing DOOM, drag and drop DOOM WAD files into the drop box below.</p>
        <p>
            Don't have any DOOM WADs?
            Try out <a class="link link-primary" href="https://github.com/freedoom/freedoom/releases/download/v0.13.0/freedoom-0.13.0.zip">FreeDoom</a>
            or the <a class="link link-primary" href="https://distro.ibiblio.org/slitaz/sources/packages/d/doom1.wad">DOOM shareware WAD</a>.
        </p>
    </div>
    <div class="p-8 max-w-6xl mx-auto">
        <WadDropbox {wadStore} />
    </div>
    {:else}
    <div class="flex flex-col gap-2">
        <div class="grid sm:grid-cols-2 mx-auto gap-4">
            {#each iWads as iwad (iwad.name)}
                {#if selectedIWad !== iwad}
                <a
                    class="btn h-auto no-animation"
                    href="#iwad={iwad.name}"
                    in:receive={{ key: iwad.name }}
                    out:send={{ key: iwad.name }}
                >
                    <img src={iwad.image} alt={iwad.name} />
                </a>
                {/if}
            {/each}
        </div>
        <div class="p-8 max-w-6xl mx-auto">
            <WadDropbox {wadStore} />
        </div>
    </div>
    {/if}

    {#if selectedIWad}
    <div out:fly={{ y: '-100%' }} in:fly={{ delay: 200, y: '-100%' }} class="flex gap-2 absolute sm:top-2 sm:left-2 z-30">
        <a class="btn btn-secondary w-48 shadow-xl" href={"#"}>❮ Select IWAD</a>
    </div>

    <div class="card image-full bg-base-200 shadow-xl absolute inset-0"
        class:show-background={!Boolean(wad)}
        in:receive={{ key: selectedWadName }}
        out:send={{ key: selectedWadName }}
    >
        <figure>
            <img class="flex-grow object-cover"
                src={wad ? imageDataUrl(wad, 'TITLEPIC', 'any') : selectedIWad.image}
                alt={''} />
        </figure>

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
                <div in:fly={{ delay: 200, y: '100%' }} class="flex gap-2 w-full">
                    <a
                        class="btn btn-primary btn-lg flex-grow no-animation shadow-xl"
                        href="#{[selectedIWad, ...selectedPWads].map(p => `wad=${p.name}`).join('&')}"
                    >Play</a>
                    {#if pWads.length}
                    <div class="dropdown dropdown-top flex-shrink">
                        <!-- <input type="checkbox"/> -->
                        <div tabindex="0" role="button" class="btn btn-lg min-w-80 shadow-xl">
                            Addons (<a class="link link-primary" href="https://doomwiki.org/wiki/PWAD" target="_blank" rel="noreferrer" >PWADs</a>)
                        </div>
                        <ul tabindex="-1" class="dropdown-content menu flex-nowrap max-h-64 overflow-scroll bg-base-300 shadow rounded-box">
                            <li><button class="btn btn-sm" on:click={() => selectedPWads = []}>Clear selection</button></li>
                            {#each pWads as pwad (pwad.name)}
                                {@const checked = selectedPWads.includes(pwad)}
                                <li>
                                    <label class="label cursor-pointer">
                                        <span class="label-text">{pwad.name} <span class="text-xs">[{detailsString(pwad)}]</span></span>
                                        <input type="checkbox" class="checkbox" {checked} on:change={() => togglePWad(pwad)} />
                                    </label>
                                </li>
                            {/each}
                        </ul>
                    </div>
                    {/if}
                </div>
            </div>
        </div>
        {/if}
    </div>
    {/if}
</div>

<style>
    .container {
        min-height: min(100vh, 36rem);
    }

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