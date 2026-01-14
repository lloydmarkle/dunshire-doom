<script lang="ts" context="module">
    interface RecentlyUsedGame {
        wad: string;
        map: string;
        skill: number;
        image: string;
    }

    const settingsKey = 'doom-lru-wads';
    const recentlyUsedLimit = 12;
    // nifty! https://stackoverflow.com/questions/34698905
    const simplifyItem = (item: RecentlyUsedGame) => (({ image, ...o }) => o)(item);

    export const recentlyUsedGames = (wads: WADInfo[]) => {
        const wadImage = (wadNames: string) => {
            const wadList = wadNames.split('&').map(e => e.split('=')[1]).flat();
            return wadList.reverse().map(w => wads.find(e => e.name === w)).find(e => e && e.image)?.image ?? '';
        };

        let items: RecentlyUsedGame[] = [];
        const push = (wad: string, map: string, skill: number) => {
            items.splice(0, 0, { wad, map, skill, image: wadImage(wad) });
            // remove any other entries for the same wad (assume we don't want multiple skill/maps on recently used)
            for (let i = 1; i < items.length; i++) {
                if (items[i].wad === wad) {
                    items.splice(i, 1);
                    i -= 1;
                }
            }
            while (items.length > recentlyUsedLimit) {
                items.pop();
            }
            localStorage.setItem(settingsKey, JSON.stringify(items.map(simplifyItem)));
        }

        try {
            items = JSON.parse(localStorage.getItem(settingsKey)) ?? [];
            // try to restore image
            for (const item of items) {
                item.image = wadImage(item.wad);
            }
        } catch {
            console.warn('failed to restore recently used wads, using defaults');
        }
        return { push, items };
    }
