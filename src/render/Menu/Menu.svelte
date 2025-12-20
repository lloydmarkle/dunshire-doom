<script lang="ts" context="module">
    export function loadOptionalUrlParams(game: Game, params: URLSearchParams) {
        const player = game.map.val.player;

        const x = params.has('player-x') ? parseFloat(params.get('player-x')) : player.position.x;
        const y = params.has('player-y') ? parseFloat(params.get('player-y')) : player.position.y;
        const z = params.has('player-z') ? parseFloat(params.get('player-z')) : player.position.z;
        player.position.set(x, y, z);
        player.positionChanged();

        const yaw = params.has('player-dir') ? parseFloat(params.get('player-dir')) : player.direction;
        player.direction = yaw;
        const pitch = params.has('player-aim') ? parseFloat(params.get('player-aim')) : player.pitch;
        player.pitch = pitch;
    }

    function createShareUrl(game: Game) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const player = game.map.val.player;

        const pos = player.position;
        params.set('player-x', pos.x.toFixed(2));
        params.set('player-y', pos.y.toFixed(2));
        params.set('player-z', pos.z.toFixed(2));
        params.set('player-aim', player.pitch.toFixed(2));
        params.set('player-dir', player.direction.toFixed(2));

        window.location.hash = '#' + params.toString();
        navigator.clipboard.writeText(window.location.href);
        return window.location.href;
    }

    export const menuCategories = (settingsMenu: any) => ({
        Normal: settingsMenu.filter(e => e.cat === "normal"),
        Advanced: settingsMenu.filter(e => e.cat === "advanced"),
        Compatibility: settingsMenu.filter(e => e.cat === "compatibility"),
        Debug: settingsMenu.filter(e => e.cat === "debug"),
        Experimental: settingsMenu.filter(e => e.cat === "experimental"),
    });

    export function menuSoundPlayer(audio: AudioContext, audioRoot: AudioNode, soundCache: ReturnType<typeof createSoundBufferCache>) {
        // 16 is more than a reasonable max number of simultaneous sounds
        let channelGain = (1 / 20 * Math.sqrt(Math.log(16)));
        const playSound = (snd: SoundIndex): [AudioBufferSourceNode, GainNode] => {
            if (!soundCache) {
                return;
            }
            const soundNode = audio.createBufferSource();
            soundNode.buffer = soundCache(snd);

            const gainNode = audio.createGain();
            configureGain(gainNode, audio.currentTime, channelGain, soundNode.buffer);
            soundNode.connect(gainNode).connect(audioRoot);
            soundNode.detune.value = randInt(-16, 16) * 4;
            soundNode.start();
            return [soundNode, gainNode];
        };

        const singleSound = (snd: SoundIndex, minDuration = 0) => {
            if (!soundCache) {
                return () => {}
            }

            let startTime: number;
            let interruptLast: () => void;
            return () => {
                const now = audio.currentTime;
                if (interruptLast && (now - startTime) < minDuration) {
                    return;
                }
                if (interruptLast) {
                    interruptLast();
                }

                startTime = now;
                const [soundNode, gainNode] = playSound(snd);
                soundNode.onended = () => interruptLast = null;
                interruptLast = () => {
                    const now = audio.currentTime;
                    if(now - startTime + interruptFadeOut > soundNode.buffer.duration) {
                        // already near the end of the sound so just finish it
                        return;
                    }
                    stopSound(now, gainNode, soundNode);
                };
            }
        };

        const sfx = {
            pstop: singleSound(SoundIndex.sfx_pstop, 0.2),
            pistol: singleSound(SoundIndex.sfx_pistol),
            stnmov: singleSound(SoundIndex.sfx_stnmov, 0.2),
            swtchn: singleSound(SoundIndex.sfx_swtchn),
            swtchx: singleSound(SoundIndex.sfx_swtchx),
        }

        return { channelGain, playSound, singleSound, sfx };
    }
