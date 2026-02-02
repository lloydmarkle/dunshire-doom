<script lang="ts" context="module">
    // it feels like this share/optional params stuff is misplaced. Maybe when we get a more functional save game ui
    // we can find a better place for it?
    export function loadOptionalUrlParams(game: Game, params: URLSearchParams) {
        const player = game.map.val.player;

        const x = params.has('player-x') ? parseFloat(params.get('player-x')) : player.position.x;
        const y = params.has('player-y') ? parseFloat(params.get('player-y')) : player.position.y;
        const z = params.has('player-z') ? parseFloat(params.get('player-z')) : player.position.z;
        player.position.set(x, y, z);
        player.positionChanged();

        const yaw = params.has('player-dir') ? parseFloat(params.get('player-dir')) : player.direction;
        player.direction = yaw;
        const pitch = params.has('player-aim') ? parseFloat(params.get('player-aim')) : player.pitch;
        player.pitch = pitch;
    }

    function createShareUrl(game: Game) {
        const params = new URLSearchParams(window.location.hash.substring(1));
        const player = game.map.val.player;

        const pos = player.position;
        params.set('player-x', pos.x.toFixed(2));
        params.set('player-y', pos.y.toFixed(2));
        params.set('player-z', pos.z.toFixed(2));
        params.set('player-aim', player.pitch.toFixed(2));
        params.set('player-dir', player.direction.toFixed(2));

        window.location.hash = '#' + params.toString();
        navigator.clipboard.writeText(window.location.href);
        return window.location.href;
    }

    export const menuCategories = (settingsMenu: MenuSetting[]) => ({
        Normal: settingsMenu.filter(e => e.cat === "normal"),
        Advanced: settingsMenu.filter(e => e.cat === "advanced"),
        Compatibility: settingsMenu.filter(e => e.cat === "compatibility"),
        Debug: settingsMenu.filter(e => e.cat === "debug"),
        Experimental: settingsMenu.filter(e => e.cat === "experimental"),
    });

    export function menuSoundPlayer(audio: AudioContext, audioRoot: AudioNode, soundCache: ReturnType<typeof createSoundBufferCache>) {
        // 16 is more than a reasonable max number of simultaneous sounds
        let channelGain = (1 / 20 * Math.sqrt(Math.log(16)));
        const playSound = (snd: SoundIndex): [AudioBufferSourceNode, GainNode] => {
            if (!soundCache) {
                return;
            }
            const soundNode = audio.createBufferSource();
            soundNode.buffer = soundCache(snd);

            const gainNode = audio.createGain();
            configureGain(gainNode, audio.currentTime, channelGain, soundNode.buffer);
            soundNode.connect(gainNode).connect(audioRoot);
            soundNode.detune.value = randInt(-16, 16) * 4;
            soundNode.start();
            return [soundNode, gainNode];
        };

        const singleSound = (snd: SoundIndex, minDuration = 0) => {
            if (!soundCache) {
                return () => {}
            }

            let startTime: number;
            let interruptLast: () => void;
            return () => {
                const now = audio.currentTime;
                if (interruptLast && (now - startTime) < minDuration) {
                    return;
                }
                if (interruptLast) {
                    interruptLast();
                }

                startTime = now;
                const [soundNode, gainNode] = playSound(snd);
                soundNode.onended = () => interruptLast = null;
                interruptLast = () => {
                    const now = audio.currentTime;
                    if(now - startTime + interruptFadeOut > soundNode.buffer.duration) {
                        // already near the end of the sound so just finish it
                        return;
                    }
                    stopSound(now, gainNode, soundNode);
                };
            }
        };

        const sfx = {
            pstop: singleSound(SoundIndex.sfx_pstop, 0.2),
            pistol: singleSound(SoundIndex.sfx_pistol),
            stnmov: singleSound(SoundIndex.sfx_stnmov, 0.2),
            swtchn: singleSound(SoundIndex.sfx_swtchn),
            swtchx: singleSound(SoundIndex.sfx_swtchx),
        }

        return { channelGain, playSound, singleSound, sfx };
    }

    export function applySoundsToDOM(root: HTMLElement, sounds: ReturnType<typeof menuSoundPlayer>) {
        root.querySelectorAll('.btn').forEach(b => b.addEventListener('click', sounds.sfx.pistol));
        root.querySelectorAll('select').forEach(b => b.addEventListener('change', sounds.sfx.pistol));
        root.querySelectorAll('li').forEach(b => b.addEventListener('pointerenter', sounds.sfx.pstop));
        root.querySelectorAll('.btn').forEach(b => b.addEventListener('pointerenter', sounds.sfx.pstop));
        root.querySelectorAll('input[type="checkbox"]').forEach(b => b.addEventListener('click', sounds.sfx.pistol));
        root.querySelectorAll('input[type="range"]').forEach(b => b.addEventListener('input', sounds.sfx.stnmov));
    }
