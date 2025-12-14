<script lang="ts">
    import { onDestroy } from "svelte";
    import { type Lump } from "../../doom";
    import { useAppContext } from "../../render/DoomContext";
    import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib';
    import { MidiSampleStore } from "../../MidiSampleStore";
    import { defaultSF2Url, musicInfo } from "../../render/MusicPlayer.svelte";
    import { fade } from "svelte/transition";

    export let lump: Lump;
    const { audio, settings } = useAppContext();
    const { musicVolume, mainVolume } = settings;

    const mainGain = audio.createGain();
    mainGain.connect(audio.destination);
    $: mainGain.gain.value = $mainVolume;
    const musicGain = audio.createGain();
    musicGain.connect(mainGain);
    $: musicGain.gain.value = $musicVolume;

    $: player = loadPlayer(lump);
    $: if (player) stopMusic();

    function loadPlayer(lump: Lump) {
        stopMusic();
        lastProgress = playProgress = 0;
        let info = musicInfo(lump);
        return info.isEncodedMusic ? encodedMusicPlayer(info.music) : spessaSynthPlayer(info.music);
    }

    let playProgress = 0;
    let lastProgress = 0;
    let startTime = 0;
    const sampleStore = new MidiSampleStore();
    async function spessaSynthPlayer(midi: ArrayBuffer) {
        const soundFontArrayBuffer = await sampleStore.fetch(defaultSF2Url).then(response => response.arrayBuffer());
        await audio.audioWorklet.addModule('./synthetizer/spessasynth_processor.min.js');
        const synth = new WorkletSynthesizer(audio);
        synth.soundBankManager.addSoundBank(soundFontArrayBuffer, 'sf2');
        synth.connect(musicGain);
        const seq = new Sequencer(synth);
        seq.loadNewSongList([{ binary: midi, fileName: lump.name }]);
        seq.loopCount = Infinity;
        const duration = (await seq.getMIDI()).duration;
        return {
            duration,
            scrub: (n: number) => seq.currentTime = n * duration,
            start: () => seq.play(),
            stop: () => seq.pause(),
        }
    }

    async function encodedMusicPlayer(music: ArrayBuffer) {
        const buffer = await audio.decodeAudioData(music);
        function createSource() {
            let node = audio.createBufferSource();
            node.buffer = buffer;
            node.connect(musicGain);
            node.loop = true;
            return node;
        }

        let source = createSource();
        let started = false;
        return {
            duration: source.buffer.duration,
            scrub: (n: number) => {
                if (started) {
                    source.stop();
                    source = createSource();
                    source.start(audio.currentTime, n * buffer.duration);
                }
            },
            start: () => {
                started = true;
                source.start();
            },
            stop: () => {
                if (started) {
                    source.stop();
                }
            },
        }
    }

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

    const debounce = (callback: () => void, wait: number) => {
        let timeoutId = null;
        return (...args: any[]) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => callback.apply(null, args), wait);
        };
    }

    const scrub2 = debounce(async () => {
        (await player)?.scrub(playProgress);
        musicGain.gain.exponentialRampToValueAtTime($musicVolume, audio.currentTime + .2);
    }, 200);
    function scrub() {
        lastProgress = playProgress;
        musicGain.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + .2);
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