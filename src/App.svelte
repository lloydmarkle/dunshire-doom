<script lang="ts">
    import { DoomWad, Game, type MissingWads, type Skill, WadFile } from './doom';
    import Doom from './render/Doom.svelte';
    import DoomControllers from './render/DoomControllers.svelte';
    import AABBSweepDebug from './render/Debug/AABBSweepDebug.svelte';
    import TextureMapScene from './render/Debug/TextureMapScene.svelte';
    import AppInfo from './render/Components/AppInfo.svelte';
    import { createAppContext } from './render/DoomContext';
    import { setContext } from 'svelte';
    import WadScreen from './Screens/WadScreen.svelte';
    import { WadStore } from './WadStore';
    import WipeContainer from './render/Components/WipeContainer.svelte';
    import ErrorScreen from './Screens/Errors/Root.svelte';
    import { loadOptionalUrlParams } from './render/Menu/Menu.svelte';
    import ENDOOM from './Screens/ENDOOM.svelte';
    import { fly } from 'svelte/transition';
    import Menu from "./render/Menu/Menu.svelte";

    const wadStore = new WadStore();
    const availableWads = wadStore.wads;

    const context = createAppContext();
    setContext('doom-app-context', context);
    const { error, audio } = context;
    function enableSoundOnce() {
        audio.resume();
    }

    const { pointerLock } = context;
    const { musicVolume, soundVolume, muted, mainVolume } = context.settings;

    const mainGain = audio.createGain();
    mainGain.connect(audio.destination);
    $: mainGain.gain.value = $muted ? 0 : $mainVolume;

    const soundGain = audio.createGain();
    soundGain.connect(mainGain);
    $: soundGain.gain.value = $soundVolume;

    const musicGain = audio.createGain();
    musicGain.connect(mainGain);
    $: musicGain.gain.value = $musicVolume * .4;

    let wad: DoomWad;
    let game: Game;
    let difficulty: Skill = null;
    let urlMapName: string;
    let showEndoom = false;

    async function parseUrlParams() {
        try {
            await parseUrlParams2();
            $error = null;
        } catch (e) {
            $error = e;
        }
    }
    let lastWads = 0;
    $: if ($availableWads.length != lastWads) {
        lastWads = $availableWads.length;
        // maybe a wad was added and now we can load the map?
        parseUrlParams();
    }

    async function parseUrlParams2() {
        const params = new URLSearchParams(window.location.hash.substring(1));

        const wadNames = params.getAll('wad');
        const urlWads = wadNames.map(wad => `wad=${wad}`).join('&');
        if (urlWads !== wad?.name) {
            if (urlWads) {
                const wadResolvers = wadNames.map(name => wadStore.fetchWad(name)
                    .then(buff => new WadFile(name, buff), err => [name, err]));
                const wads: any = await Promise.all(wadResolvers);

                const succeeded = wads.filter(e => e instanceof WadFile);
                const failed = wads.filter(e => !(e instanceof WadFile));
                if (failed.length) {
                    const err: MissingWads = {
                        code: 3,
                        details: {
                            succeededWads: succeeded.map(e => e.name),
                            failedWads: failed,
                        },
                        message: `Failed to load wads: ${failed.map(e => e[0])}`,
                    }
                    throw err;
                }

                wad = new DoomWad(urlWads, wads);
                game = null;
            } else {
                wad = null;
            }
        }

        showEndoom = params.has('endoom');

        const urlSkill = parseInt(params.get('skill'));
        const clippedSkill = Math.min(5, Math.max(1, isFinite(urlSkill) ? urlSkill : difficulty)) as Skill;
        const validUrlSkill = isFinite(urlSkill) && urlSkill === clippedSkill;
        if ((game && urlSkill !== game.skill) || (!game && validUrlSkill)) {
            difficulty = clippedSkill;
            game = null;
        }

        urlMapName = params.get('map');
        if (urlMapName && validUrlSkill && (!game || game.map.val?.name !== urlMapName)) {
            game = new Game(wad, difficulty, context.settings);
            showEndoom = true;
            game.startMap(urlMapName);
            loadOptionalUrlParams(game, params);
        }

        // mostly here for testing intermission screens
        const urlIntermission = params.get('intermission');
        if (urlIntermission && game.map.val) {
            const parts = urlIntermission.split(',').map(e => parseInt(e));
            if (parts.length < 4) {
                return;
            }
            const map = game.map.val;
            map.triggerSpecial({ special: 52 } as any, map.player, 'W')
            game.intermission.val.playerStats[0].kills = parts[0];
            game.intermission.val.playerStats[0].items = parts[1];
            game.intermission.val.playerStats[0].secrets = parts[2];
            game.time.playTime = parts[3];
        }
    }

    const isPointerLocked = pointerLock.isPointerLocked;
    $: showMenu = !$isPointerLocked;

    // keep url in sync with game
    $: map = game?.map;
    $: if ($map && urlMapName !== $map.name) {
        history.pushState(null, null, `#${game.wad.name}&skill=${game.skill}&map=${$map.name}`);
    }

    $: screenName =
        game ? 'game' :
        wad && showEndoom ? 'endoom':
        $error ? 'error' :
        'root';
</script>

<svelte:window on:popstate={parseUrlParams} />

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-noninteractive-element-interactions -->
<main
    on:click|once={enableSoundOnce}
    use:context.pointerLock.pointerLockControls
    use:context.fullscreen.fullscreenControls
    class="full"
>
    <!-- <AABBSweepDebug /> -->
    <!-- <TextureMapScene /> -->

    <WipeContainer key={screenName}>
        {#if screenName === 'error'}
            <ErrorScreen error={$error} {wadStore} />
        {:else if screenName === 'endoom'}
            <div class="absolute inset-0">
                <ENDOOM {wad} />
                <div class="absolute top-0 bg-base-100 rounded-box shadow-xl">
                    <a href="/#" class="btn btn-lg">Close</a>
                </div>
            </div>
        {:else if screenName === 'game'}
            {#key game}
                <Doom {game} {musicGain} {soundGain} paused={showMenu}>
                    {#if showMenu}
                        <Menu />
                    {/if}
                    <DoomControllers paused={showMenu} />
                </Doom>
            {/key}
        {:else}
            <WadScreen {wad} {wadStore} />
        {/if}
    </WipeContainer>
</main>

<style>
    :root {
        --line-width: 12px;
        --honeycomb-size: 40px;
        background: var(--honeycomb-gradient);
        background-size: var(--honeycomb-size-x) var(--honeycomb-size-y);
        width: 100vw;
        height: 100vh;
    }

    /*
        safari hack to make sure we can scroll to hide the address bar...
        See also the note in Doom.svelte
    */
    @supports (-webkit-touch-callout: none) {
        @media only screen and (orientation: landscape) {
            main {
                padding-top: 60px;
            }
        }
    }

    .full {
        width: 100vw;
        height: 100vh;
    }
</style>