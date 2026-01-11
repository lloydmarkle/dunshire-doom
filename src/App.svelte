<script lang="ts">
    import { DoomWad, Game, type MissingWads, type Skill, WadFile } from './doom';
    import Doom from './render/Doom.svelte';
    import DoomControllers from './render/DoomControllers.svelte';
    import AABBSweepDebug from './render/Debug/AABBSweepDebug.svelte';
    import TextureMapScene from './render/Debug/TextureMapScene.svelte';
    import { createAppContext } from './render/DoomContext';
    import { setContext } from 'svelte';
    import HomeScreen from './Screens/HomeScreen.svelte';
    import { WadStore } from './WadStore';
    import WipeContainer from './render/Components/WipeContainer.svelte';
    import ErrorScreen from './Screens/Errors/Root.svelte';
    import { loadOptionalUrlParams } from './render/Menu/Menu.svelte';
    import ENDOOM from './render/ENDOOM.svelte';
    import Menu from "./render/Menu/Menu.svelte";
    import MusicPlayer from './render/MusicPlayer.svelte';
    import { recentlyUsedGames } from './Screens/LauncherScreen.svelte';

    const wadStore = new WadStore();
    const availableWads = wadStore.wads;

    const context = createAppContext();
    setContext('doom-app-context', context);
    const { error, audio, musicTrack } = context;
    function enableSoundOnce() {
        audio.resume();
    }

    const { pointerLock, soundGain, musicGain } = context;

    let wad = $state<DoomWad>();
    let game = $state<Game>();
    let difficulty: Skill = null;
    let urlMapName = '';
    let showEndoom = $state(false);
    const isPointerLocked = pointerLock.isPointerLocked;
    let showMenu = $derived(!$isPointerLocked);

    let lastWads = 0;
    $effect(() => {
        if ($availableWads.length != lastWads) {
            lastWads = $availableWads.length;
            // maybe a wad was added and now we can load the map?
            parseUrlParams();
        }
    });
    let recentlyUsed = $derived(recentlyUsedGames($availableWads));

    async function parseUrlParams() {
        try {
            await parseUrlParams2();
            $error = null;
        } catch (e) {
            $error = e;
        }
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
            pointerLock.requestLock();
            game.startMap(urlMapName);
            loadOptionalUrlParams(game, params);
            recentlyUsed.push(game.wad.name, urlMapName, game.skill);
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

    // keep url in sync with game
    let map = $derived(game?.map);
    $effect(() => {
        if ($map && urlMapName !== $map.name) {
            urlMapName = $map.name;
            recentlyUsed.push(game.wad.name, $map.name, game.skill);
            history.pushState(null, null, `#${game.wad.name}&skill=${game.skill}&map=${$map.name}`);
        }
    })

    let screenName = $derived(
        game ? 'game' :
        wad && showEndoom ? 'endoom':
        $error ? 'error' :
        'home');

    const once = (fn: () => void) => (ev: Event) => {
        if (fn) {
            fn.call(this, ev);
            fn = null;
        }
    };
</script>

<svelte:window onpopstate={parseUrlParams} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<main
    onclick={once(enableSoundOnce)}
    use:context.pointerLock.pointerLockControls
    use:context.fullscreen.fullscreenControls
    class="w-screen h-screen"
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
                <Doom {game} {soundGain} paused={showMenu}>
                    {#if showMenu}
                        <Menu />
                    {/if}
                    <DoomControllers paused={showMenu} />
                </Doom>
            {/key}
        {:else}
            <HomeScreen {wad} {wadStore} />
        {/if}
    </WipeContainer>

    {#if wad && screenName !== 'endoom'}
        <MusicPlayer audioRoot={musicGain} lump={$musicTrack} />
    {/if}
</main>

<style>
    :root {
        --line-width: 12px;
        --honeycomb-size: 40px;
        background: var(--honeycomb-gradient);
        background-size: var(--honeycomb-size-x) var(--honeycomb-size-y);
    }
</style>