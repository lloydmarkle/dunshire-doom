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
                if ('IMPM' === String.fromCharCode(...musicBuffer.subarray(0, 4))) {
                    console.warn('IMPM files not supported (yet)')
                    return buff.from([])
                }
                return mus2midi(buff.from(musicBuffer)) as Buffer<ArrayBuffer>;
            } catch {
                console.warn('unabled to play midi', lump?.name)
            }
            return buff.from([]);
        }
    }

    export async function nullMusicPlayer() {
        return {
            duration: 0,
            scrub: (n: number) => {},
            start: () => {},
            stop: () => {},
        };
    }

    // TODO: having two functions here is pretty messy. There should be a better way...
    export async function createSpessaSequencer(audio: AudioContext, gain: AudioNode) {
        const sampleStore = new MidiSampleStore();
        const soundFontArrayBuffer = await sampleStore.fetch(defaultSF2Url).then(response => response.arrayBuffer());
        await audio.audioWorklet.addModule('./synthetizer/spessasynth_processor.min.js');
        const synth = new WorkletSynthesizer(audio);
        synth.soundBankManager.addSoundBank(soundFontArrayBuffer, 'sf2');
        const seq = new Sequencer(synth);
        seq.synth.connect(gain);
        return seq;
    }
    export async function spessaSynthPlayer(seq: Sequencer, name: string, midi: ArrayBuffer) {
        seq.loadNewSongList([{ binary: midi, fileName: name }]);
        seq.loopCount = Infinity;
        const duration = (await seq.getMIDI()).duration;
        return {
            duration,
            scrub: (n: number) => seq.currentTime = n * duration,
            start: () => seq.play(),
            stop: () => seq.pause(),
        };
    }

    // mp3 or ogg
    export async function encodedMusicPlayer(audio: AudioContext, gain: AudioNode, name: string, music: ArrayBuffer) {
        const buffer = await audio.decodeAudioData(music);
        function createSource() {
            let node = audio.createBufferSource();
            node.buffer = buffer;
            node.connect(gain);
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
        };
    }

    export async function synthPlayer(audio: AudioContext, gain: AudioNode, name: string, music: ArrayBufferLike) {
        const synth = new WebAudioTinySynth();
        synth.setAudioContext(audio, gain);
        synth.loadMIDI(music);
        synth.setLoop(1);
        return {
            duration: 0,
            // does this actually work?
            scrub: (n: number) => synth.locateMIDI(this.maxTick * n),
            start: () => synth.playMIDI(),
            stop: () => synth.stopMIDI(),
        }
    }

    export function debounce(callback: () => void, wait: number) {
        let timeoutId = null;
        return (...args: any[]) => new Promise<void>(resolve => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => resolve(callback.apply(null, args)), wait);
        });
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
    export let trackName: string = null;
    export let lump: Lump = null;
    const { audio, settings } = useAppContext();
    const musicPlayback = settings.musicPlayback;

    // create our own local gain node so we can interrupt sound playback more gracefully (with fade)
    const localGain = audio.createGain();
    localGain.gain.value = 1;
    localGain.connect(audioRoot);

    let seq: Sequencer;
    let musicPlayer: Awaited<ReturnType<typeof nullMusicPlayer>>;
    async function loadMusic(voice: string, musicLump: Lump, info: ReturnType<typeof musicInfo>) {
        if (musicPlayer) {
            await stopMusic();
        }
        if (!seq) {
            seq = await createSpessaSequencer(audio, localGain);
        }
        musicPlayer = await (
            info.music.byteLength === 0 ? nullMusicPlayer() :
            info.isEncodedMusic ? encodedMusicPlayer(audio, localGain, musicLump.name, info.music) :
            voice === 'soundfont' ? spessaSynthPlayer(seq, musicLump.name, info.music) :
            voice === 'synth' ? synthPlayer(audio, localGain, musicLump.name, info.music) :
            nullMusicPlayer());
        playMusic();
    }
    $: musicLump = lump ?? wad.optionalLump(trackName);
    $: loadMusic($musicPlayback, musicLump, musicInfo(musicLump));

    async function playMusic() {
        musicPlayer.start();
        localGain.gain.linearRampToValueAtTime(1, audio.currentTime + .2);
    }
    const stopAfterFade = debounce(() => musicPlayer.stop(), 200);
    async function stopMusic() {
        localGain.gain.cancelScheduledValues(audio.currentTime);
        localGain.gain.exponentialRampToValueAtTime(0.00001, audio.currentTime + .2);
        return stopAfterFade();
    }
    onDestroy(stopMusic);
</script>