</script>
<script lang="ts">
    import { crossfade, fade, fly } from "svelte/transition";
    import { data, store, tickTime, type DoomWad } from "../doom";
    import { WadStore, type WADInfo } from "../WadStore";
    import Picture from "../render/Components/Picture.svelte";
    import { Home, MagnifyingGlass } from "@steeze-ui/heroicons";
    import { Icon } from "@steeze-ui/svelte-icon";
    import WadList from "../render/Components/WadList.svelte";
    import { useAppContext } from "../render/DoomContext";
    import { createSoundBufferCache } from "../render/SoundPlayer.svelte";
    import { onMount, tick } from "svelte";
    import { menuSoundPlayer } from "../render/Menu/Menu.svelte";
    import type { KeyboardEventHandler } from "svelte/elements";
    import PreloadWad, { preloadedWads } from "./Launcher/PreloadWad.svelte";
    import { SpeakerWave, SpeakerXMark } from "@steeze-ui/heroicons";

    export let wads: WADInfo[];
    export let wadStore: WadStore;
    export let wad: DoomWad = null;
    $: iWads = wads.filter(wad => wad.iwad);
    $: preloadWads = preloadedWads.filter(e => !iWads.find(w => w.name === e.link.split('/').pop().split('.').shift()))
    $: pWads = wads.filter(wad => !wad.iwad);

    const { audio, soundGain, settings, musicTrack } = useAppContext();
    const { maxSoundChannels, muted } = settings;
    $: menuSounds = menuSoundPlayer(audio, soundGain, wad ? createSoundBufferCache(audio, wad) : null);
    $: msfx = menuSounds.sfx;
    $: menuSounds.channelGain = (1 / 20 * Math.sqrt(Math.log($maxSoundChannels)));
    $: recentlyUsed = recentlyUsedGames(wads);

    const nullTransition = () => ({ duration: 0 });
    const [send, receive] = crossfade({
		duration: 350,
		fallback: nullTransition,
	});

    let searchText = '';
    $: lowerCaseSearchText = searchText.toLowerCase();
    $: filteredWads = pWads.filter(wad => wad.name.includes(lowerCaseSearchText));

    let selectedIWad: WADInfo;
    let selectedPWads: WADInfo[] = [];
    let bgImage = '';
    $: $musicTrack = wad ? (wad.optionalLump('D_DM2TTL') ?? wad.optionalLump('D_INTRO')) : null;

    let skullImage = 0;
    const skullImages = ['M_SKULL1', 'M_SKULL2'];
    onMount(() => {
        // menu skull changes every 8 tics
        const skullChanger = setInterval(() => skullImage ^= 1, 1000 * tickTime * 8);
        return () => clearInterval(skullChanger);
    });

    let selectedWadName = '';
    $: if (selectedIWad) selectedWadName = selectedIWad.name;
    let lastPwadsCount = 0;
    let lastIWad = '';
    let startPlaying = false;
    let mapName: string;
    $: mapNames = wad?.mapNames ?? [];
    function parseUrlHash(hash: string, iwads: WADInfo[]) {
        const params = new URLSearchParams(hash.substring(1));

        const wads = params.getAll('wad');
        selectedIWad = iwads.find(e => e.name === wads[0]);
        selectedPWads = wads.map(p => pWads.find(e => e.name === p)).filter(e => e);
        bgImage = selectedPWads.reduce<string>((img, pwad) => pwad.image ?? img, undefined) ?? selectedIWad?.image;

        if (selectedIWad?.name !== lastIWad) {
            (lastIWad ? msfx.swtchx : msfx.pistol)();
        }
        if (lastPwadsCount !== selectedPWads.length) {
            (lastPwadsCount - selectedPWads.length > 0 ? msfx.swtchx : msfx.swtchn)();
        }
        lastIWad = selectedIWad?.name ?? '';
        lastPwadsCount = selectedPWads.length;

        const urlMapName = params.get('map');
        if (urlMapName !== mapName) {
            mapName = urlMapName;
        }

        let play = startPlaying;
        startPlaying = params.has('play') || params.has('map');
        if (play !== startPlaying) {
            (play ? msfx.swtchx : msfx.pistol)();
        }
    }
    $: parseUrlHash(window.location.hash, iWads);

    // TODO: the url state management in this component is a mess. The whole component is a mess really. It works but
    // it feels like it could be written in a much cleaner and tidier way.
    $: if (wad && selectedPWads && !startPlaying && !mapName) {
        window.location.href = '#' + [selectedIWad, ...selectedPWads].filter(p => p).map(p => `wad=${p.name}`).join('&');
    }
    $: screen =
        wad && startPlaying && mapNames.includes('E1M1') && !mapName ? 'select-episode' :
        wad && startPlaying ? 'select-skill' :
        wad ? 'select-wads' :
        !selectedIWad ? 'select-iwad' :
        'wait'; // a brief intermediate state that happens when an iwad is selected but the wad isn't loaded (yet)

    // keyboard controls became almost an exercise in code golf so I'm not sure how readable this is...
    let rootNode: HTMLDivElement;
    let cursor = store(0);
    let section = store('');
    const keyboardControllers = (() => {
        const gridMover = (name: string, selector: string) => {
            const info = { rows: 0, cols: 0, cells: 0, buttons: null as NodeListOf<HTMLElement> };
            const measure = () => {
                const grid = rootNode?.querySelector<HTMLElement>(selector);
                if (grid) {
                    info.cells = grid.childElementCount;
                    info.buttons = grid.querySelectorAll('.btn');
                    // Based on https://stackoverflow.com/questions/49506393
                    const style = getComputedStyle(grid);
                    info.rows = style.gridTemplateRows.split(' ').length;
                    info.cols = style.gridTemplateColumns.split(' ').length;
                }
            }
            tick().then(() => measure());

            const monitor = () => {
                const obs = new ResizeObserver(measure);
                obs.observe(rootNode);
                return () => obs.disconnect();
            };
            const move = (ev: KeyboardEvent) => {
                const min = Math.floor(cursor.val / info.cols) * info.cols;
                const max = Math.min(info.cells, min + info.cols);
                // clamp instead of wrap?
                if (ev.code === 'ArrowUp') {
                    cursor.update(n => wrapAround(n - info.cols, info.cells));
                } else if (ev.code === 'ArrowDown') {
                    cursor.update(n => wrapAround(n + info.cols, info.cells));
                } else if (ev.code === 'ArrowLeft') {
                    cursor.update(n => wrapAround(n - 1, max, min));
                } else if (ev.code === 'ArrowRight') {
                    cursor.update(n => wrapAround(n + 1, max, min));
                } else if (ev.code === 'Enter' || ev.code === 'Return') {
                    info.buttons.item(cursor.val).click();
                    ev.preventDefault();
                }
            };
            return { name, info, move, monitor };
        };

        let resetCursor = () => {};
        let resetState: any = () => {};
        const captureCursor = (n: number, fn: KeyboardEventHandler<Window>, init = resetState) => {
            let localCursor = n;
            return () => {
                resetState();
                tick().then(() => resetState = init() ?? resetState);
                resetCursor();
                cursor.set(localCursor);
                resetCursor = cursor.subscribe(n => localCursor = n);
                return fn;
            }
        };
        const wrapAround = (n: number, max: number, min = 0) => n > max - 1 ? min : n < min ? max - 1 : n;

        const episodeGrid = gridMover('episode', '.card-actions .grid');
        const episode = captureCursor(0, ev => {
            episodeGrid.move(ev);
            if (ev.code === 'Escape') {
                rootNode.querySelector<HTMLElement>('.card-title a').click();
            }
        }, episodeGrid.monitor);

        const root = (): KeyboardEventHandler<Window> => {
            if (recentlyUsed.items.length) {
                const stackedGrid =
                    (before: ReturnType<typeof gridMover>, main: ReturnType<typeof gridMover>, after: ReturnType<typeof gridMover>) =>
                    () => {
                        resetState();
                        resetState = main.monitor();
                        tick().then(() => {
                            const element = main.info.buttons.item($cursor);
                            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        });
                        return ev => {
                            if (ev.code === 'ArrowUp') {
                                if (cursor.val - main.info.cols < 0) {
                                    cursor.update(v => before.info.cols * (before.info.rows - 1) + (v % before.info.cols))
                                    return section.set(before.name);
                                }
                                cursor.update(n => wrapAround(n - main.info.cols, main.info.cells));
                            } else if (ev.code === 'ArrowDown') {
                                if (cursor.val + main.info.cols >= main.info.cells) {
                                    cursor.update(v => v % after.info.cols);
                                    return section.set(after.name);
                                }
                                cursor.update(n => wrapAround(n + main.info.cols, main.info.cells));
                            } else {
                                main.move(ev);
                            }
                            const element = main.info.buttons.item($cursor);
                            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        };
                    };

                const recentGrid = gridMover('recent', '.recent-grid');
                const gameGrid = gridMover('game', '.game-grid');
                const recentGridHandler = stackedGrid(gameGrid, recentGrid, gameGrid);
                const gameGridHandler = stackedGrid(recentGrid, gameGrid, recentGrid);
                let currentHandler: KeyboardEventHandler<Window>;
                if (!section.val.length) {
                    section.set('recent');
                }
                section.subscribe(val => currentHandler = (val === 'game' ? gameGridHandler() : recentGridHandler()));
                return ev => currentHandler(ev);
            }
            section.set('game');
            const gameGrid = gridMover('game', '.game-grid');
            return captureCursor(0, gameGrid.move, gameGrid.monitor)();
        };

        const skill = captureCursor(3, ev => {
            if (ev.code === 'ArrowUp') {
                cursor.update(n => wrapAround(n - 1, data.skills.length));
            } else if (ev.code === 'ArrowDown') {
                cursor.update(n => wrapAround(n + 1, data.skills.length));
            } else if (ev.code === 'Enter' || ev.code === 'Return') {
                rootNode.querySelector<HTMLElement>('.card-actions .pulse-saturation').click();
                ev.preventDefault();
            } else if (ev.code === 'Escape') {
                rootNode.querySelector<HTMLElement>('.card-title a:last-child').click();
            }
        });

        const wads = (): KeyboardEventHandler<Window> => {
            const wadListController = captureCursor(-1, ev => {
                if (ev.code === 'Enter' || ev.code === 'Return' || ev.code === 'Space') {
                    cursor.update(y => wrapAround(y, filteredWads.length));
                    rootNode.querySelectorAll<HTMLElement>('.dropdown ul label').item(cursor.val).click();
                    rootNode.querySelector<HTMLElement>('.dropdown input').focus();
                    ev.preventDefault();
                } else if (ev.code === 'Escape') {
                    rootNode.querySelector<HTMLElement>('.card-actions .btn').focus();
                    searchText = '';
                    msfx.swtchx();
                } else if (ev.code === 'ArrowDown') {
                    cursor.update(n => wrapAround(n + 1, filteredWads.length));
                } else if (ev.code === 'ArrowUp') {
                    cursor.update(n => wrapAround(n - 1, filteredWads.length));
                }
            })();
            const wadScreenController = captureCursor(0, ev => {
                if (ev.code === 'Enter' || ev.code === 'Return') {
                    rootNode.querySelector<HTMLElement>('.card-actions .btn').click();
                } else if (ev.code === 'Escape') {
                    rootNode.querySelector<HTMLElement>('.flex .btn').click();
                } else if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') {
                    msfx.swtchn();
                    cursor.set(0);
                    rootNode.querySelector<HTMLElement>('.dropdown .btn')?.focus();
                    rootNode.querySelector<HTMLElement>('.dropdown input')?.focus();
                }
            })();
            return ev => {
                // this is probably a little expensive but since the visibility can be cancelled by mixing mouse and
                // keyboard interaction, it's the only safe way I can think of doing this
                const dropdownELement = rootNode.querySelector<HTMLElement>('.dropdown .dropdown-content');
                const listVisible = dropdownELement && getComputedStyle(dropdownELement).visibility === 'visible';
                return (listVisible ? wadListController : wadScreenController)(ev);
            };
        };

        return { episode, skill, wads, root };
    })();
    const cursorSection = (section: string, num: number) => () => {
        $section = section;
        $cursor = num;
    };
    $: if ($cursor >= 0) msfx.pstop();
    $: keyController = rootNode && (
        screen === 'select-episode' ? keyboardControllers.episode() :
        screen === 'select-skill' ? keyboardControllers.skill() :
        screen === 'select-wads' ? keyboardControllers.wads() :
        screen === 'select-iwad' ? keyboardControllers.root() :
        null);

    let keyboardActive = false;
    const keydown: KeyboardEventHandler<Window> = ev => {
        keyboardActive = true;
        keyController?.(ev);
    }