</script>
<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { useAppContext, useDoom } from "../DoomContext";
    import MenuItem from "./MenuItem.svelte";
    import AppInfo from "../Components/AppInfo.svelte";
    import MapNamePic from "../Components/MapNamePic.svelte";
    import Picture from "../Components/Picture.svelte";
    import { type Game, SoundIndex, data, randInt } from "../../doom";
    import MapStats from "./MapStats.svelte";
    import CheatsMenu from "./CheatsMenu.svelte";
    import KeyboardControlsMenu from "./KeyboardControlsMenu.svelte";
    import TouchControlsMenu from "./TouchControlsMenu.svelte";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { SpeakerWave, SpeakerXMark, VideoCamera, Cube, Eye, User, ArrowsPointingIn, ArrowsPointingOut, GlobeEuropeAfrica } from '@steeze-ui/heroicons'

    const { game } = useDoom();
    const { settingsMenu, editor, pointerLock, fullscreen } = useAppContext();
    const { muted, cameraMode, simulate486 } = useAppContext().settings;
    const { intermission, map } = game;

    const transitionDuration = 200;
    const touchDevice = matchMedia('(hover: none)').matches;
    // a hack to allow a fullscreen menu for configuring touch controls
    let showTouchControls = false;

    $: isFullscreen = fullscreen.isFullscreen;
    const toggleFullscreen = () => $isFullscreen
        ? fullscreen.releaseFullscreen()
        : fullscreen.requestFullscreen();

    $: episodeEnd = $intermission && $intermission.finishedMap.name.endsWith('M8');
    $: nextEpisodeMap = `E${1 + parseInt(episodeEnd ? $intermission.finishedMap.name[1] : '-1')}M1`;
    $: hasNextEpisode = game.wad.mapNames.includes(nextEpisodeMap);
    function startNextEpisode() {
        game.resetInventory();
        game.startMap(nextEpisodeMap);
        pointerLock.requestLock();
    }

    let shared = false;
    function share() {
        location.href = createShareUrl(game);
        shared = true;
    }

    const settings = menuCategories(settingsMenu);

    function keyup(ev: KeyboardEvent) {
        switch (ev.code) {
            case "Backquote":
            case "Escape":
                resumeGame();
                ev.stopImmediatePropagation();
                break;
        }
    }

    function resumeGame() {
        pointerLock.requestLock();
    }

    import { configureGain, createSoundBufferCache, interruptFadeOut, stopSound } from "../SoundPlayer.svelte";
    import { onMount } from "svelte";
    const { audio, soundGain } = useAppContext();
    const { maxSoundChannels } = useAppContext().settings;
    $: soundCache = createSoundBufferCache(audio, game.wad);
    $: menuSounds = menuSoundPlayer(audio, soundGain, soundCache);
    $: menuSounds.channelGain = (1 / 20 * Math.sqrt(Math.log($maxSoundChannels)));
    onMount(() => {
        document.querySelectorAll('.btn').forEach(b => b.addEventListener('pointerenter', menuSounds.sfx.pstop));
        document.querySelectorAll('.dropdown .btn').forEach(b => b.addEventListener('click', menuSounds.sfx.pistol));
        document.querySelectorAll('select').forEach(b => b.addEventListener('change', menuSounds.sfx.swtchn));
        document.querySelectorAll('label').forEach(b => b.addEventListener('pointerenter', menuSounds.sfx.pstop));
        document.querySelectorAll('input[type="checkbox"]').forEach(b => b.addEventListener('click', menuSounds.sfx.pistol));
        document.querySelectorAll('input[type="range"]').forEach(b => b.addEventListener('input', menuSounds.sfx.stnmov));
    })
</script>

<svelte:window on:keyup|preventDefault={keyup} />

<div
    transition:fade={{ duration: transitionDuration }}
    on:introstart={menuSounds.sfx.swtchn}
    on:outrostart={menuSounds.sfx.swtchx}
    class:hidden={$editor.active}
    class="absolute inset-0 opacity-50 bg-neutral pointer-events-none"
/>

