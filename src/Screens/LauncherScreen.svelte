<script lang="ts">
    import { crossfade, fade, fly } from "svelte/transition";
    import { data, tickTime, type DoomWad } from "../doom";
    import type { WADInfo } from "../WadStore";
    import Picture from "../render/Components/Picture.svelte";
    import { Home, MagnifyingGlass } from "@steeze-ui/heroicons";
    import { Icon } from "@steeze-ui/svelte-icon";
    import WadList from "../render/Components/WadList.svelte";
    import { useAppContext } from "../render/DoomContext";
    import { createSoundBufferCache } from "../render/SoundPlayer.svelte";
    import { onDestroy } from "svelte";
    import { menuSoundPlayer } from "../render/Menu/Menu.svelte";

    export let wads: WADInfo[];
    export let wad: DoomWad = null;
    $: iWads = wads.filter(wad => wad.iwad);
    $: pWads = wads.filter(wad => !wad.iwad);

    const { audio, soundGain, settings, musicTrack } = useAppContext();
    const { maxSoundChannels } = settings;
    $: menuSounds = menuSoundPlayer(audio, soundGain, wad ? createSoundBufferCache(audio, wad) : null);
    $: msfx = menuSounds.sfx;
    $: menuSounds.channelGain = (1 / 20 * Math.sqrt(Math.log($maxSoundChannels)));

    const [send, receive] = crossfade({
		duration: 350,
		fallback: fade,
	});

    let searchText = '';
    $: lowerCaseSearchText = searchText.toLowerCase();
    $: filteredWads = pWads.filter(wad => wad.name.includes(lowerCaseSearchText));

    let selectedIWad: WADInfo;
    let selectedPWads: WADInfo[] = [];
    let bgImage = '';
    $: $musicTrack = wad ? (wad.optionalLump('D_DM2TTL') ?? wad.optionalLump('D_INTRO')) : null;

    let selectedSkill = 3;
    let skullImage = 0;
    const skullImages = ['M_SKULL1', 'M_SKULL2'];
    // menu skull changes every 8 tics
    const skullChanger = setInterval(() => skullImage ^= 1, 1000 * tickTime * 8);
    onDestroy(() => clearInterval(skullChanger));

    let lastPwadsCount = 0;
    let lastIWad = '';
    let startPlaying = false;
    let mapName: string;
    $: mapNames = wad?.mapNames ?? [];
    function parseUrlHash(hash: string, iwads: WADInfo[]) {
        const params = new URLSearchParams(hash.substring(1));

        const wads = params.getAll('wad');
        selectedIWad = iwads.find(e => e.name === wads[0]);
        selectedPWads = wads.map(p => pWads.find(e => e.name === p)).filter(e => e);
        bgImage = selectedPWads.reduce<string>((img, pwad) => pwad.image ?? img, undefined) ?? selectedIWad?.image;

        if (selectedIWad?.name !== lastIWad) {
            (lastIWad ? msfx.swtchx : msfx.pistol)();
        }
        if (lastPwadsCount !== selectedPWads.length) {
            (lastPwadsCount - selectedPWads.length > 0 ? msfx.swtchx : msfx.swtchn)();
        }
        lastIWad = selectedIWad?.name ?? '';
        lastPwadsCount = selectedPWads.length;

        let play = startPlaying;
        startPlaying = params.has('play') || params.has('map');
        if (play !== startPlaying) {
            (play ? msfx.swtchx : msfx.pistol)();
        }
        const urlMapName = params.get('map');
        if (urlMapName !== mapName) {
            mapName = urlMapName;
        }
    }
    $: parseUrlHash(window.location.hash, iWads);

    // TODO: the url state management in this component is a mess. The whole component is a mess really. It works but
    // it feels like it could be written in a much cleaner and tidier way.
    $: if (wad && selectedPWads && !startPlaying && !mapName) {
        window.location.href = '#' + [selectedIWad, ...selectedPWads].filter(p => p).map(p => `wad=${p.name}`).join('&');
    }
</script>

<svelte:window on:popstate={() => parseUrlHash(window.location.hash, iWads)} />

<div class="
    mx-auto py-2 grid grid-cols-2 gap-4 px-4 place-content-start
    md:grid-cols-3 sm:gap-8 sm:px-8
    lg:grid-cols-4