</script>
<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { useAppContext, useDoom } from "../DoomContext";
    import MenuItem from "./MenuItem.svelte";
    import CommandPalette from "./CommandPalette.svelte";
    import AppInfo from "../Components/AppInfo.svelte";
    import MapNamePic from "../Components/MapNamePic.svelte";
    import Picture from "../Components/Picture.svelte";
    import { type Game, SoundIndex, data, exportMap, randInt, store } from "../../doom";
    import MapStats from "./MapStats.svelte";
    import CheatsMenu from "./CheatsMenu.svelte";
    import KeyboardControlsMenu from "./KeyboardControlsMenu.svelte";
    import TouchControlsMenu from "./TouchControlsMenu.svelte";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { SpeakerWave, SpeakerXMark, VideoCamera, Cube, Eye, User, ArrowsPointingIn, ArrowsPointingOut, GlobeEuropeAfrica, MagnifyingGlass, Trash, ExclamationTriangle } from '@steeze-ui/heroicons'
    import { SaveGameStore, type SaveGame } from "../../SaveGameStore";

    const { game, viewSize } = useDoom();
    const { settingsMenu, editor, pointerLock, fullscreen, restoreGame } = useAppContext();
    const { muted, cameraMode, simulate486 } = useAppContext().settings;
    const { intermission, map } = game;
    const settings = menuCategories(settingsMenu);

    const transitionDuration = 200;
    $: touchDevice = matchMedia('(hover: none)').matches;
    // a hack to allow a fullscreen menu for configuring touch controls
    $: showTouchControls = touchDevice && subMenu === 'controls';
    const menuFlyDirection = $viewSize.width > 768 && touchDevice ? '100%' : '-100%';

    // Someday I hope to live in a world where I can use fullscreen API in safari on iPhone
    // https://forums.developer.apple.com/forums/thread/133248
    // https://caniuse.com/fullscreen
    $: isFullscreen = fullscreen.isFullscreen;
    const toggleFullscreen = () => $isFullscreen
        ? fullscreen.releaseFullscreen()
        : fullscreen.requestFullscreen();

    $: episodeEnd = $intermission && $intermission.finishedMap.name.endsWith('M8');
    $: nextEpisodeMap = `E${1 + parseInt(episodeEnd ? $intermission.finishedMap.name[1] : '-1')}M1`;
    $: hasNextEpisode = game.wad.mapNames.includes(nextEpisodeMap);
    function startNextEpisode() {
        game.resetInventory();
        game.startMap(nextEpisodeMap);
        pointerLock.requestLock();
    }

    let shared = false;
    function share() {
        location.href = createShareUrl(game);
        shared = true;
    }

    let keyboardActive = false;
    function keydown(ev: KeyboardEvent) {
        keyboardActive = true;
        if (paletteActive) {
            return;
        }

        const saveMenu = subMenu === 'load' || subMenu === 'save'
        if (!saveMenu) {
            const specialKeys = ev.ctrlKey || ev.metaKey;
            if (ev.key.toUpperCase() === 'L' && !specialKeys) {
                toggleSaveGamesSubmenu('load')();
                ev.preventDefault();
            }
            if (ev.key.toUpperCase() === 'S' && !specialKeys) {
                toggleSaveGamesSubmenu('save')();
                ev.preventDefault();
            }
            return;
        }
        // don't let keys go to command palette if a menu is active
        ev.stopPropagation();

        const speed = ev.shiftKey ? 3 : 1
        switch (ev.code) {
            case 'ArrowUp':
                wrapAndScroll(-speed);
                break;
            case 'ArrowDown':
                wrapAndScroll(speed);
                break;
            case 'ArrowLeft':
            case 'ArrowRight':
                deleteSaveMode = !deleteSaveMode;
                break;
            case 'Delete':
                if (deleteSaveMode) {
                    saveGames.then(sg => deleteSave(sg[$cursor].id));
                }
                break;
            case 'Enter':
            case 'Return':
                if (!deleteSaveMode && subMenu === 'load') {
                    saveGames.then(sg => loadGame(sg[$cursor]));
                } else if (typeSaveName === -2) {
                    if ($cursor === -1) {
                        selectSaveSlot('', $cursor);
                    } else {
                        saveGames.then(sg => selectSaveSlot(sg[$cursor].name, sg[$cursor].id));
                    }
                } else if (deleteSaveMode) {
                    saveGames.then(sg => deleteSave(sg[$cursor].id));
                } else if (subMenu === 'save') {
                    saveGame(saveGameName, typeSaveName);
                }
                break;
        }
    }
    function keyup(ev: KeyboardEvent) {
        if (paletteActive) {
            return;
        }
        switch (ev.code) {
            case 'Backquote':
            case 'Escape':
                if (typeSaveName !== -2) {
                    typeSaveName = -2;
                    menuSounds.sfx.swtchx();
                    return;
                }
                if (subMenu) {
                    subMenu = '';
                    return;
                }
                resumeGame();
                ev.stopImmediatePropagation();
                break;
        }
    }

    function resumeGame() {
        pointerLock.requestLock();
    }

    // save games (see also keyboard controls above)
    let cursor = store(-1);
    const wrapAround = (n: number, max: number, min = 0) => n > max - 1 ? min : n < min ? max - 1 : n;
    const wrapAndScroll = (speed: number) => {
        const cursorMin = subMenu === 'save' && !deleteSaveMode ? -1 : 0;
        saveGames.then(sg => {
            cursor.update(n => wrapAround(n + speed, sg.length, cursorMin))
            const element = document.querySelectorAll<HTMLElement>('.saves .btn').item($cursor);
            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        });
    }
    let saveSearch: HTMLInputElement;
    let deleteSaveMode = false;
    let typeSaveName = -2;
    let saveGameName = '';
    const sgs = new SaveGameStore();
    let lastWadName = game.wad.name.split('&').pop().split('=').pop().toUpperCase();
    let selectedFilters = [lastWadName];
    $: visibleGameFilters = (async (): Promise<string[]> => [
            lastWadName,
            ...(await sgs.filters).filter(e => e[1] > 2 && e[0].length > 1 && !e[0].startsWith('M')).map(e => e[0]),
        ].filter((e, i, arr) => arr.indexOf(e) === i))();
    let loadGameSearchText = '';
    $: saveGames = (subMenu === 'load' || subMenu === 'save')
        ? sgs.loadGames([loadGameSearchText.toUpperCase(), ...selectedFilters].join(' '))
        : Promise.resolve([] as SaveGame[]);
    function saveGame(name: string, id?: number) {
        // TODO: replace this with an actual screenshot at save time
        const tempImage = 'data:image/png;base64,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';
        const save = exportMap($map);
        sgs.storeGame(name, tempImage, $map.game, save, id === -1 ? undefined : id);
        $map.player.hudMessage.set('Game saved.');
        menuSounds.sfx.pistol();
        resumeGame();
    }
    async function loadGame(save: SaveGame) {
        menuSounds.sfx.pistol();
        const mapExport = await save.mapExport();
        // loading a game may need to recreate the game instance (if skill level or wads change) but even if it doesn't,
        // we need to load the game state so set a flag here to be loaded in the main doom component.
        window.location.hash = `#${save.wads.map(e => 'wad=' + e).join('&')}&skill=${save.skill}&map=${save.mapInfo.name}`;
        restoreGame.set(mapExport);
        resumeGame();
    }
    const deleteSave = async (id: number) => {
        await sgs.deleteGame(id)
        saveGames = sgs.loadGames([loadGameSearchText.toUpperCase(), ...selectedFilters].join(' '));
        menuSounds.sfx.pistol();
        saveGames.then(sg => cursor.update(n => wrapAround(n, sg.length, 0)));
        typeSaveName = -2;
    };
    const selectSaveSlot = (name: string, id: number) => {
        typeSaveName = id;
        saveGameName = name;
        menuSounds.sfx.pistol();
        tick().then(() => document.querySelector<HTMLElement>('.saves .btn-outline input')?.focus());
    }
    const toggleSaveGamesSubmenu = (menu: string) => () => {
        deleteSaveMode = false;
        typeSaveName = -2;
        saveGameName = '';
        loadGameSearchText = '';
        if (toggleSubmenu(menu)() === menu) {
            $cursor = menu === 'save' ? -1 : 0;
            tick().then(() => saveSearch?.focus());
        }
    }
    const toggleGameFilter = (name: string) => () => {
        if (selectedFilters.includes(name)) {
            selectedFilters = selectedFilters.filter(e => e !== name);
        } else {
            selectedFilters = [...selectedFilters, name];
        }
    }

    let paletteActive = false;

    let subMenu = '';
    $: if (paletteActive) subMenu = '';
    let subMenuNode: HTMLElement;
    const toggleSubmenu = (menu: string) => () => subMenu = subMenu === menu ? '' : menu;

    import { configureGain, createSoundBufferCache, interruptFadeOut, stopSound } from "../SoundPlayer.svelte";
    import { onMount, tick } from "svelte";
    import type { MenuSetting } from "./menu";
    const { audio, soundGain } = useAppContext();
    const { maxSoundChannels } = useAppContext().settings;
    $: soundCache = createSoundBufferCache(audio, game.wad);
    $: menuSounds = menuSoundPlayer(audio, soundGain, soundCache);
    $: menuSounds.channelGain = (1 / 20 * Math.sqrt(Math.log($maxSoundChannels)));
    onMount(() => {
        document.querySelectorAll('.btn').forEach(b => b.addEventListener('pointerenter', menuSounds.sfx.pstop));
        document.querySelectorAll('label').forEach(b => b.addEventListener('pointerenter', menuSounds.sfx.pstop));
        document.querySelectorAll('input[type="checkbox"]').forEach(b => b.addEventListener('click', menuSounds.sfx.pistol));
    });
    $: if (subMenuNode) {
        (!subMenu ? menuSounds.sfx.swtchx : menuSounds.sfx.swtchn)();
        tick().then(() => applySoundsToDOM(subMenuNode, menuSounds));
    }
