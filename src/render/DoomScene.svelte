<script lang="ts">
    import { T, useTask, useThrelte } from "@threlte/core";
    // TODO: does pmndrs/postprocessing offer an advantage here?
    import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer';
    import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass';
    import { GammaCorrectionShader } from 'three/examples/jsm/shaders/GammaCorrectionShader';
    import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass";
    import { ScreenColorShader } from "./Shaders/ScreenColorShader";
    import Weapon from "./Map/Weapon.svelte";
    import { ticksPerSecond } from "../doom";
    import { Camera, Scene } from "three";
    import { OrthographicCamera } from "three";
    import R1 from "./Map/Root.svelte";
    import R2 from "./R2/Root.svelte";
    import { onMount } from "svelte";
    import { SpriteSheet } from "./R2/Sprite/SpriteAtlas";
    import { useAppContext } from "./DoomContext";
    import { derived } from "svelte/store";
    import { type MapRuntime } from "../doom";
    import Stats from "./Debug/Stats.svelte";

    export let map: MapRuntime;
    export let frameTime: number;
    export let paused: boolean;

    const { settings, editor, lastRenderScreenshot } = useAppContext();

    const { renderer, advance, canvas, renderStage } = useThrelte();
    // TODO: it would be nice to create this once per game
    $: spriteSheet = (spriteSheet ?? new SpriteSheet(map.game.wad, renderer.capabilities.maxTextureSize));

    // not sure this is correct but it looks about right https://doomwiki.org/wiki/Aspect_ratio
    const yScale = (4 / 3) / (16 / 10);
    const { damageCount, bonusCount, inventory } = map.player;
    const cPass = new ShaderPass(ScreenColorShader);
    // In svelte 5 these would be $effect but that isn't really the intent of effect. I'll have to think about this to migrate
    $: cPass.uniforms.invunlTime.value = $inventory.items.invincibilityTicks / ticksPerSecond;
    $: cPass.uniforms.radiationTime.value = $inventory.items.radiationSuitTicks / ticksPerSecond;
    $: cPass.uniforms.berserkTime.value = $inventory.items.berserkTicks / ticksPerSecond;
    $: cPass.uniforms.damageCount.value = $damageCount;
    $: cPass.uniforms.bonusCount.value = $bonusCount;

    let hudScene: Scene;
    let hudCam: OrthographicCamera;
    // Using a shader pass requires a bit more work now with threlte6
    // https://threlte.xyz/docs/learn/advanced/migration-guide#usethrelteroot-has-been-removed
    const { scene, camera, size } = useThrelte();
    const composer = new EffectComposer(renderer);

    const setupEffectComposer = (camera: Camera, hudScene: Scene) => {
        composer.passes.length = 0;
        composer.addPass(new RenderPass(scene, camera));
        if (hudScene) {
            const p = new RenderPass(hudScene, hudCam);
            p.clear = false;
            p.clearDepth = true;
            composer.addPass(p);
        }
        composer.addPass(new ShaderPass(GammaCorrectionShader));
        composer.addPass(cPass);
    }
    $: setupEffectComposer($camera, hudScene);
    $: composer.setSize($size.width, $size.height);

    useTask('doom-render', delta => {
        composer.render(delta);

        // capture screenshots for save games
        if (!paused) {
            $lastRenderScreenshot = null;
        } else if (!$lastRenderScreenshot && map.isActive) {
            // make sure we only capture screenshots from the "active" map
            const tCanvas = document.createElement('canvas');
            tCanvas.width = 160;
            tCanvas.height = 100;
            let ctx = tCanvas.getContext('2d');
            ctx.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 0, tCanvas.width, tCanvas.height);
            $lastRenderScreenshot = tCanvas.toDataURL('image/png');
        }
    }, { stage: renderStage });

    // A fun little hack to make the game feel like it used to on my 486sx25
    const { simulate486, pixelScale, renderMode } = settings;
    // F5 low-res mode (it should be .5 but that looks to sharp IMO)
    // FIXME: starting the game with low pixel ratio and then increasing doesn't work... why?
    $: renderer.setPixelRatio($simulate486 ? .2 : $pixelScale);

    // the spawn mode setting is a little tricky to handle
    let lastSpawnMode = settings.spawnMode.val;
    onMount(() => settings.spawnMode.subscribe(val => {
        if (val === lastSpawnMode) {
            return;
        }
        const game = map.game;
        const { position, direction, pitch } = map.player;
        const newMap = game.startMap(map.name);
        newMap.player.position.copy(position);
        newMap.player.direction = direction;
        newMap.player.pitch = pitch;
    }));

    onMount(() => {
        // use negative number so we always render first frame as fast as possible
        let lastFrameTime = -1000;

        // A nifty hack to watch all settings for changes and then force a re-render when the menu is open
        const allSettings = Object.keys(settings).filter(k => typeof settings[k] === 'object').map(k => settings[k]);
        derived(allSettings, () => new Date()).subscribe(advance);

        let frameReq = requestAnimationFrame(function renderFrame(time) {
            time *= .001;
            frameReq = requestAnimationFrame(renderFrame);
            // slow down update frequency to 1fps when paused EXCEPT:
            // 1) capture lastRenderScreenshot for save games before slowing down
            // 2) use 20fps if the inspector (editor) is turned on
            let ft = !paused || !$lastRenderScreenshot ? frameTime : ($editor.selected ? .05 : 1);
            if (time - lastFrameTime > ft) {
                advance();
                lastFrameTime = time - (time % ft);
            }
        });
        return () => cancelAnimationFrame(frameReq);
    });
</script>

<Stats />
{#if $renderMode === 'r2'}
    <R2 map={map} {spriteSheet} />
{:else}
    <R1 map={map} />
{/if}

<!--
    Don't attach the scene to the parent scene (the root) because we are only rendering the HUD
    which is composited by a RenderPass
-->
<T.Scene attach={() => {}} bind:ref={hudScene} >
    <T.OrthographicCamera bind:ref={hudCam} />
    <T.AmbientLight color={'white'} intensity={4} />
    <Weapon player={map.player} {yScale} />
</T.Scene>
