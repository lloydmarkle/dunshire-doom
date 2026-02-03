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
    import { type Game, SoundIndex, type Store, data, exportMap, randInt, store } from "../../doom";
    import MapStats from "./MapStats.svelte";
    import CheatsMenu from "./CheatsMenu.svelte";
    import KeyboardControlsMenu from "./KeyboardControlsMenu.svelte";
    import TouchControlsMenu from "./TouchControlsMenu.svelte";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { SpeakerWave, SpeakerXMark, VideoCamera, Cube, Eye, User, ArrowsPointingIn, ArrowsPointingOut, GlobeEuropeAfrica, MagnifyingGlass, Trash, ExclamationTriangle, Funnel } from '@steeze-ui/heroicons'
    import { SaveGameStore, type SaveGame } from "../../SaveGameStore";

    const { game, viewSize } = useDoom();
    const { settingsMenu, editor, pointerLock, fullscreen, restoreGame, lastRenderScreenshot } = useAppContext();
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

        const wrapMin = subMenu === 'save' && !deleteSaveMode ? -1 : 0;
        const speed = ev.shiftKey ? 3 : 1
        switch (ev.code) {
            case 'ArrowUp':
                wrapAndScroll(vcursor, -speed, '.saves .btn', wrapMin);
                break;
            case 'ArrowDown':
                wrapAndScroll(vcursor,speed, '.saves .btn', wrapMin);
                break;
            case 'Delete':
                deleteSaveMode = !deleteSaveMode;
                break;
            case 'Enter':
            case 'Return':
                if (!deleteSaveMode && subMenu === 'load') {
                    saveGames.then(sg => loadGame(sg[$vcursor]));
                } else if (typeSaveName === -2) {
                    if ($vcursor === -1) {
                        selectSaveSlot('', $vcursor);
                    } else {
                        saveGames.then(sg => selectSaveSlot(sg[$vcursor].name, sg[$vcursor].id));
                    }
                } else if (deleteSaveMode) {
                    saveGames.then(sg => deleteSave(sg[$vcursor].id));
                } else if (subMenu === 'save') {
                    saveGame(saveGameName, typeSaveName);
                }
                break;
            // TODO: left-right-space is awkward for toggling filters and also with search box highlighted. hmmm
            case 'ArrowLeft':
                wrapAndScroll(hcursor, -speed, '.save-filters label');
                break;
            case 'ArrowRight':
                wrapAndScroll(hcursor, speed, '.save-filters label');
                break;
            case 'Space':
                document.querySelectorAll<HTMLElement>('.save-filters label').item($hcursor)?.click();
                saveSearch?.focus();
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
    let vcursor = store(-1);
    let hcursor = store(0);
    const wrapAround = (n: number, max: number, min = 0) => n > max - 1 ? min : n < min ? max - 1 : n;
    const wrapAndScroll = (cursor: Store<number>, speed: number, selector: string, min = 0) => {
        const items = document.querySelectorAll<HTMLElement>(selector);
        cursor.update(n => wrapAround(n + speed, items.length + min, min));
        items.item(cursor.val - min)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
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
        const img = $lastRenderScreenshot ?? "";
        const save = exportMap($map);
        sgs.storeGame(name, img, $map.game, save, id === -1 ? undefined : id);
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
        saveGames.then(sg => vcursor.update(n => wrapAround(n, sg.length, 0)));
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
            $vcursor = menu === 'save' ? -1 : 0;
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
                    {#if keyboardActive}
                        <div class="kbd kbd-xs">DEL</div>
                    {/if}
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
                        class:btn-outline={-1 === $vcursor}
                        on:pointerenter={() => $vcursor = -1}
                    >
                        <img width="320" height="100" src={$lastRenderScreenshot ?? ""} alt={$map.name} />
                        {#if typeSaveName !== -1}
                            <div class="absolute flex justify-center items-center text-xl text-secondary rounded-lg"
                                style:--tw-bg-opacity={.2}
                            >
                                New save game
                            </div>
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
                            class:btn-outline={i === $vcursor}
                            on:pointerenter={() => $vcursor = i}
                        >
                            {@render gameTile(save, i)}

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
                    {#if keyboardActive}
                        <div class="kbd kbd-xs">DEL</div>
                    {/if}
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
                            class:btn-outline={i === $vcursor}
                            on:pointerenter={() => $vcursor = i}
                        >
                            {@render gameTile(save, i)}
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

{#snippet gameTile(save: SaveGame, index: number)}
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

    {#if typeSaveName !== save.id && save.name.length}
    <div class="absolute left-2 p-2 bg-black rounded-lg text-start text-primary text-xl max-w-60 overflow-hidden text-ellipsis"
        style:--tw-bg-opacity={.5}
    >
        {save.name}
    </div>
    {/if}

    {#if $vcursor === index}
    <div
        class="absolute text-2xl text-secondary"
        class:hidden={!deleteSaveMode}
    ><Icon src={Trash} theme='outline' size="36px" /></div>
    {/if}
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
    <div class="flex gap-4 p-2 items-center justify-start sticky top-16 z-10 bg-inherit shadow-2xl overflow-x-scroll">
        <span><Icon src={Funnel} theme='outline' size="24px" /></span>
        <ul class="save-filters menu menu-horizontal flex-nowrap">
        {#each relevantFilters as filter, i}
            {@const checked = selectedFilters.includes(filter)}
            <li>
                <label
                    class="label cursor-pointer gap-1"
                    class:active={i === $hcursor}
                    on:pointerenter={() => $hcursor = i}
                >
                    <input type="checkbox" class="checkbox checkbox-xs"
                        {checked} on:change={toggleGameFilter(filter)} />
                    <span class="label-text text-sm lowercase">{filter}</span>
                </label>
            </li>
        {/each}
        </ul>
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