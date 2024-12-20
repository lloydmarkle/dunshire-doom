<script lang="ts">
    import { useAppContext } from "./DoomContext";
    import { MapObject, PlayerMapObject, SoundIndex, type Sector, type SoundEmitter, DoomWad, xyDistSqr, word, dword } from "../doom";
    import { Vector3 } from "three";
    import { randInt } from "three/src/math/MathUtils";
    import { onDestroy } from "svelte";
    import { monitorMapObject } from "./Map/SvelteBridge";

    export let audioRoot: AudioNode;
    export let wad: DoomWad;
    export let soundEmitter: SoundEmitter;
    export let timescale: number;
    export let player: PlayerMapObject = null;

    const { audio, settings } = useAppContext();
    const { experimentalSoundHacks, maxSoundChannels } = settings;

    const speedOfSound = 343; // m/s
    // https://web.archive.org/web/20211127055143/http://www.trilobite.org/doom/doom_metrics.html
    const verticalMeters = 0.03048;

    // we want these as small as possible so long as the audio doesn't pop or click on start and stop
    // FIXME: I still hears lots of pops and clicks though so something isn't right
    const fadeInTime = 0.035;
    const fadeOutTime = 0.035;
    const interruptFadeOut = .05;
    const minGain = 0.0000001;
    function gainNode(t: number, value: number, buffer: AudioBuffer) {
        // why set the gain this way? Without it, we get a bunch of popping when sounds start and stop
        // NB: linearRamp sounds cleaner to me than exponential. Not sure why
        const node = audio.createGain();
        node.gain.setValueAtTime(minGain, t);
        node.gain.linearRampToValueAtTime(value, t + fadeInTime);
        node.gain.setValueAtTime(value, t + buffer.duration - fadeOutTime);
        node.gain.linearRampToValueAtTime(minGain, t + buffer.duration);
        return node;
    }

    const defaultPosition = new Vector3();
    // Camera position or player position? I think camera is probably more useful (especially for orthogonal/follow cam)
    // even though it's less accurate.
    $: playerPosition = player?.position ?? defaultPosition;
    function updateListener(position: Vector3, yaw: number, pitch: number) {
        if (!player) {
            // if we don't have a player, we don't need positional audio
            return;
        }
        if (audio.listener.positionX) {
            audio.listener.positionX.value = position.x;
            audio.listener.positionY.value = position.y;
            audio.listener.positionZ.value = position.z;
        } else {
            audio.listener.setPosition(position.x, position.y, position.z);
        }
        if (audio.listener.forwardX) {
            audio.listener.forwardX.value = Math.cos(yaw);
            audio.listener.forwardY.value = Math.sin(yaw);
            audio.listener.forwardZ.value = 0;
            audio.listener.upX.value = 0;
            audio.listener.upY.value = 0;
            audio.listener.upZ.value = Math.cos(pitch);
        } else {
            audio.listener.setOrientation(
                Math.cos(yaw), Math.sin(yaw), 0,
                0, 0, Math.cos(pitch));
        }
    }

    let unsub = () => {};
    onDestroy(unsub);
    $: if (player?.map) {
        unsub();
        unsub = monitorMapObject(player?.map, player, mo => {
            updateListener(mo.position, mo.direction, mo.pitch);
        });
    }

    const soundBuffers = new Map<string, AudioBuffer>()
    function soundBuffer(name: string) {
        if (!soundBuffers.has(name)) {
            const buff = wad.lumpByName(name).data;
            const sampleRate = word(buff, 0x2);
            const numSamples = dword(buff, 0x4) - 32;
            const buffer = audio.createBuffer(1, numSamples, sampleRate);
            buffer.getChannelData(0).set(buff.slice(0x18, 0x18 + numSamples));
            soundBuffers.set(name, buffer);
        }
        return soundBuffers.get(name);
    }

    const isSingletonSound = (snd: SoundIndex) => (
        snd === SoundIndex.sfx_pistol
        || snd === SoundIndex.sfx_sawup
        || snd === SoundIndex.sfx_sawidl
        || snd === SoundIndex.sfx_sawful
        || snd === SoundIndex.sfx_sawhit
        || snd === SoundIndex.sfx_stnmov
    );

    class SoundChannel {
        public location: MapObject | Sector;
        public sound: SoundIndex;
        public soundNode: AudioBufferSourceNode;
        public gainNode: GainNode;
        public dist: number;

        private deactivate = () => this.gainNode = this.soundNode = undefined;
        get isActive() { return this.gainNode || this.soundNode; }

        play(snd: SoundIndex, location: MapObject | Sector, position: typeof defaultPosition, dist: number) {
            this.location = location;
            this.sound = snd;
            this.dist = dist;

            const isSectorLocation = location && 'soundTarget' in location;
            const isPositional = player && location && location !== player;

            // FIXME: SoundIndex[snd] can be undefined?
            const name = 'DS' + SoundIndex[snd].toUpperCase().split('_')[1];
            this.soundNode = audio.createBufferSource()
            this.soundNode.buffer = soundBuffer(name);
            this.soundNode.playbackRate.value = timescale;
            this.soundNode.addEventListener('ended', this.deactivate);
            // A controversial feature? https://doomwiki.org/wiki/Random_sound_pitch_removed
            if (snd === SoundIndex.sfx_sawup || snd === SoundIndex.sfx_sawhit) {
                this.soundNode.detune.value = randInt(-8, 8) * 4;
            }
            if (snd === SoundIndex.sfx_itemup || snd === SoundIndex.sfx_tink) {
                this.soundNode.detune.value = randInt(-16, 16) * 4;
            }

            const now = audio.currentTime;
            this.gainNode = gainNode(now, channelGain, this.soundNode.buffer);
            this.gainNode.connect(audioRoot);
            this.soundNode.start(now);

            if (!isPositional) {
                this.soundNode.connect(this.gainNode);
                return;
            }

            const pan = audio.createPanner();
            pan.connect(this.gainNode);
            this.soundNode.connect(pan);
            // https://www.doomworld.com/forum/topic/96950-how-far-can-the-player-hear/
            pan.distanceModel = 'linear';
            pan.refDistance = 200;
            pan.maxDistance = 1200;
            pan.rolloffFactor = 1;
            // set position based on current mobj position (we could subscribe but objects don't move fast and sounds
            // aren't long so it doesn't seem worth it)
            const t = audio.currentTime + .05; // if we do this immediately, we get crackling as the sound position changes
            pan.positionX.linearRampToValueAtTime(position.x, t);
            pan.positionY.linearRampToValueAtTime(position.y, t);
            // use player position for sector sound sources otherwise we use the middle-z and that may be above or below the player
            pan.positionZ.linearRampToValueAtTime(isSectorLocation ? playerPosition.z + 41 : position.z, t);

            if ($experimentalSoundHacks) {
                this.experimentalSoundHack(pan);
            }
        }

        private experimentalSoundHack(pan: PannerNode) {
            const now = audio.currentTime;
            // Some half baked experiments with echo/filter to for room acoustics. I'll probably not keep
            // this but it's fun to play with. Ideally we have some reverb based on sound location and room size and maybe
            // textures (wood vs marble vs metal vs stone). Maybe use filters high sounds for hidden objects? (because bass
            // sounds pass through walls)
            if (location instanceof MapObject) {
                // add a filter to play low freqency when outside but delay it based on xy distance
                if (location.sector.ceilFlat === 'F_SKY1') {
                    // can't be 0 otherwise gainNode will error because we use exponential ramps
                    const gain = channelGain * .4 * (1 - Math.min(.99999999, this.dist / 1_000_000));
                    const fGain = gainNode(now, gain, this.soundNode.buffer);
                    fGain.connect(audioRoot);
                    const filter = audio.createBiquadFilter();
                    this.soundNode.connect(filter);
                    filter.type = 'lowpass';
                    filter.frequency.value = 200;
                    filter.Q.value = 1;
                    filter.connect(fGain);
                }
                // don't add echo if we are outside
                if (location.sector.ceilFlat !== 'F_SKY1') {
                    // calculate echo based on height of the room. It's not accurate but interesting to play with.
                    const heightM = (location.sector.zCeil - location.sector.zFloor) * verticalMeters;
                    const delay = heightM * 2 / speedOfSound;
                    const eGain = gainNode(now + delay, channelGain * .4, this.soundNode.buffer);
                    eGain.connect(audioRoot);
                    const echo = audio.createDelay();
                    echo.delayTime.value = delay;
                    echo.connect(eGain);
                    pan.connect(echo);
                }
            }
        }

        stop() {
            // fade and stop the sound
            const now = audio.currentTime;
            const v = this.gainNode.gain.value;
            this.gainNode.gain.cancelScheduledValues(now);
            this.gainNode.gain.setValueAtTime(v, now);
            this.gainNode.gain.linearRampToValueAtTime(minGain, now + interruptFadeOut);

            this.soundNode.removeEventListener('ended', this.deactivate)
            this.soundNode.stop(now + interruptFadeOut);
        }
    }

    $: channelGain = (1 / 20 * Math.sqrt(Math.log($maxSoundChannels)));
    $: soundChannels = Array.from({ length: $maxSoundChannels }, () => new SoundChannel());
    // Adjust sound playback speed as timescale changes.
    // In practice, this probably doesn't matter but it's cool we can do it.
    $: soundChannels.forEach(sc => sc.soundNode?.playbackRate?.exponentialRampToValueAtTime(timescale, audio.currentTime + .1));

    soundEmitter.onSound((snd, location) => {
        const isPositional = player && location && location !== player;
        const position = !isPositional ? defaultPosition :
            ('soundTarget' in location) ? location.center
            : location.position;

        const dist = !isPositional ? 0 :
            xyDistSqr(position ?? defaultPosition, playerPosition ?? defaultPosition);
        const channel =
            // Singleton sound are only only allowed to play on one channel
            ((isSingletonSound(snd) && soundChannels.find(e => e.isActive && e.sound === snd)) || undefined)
            // only one sound channel per sound origin (if there is an origin)
            ?? soundChannels.find(e => e.isActive && e.location && e.location === location)
            // new sound origin (or no origin) so find an inactive channel
            ?? soundChannels.find(e => !e.isActive)
            // all channels are busy? See if we are closer than one of the active channels and replace it
            ?? soundChannels.filter(e => e.dist > dist).sort((a, b) => b.dist - a.dist)[0];
        if (!channel) {
            // this sound is farther than all the currently active sounds so ignore it
            return;
        }

        // interrupt active sound and play the new one
        if (channel.isActive) {
            channel.stop();
        }
        channel.play(snd, location, position, dist);
    });
</script>