<script lang="ts" context="module">
    // There should be a better way to map these names to GM numbers https://en.wikipedia.org/wiki/General_MIDI but I'm not sure how.
    // Maybe throw the whole thing away and used https://doomwiki.org/wiki/GENMIDI ?
    // Also, wow(!),  doom used lots of instruments https://flaterco.com/kb/DOOM/Doom-instruments.html.
    const instrumentNames = {
        0: "acoustic_grand_piano", // 0??
        1: "acoustic_grand_piano",
        2: "bright_acoustic_piano",
        3: "electric_grand_piano",
        4: "honkytonk_piano",
        5: "electric_piano_1",
        6: "electric_piano_2",
        7: "harpsichord",
        8: "clavinet",
        9: "celesta",
        10: "glockenspiel",
        11: "music_box",
        12: "vibraphone",
        13: "marimba",
        14: "xylophone",
        15: "tubular_bells",
        16: "dulcimer",
        17: "drawbar_organ",
        18: "percussive_organ",
        19: "rock_organ",
        20: "church_organ",
        21: "reed_organ",
        22: "accordion",
        23: "harmonica",
        24: "tango_accordion",
        25: "acoustic_guitar_nylon",
        26: "acoustic_guitar_steel",
        27: "electric_guitar_jazz",
        28: "electric_guitar_clean",
        29: "electric_guitar_muted",
        30: "overdriven_guitar",
        31: "distortion_guitar",
        32: "guitar_harmonics",
        33: "acoustic_bass",
        34: "electric_bass_finger",
        35: "electric_bass_pick",
        36: "fretless_bass",
        37: "slap_bass_1",
        38: "slap_bass_2",
        39: "synth_bass_1",
        40: "synth_bass_2",
        41: "violin",
        42: "viola",
        43: "cello",
        44: "contrabass",
        45: "tremolo_strings",
        46: "pizzicato_strings",
        47: "orchestral_harp",
        48: "timpani",
        49: "string_ensemble_1",
        50: "string_ensemble_2",
        51: "synth_strings_1",
        52: "synth_strings_2",
        53: "choir_aahs",
        54: "voice_oohs",
        55: "synth_choir",
        56: "orchestra_hit",
        57: "trumpet",
        58: "trombone",
        59: "tuba",
        60: "muted_trumpet",
        61: "french_horn",
        62: "brass_section",
        63: "synth_brass_1",
        64: "synth_brass_2",
        65: "soprano_sax",
        66: "alto_sax",
        67: "tenor_sax",
        68: "baritone_sax",
        69: "oboe",
        70: "english_horn",
        71: "bassoon",
        72: "clarinet",
        73: "piccolo",
        74: "flute",
        75: "recorder",
        76: "pan_flute",
        77: "blown_bottle",
        78: "shakuhachi",
        79: "whistle",
        80: "ocarina",
        81: "lead_1_square",
        82: "lead_2_sawtooth",
        83: "lead_3_calliope",
        84: "lead_4_chiff",
        85: "lead_5_charang",
        86: "lead_6_voice",
        87: "lead_7_fifths",
        88: "lead_8_bass__lead",
        89: "pad_1_new_age",
        90: "pad_2_warm",
        91: "pad_3_polysynth",
        92: "pad_4_choir",
        93: "pad_5_bowed",
        94: "pad_6_metallic",
        95: "pad_7_halo",
        96: "pad_8_sweep",
        97: "fx_1_rain",
        98: "fx_2_soundtrack",
        99: "fx_3_crystal",
        100: "fx_4_atmosphere",
        101: "fx_5_brightness",
        102: "fx_6_goblins",
        103: "fx_7_echoes",
        104: "fx_8_scifi",
        105: "sitar",
        106: "banjo",
        107: "shamisen",
        108: "koto",
        109: "kalimba",
        110: "bagpipe",
        111: "fiddle",
        112: "shanai",
        113: "tinkle_bell",
        114: "agogo",
        115: "steel_drums",
        116: "woodblock",
        117: "taiko_drum",
        118: "melodic_tom",
        119: "synth_drum",
        120: "reverse_cymbal",
        121: "guitar_fret_noise",
        122: "breath_noise",
        123: "seashore",
        124: "bird_tweet",
        125: "telephone_ring",
        126: "helicopter",
        127: "applause",
        128: "gunshot",

    };
    // an incomplete (sometime incorrect) drum mapping...
    const drumMap = {
        35: 'kick/bd0010', // Acoustic Bass Drum
        36: 'kick/bd0000', // Electric Bass Drum
        37: 'rimshot', // Side Stick
        38: 'snare/sd0075', // Acoustic Snare
        39: 'clap', // Hand Clap
        40: 'snare/sd7575', // Electric Snare
        41: 'tom-low', // Low Floor Tom
        42: 'hihat-close', // Closed Hi-hat
        43: 'tom-hi', // High Floor Tom
        44: 'hihat-open/oh25', // Pedal Hi-hat
        45: 'tom-low', // Low Tom
        46: 'hihat-open', // Open Hi-hat
        47: 'tom-low/lt10', // Low-Mid Tom
        48: 'mid-tom/mt10', // High-Mid Tom
        49: 'cymbal/cy0025', // Crash Cymbal 1
        50: 'tom-hi', // High Tom
        51: 'cymbal/cy1025', // Ride Cymbal 1
        52: 'cymbal/cy7500', // Chinese Cymbal
        53: 'cymbal/cy1025', // Ride Bell
        55: 'cymbal/cy0075', // Splash Cymbal
        56: 'cowbell', // Cowbell
        57: 'cymbal/cy0025', // Crash Cymbal 2
        59: 'cymbal/cy1010', // Ride Cymbal 2
        62: 'conga-hi', // Mute High Conga
        63: 'conga-hi/hc25', // Open High Conga
        64: 'conga-low', // Low Conga
        70: 'maraca', // Maracas
        75: 'clave', // Claves
        // 54: '', // Tambourine
        // 58: '', // Vibraslap
        // 60: '', // High Bongo
        // 61: '', // Low Bongo
        // 65: '', // High Timbale
        // 66: '', // Low Timbale
        // 67: '', // High Agogô
        // 68: '', // Low Agogô
        // 69: '', // Cabasa
        // 71: '', // Short Whistle
        // 72: '', // Long Whistle
        // 73: '', // Short Guiro
        // 74: '', // Long Guiro
        // 76: '', // High Woodblock
        // 77: '', // Low Woodblock
        // 78: '', // Mute Cuica
        // 79: '', // Open Cuica
        // 80: '', // Mute Triangle
        // 81: '', // Open Triangle
    };