<div class="absolute top-0 left-0 bottom-0 grid select-none">
    <div transition:fly={{ x: "-100%", duration: transitionDuration}} class="
        bg-honeycomb
        w-screen max-w-96 overflow-y-scroll overflow-x-hidden
        flex flex-col gap-2
    "
    class:hidden={showTouchControls}
    >
        <div class="self-center pt-2"><a href="#{game.wad.name}&endoom"><Picture name="M_DOOM" /></a></div>
        <div class="px-2">
            <div class="flex gap-4 items-center pb-2">
                {#if $intermission}
                    <span>Intermission</span>
                {:else if $map}
                    <span><MapNamePic name={$map.name} /></span>
                {/if}
                <span><Picture name={data.skills.find((sk) => sk.num === game.skill).pic}/></span>
            </div>
            <MapStats map={$map} />
        </div>
        <div class="divider" />
        <button class="btn btn-primary uppercase z-20 sticky top-0" on:click={resumeGame}>Resume</button>

        {#if hasNextEpisode}
        <button on:click={startNextEpisode} class="btn btn-secondary">Next episode</button>
        {/if}
        {#if !shared}
            <button class="btn" on:click={share}>Share</button>
        {:else}
            <span class="text-center" transition:fly={{ duration: transitionDuration }}>Url copied to clipboard</span>
        {/if}
        <!-- TODO: someday... get save/load working-->
        <!-- <button class="btn" disabled>Load</button>
        <button class="btn" disabled>Save</button> -->

        <div class="divider" />
        <div class="flex mx-auto join">
            <label class="swap btn btn-lg join-item">
                <input type="checkbox" bind:checked={$isFullscreen} on:click={toggleFullscreen} />
                <Icon class="swap-on fill-current" src={ArrowsPointingIn} theme='solid' size="2rem"/>
                <Icon class="swap-off fill-current" src={ArrowsPointingOut} theme='solid' size="2rem"/>
            </label>
            <div class="dropdown dropdown-bottom">
                <div tabindex="0" role="button" class="btn btn-lg join-item"><Icon src={VideoCamera} theme='solid' size="2rem"/></div>
                <ul tabindex="-1" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                    <li><button on:click={() => $cameraMode = '1p'}><Icon src={Eye} theme='solid' size="1.5rem"/>First person</button></li>
                    <li><button on:click={() => $cameraMode = '3p'}><Icon src={User} theme='solid' size="1.5rem"/>Third person</button></li>
                    <li><button on:click={() => $cameraMode = 'ortho'}><Icon src={Cube} theme='solid' size="1.5rem"/>Isometric</button></li>
                    <li><button on:click={() => $cameraMode = 'bird'}><Icon src={GlobeEuropeAfrica} theme='solid' size="1.5rem"/>Overhead</button></li>
                </ul>
            </div>
            <label class="swap btn btn-lg join-item">
                <input type="checkbox" bind:checked={$muted} />
                <Icon class="swap-on fill-current" src={SpeakerXMark} theme='solid' size="2rem"/>
                <Icon class="swap-off fill-current" src={SpeakerWave} theme='solid' size="2rem"/>
            </label>
            <label class="swap btn btn-lg join-item">
                <input type="checkbox" bind:checked={$simulate486} />
                <span class="swap-on text-xs">486ish</span>
                <span class="swap-off text-xs">Normal</span>
            </label>
        </div>

        <div class="dropdown md:static">
            <div tabindex="0" role="button" class="btn w-full">Settings</div>
            <div tabindex="-1" class="
                dropdown-content z-10 shadow bg-base-100 w-screen max-w-96 rounded-box
                overflow-y-scroll top-12 bottom-0
                pb-80 md:top-0 md:pb-10 md:left-96
            ">
                <ul class="menu">
                    {#each Object.entries(settings) as [category, values]}
                        <div class="divider sticky my-2 z-10 top-0 bg-base-100">{category}</div>
                        {#each values as item}
                            <li><MenuItem {item} /></li>
                        {/each}
                    {/each}

                    <div class="divider sticky my-2 z-10 top-0 bg-base-100">Other</div>
                    <li>
                        <label class="label cursor-pointer">
                            <span class="label-text">Inspector</span>
                            <input type="checkbox" class="checkbox" bind:checked={$editor.active} on:change={() => ($editor.selected = null)} />
                        </label>
                    </li>
                </ul>
            </div>
        </div>

        <div class="dropdown md:static" on:focusin={() => showTouchControls = touchDevice}>
            <div tabindex="0" role="button" class="btn w-full">Controls</div>
            <div tabindex="-1" class="
                dropdown-content z-10 shadow bg-base-100 w-screen max-w-96 rounded-box
                overflow-y-scroll top-12 bottom-0
                pb-80 md:top-0 md:pb-10 md:left-96
            ">
                {#if !showTouchControls}
                <KeyboardControlsMenu />
                {/if}
            </div>
        </div>

        {#if $map}
        <div class="dropdown md:static">
            <div tabindex="0" role="button" class="btn w-full">Cheats</div>
            <div tabindex="-1" class="
            dropdown-content z-10 shadow bg-base-100 w-screen max-w-96 rounded-box
            overflow-y-scroll top-12 bottom-0
            pb-80 md:top-0 md:pb-10 md:left-96
        ">
                <CheatsMenu player={$map.player} />
            </div>
        </div>
        {/if}

        <div class="fixed bottom-4 px-2">
            <AppInfo />
        </div>
    </div>
</div>

{#if showTouchControls}
<div
    class="absolute inset-0 z-30"
    transition:fly={{ y: '-100%', duration: transitionDuration }}
>
    <div class="absolute inset-0 bg-honeycomb opacity-60 pointer-events-none" />
    <div class="relative w-full h-full">
        <TouchControlsMenu bind:visible={showTouchControls} />
    </div>
</div>
{/if}

<style>
    .dropdown .btn:focus {
        background: oklch(var(--b1));
    }
</style>