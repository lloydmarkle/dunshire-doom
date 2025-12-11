<script lang="ts">
    import { onDestroy } from "svelte";
    import { type Lump } from "../../doom";
    import { useAppContext } from "../../render/DoomContext";
    import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib';
    import { MidiSampleStore } from "../../MidiSampleStore";
    import { defaultSF2Url, musicInfo } from "../../render/MusicPlayer.svelte";

    export let lump: Lump;
    const { audio, settings } = useAppContext();
    const { musicVolume, mainVolume } = settings;

    const mainGain = audio.createGain();
    mainGain.connect(audio.destination);
    $: mainGain.gain.value = $mainVolume;
    const musicGain = audio.createGain();
    musicGain.connect(mainGain);
    $: musicGain.gain.value = $musicVolume;

    $: info = musicInfo(lump);
    $: if (info) stopMusic();

    const sampleStore = new MidiSampleStore();
    let stopTheMusic: Promise<() => void>;
    async function spessaSynthPlayer(midi: ArrayBuffer) {
        const soundFontArrayBuffer = await sampleStore.fetch(defaultSF2Url).then(response => response.arrayBuffer());
        await audio.audioWorklet.addModule('./synthetizer/spessasynth_processor.min.js'); // add the worklet
        const synth = new WorkletSynthesizer(audio);
        synth.soundBankManager.addSoundBank(soundFontArrayBuffer, 'sf2');
        synth.connect(musicGain);
        const seq = new Sequencer(synth);
        seq.loadNewSongList([{ binary: midi, fileName: lump.name }]);
        seq.loopCount = -1;
        seq.play();
        return () => seq.pause();
    }

    async function mp3Player(music: ArrayBuffer) {
        const mp3 = audio.createBufferSource();
        mp3.buffer = await audio.decodeAudioData(music);
        mp3.connect(musicGain);
        mp3.loop = true;
        mp3.start();
        return () => mp3.stop();
    }

    let playing = false;
    function playMusic() {
        playing = true;
        stopTheMusic = info.isMp3 ? mp3Player(info.music) : spessaSynthPlayer(info.music);
    }

    async function stopMusic() {
        playing = false;
        if (stopTheMusic) {
            (await stopTheMusic)();
        }
    }

    onDestroy(stopMusic);

    // TODO: lots that could be improved here. It would be nice to show
    // duration of the track, allow scrubbing the track, or choosing a different
    // voice (synth, or sf2). I suppose that can come some other time.
</script>

<h3>Sound: {lump.name}</h3>
<div class="flex gap-4 overflow-hidden">
    <button class="btn btn-lg text-4xl" on:click={playing ? stopMusic : playMusic}>
        {playing ? '⏸️' : '▶️'}
    </button>
</div>