</script>
<script lang="ts">
    import { onDestroy } from "svelte";
    import { Buffer as buff } from 'buffer';
    import midiplay from 'midi-player-js';
    import { mus2midi } from 'mus2midi';
    import { MidiSampleStore } from "../MidiSampleStore";
    import { Soundfont, DrumMachine } from "smplr";
    import { useAppContext } from "./DoomContext";
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
    $: music = toMidi(musicBuffer);
    function toMidi(musicBuffer: Uint8Array) {
        try {
            // some wads have mp3 files, not mus
            if (isMp3) {
                return buff.from(musicBuffer).buffer;
            }
            // some wads have vanilla midi
            if ('MThd' === String.fromCharCode(...musicBuffer.subarray(0, 4))) {
                return buff.from(musicBuffer);
            }
            return mus2midi(buff.from(musicBuffer));
        } catch {
            console.warn('unabled to play midi', trackName)
        }
        return buff.from([]);
    }

    $: musicStopper =
        isMp3 ? mp3Player(music) :
        $musicPlayback === 'spessasynth' ? spessaSynthPlayer(music) :
        $musicPlayback === 'soundfont' ? soundFontPlayer(music) :
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

    async function mp3Player(music: ArrayBufferLike) {
        stopTheMusic();

        const mp3 = audio.createBufferSource();
        mp3.buffer = await audio.decodeAudioData(music);
        mp3.connect(audioRoot);
        mp3.loop = true;
        mp3.start();
        return () => mp3.stop();
    }

    async function spessaSynthPlayer(midi: ArrayBufferLike) {
        stopTheMusic();

        await audio.audioWorklet.addModule(new URL('/' + WORKLET_URL_ABSOLUTE, import.meta.url)); // add the worklet
        const soundFontArrayBuffer = await fetch("/synthetizer/GeneralUser-GS.sf2").then(response => response.arrayBuffer());
        const synth = new Synthetizer(audioRoot, soundFontArrayBuffer);
        const seq = new Sequencer([{ binary: midi }], synth);
        seq.loop = true;
        seq.play();
        return () => seq?.stop();
    }

    const storage = new MidiSampleStore();
    async function soundFontPlayer(midi: ArrayBufferLike) {
        stopTheMusic();

        const effects: { pan: StereoPannerNode, bq: BiquadFilterNode }[] = [];
        // D_INTRO sets pan on channel 11 (which shouldn't happen but... meh?)
        for (let i = 0; i < 11; i++) {
            const pan = audio.createStereoPanner();
            const bq = audio.createBiquadFilter();
            effects[i] = { pan, bq };
        }
        const drums = await new DrumMachine(audio, { storage, destination: audioRoot }).load;
        // drums.output.addInsert(effects[9].bq);
        drums.output.addInsert(effects[9].pan);

        // doom uses 9 instrument channels (10 is percussion)
        type Instrument = Soundfont;
        let channels: (Instrument | DrumMachine)[] = [null, null, null, null, null, null, null, null, null, drums];

        const midiPlayer = new midiplay.Player(async (ev) => {
            ev.channel -= 1;
            switch(ev.name) {
                case 'Set Tempo':
                    midiPlayer.tempo = ev.data;
                    break;

                case 'Program Change':
                    if (ev.channel !== 9) {
                        if (!instrumentNames[ev.value]) console.warn('missing-instrument', ev.value)
                        const instrument = instrumentNames[ev.value] ?? instrumentNames[6];
                        const sf = await new Soundfont(audio, { storage, instrument, destination: audioRoot }).load;
                        sf.output.addInsert(effects[ev.channel].pan);
                        // sf.output.addInsert(effects[ev.channel].bq);
                        channels[ev.channel] = sf;
                    }
                    break;
                case 'Controller Change':
                    if (ev.number === 7) {
                        channels[ev.channel]?.output.setVolume(ev.value);
                    }
                    if (ev.number === 10) {
                        effects[ev.channel].pan.pan.value = (ev.value - 64) / 127;
                    }
                    break;

                case 'Pitch Bend':
                    // ??
                    // console.log('pitch-bend', ev)
                    break;
                case 'Note on':
                    if (ev.channel === 9) {
                        if (!drumMap[ev.noteNumber]) console.warn('missing drum', ev.noteNumber)
                        channels[ev.channel].start({ note: drumMap[ev.noteNumber], velocity: ev.velocity });
                    } else {
                        channels[ev.channel]?.start({ note: ev.noteNumber, velocity: ev.velocity });
                    }
                    break;
                case 'Note off':
                    channels[ev.channel]?.stop(ev.noteNumber);
                    break;

                default:
                    console.warn('midi: unhandled event',ev);
            }
        });

        // see https://github.com/grimmdude/MidiPlayerJS/issues/25
        (midiPlayer as any).sampleRate = 0;
        midiPlayer.loadArrayBuffer(midi);
        midiPlayer.play();
        return () => midiPlayer.stop();
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