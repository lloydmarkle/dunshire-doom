<script lang="ts">
    import { onDestroy } from "svelte";
    import { type Lump } from "../../doom";
    import { useAppContext } from "../../render/DoomContext";
    import { createSoundBuffer } from "../../render/SoundPlayer.svelte";
    import { fade } from "svelte/transition";

    export let lump: Lump;
    const { audio, settings } = useAppContext();
    const { soundVolume, mainVolume } = settings;

    const mainGain = audio.createGain();
    mainGain.connect(audio.destination);
    $: mainGain.gain.value = $mainVolume;
    const soundGain = audio.createGain();
    soundGain.connect(mainGain);
    $: soundGain.gain.value = $soundVolume;

    $: soundBuffer = createSoundBuffer(audio, lump.data);

    let playing = false;
    let startTime = 0;
    let playProgress = 0;
    let lastProgress = 0;

    let audioSource: AudioBufferSourceNode;
    function resetAudio () {
        // did we hit the end of the sound? If yes, reset
        if (playProgress > .99) {
            audioSource = null;
            playing = false;
            playProgress = lastProgress = 0;
        }
    }

    function play() {
        lastProgress = playProgress;
        startTime = audio.currentTime;

        const gainNode = audio.createGain();
        gainNode.connect(soundGain);

        audioSource = audio.createBufferSource();
        audioSource.buffer = soundBuffer;
        audioSource.onended = resetAudio;
        audioSource.connect(gainNode);
        audioSource.start(startTime, playProgress * soundBuffer.duration);
    }

    function scrub() {
        if (!playing) {
            return;
        }
        audioSource?.stop();
        play();
    }

    function togglePlay() {
        if (playing) {
            playing = false;
            audioSource.stop();
        } else {
            playing = true;
            play();
            const updateProgress = () => {
                if (playing) {
                    playProgress = lastProgress + ((audio.currentTime - startTime) / soundBuffer.duration);
                    requestAnimationFrame(updateProgress);
                }
            };
            requestAnimationFrame(updateProgress);
        }
    }

    onDestroy(() => audioSource?.stop());

    // bubble range is based on https://css-tricks.com/value-bubbles-for-range-inputs/
</script>

<h3>Sound: {lump.name}</h3>
<div class="flex gap-4 overflow-hidden">
    <button class="btn btn-lg text-4xl" on:click={togglePlay}>
        {playing ? '⏸️' : '▶️'}
    </button>
    <div class="flex flex-col gap-4 w-full">
        <div class="flex justify-between">
            <div>0.0s</div>
            <div>{soundBuffer.duration.toFixed(2)}s</div>
        </div>
        <div class="relative">
            <input type="range" class="range range-primary" bind:value={playProgress} on:input={scrub} step=".001" max="1" />
            {#if playing || lastProgress !== playProgress}
            <output
                transition:fade
                class="bubble bg-base-300"
                style:--st-range-progress="{playProgress * 100}%"
            >
                {(playProgress * soundBuffer.duration).toFixed(1)}s
            </output>
            {/if}
        </div>
    </div>
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