</script>

<svelte:window
    on:keyup|preventDefault={keyup}
    on:keydown={keydown}
    on:pointermove={() => keyboardActive = false}
/>

<div
    transition:fade={{ duration: transitionDuration }}
    on:introstart={menuSounds.sfx.swtchn}
    on:outrostart={menuSounds.sfx.swtchx}
    class:hidden={$editor.active}
    class="absolute inset-0 opacity-50 bg-neutral pointer-events-none"
></div>

<div class="game-menu absolute top-0 left-0 bottom-0 grid select-none"
    class:keyboard-controls={keyboardActive}
>
    <div transition:fly={{ x: "-100%", duration: transitionDuration }} class="
        bg-honeycomb
        w-screen max-w-96 overflow-y-scroll overflow-x-hidden md:z-10
    "
    class:hidden={showTouchControls && subMenu === 'controls'}
    >
        <div class="flex flex-col gap-2 transition-transform"
            class:menu-go-up={paletteActive}
        >
            <div class="self-center pt-2"><a href="#{game.wad.name}&endoom"><Picture name="M_DOOM" /></a></div>
            <div class="px-2">
                <div class="flex gap-4 items-center pb-2">
                    {#if $intermission}
                        <span>Intermission</span>
                    {:else if $map}
                        <span><MapNamePic name={$map.name} /></span>
                    {/if}
                    <span><Picture name={data.skills.find((sk) => sk.num === game.skill).pic}/></span>
                </div>
                <MapStats map={$map} />
            </div>

            <div class="divider"></div>
            <button class="btn btn-primary uppercase" on:click={resumeGame}>Resume</button>

            {#if hasNextEpisode}
            <button on:click={startNextEpisode} class="btn btn-secondary">Next episode</button>
            {/if}
            {#if !shared}
                <button class="btn" on:click={share}>Share</button>
            {:else}
                <span class="text-center" transition:fly={{ duration: transitionDuration }}>Url copied to clipboard</span>
            {/if}

            {#if $map}
                <button class="btn relative"
                    class:submenu-selected={subMenu === 'load'}
                    on:click={toggleSaveGamesSubmenu('load')}
                >
                    Load
                    <kbd class="absolute right-4 kbd">L</kbd>
                </button>
                <button class="btn relative"
                    class:submenu-selected={subMenu === 'save'}
                    on:click={toggleSaveGamesSubmenu('save')}
                >
                    Save
                    <kbd class="absolute right-4 kbd">S</kbd>
                </button>
            {/if}

            <div class="divider"></div>
            <div class="flex mx-auto join">
                <label class="swap btn btn-lg join-item">
                    <input type="checkbox" bind:checked={$isFullscreen} on:click={toggleFullscreen} />
                    <Icon class="swap-on fill-current" src={ArrowsPointingIn} theme='solid' size="32px"/>
                    <Icon class="swap-off fill-current" src={ArrowsPointingOut} theme='solid' size="32px"/>
                </label>
                <div class="dropdown dropdown-bottom">
                    <div tabindex="0" role="button" class="btn btn-lg join-item"><Icon src={VideoCamera} theme='solid' size="32px"/></div>
                    <ul tabindex="-1" class="dropdown-content z-[1] menu p-2 shadow bg-base-100 rounded-box w-52">
                        <li><button on:click={() => $cameraMode = '1p'}><Icon src={Eye} theme='solid' size="24px"/>First person</button></li>
                        <li><button on:click={() => $cameraMode = '3p'}><Icon src={User} theme='solid' size="24px"/>Third person</button></li>
                        <li><button on:click={() => $cameraMode = 'ortho'}><Icon src={Cube} theme='solid' size="24px"/>Isometric</button></li>
                        <li><button on:click={() => $cameraMode = 'bird'}><Icon src={GlobeEuropeAfrica} theme='solid' size="24px"/>Overhead</button></li>
                    </ul>
                </div>
                <label class="swap btn btn-lg join-item">
                    <input type="checkbox" bind:checked={$muted} />
                    <Icon class="swap-on fill-current" src={SpeakerXMark} theme='solid' size="32px"/>
                    <Icon class="swap-off fill-current" src={SpeakerWave} theme='solid' size="32px"/>
                </label>
                <label class="swap btn btn-lg join-item">
                    <input type="checkbox" bind:checked={$simulate486} />
                    <span class="swap-on text-xs">486ish</span>
                    <span class="swap-off text-xs">Normal</span>
                </label>
            </div>

            <button class="btn w-full relative"
                class:submenu-selected={subMenu === 'settings'}
                on:click={toggleSubmenu('settings')}>
                Settings
                <kbd class="absolute right-4 kbd">/</kbd>
            </button>
            <button class="btn w-full"
                class:submenu-selected={subMenu === 'controls'}
                on:click={toggleSubmenu('controls')}>Controls</button>
            <button class="btn w-full"
                class:submenu-selected={subMenu === 'cheats'}
                on:click={toggleSubmenu('cheats')}>Cheats</button>
        </div>

        {#if !touchDevice}
        <div class:palette-active={paletteActive}>
            <CommandPalette bind:active={paletteActive} />
        </div>
        {/if}

        <div class="fixed bottom-4 px-2">
            <AppInfo />
        </div>
    </div>

    {#if subMenu && !showTouchControls}
    <div bind:this={subMenuNode} class="
        absolute bg-base-100 shadow w-screen max-w-96 rounded-box
        overflow-y-scroll bottom-0 top-0
        pb-80 md:pb-10 md:left-96
        "
        class:delete-mode={deleteSaveMode}
        transition:fly|global={{ x: menuFlyDirection, duration: transitionDuration }}
    >
        <button class="btn btn-secondary w-full sticky top-0 z-20 md:hidden" on:click={() => subMenu = ''}>Back</button>
        {#if subMenu === 'settings'}
            <ul class="menu">
                {#each Object.entries(settings) as [category, values]}
                    <div class="divider sticky my-2 z-10 top-12 md:top-0 bg-base-100">{category}</div>
                    {#each values as item}
                        <li><MenuItem {item} /></li>
                    {/each}
                {/each}

                <div class="divider sticky my-2 z-10 top-0 bg-base-100">Other</div>
                <li>
                    <label class="label cursor-pointer">
                        <span class="label-text">Inspector</span>
                        <input type="checkbox" class="checkbox" bind:checked={$editor.active} on:change={() => ($editor.selected = null)} />
                    </label>
                </li>
            </ul>
        {:else if subMenu === 'controls'}
            <KeyboardControlsMenu />
        {:else if subMenu === 'cheats'}
            <CheatsMenu player={$map.player} />
        {:else if subMenu === 'save'}
            <h2 class="flex justify-center sticky top-12 bg-base-200 z-10 md:hidden">Save</h2>
            <div class="flex flex-wrap gap-4 p-2 items-center justify-start sticky top-0 z-10 bg-inherit">
                <button class="btn"
                    class:btn-outline={deleteSaveMode}
                    on:click={() => deleteSaveMode = !deleteSaveMode}
                >
                    <Icon src={Trash} theme='outline' size="18px" />
                </button>

                <label class="input input-bordered flex items-center gap-2 text-sm grow">
                    <Icon src={MagnifyingGlass} theme='outline' size="12px" />
                    <input bind:this={saveSearch} type="text" placeholder="Search" bind:value={loadGameSearchText} />
                </label>
            </div>
            {#await saveGames}
                <div class="absolute inset-0 flex justify-center items-center z-20" out:fade={{ duration: 400 }}>
                    <span class="loading loading-spinner loading-lg"></span>
                </div>
            {:then games}
                {@render quickFilters(games)}
                <div class="saves flex flex-col gap-2 px-8 py-2">
                    {#if !deleteSaveMode}
                    <button
                        class="btn btn-neutral h-[100px] no-animation p-0 overflow-hidden shadow-2xl relative"
                        on:click={() => selectSaveSlot('', -1)}
                        class:btn-outline={-1 === $cursor}
                        on:pointerenter={() => $cursor = -1}
                    >
                        {#if typeSaveName !== -1}
                            New save game
                        {:else}
                        <div class="savegame-text absolute left-2 p-2 bg-black rounded-lg text-start text-primary text-xl max-w-60 overflow-hidden text-ellipsis"
                            style:--tw-bg-opacity={.5}
                        >
                            <input type="text" class="absolute opacity-0 h-0 w-0" bind:value={saveGameName} />
                            {saveGameName}
                        </div>
                        {/if}
                    </button>
                    {/if}
                    {#each games as save, i (save.id)}
                    <div class="relative">
                        <button
                            class="btn h-auto no-animation p-0 overflow-hidden shadow-2xl relative"
                            on:click={() => selectSaveSlot(save.name, save.id)}
                            class:btn-outline={i === $cursor}
                            on:pointerenter={() => $cursor = i}
                        >
                            {@render gameTile(save)}

                            {#if !deleteSaveMode && typeSaveName === save.id}
                            <div class="savegame-text absolute left-2 p-2 bg-black rounded-lg text-start text-primary text-xl max-w-60 overflow-hidden text-ellipsis"
                            style:--tw-bg-opacity={.5}
                            >
                                <input type="text" class="absolute opacity-0 h-0 w-0" bind:value={saveGameName} />
                                {saveGameName}
                            </div>
                            {/if}
                        </button>
                        {@render deleteButton(save)}
                        </div>
                    {/each}
                </div>
            {/await}
        {:else if subMenu === 'load'}
            <h2 class="flex justify-center sticky top-12 bg-base-200 z-20 md:hidden">Load</h2>
            <div class="flex flex-wrap gap-4 p-2 items-center justify-start sticky top-0 z-10 bg-inherit shadow-2xl">
                <button class="btn"
                    class:btn-outline={deleteSaveMode}
                    on:click={() => deleteSaveMode = !deleteSaveMode}
                >
                    <Icon src={Trash} theme='outline' size="18px" />
                </button>

                <label class="input input-bordered flex items-center gap-2 text-sm grow">
                    <Icon src={MagnifyingGlass} theme='outline' size="12px" />
                    <input bind:this={saveSearch} type="text" placeholder="Search" bind:value={loadGameSearchText} />
                </label>
            </div>
            {#await saveGames}
                <div class="absolute inset-0 flex justify-center items-center z-20" out:fade={{ duration: 400 }}>
                    <span class="loading loading-spinner loading-lg"></span>
                </div>
            {:then games}
                {@render quickFilters(games)}
                <div class="saves flex flex-col gap-2 px-8 py-2">
                {#each games as save, i (save.id)}
                    <div class="relative">
                        <button
                            class="btn w-full h-auto no-animation p-0 overflow-hidden shadow-2xl relative"
                            on:click={() => deleteSaveMode ? typeSaveName = save.id : loadGame(save)}
                            class:btn-outline={i === $cursor}
                            on:pointerenter={() => $cursor = i}
                        >
                            {@render gameTile(save)}
                        </button>
                        {@render deleteButton(save)}
                    </div>
                {/each}
                </div>
            {/await}
        {/if}
    </div>
    {/if}
</div>

{#snippet gameTile(save: SaveGame)}
    <img width="320" height="100" src={save.image} alt={save.mapInfo.name} />

    <div class="absolute bottom-2 right-2 p-2 items-end flex flex-col gap-2 bg-black rounded-lg text-secondary"
        style:--tw-bg-opacity={.5}
    >
        <span>{save.mapInfo.totalKills === 0 ? '100' : Math.floor(save.mapInfo.kills * 100 / save.mapInfo.totalKills)}%</span>
        <div class="flex items-end">
            <span>{save.mapInfo.name}:</span>
            <span>{data.skills[save.skill - 1].alias}</span>
        </div>
        <div>
        {#each save.wads as name}
            <div class="badge badge-secondary badge-xs">{name}</div>
        {/each}
        </div>
    </div>

    {#if typeSaveName !== save.id}
    <div class="absolute left-2 p-2 bg-black rounded-lg text-start text-primary text-xl max-w-60 overflow-hidden text-ellipsis"
        style:--tw-bg-opacity={.5}
    >
        {save.name}
    </div>
    {/if}

    <div
        class="absolute text-2xl"
        class:hidden={!deleteSaveMode}
    ><Icon src={Trash} theme='outline' size="36px" /></div>
{/snippet}

{#snippet deleteButton(save: SaveGame)}
    {#if deleteSaveMode && typeSaveName === save.id}
        <div
            transition:fly={{ y:'-4rem', duration: 200 }}
            class="alert alert-warning flex absolute top-4 z-20"
        >
            <span><Icon src={ExclamationTriangle} theme='outline' size="24px" /></span>
            <span>Delete save "{save.name}"?</span>
            <div class="flex gap-2 ms-auto">
                <button class="btn" on:click={() => deleteSave(save.id)}>Yes</button>
                <button class="btn" on:click={() => typeSaveName = -2}>No</button>
            </div>
        </div>
    {/if}
{/snippet}

{#snippet quickFilters(games: SaveGame[])}
    {#await visibleGameFilters then visibleFilters}
    {@const gameFilters = (games ?? []).map(e => e.searchText).flat().filter((e, i, arr) => arr.indexOf(e) === i)}
    {@const relevantFilters = visibleFilters.filter(e => selectedFilters.includes(e) || gameFilters.includes(e))}
    <div class="flex gap-4 p-2 items-center justify-start sticky top-16 z-10 bg-inherit shadow-2xl overflow-x-scroll scroll-">
        {#each relevantFilters as filter}
            <button on:click={toggleGameFilter(filter)}
                class="btn btn-secondary btn-sm no-animation lowercase"
                class:btn-outline={!selectedFilters.includes(filter)}
            >{filter}</button>
        {/each}
    </div>
    {/await}
{/snippet}

{#if subMenu === 'controls' && showTouchControls}
    <div
        class="absolute inset-0 z-30"
        transition:fly={{ x: menuFlyDirection, duration: transitionDuration }}
    >
        <div class="absolute inset-0 bg-honeycomb opacity-60 pointer-events-none"></div>
        <div class="relative w-full h-full">
            <TouchControlsMenu bind:subMenu={subMenu} />
        </div>
    </div>
{/if}

<style>
    :global(body):has(.game-menu.keyboard-controls) {
        cursor: none;
    }
    .keyboard-controls {
        pointer-events: none;
    }

    @media (hover: none) {
        .kbd {
            display: none;
        }
    }

    .savegame-text::after {
        content: '_';
        animation: cursor-pulse .2s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate-reverse;
    }
    @keyframes cursor-pulse {
        to { opacity: 0.3; }
    }

    .saves .btn img {
        height: 100px;
        object-fit: cover;
    }
    .saves .btn-outline img {
        transform-origin: top center;
        transition: transform 0.2s;
    }
    .saves .btn-outline img {
        transform: scale(1.02);
    }

    .delete-mode {
        --tw-bg-opacity: 1;
        background-color: rgb(153 27 27 / var(--tw-bg-opacity))
    }
    .delete-mode .saves .btn {
        filter: grayscale(100%);
    }

    .submenu-selected {
        background: oklch(var(--b1));
    }

    .palette-active {
        position: absolute;
        top: 1rem;
        width: 100%;
        padding-inline: .5rem;
    }
    .menu-go-up {
        transform: translate(0, -100%);
    }
</style>