</script>

<svelte:window
    on:popstate={() => parseUrlHash(window.location.hash, iWads)}
    on:keydown={keydown}
    on:pointermove={() => keyboardActive = false}
/>

<div bind:this={rootNode}
    class="launcher-screen px-4 py-2 pb-24 sm:px-8 mx-auto"
    class:keyboard-controls={keyboardActive}
>
    {#if recentlyUsed.items.length}
        <div class="divider">Recent Games</div>
        <div class="recent-grid
            grid grid-cols-2 gap-4 place-content-start
            md:grid-cols-3 lg:grid-cols-4 sm:gap-8"
        >
            {#each recentlyUsed.items as info, i (info.wad)}
                <a
                    class="btn h-auto no-animation p-0 overflow-hidden shadow-2xl relative"
                    href="#{info.wad}&skill={info.skill}&map={info.map}"
                    class:pulse-highlight={i === $cursor && 'recent' === $section}
                    class:btn-outline={i === $cursor && 'recent' === $section}
                    on:pointerenter={cursorSection('recent', i)}
                >
                    <img width="320" height="200" src={info.image} alt={info.wad} />
                    <div
                        class="absolute bottom-2 left-2 p-2 flex items-end text-secondary bg-black rounded-lg"
                        style:--tw-bg-opacity={.5}
                    >
                        <span>{info.map}:</span>
                        <span>{data.skills[info.skill - 1].alias}</span>
                    </div>
                </a>
            {/each}
        </div>
        <div class="divider">Games</div>
    {/if}
    <div class="game-grid
        grid grid-cols-2 gap-4 place-content-start
        md:grid-cols-3 lg:grid-cols-4 sm:gap-8"
    >
        {#each iWads as iwad, i (iwad.name)}
            {#if iwad !== selectedIWad}
            <a
                class="btn h-auto no-animation p-0 overflow-hidden shadow-2xl"
                href="#wad={iwad.name}"
                in:receive={{ key: iwad.name }}
                out:send={{ key: iwad.name }}
                class:pulse-highlight={i === $cursor && 'game' === $section}
                class:btn-outline={i === $cursor && 'game' === $section}
                on:pointerenter={cursorSection('game', i)}
            >
                <img width="320" height="200" src={iwad.image} alt={iwad.name} />
            </a>
            {/if}
        {/each}
        {#each preloadWads as wad, i (wad.link)}
            {@const index = i + iWads.length}
            <PreloadWad
                {wadStore} {wad}
                {...{
                    class: [
                        index === $cursor && 'game' === $section && 'pulse-highlight',
                        index === $cursor && 'game' === $section && 'btn-outline',
                    ],
                    onpointerenter: cursorSection('game', index),
                }}
            >
                <span class="download-required-annotation">Download</span>
            </PreloadWad>
        {/each}
    </div>

    {#if selectedIWad}
        {#if screen !== 'select-iwad'}
        <div out:fly={{ y: '-100%' }} in:fly={{ delay: 600, y: '-100%' }} class="flex gap-2 absolute sm:top-2 sm:left-2 z-30">
            <a class="btn btn-secondary w-48 shadow-xl" href={"#"}><Icon src={Home} theme='solid' size="16px"/> Home</a>
            <label class="swap btn btn-secondary join-item">
                <input type="checkbox" bind:checked={$muted} />
                <Icon class="swap-on fill-current" src={SpeakerXMark} theme='solid' size="16px"/>
                <Icon class="swap-off fill-current" src={SpeakerWave} theme='solid' size="16px"/>
            </label>
        </div>
        {/if}

    <div
        class="card image-full bg-base-200 shadow-xl absolute inset-0"
        class:show-background={!Boolean(wad && startPlaying)}
        in:receive={{ key: selectedWadName }}
        out:send={{ key: selectedWadName }}
    >
        {#key bgImage}
        <figure transition:fade>
            <img class="flex-grow"
                width="320" height="200"
                src={bgImage} alt={'TITLEPIC'} />
        </figure>
        {/key}

        {#if screen === 'select-wads'}
            <div class="card-body justify-end">
                <h2 class="card-title">
                    <span>{selectedIWad.name}</span>
                    {#if selectedPWads.length}
                    <div class="divider sm:divider-horizontal">+</div>
                    <div class="flex flex-wrap gap-2 p-4 bg-base-300 rounded-box place-items-center">
                        {#each selectedPWads as pwad}
                            <div class="badge badge-primary badge-lg">{pwad.name}</div>
                        {/each}
                    </div>
                    {/if}
                </h2>
                <div class="card-actions">
                    <div in:fly={{ delay: 200, y: '60%' }} class="flex flex-col sm:flex-row gap-2 w-full">
                        <a
                            class="btn btn-primary btn-lg flex-grow no-animation shadow-xl"
                            href="#{wad.name}&play"
                        >Play</a>
                        {#if pWads.length}
                        <div class="dropdown dropdown-top">
                            <div tabindex="0" role="button" class="btn btn-lg min-w-80 shadow-xl">
                                Mods (<a class="link link-primary" href="https://doomwiki.org/wiki/PWAD" target="_blank" rel="noreferrer" >PWADs</a>)
                            </div>
                            <div tabindex="-1"
                                class="
                                    dropdown-content h-96 overflow-scroll bg-base-300 shadow rounded-t-xl
                                    absolute left-0 w-full
                                    sm:w-screen sm:max-w-[150%] sm:-left-1/2
                                "
                                style:--wadlist-boxHeight=".5rem"
                            >
                                <div class="flex flex-wrap gap-1 items-center px-4 py-2 z-10 bg-base-100 sticky top-0 shadow-2xl">
                                    <button class="btn btn-sm" on:click={() => selectedPWads = []}>Clear selection</button>
                                    <label class="input input-bordered input-sm flex items-center gap-2 ms-auto">
                                        <input type="text" class="grow" placeholder="Search" bind:value={searchText} />
                                        <Icon src={MagnifyingGlass} theme='outline' size="8px" />
                                    </label>
                                </div>
                                <WadList wads={filteredWads} bind:selected={selectedPWads} highlightIndex={$cursor} />
                            </div>
                        </div>
                        {/if}
                    </div>
                </div>
            </div>
        {:else if screen === 'select-episode'}
            <div class="card-body justify-self-center pt-24">
                <div class="card-title h-40 grid justify-items-center items-center">
                    <a href="#{wad.name}" class="scale-[2]"><Picture {wad} name="M_DOOM" /></a>
                </div>
                <div class="card-actions bg-base-300 rounded-box shadow-xl p-4 flex flex-col gap-2 z-10" style:--tw-bg-opacity={.7}>
                    <span class="divider"><Picture {wad} name="M_EPISOD" /></span>
                    <div class="grid sm:grid-cols-2 gap-4 mx-auto">
                        {#each [1, 2, 3, 4, 5, 6, 7, 8, 9] as ep, i}
                            {#if mapNames.includes(`E${ep}M1`)}
                                <a class="btn no-animation h-full relative overflow-hidden" href="#{wad.name}&map=E{ep}M1"
                                    class:pulse-highlight={i === $cursor}
                                    class:btn-outline={i === $cursor}
                                    on:pointerenter={() => $cursor = i}
                                    on:click={msfx.pistol}
                                >
                                    <span class="scale-[1.1] hover:scale-[1.2] transition-transform">
                                        <Picture {wad} name={ep > 3 ? 'INTERPIC' : `WIMAP${ep - 1}`} />
                                    </span>
                                    <span class="absolute bottom-0"><Picture {wad} name="M_EPI{ep}" /></span>
                                </a>
                            {/if}
                        {/each}
                    </div>
                </div>
            </div>
        {:else if screen === 'select-skill'}
            <div class="card-body justify-self-center pt-24">
                <div
                    class="card-title h-40 grid justify-items-center items-center"
                    class:grid-cols-[1fr_auto_1fr]={mapName?.startsWith('E')}
                >
                    <a href="#{wad.name}" class="scale-[2]"><Picture {wad} name="M_DOOM" /></a>
                    {#if mapName?.startsWith('E')}
                        <div class="divider divider-horizontal"></div>
                        {@const ep = parseInt(mapName[1])}
                        <a class="btn h-full relative overflow-hidden" href="#{wad.name}&play"
                            on:pointerenter={msfx.stnmov}
                            on:click={msfx.swtchx}
                        >
                            <span class="scale-[1.2] hover:scale-[1.1] transition-transform">
                                <Picture {wad} name={ep === 4 ? 'INTERPIC' : `WIMAP${ep - 1}`} />
                            </span>
                            <span class="absolute bottom-0"><Picture {wad} name="M_EPI{ep}" /></span>
                        </a>
                    {/if}
                </div>

                <div class="card-actions bg-base-300 rounded-box shadow-xl p-4 flex flex-col gap-2 z-10" style:--tw-bg-opacity={.7}>
                    <span class="divider"><Picture {wad} name="M_SKILL" /></span>
                    {#each data.skills as skill, i}
                        <a class="btn w-full no-animation flex justify-start gap-4" in:fly={{ y: '-100%', delay: i * 50 }}
                            href="#{wad.name}&skill={i + 1}&map={mapName ?? 'MAP01'}"
                            class:bg-base-300={i === $cursor}
                            on:pointerenter={() => $cursor = i}
                            on:click={msfx.pistol}
                        >
                            <span class="scale-125 opacity-0 transition-opacity" class:opacity-100={i === $cursor}>
                                <Picture {wad} name={skullImages[skullImage]} />
                            </span>
                            <span class:pulse-saturation={i === $cursor}>
                                <Picture {wad} name={skill.pic} />
                            </span>
                        </a>
                    {/each}
                </div>
            </div>
        {/if}
    </div>
    {/if}
</div>

<style>
    :global(body):has(.launcher-screen.keyboard-controls) {
        cursor: none;
    }
    .keyboard-controls {
        pointer-events: none;
    }

    .btn-outline img {
        transform-origin: top center;
        transition: transform 0.2s;
    }
    .btn-outline img {
        transform: scale(1.05);
    }

    .download-required-annotation {
        position: absolute;
        top: 0;
        background: black;
        transition: transform .3s;
    }
    :global(.wad-install:hover .download-required-annotation) {
        transform: translate(0, -150%);
    }

    /* .card.image-full > figure img {
        object-fit: contain;
    } */
    .card.image-full:before {
        transition: opacity .3s;
    }
    .card.image-full.show-background:before {
        opacity: 0;
    }

    .pulse-saturation {
        animation: pulse-saturate .4s infinite alternate-reverse;
    }
    @keyframes pulse-saturate {
        0% { filter: saturate(1); }
        100% { filter: saturate(1.5); }
    }

    .pulse-highlight {
        animation: pulse-brightness .4s infinite alternate-reverse;
    }
    @keyframes pulse-brightness {
        0% { filter: brightness(1); }
        100% { filter: brightness(1.1); }
    }
</style>