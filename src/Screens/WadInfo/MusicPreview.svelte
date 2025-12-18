<script lang="ts">
    import { onDestroy } from "svelte";
    import { type Lump } from "../../doom";
    import { useAppContext } from "../../render/DoomContext";
    import { createMusicPlayer } from "../../render/MusicPlayer.svelte";
    import { fade } from "svelte/transition";

    export let lump: Lump;
    const { audio, musicGain, settings } = useAppContext();
    const { musicPlayback } = settings;

    const player = createMusicPlayer(audio, musicGain);
    function loadMusic(voice: string, lump: Lump) {
        stopMusic();
        lastProgress = playProgress = 0;
        return player.loadMusic(voice, lump);
    }
    $: music = loadMusic($musicPlayback, lump);
    onDestroy(player.stopMusic);

    let playProgress = 0;
    let lastProgress = 0;
    let startTime = 0;
    let playing = false;
    async function playMusic() {
        playing = true;
        startTime = audio.currentTime;

        const duration = (await music).duration;
        player.playMusic();
        const updateProgress = () => {
            if (playing) {
                playProgress = lastProgress + ((audio.currentTime - startTime) / duration);
                requestAnimationFrame(updateProgress);
            }
            if (playProgress > 1) {
                // we've reached the end and are looping so reset progress
                startTime = audio.currentTime;
                playProgress = lastProgress = 0;
            }
        };
        requestAnimationFrame(updateProgress);
    }

    async function stopMusic() {
        playing = false;
        return player.stopMusic();
    }
    function scrub() {
        lastProgress = playProgress;
        player.scrub(playProgress)
    }
    onDestroy(stopMusic);

    function formatSongLength(duration: number) {
        return [
            Math.floor(duration / 60).toString().padStart(2, '0'),
            Math.floor(duration % 60).toString().padStart(2, '0'),
        ].join(':');
    }

    // TODO: The music play/scrub stuff is mostly shared between this and SoundPreview. Would be nice to consolidate...
</script>

<h3>Sound: {lump.name}</h3>
<div class="flex gap-4 overflow-hidden">
    <button class="btn btn-lg text-4xl" on:click={playing ? stopMusic : playMusic}>
        {playing ? '⏸️' : '▶️'}
    </button>
    {#if music}
    {#await music}
        <div class="flex justify-center">
            <span class="loading loading-spinner loading-md"></span>
        </div>
    {:then musicPlayer}
        <div class="flex flex-col gap-4 w-full">
            <div class="flex justify-between">
                <div>0.0s</div>
                <div>{formatSongLength(musicPlayer.duration)}</div>
            </div>
            <div class="relative">
                <input type="range" class="range range-primary" bind:value={playProgress} on:input={scrub} step=".001" max="1" />
                {#if playing || playProgress !== lastProgress}
                <output
                    transition:fade
                    class="bubble bg-base-300"
                    style:--st-range-progress="{playProgress * 100}%"
                >
                    {formatSongLength(playProgress * musicPlayer.duration)}
                </output>
                {/if}
            </div>
        </div>
    {/await}
    {/if}
</div>

<style>
    .bubble {
        padding: 4px 12px;
        position: absolute;
        border-radius: 4px;
        left: var(--st-range-progress);
        transform: translate(-50%, -110%);
    }
    .bubble::after {
        z-index: -1;
        content: "";
        position: absolute;
        width: 1rem;
        height: 1rem;
        background: oklch(var(--b3));
        top: 1rem;
        left: 50%;
        transform: rotate(45deg);
    }
</style>