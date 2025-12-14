<script lang="ts" context="module">
    // Our friends at EDGE-classic already have a nice soundfont in their repo so download that rather than putting one
    // in our own repo. Honestly, it wouldn't be a big deal to just have our own. Long term, I think I'd like users to
    // be able to supply their own if they want but that can be added later.
    export const defaultSF2Url = 'https://raw.githubusercontent.com/edge-classic/EDGE-classic/5fa1e0867e1ef71e260f45204888df85ada4be1b/soundfont/Default.sf2'

    export function musicInfo(lump: Lump) {
        const musicBuffer = lump?.data;
        const isEncodedMusic = musicBuffer && (
                (musicBuffer[0] === 0xff && [0xfb, 0xf3, 0xf2].includes(musicBuffer[1]))
                || (musicBuffer[0] === 0x4f && musicBuffer[1] === 0x67 && musicBuffer[2] === 0x67 && musicBuffer[3] === 0x53)
                || (musicBuffer[0] === 0x49 && musicBuffer[1] === 0x44 && musicBuffer[2] === 0x33));
        const music = toMidi(musicBuffer).buffer;
        return { isEncodedMusic, music };

        function toMidi(musicBuffer: Uint8Array): Buffer<ArrayBuffer> {
            try {
                // some wads have mp3 files, not mus
                if (isEncodedMusic) {
                    return buff.from(musicBuffer);
                }
                // some wads have vanilla midi
                if ('MThd' === String.fromCharCode(...musicBuffer.subarray(0, 4))) {
                    return buff.from(musicBuffer);
                }
                return mus2midi(buff.from(musicBuffer)) as Buffer<ArrayBuffer>;
            } catch {
                console.warn('unabled to play midi', lump?.name)
            }
            return buff.from([]);
        }
    }
</script>
<script lang="ts">
    import { onDestroy } from "svelte";
    import { Buffer as buff } from 'buffer';
    import { mus2midi } from 'mus2midi';
    import { useAppContext } from "./DoomContext";
    import { MidiSampleStore } from "../MidiSampleStore";
    import WebAudioTinySynth from 'webaudio-tinysynth';
    import type { DoomWad, Lump } from "../doom";
    import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib';

    export let audioRoot: AudioNode;
    export let wad: DoomWad;
    export let trackName: string;
    const { audio, settings } = useAppContext();
    const musicPlayback = settings.musicPlayback;

    $: musicLump = wad.optionalLump(trackName);
    $: info = musicInfo(musicLump);

    $: musicStopper =
        info.music.byteLength === 0 ? noMusic() :
        info.isEncodedMusic ? encodedMusicPlayer(info.music) :
        $musicPlayback === 'soundfont' ? spessaSynthPlayer(info.music) :
        $musicPlayback === 'synth' ? synthPlayer(info.music) :
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

    // mp3 or ogg
    async function encodedMusicPlayer(music: ArrayBuffer) {
        stopTheMusic();

        const source = audio.createBufferSource();
        source.buffer = await audio.decodeAudioData(music);
        source.connect(audioRoot);
        source.loop = true;
        source.start();
        return () => source.stop();
    }

    const sampleStore = new MidiSampleStore();
    async function spessaSynthPlayer(midi: ArrayBuffer) {
        stopTheMusic();

        const soundFontArrayBuffer = await sampleStore.fetch(defaultSF2Url).then(response => response.arrayBuffer());
        await audio.audioWorklet.addModule('./synthetizer/spessasynth_processor.min.js'); // add the worklet
        const synth = new WorkletSynthesizer(audio);
        synth.soundBankManager.addSoundBank(soundFontArrayBuffer, 'sf2');
        synth.connect(audioRoot);
        const seq = new Sequencer(synth);
        seq.loadNewSongList([{ binary: midi, fileName: trackName }]);
        seq.loopCount = -1;
        seq.play();
        return () => seq.pause();
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