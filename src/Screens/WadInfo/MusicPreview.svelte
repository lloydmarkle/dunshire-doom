<script lang="ts">
    import { onDestroy } from "svelte";
    import { type Lump } from "../../doom";
    import { useAppContext } from "../../render/DoomContext";
    import { createSpessaSequencer, debounce, encodedMusicPlayer, musicInfo, nullMusicPlayer, spessaSynthPlayer } from "../../render/MusicPlayer.svelte";
    import { fade } from "svelte/transition";
    import type { Sequencer } from "spessasynth_lib";

    export let lump: Lump;
    const { audio, musicGain } = useAppContext();

    // create our own local gain node so we can interrupt sound playback more gracefully
    const localGain = audio.createGain();
    localGain.gain.value = 1;
    localGain.connect(musicGain);

    $: player = loadPlayer(lump);
    $: if (player) stopMusic();

    let seq: Sequencer;
    async function loadPlayer(lump: Lump) {
        if (!seq) {
            seq = await createSpessaSequencer(audio, localGain);
        }
        stopMusic();
        lastProgress = playProgress = 0;
        let info = musicInfo(lump);
        return info.music.byteLength === 0 ? nullMusicPlayer() :
            info.isEncodedMusic ? encodedMusicPlayer(audio, localGain, lump.name, info.music) :
            spessaSynthPlayer(seq, lump.name, info.music);
    }

    let playProgress = 0;
    let lastProgress = 0;
    let startTime = 0;
    let playing = false;
    async function playMusic() {
        playing = true;
        startTime = audio.currentTime;

        const musicPlayer = await player;
        if (musicPlayer) {
            musicPlayer.start();
            const updateProgress = () => {
                if (playing) {
                    playProgress = lastProgress + ((audio.currentTime - startTime) / musicPlayer.duration);
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
    }

    async function stopMusic() {
        playing = false;
        (await player)?.stop();
    }

    const scrub2 = debounce(async () => {
        (await player)?.scrub(playProgress);
        localGain.gain.exponentialRampToValueAtTime(1, audio.currentTime + .2);
    }, 200);
    function scrub() {
        lastProgress = playProgress;
        localGain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + .2);
        scrub2();
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
    {#await player}
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