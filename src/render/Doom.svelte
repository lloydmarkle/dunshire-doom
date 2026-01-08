<script lang="ts">
    import { type Game, store } from "../doom";
    import { setContext } from "svelte";
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
    import Hack from "./Hack.svelte";
    import { WebGLRenderer, type WebGLRendererParameters } from "three";

    export let game: Game;
    export let soundGain: GainNode;
    export let paused: boolean;

    let viewSize = store({ width: 320, height: 200 });
    const doomContext = createGameContext(game, viewSize);
    setContext("doom-game-context", doomContext);
    const { settings, pointerLock, musicTrack } = useAppContext();
    const { cameraMode, showPlayerInfo, timescale } = settings;
    const { map, intermission } = game;

    // NOTE: add noise to map name so that idclev to same map does screen wipe
    $: screenName = ($map?.name ?? '') + Math.random();
    $: intScreen = $intermission ? 'summary' : null;

    let intermissionMusic: string;
    $: mapMusicTrack = $map?.musicTrack;
    $: $musicTrack = game.wad.optionalLump($mapMusicTrack ?? intermissionMusic);

    $: renderSectors = $map ? buildRenderSectors(game.wad, $map) : [];
    $: settings.compassMove.set($cameraMode === "svg");

    const rendererParameters: WebGLRendererParameters = {
        // resolves issues with z-fighting for large maps with small sectors (eg. Sunder 15 and 20 at least)
        logarithmicDepthBuffer: true,
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

<svelte:window on:keyup|preventDefault={keyup} />

<WipeContainer key={intScreen ?? screenName}>
    <div
        class="relative grid h-full w-full bg-black"
        bind:clientHeight={$viewSize.height}
        bind:clientWidth={$viewSize.width}
    >
    {#if $intermission}
        <!-- NOTE: be cautious with #key and bind: https://github.com/sveltejs/svelte/issues/7704 (until svelte5) -->
        <Intermission details={$intermission}
            size={$viewSize}
            bind:musicTrack={intermissionMusic}
            bind:screenName={screenName} />
    {/if}

    <MapContext map={$map} {renderSectors}>
        {#if $cameraMode === 'svg'}
        <SvgMapRoot
            size={$viewSize}
            map={$map}
        />
        {:else}
        <Canvas
            createRenderer={(canvas) => new WebGLRenderer({ canvas, ...rendererParameters })}
            renderMode='manual'
            autoRender={false}
        >
            <Hack viewSize={$viewSize} {paused} />
        </Canvas>
        {/if}
        <HUD size={$viewSize} player={$map.player} />

        {#if $showPlayerInfo}
        <PlayerInfo player={$map.player} interactive={paused} />
        {/if}
        <EditPanel map={$map} />
    </MapContext>
    </div>
</WipeContainer>

<SoundPlayer wad={game.wad} audioRoot={soundGain} soundEmitter={game} timescale={$timescale} player={$map?.player} />

<slot />