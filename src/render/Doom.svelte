<script lang="ts">
    import { type Game, randInt, randomNorm, store } from "../doom";
    import { onMount, setContext, tick, type Snippet } from "svelte";
    import { createGameContext, useAppContext } from "./DoomContext";
    import EditPanel from "./Editor/EditPanel.svelte";
    import PlayerInfo from "./Debug/PlayerInfo.svelte";
    import { buildRenderSectors } from "./RenderData";
    import { Canvas } from "@threlte/core";
    import HUD from "./HUD/HUD.svelte";
    import SvgMapRoot from "./Svg/Root.svelte";
    import MapContext from "./Map/Context.svelte";
    import Intermission from "./Intermission/Intermission.svelte";
    import SoundPlayer from "./SoundPlayer.svelte";
    import WipeContainer from "./Components/WipeContainer.svelte";
    import DoomScene from "./DoomScene.svelte";
    import { WebGLRenderer } from "three";

    interface Props {
        game: Game;
        soundGain: GainNode;
        paused: boolean;
        children: Snippet;
    }
    const { game, soundGain, paused, children }: Props = $props();

    let viewSize = store({ width: 320, height: 200 });
    // FIXME: actually, the warnings on the nex two lines are correct and it's I have {#key game} in the parent block.
    // I'm just still not sure the "right" way to fix it
    const doomContext = createGameContext(game, viewSize);
    const { map, intermission } = game;
    setContext("doom-game-context", doomContext);
    const { settings, pointerLock, musicTrack, error } = useAppContext();
    const { cameraMode, showPlayerInfo, timescale, fpsLimit, simulate486 } = settings;

    let screenName = $derived(
        $intermission ? 'intermission'
        // NOTE: add noise to map name so that idclev to same map does screen wipe
        : ($map?.name ?? '') + Math.random());

    let intermissionMusic = $state('');
    let mapMusic = $derived($map?.musicTrack);
    $effect(() => { $musicTrack = game.wad.optionalLump($mapMusic ?? intermissionMusic) });

    let renderSectors = $derived($map ? buildRenderSectors(game.wad, $map) : []);
    $effect(() => settings.compassMove.set($cameraMode === "svg"));

    let frameTime = $derived(1 / $fpsLimit);
    let tScale = $derived($timescale);
    // A fun little hack to make the game feel like it used to on my 486sx25
    const use486TimeParams = () => {
        if (!$simulate486) {
            return;
        }
        setTimeout(use486TimeParams, randInt(200, 800));
        // a real 486 would slow down if there was a lot of geometry or bad guys but this was simple and fun.
        // This guy has some neat numbers though we're not strictly following it https://www.youtube.com/watch?v=rZcAo4oUc4o
        frameTime = 1 / randomNorm(2, 18, 1.2);
        tScale = 1 - frameTime * 2;
    };
    const useNormalTimeParams = () => {
        frameTime = 1 / $fpsLimit
        tScale = $timescale;
    };
    // $effect() just blows up here. Probably good to revisit that someday when I understand svelte 5 better
    onMount(() => simulate486.subscribe(is486 => tick().then(() => is486 ? use486TimeParams() : useNormalTimeParams())));

    onMount(() => {
        let lastTickTime = 0;

        let handle = requestAnimationFrame(function gameTicker(time) {
            time *= .001;
            handle = requestAnimationFrame(gameTicker);
            if (paused || !game) {
                lastTickTime = time;
                return;
            }

            try {
                game.tick(time - lastTickTime, tScale);
                lastTickTime = time;
            } catch (e) {
                $error = e;
            }
        });
        return () => cancelAnimationFrame(handle);
    });

    const preventDefault = (fn: (...args: any[]) => void) => (ev: Event) => {
        ev.preventDefault();
        fn.call(this, ev);
	};

    function keyup(ev: KeyboardEvent) {
        switch (ev.code) {
            // show menu, we don't need to catch "escape" because pointer lock handles that
            case "Backquote":
                pointerLock.releaseLock();
                break;
        }
    }
</script>

<svelte:window onkeyup={preventDefault(keyup)} />

<WipeContainer key={screenName}>
    <div
        class="relative flex justify-center h-full w-full bg-black"
        bind:clientHeight={$viewSize.height}
        bind:clientWidth={$viewSize.width}
    >
    {#if $intermission}
        <Intermission details={$intermission}
            bind:musicTrack={intermissionMusic} />
    {/if}

    <MapContext map={$map} {renderSectors}>
        {#if $cameraMode === 'svg'}
        <SvgMapRoot map={$map} />
        {:else}
        <Canvas
            createRenderer={canvas => new WebGLRenderer({
                canvas,
                // resolves issues with z-fighting for large maps with small sectors (eg. Sunder 15 and 20 at least)
                logarithmicDepthBuffer: true,
            })}
            renderMode='manual'
            autoRender={false}
        >
            <DoomScene map={$map} {frameTime} {paused} />
        </Canvas>
        {/if}
        <HUD player={$map.player} />

        {#if $showPlayerInfo}
        <PlayerInfo player={$map.player} interactive={paused} />
        {/if}
        <EditPanel map={$map} />
    </MapContext>
    </div>
</WipeContainer>

<SoundPlayer wad={game.wad} audioRoot={soundGain} soundEmitter={game} timescale={$timescale} player={$map?.player} />

{@render children()}