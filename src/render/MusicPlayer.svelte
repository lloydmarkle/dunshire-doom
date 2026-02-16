<script lang="ts" module>
    // Our friends at EDGE-classic already have a nice soundfont in their repo so download that rather than putting one
    // in our own repo. Honestly, it wouldn't be a big deal to just have our own. Long term, I think I'd like users to
    // be able to supply their own if they want but that can be added later.
    const defaultSF2Url = 'https://raw.githubusercontent.com/edge-classic/EDGE-classic/5fa1e0867e1ef71e260f45204888df85ada4be1b/soundfont/Default.sf2'

    function musicInfo(lump: Lump) {
        const musicBuffer = lump?.data;
        const isEncodedMusic = musicBuffer && (
                (musicBuffer[0] === 0xff && [0xfb, 0xf3, 0xf2].includes(musicBuffer[1])) // MP3
                || (musicBuffer[0] === 0x49 && musicBuffer[1] === 0x44 && musicBuffer[2] === 0x33)
                || (musicBuffer[0] === 0x4f && musicBuffer[1] === 0x67 && musicBuffer[2] === 0x67 && musicBuffer[3] === 0x53)); // OGG
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
                if (musicBuffer) {
                    console.warn('unabled to play midi', lump?.name)
                }
            }
            return buff.from([]);
        }
    }

    type MusicTrack = Awaited<ReturnType<typeof nullMusicPlayer>>;
    async function nullMusicPlayer() {
        return {
            duration: 0,
            scrub: (n: number) => {},
            play: (loop: boolean) => {},
            pause: () => {},
        };
    }

    function createSpessaSynthPlayer() {
        let seq: Sequencer;
        return async (audio: AudioContext, gain: AudioNode, name: string, midi: ArrayBuffer): Promise<MusicTrack> => {
            if (!seq) {
                const sampleStore = new MidiSampleStore();
                const soundFontArrayBuffer = await sampleStore.fetch(defaultSF2Url).then(response => response.arrayBuffer());
                await audio.audioWorklet.addModule('./synthetizer/spessasynth_processor.min.js');
                const synth = new WorkletSynthesizer(audio);
                synth.soundBankManager.addSoundBank(soundFontArrayBuffer, 'sf2');
                seq = new Sequencer(synth);
                seq.synth.connect(gain);
            }
            seq.loadNewSongList([{ binary: midi, fileName: name }]);
            const duration = (await seq.getMIDI()).duration;
            return {
                duration,
                scrub: n => seq.currentTime = n * duration,
                play: loop => {
                    seq.loopCount = loop ? Infinity : 0;
                    seq.play();
                },
                pause: () => seq.pause(),
            };
        }
    }

    // mp3 or ogg
    async function encodedMusicPlayer(audio: AudioContext, gain: AudioNode, name: string, music: ArrayBuffer): Promise<MusicTrack> {
        const buffer = await audio.decodeAudioData(music);
        function createSource(loop: boolean) {
            let node = audio.createBufferSource();
            node.buffer = buffer;
            node.connect(gain);
            node.loop = loop;
            return node;
        }

        let source: AudioBufferSourceNode;
        return {
            duration: buffer.duration,
            scrub: n => {
                source?.stop();
                source = createSource(source?.loop ?? false);
                source.start(audio.currentTime, n * buffer.duration);
            },
            play: loop => {
                source = createSource(loop);
                source.start();
            },
            pause: () => source?.stop(),
        };
    }

    async function synthPlayer(audio: AudioContext, gain: AudioNode, name: string, music: ArrayBufferLike): Promise<MusicTrack> {
        const synth = new WebAudioTinySynth();
        synth.setAudioContext(audio, gain);
        synth.loadMIDI(music);
        return {
            duration: 0,
            scrub: n => synth.locateMIDI(this.maxTick * n),
            play: loop => {
                synth.setLoop(loop);
                synth.playMIDI();
            },
            pause: () => synth.stopMIDI(),
        }
    }

    export function createMusicPlayer(audio: AudioContext, audioRoot: AudioNode) {
        let spessaSynthPlayer = createSpessaSynthPlayer();
        let currentTrack: Promise<MusicTrack>;

        // create our own local gain node so we can interrupt sound playback more gracefully (with fade)
        const localGain = audio.createGain();
        localGain.gain.value = 0;
        localGain.gain.setValueAtTime(0, audio.currentTime);
        localGain.connect(audioRoot);
        const fadeTime = 0.15 // seconds
        const fadeTimeMS = fadeTime * 1000;

        const fadeWrap = async (track: MusicTrack) => {
            let timeoutId: ReturnType<typeof setTimeout>;
            const schedule = (callback: (...args: any[]) => void, wait: number) =>
                new Promise(resolve => {
                    clearTimeout(timeoutId);
                    timeoutId = setTimeout(() => resolve(callback()), wait);
                });

            return {
                duration: track.duration,
                scrub: async (n: number) => {
                    localGain.gain.linearRampToValueAtTime(0, audio.currentTime + fadeTime);
                    return schedule(() => {
                        localGain.gain.linearRampToValueAtTime(1, audio.currentTime + fadeTime);
                        track.scrub(n);
                    }, fadeTimeMS);
                },
                play: async (loop: boolean) => {
                    localGain.gain.linearRampToValueAtTime(1, audio.currentTime + fadeTime);
                    return schedule(() => track.play(loop), fadeTimeMS);
                },
                pause: async () => {
                    localGain.gain.linearRampToValueAtTime(0, audio.currentTime + fadeTime);
                    return schedule(() => track.pause(), fadeTimeMS);
                },
            }
        }

        const loadTrack = async (voice: string, musicLump: Lump) => {
            if (currentTrack) {
                (await currentTrack)?.pause();
            }
            const info = musicInfo(musicLump);
            currentTrack =
                info.music.byteLength === 0 ? nullMusicPlayer() :
                info.isEncodedMusic ? encodedMusicPlayer(audio, localGain, musicLump.name, info.music) :
                voice === 'soundfont' ? spessaSynthPlayer(audio, localGain, musicLump.name, info.music) :
                voice === 'synth' ? synthPlayer(audio, localGain, musicLump.name, info.music) :
                nullMusicPlayer();
            return fadeWrap(await currentTrack);
        }

        return { loadTrack };
    }
</script>
<script lang="ts">
    import { Buffer as buff } from 'buffer';
    import { mus2midi } from 'mus2midi';
    import { useAppContext } from "./DoomContext";
    import { MidiSampleStore } from "../MidiSampleStore";
    import WebAudioTinySynth from 'webaudio-tinysynth';
    import type { Lump } from "../doom";
    import { Sequencer, WorkletSynthesizer } from 'spessasynth_lib';

    interface Props {
        audioRoot: GainNode;
        lump: Lump;
        looping: boolean;
    }
    const { audioRoot, lump = null, looping = false }: Props = $props();
    const { audio, settings } = useAppContext();
    const { musicPlayback } = settings;

    const musicPlayer = $derived(createMusicPlayer(audio, audioRoot));
    $effect(() => {
        const track = musicPlayer.loadTrack($musicPlayback, lump);
        track.then(t => t.play(looping));
        return () => track.then(t => t.pause());
    });
</script>