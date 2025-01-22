<script lang="ts">
    import { onDestroy } from "svelte";
    import { Buffer as buff } from 'buffer';
    import { mus2midi } from 'mus2midi';
    import { useAppContext } from "./DoomContext";
    import { MidiSampleStore } from "../MidiSampleStore";
    import WebAudioTinySynth from 'webaudio-tinysynth';
    import type { DoomWad } from "../doom";
    import { Sequencer, Synthetizer, WORKLET_URL_ABSOLUTE } from 'spessasynth_lib';

    export let audioRoot: AudioNode;
    export let wad: DoomWad;
    export let trackName: string;
    const { audio, settings } = useAppContext();
    const musicPlayback = settings.musicPlayback;

    $: musicBuffer = wad.lumpByName(trackName)?.data;
    $: isMp3 = musicBuffer && (
            (musicBuffer[0] === 0xff && [0xfb, 0xf3, 0xf2].includes(musicBuffer[1]))
            || (musicBuffer[0] === 0x49 && musicBuffer[1] === 0x44 && musicBuffer[2] === 0x33));
    $: music = toMidi(musicBuffer).buffer;
    function toMidi(musicBuffer: Uint8Array): Buffer<ArrayBuffer> {
        try {
            // some wads have mp3 files, not mus
            if (isMp3) {
                return buff.from(musicBuffer);
            }
            // some wads have vanilla midi
            if ('MThd' === String.fromCharCode(...musicBuffer.subarray(0, 4))) {
                return buff.from(musicBuffer);
            }
            return mus2midi(buff.from(musicBuffer)) as Buffer<ArrayBuffer>;
        } catch {
            console.warn('unabled to play midi', trackName)
        }
        return buff.from([]);
    }

    $: musicStopper =
        isMp3 ? mp3Player(music) :
        $musicPlayback === 'soundfont' ? spessaSynthPlayer(music) :
        $musicPlayback === 'synth' ? synthPlayer(music) :
        noMusic();
    onDestroy(stopTheMusic);
    async function stopTheMusic() {
        if (musicStopper) {
            (await musicStopper)();
        }
    }

    async function noMusic() {
        stopTheMusic();
        return () => {};
    }

    async function mp3Player(music: ArrayBuffer) {
        stopTheMusic();

        const mp3 = audio.createBufferSource();
        mp3.buffer = await audio.decodeAudioData(music);
        mp3.connect(audioRoot);
        mp3.loop = true;
        mp3.start();
        return () => mp3.stop();
    }

    // Our friends at EDGE-classic already have a nice soundfont in their repo so download that rather than putting one
    // in our own repo. Honestly, it wouldn't be a big deal to just have our own. Long term, I think I'd like users to
    // be able to supply their own if they want but that can be added later.
    const defaultSF2Url = 'https://raw.githubusercontent.com/edge-classic/EDGE-classic/5fa1e0867e1ef71e260f45204888df85ada4be1b/soundfont/Default.sf2'
    const sampleStore = new MidiSampleStore();
    async function spessaSynthPlayer(midi: ArrayBuffer) {
        stopTheMusic();

        await audio.audioWorklet.addModule('./' + WORKLET_URL_ABSOLUTE); // add the worklet
        const soundFontArrayBuffer = await sampleStore.fetch(defaultSF2Url).then(response => response.arrayBuffer());
        const synth = new Synthetizer(audioRoot, soundFontArrayBuffer);
        const seq = new Sequencer([{ binary: midi, altName: trackName }], synth);
        seq.loop = true;
        seq.play();
        return () => seq?.stop();
    }

    async function synthPlayer(midi: ArrayBufferLike) {
        stopTheMusic();

        const synth = new WebAudioTinySynth();
        synth.setAudioContext(audio, audioRoot);
        synth.loadMIDI(midi);
        synth.setLoop(1);
        // actually, it would be really cool to use GENMIDI here to configure the oscillars WebAudioTinySynth creates.
        // We can inject the OPL3 waveforms too via the synth.wave map by synth.wave['w-opl3-0'] = PeriodicWave(...), etc.
        synth.playMIDI();
        return () => synth.stopMIDI();
    }
</script>