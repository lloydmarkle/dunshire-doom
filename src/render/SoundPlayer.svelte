<script lang="ts">
    import { useAppContext } from "./DoomContext";
    import { MapObject, PlayerMapObject, SoundIndex, store, type Sector, type SoundEmitter, DoomWad, xyDistSqr } from "../doom";
    import { Vector3 } from "three";
    import { randInt } from "three/src/math/MathUtils";

    export let audioRoot: AudioNode;
    export let wad: DoomWad;
    export let soundEmitter: SoundEmitter;
    export let timescale: number;
    export let player: PlayerMapObject = null;

    const { audio, settings } = useAppContext();
    const { experimentalSoundHacks } = settings;

    const speedOfSound = 343; // m/s
    // https://web.archive.org/web/20211127055143/http://www.trilobite.org/doom/doom_metrics.html
    const verticalMeters = 0.03048;
    const maxSounds = 16;
    const soundGain = (1 / (maxSounds + 1));

    // we want these as small as possible so long as the audio doesn't pop or click on start and stop
    // FIXME: I still hears lots of pops and clicks though so something isn't right
    const fadeInTime = 0.035;
    const fadeOutTime = 0.035;
    const interruptFadeOut = .1;
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

    const defaultPosition = store(new Vector3());
    // Camera position or player position? I think camera is probably more useful (especially for orthogonal/follow cam)
    // even though it's less accurate.
    $: playerPosition = player?.position ?? defaultPosition;
    $: yaw = player?.direction;
    $: pitch = player?.pitch;
    $: updateListener($playerPosition, $yaw, $pitch);
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

    const soundBuffers = new Map<string, AudioBuffer>()
    const word = (buff: Uint8Array, offset: number) => buff[offset + 1] << 8 | buff[offset];
    const dword = (buff: Uint8Array, offset: number) => word(buff, offset + 2) << 16 | word(buff, offset);
    function soundBuffer(name: string) {
        if (!soundBuffers.has(name)) {
            const buff = wad.lumpByName(name).data;
            const sampleRate = word(buff, 0x2);
            const numSamples = dword(buff, 0x4) - 32;
            const buffer = audio.createBuffer(1, numSamples, sampleRate);
            buffer.getChannelData(0).set(buff.slice(0x18, numSamples));
            soundBuffers.set(name, buffer);
        }
        return soundBuffers.get(name);
    }

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
            const now = audio.currentTime;

            // FIXME: SoundIndex[snd] can be undefined?
            const name = 'DS' + SoundIndex[snd].toUpperCase().split('_')[1];
            this.soundNode = audio.createBufferSource()
            this.soundNode.buffer = soundBuffer(name);
            this.soundNode.playbackRate.value = timescale;
            this.soundNode.addEventListener('ended', this.deactivate);
            this.soundNode.start(now);
            // A controversial feature? https://doomwiki.org/wiki/Random_sound_pitch_removed
            if (snd === SoundIndex.sfx_sawup || snd === SoundIndex.sfx_sawhit) {
                this.soundNode.detune.value = randInt(-8, 8) * 4;
            }
            if (snd === SoundIndex.sfx_itemup || snd === SoundIndex.sfx_tink) {
                this.soundNode.detune.value = randInt(-16, 16) * 4;
            }

            this.gainNode = gainNode(now, soundGain, this.soundNode.buffer);
            this.gainNode.connect(audioRoot);

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
            // aren't long so it didn't seem worth it)
            const t = audio.currentTime + .1; // if we do this immediately, we get crackling as the sound position changes
            pan.positionX.linearRampToValueAtTime(position.val.x, t);
            pan.positionY.linearRampToValueAtTime(position.val.y, t);
            // use player position for sector sound sources otherwise we use the middle-z and that may be above or below the player
            pan.positionZ.linearRampToValueAtTime(isSectorLocation ? $playerPosition.z + 41 : position.val.z, t);

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
                if (location.sector.val.ceilFlat.val === 'F_SKY1') {
                    // can't be 0 otherwise gainNode will error because we use exponential ramps
                    const gain = soundGain * .4 * (1 - Math.min(.99999999, this.dist / 1_000_000));
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
                if (location.sector.val.ceilFlat.val !== 'F_SKY1') {
                    // calculate echo based on height of the room. It's not accurate but interesting to play with.
                    const heightM = (location.sector.val.zCeil.val - location.sector.val.zFloor.val) * verticalMeters;
                    const delay = heightM * 2 / speedOfSound;
                    const eGain = gainNode(now + delay, soundGain * .4, this.soundNode.buffer);
                    eGain.connect(audioRoot);
                    const echo = audio.createDelay();
                    echo.delayTime.value = delay;
                    echo.connect(eGain);
                    pan.connect(echo);
                }
            }
        }

        stop() {
            // HACK: chaingunners use the shotgun sound and it sounds _terrible_ if we interrupt the sound. I'm not sure
            // how this sound works in DOOM because it seems from reading the code that we stop sounds for a given origin
            // before playing the next sound but the chainguner only has 4 tics between frames (so about .11s) and the
            // shotgun sound is .84s so make the fade a little longer to play more of the sound.
            const fadeOut = (this.sound === SoundIndex.sfx_shotgn) ? .4 : interruptFadeOut;
            // fade and stop the sound
            const now = audio.currentTime;
            const v = this.gainNode.gain.value;
            this.gainNode.gain.cancelScheduledValues(now);
            this.gainNode.gain.setValueAtTime(v, now);
            this.gainNode.gain.linearRampToValueAtTime(minGain, now + fadeOut);

            this.soundNode.removeEventListener('ended', this.deactivate)
            this.soundNode.stop(now + fadeOut);
        }
    }

    let soundChannels: SoundChannel[] = Array.from({ length: maxSounds }, () => new SoundChannel());
    // Adjust sound playback speed as timescale changes.
    // In practice, this probably doesn't matter but it's cool we can do it.
    $: soundChannels.forEach(sc => sc.soundNode?.playbackRate?.exponentialRampToValueAtTime(timescale, audio.currentTime + .1));

    soundEmitter.onSound((snd, location) => {
        const isPositional = player && location && location !== player;
        const position = !isPositional ? defaultPosition :
            ('soundTarget' in location) ? store(location.center)
            : location.position;

        const dist = xyDistSqr(position?.val ?? $defaultPosition, $playerPosition ?? $defaultPosition);
        let channel =
            // only one sound channel per sound origin (if there is an origin)
            soundChannels.find(e => e.isActive && e.location && e.location === location)
            // new sound origin (or no origin) so find an inactive channel
            ?? soundChannels.find(e => !e.isActive)
            // all channels are busy? See if we are closer than one of the active channels and replace it
            ?? soundChannels.filter(e => e.dist > dist).sort((a, b) => b.dist - a.dist)[0];
        if (!channel) {
            // this sound is farther than all the currently active sounds so ignore it
            return;
        }

        // Sometimes, we interrupt the sound
        const isSingletonSound = (
            snd === SoundIndex.sfx_pistol
            || snd === SoundIndex.sfx_sawup
            || snd === SoundIndex.sfx_sawidl
            || snd === SoundIndex.sfx_sawful
            || snd === SoundIndex.sfx_sawhit
            || snd === SoundIndex.sfx_stnmov
        );
        if (channel.isActive && (isSingletonSound || channel.location === location || snd === channel.sound)) {
            channel.stop();
        }
        channel.play(snd, location, position, dist);
    });
</script>