">
    {#each iWads as iwad (iwad.name)}
        {#if selectedIWad !== iwad}
            <a
                class="btn h-auto no-animation p-0 overflow-hidden shadow-2xl hover:scale-105"
                href="#wad={iwad.name}"
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
    <a class="btn btn-secondary w-48 shadow-xl" href={"#"}><Icon src={Home} theme='solid' size="16px"/> Home</a>
</div>

{@const selectedWadName = selectedIWad.name}
<div class="card image-full bg-base-200 shadow-xl absolute inset-0"
    class:show-background={!Boolean(wad && startPlaying)}
    in:receive={{ key: selectedWadName }}
    out:send={{ key: selectedWadName }}
>
    {#key bgImage}
    <figure transition:fade>
        <img class="flex-grow"
            width="320" height="200"
            src={bgImage} alt={'TITLEPIC'} />
    </figure>
    {/key}

    {#if wad && startPlaying}
        <div class="card-body justify-self-center pt-24">
            <div
                class="h-40 grid justify-items-center items-center"
                class:grid-cols-[1fr_auto_1fr]={mapName?.startsWith('E')}
            >
                <a href="#{wad.name}" class="scale-[2]"><Picture {wad} name="M_DOOM" /></a>
                {#if mapName?.startsWith('E')}
                    <div class="divider divider-horizontal"></div>
                    {@const ep = parseInt(mapName[1])}
                    <a class="btn h-full relative overflow-hidden" href="#{wad.name}&play"
                        on:pointerenter={msfx.stnmov}
                        on:click={msfx.swtchx}
                    >
                        <span class="scale-[1.2] hover:scale-[1.1] transition-transform">
                            <Picture {wad} name={ep === 4 ? 'INTERPIC' : `WIMAP${ep - 1}`} />
                        </span>
                        <span class="absolute bottom-0"><Picture {wad} name="M_EPI{ep}" /></span>
                    </a>
                {/if}
            </div>

            <div class="bg-base-300 rounded-box shadow-xl p-4 flex flex-col gap-2 z-10" style:--tw-bg-opacity={.7}>
                {#if mapNames.includes('E1M1') && !mapName}
                    <span class="divider"><Picture {wad} name="M_EPISOD" /></span>
                    <div class="grid sm:grid-cols-2 gap-4 mx-auto">
                        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as ep}
                            {#if mapNames.includes(`E${ep}M1`)}
                                <a class="btn h-full relative overflow-hidden" href="#{wad.name}&map=E{ep}M1"
                                    on:pointerenter={msfx.pstop}
                                    on:click={msfx.pistol}
                                >
                                    <span class="scale-[1.1] hover:scale-[1.2] transition-transform">
                                        <Picture {wad} name={ep > 3 ? 'INTERPIC' : `WIMAP${ep - 1}`} />
                                    </span>
                                    <span class="absolute bottom-0"><Picture {wad} name="M_EPI{ep}" /></span>
                                </a>
                            {/if}
                        {/each}
                    </div>
                {:else}
                    <span class="divider"><Picture {wad} name="M_SKILL" /></span>
                    {#each data.skills as skill, i}
                        <a class="btn no-animation pulse-on-hover flex justify-start gap-4" in:fly={{ y: '-100%', delay: i * 50 }}
                            href="#{wad.name}&skill={i + 1}&map={mapName ?? 'MAP01'}"
                            on:pointerenter={msfx.pstop}
                            on:pointerenter={() => selectedSkill = i}
                            on:click={msfx.pistol}
                        >
                            <span class="scale-125 opacity-0 transition-opacity" class:opacity-100={selectedSkill === i}>
                                <Picture {wad} name={skullImages[skullImage]} />
                            </span>
                            <Picture {wad} name={skill.pic} />
                        </a>
                    {/each}
                {/if}
            </div>
        </div>

    {:else if wad}
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
                <div in:fly={{ delay: 200, y: '60%' }} class="flex flex-col sm:flex-row gap-2 w-full">
                    <a
                        class="btn btn-primary btn-lg flex-grow no-animation shadow-xl"
                        href="#{wad.name}&play"
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
                                    <Icon src={MagnifyingGlass} theme='outline' size="8px" />
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

<style>
    /* .card.image-full > figure img {
        object-fit: contain;
    } */
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