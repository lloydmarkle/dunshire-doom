<script lang="ts">
    import { crossfade, fade, fly } from "svelte/transition";
    import { data, store, tickTime, type DoomWad } from "../doom";
    import type { WADInfo } from "../WadStore";
    import Picture from "../render/Components/Picture.svelte";
    import { Home, MagnifyingGlass } from "@steeze-ui/heroicons";
    import { Icon } from "@steeze-ui/svelte-icon";
    import WadList from "../render/Components/WadList.svelte";
    import { useAppContext } from "../render/DoomContext";
    import { createSoundBufferCache } from "../render/SoundPlayer.svelte";
    import { onMount, tick } from "svelte";
    import { menuSoundPlayer } from "../render/Menu/Menu.svelte";
    import type { KeyboardEventHandler } from "svelte/elements";

    export let wads: WADInfo[];
    export let wad: DoomWad = null;
    $: iWads = wads.filter(wad => wad.iwad);
    $: pWads = wads.filter(wad => !wad.iwad);

    const { audio, soundGain, settings, musicTrack } = useAppContext();
    const { maxSoundChannels } = settings;
    $: menuSounds = menuSoundPlayer(audio, soundGain, wad ? createSoundBufferCache(audio, wad) : null);
    $: msfx = menuSounds.sfx;
    $: menuSounds.channelGain = (1 / 20 * Math.sqrt(Math.log($maxSoundChannels)));

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
        selectedIWad && wad && startPlaying && mapNames.includes('E1M1') && !mapName ? 'select-episode' :
        selectedIWad && wad && startPlaying ? 'select-skill' :
        selectedIWad && wad ? 'select-wads' :
        'select-iwad';

    // the keyboard controls became almost an exercise in code golf so I'm not sure how readable they are...
    let rootNode: HTMLDivElement;
    const [cursor, keyboardController] = (() => {
        const gridInfo = { rows: 0, cols: 0, cells: 0, buttons: null };
        const measureGrid = (selector: string) => {
            const obs = new ResizeObserver(() => {
                const grid = rootNode?.querySelector(selector);
                if (grid) {
                    gridInfo.cells = grid.childElementCount;
                    gridInfo.buttons = grid.querySelectorAll('.btn');
                    // Based on https://stackoverflow.com/questions/49506393
                    const style = getComputedStyle(grid);
                    gridInfo.rows = style.gridTemplateRows.split(' ').length;
                    gridInfo.cols = style.gridTemplateColumns.split(' ').length;
                }
            });
            if (rootNode) {
                obs.observe(rootNode);
            }
            return () => obs.disconnect();
        };
        const gridMove = (ev: KeyboardEvent) => {
            const min = Math.floor(cursor.val / gridInfo.cols) * gridInfo.cols;
            const max = Math.min(gridInfo.cells, min + gridInfo.cols);
            if (ev.code === 'ArrowUp') {
                cursor.update(n => wrapAround(n - gridInfo.cols, gridInfo.cells));
            } else if (ev.code === 'ArrowDown') {
                cursor.update(n => wrapAround(n + gridInfo.cols, gridInfo.cells));
            } else if (ev.code === 'ArrowLeft') {
                cursor.update(n => wrapAround(n - 1, max, min));
            } else if (ev.code === 'ArrowRight') {
                cursor.update(n => wrapAround(n + 1, max, min));
            } else if (ev.code === 'Enter' || ev.code === 'Return') {
                gridInfo.buttons.item(cursor.val).click();
                ev.preventDefault();
            }
        };

        let cursor = store(0);
        let resetCursor = () => {};
        let resetState: any = () => {};
        const captureCursor = (n: number, fn: KeyboardEventHandler<Window>, init = resetState) => {
            resetState();
            let localCursor = n;
            return () => {
                tick().then(() => resetState = init() ?? resetState);
                resetCursor();
                cursor.set(localCursor);
                resetCursor = cursor.subscribe(n => localCursor = n);
                return fn;
            }
        };
        const wrapAround = (n: number, max: number, min = 0) => n > max - 1 ? min : n < min ? max - 1 : n;

        const episode = captureCursor(0, ev => {
            gridMove(ev);
            if (ev.code === 'Escape') {
                rootNode.querySelector<HTMLElement>('.card-title a').click();
            }
        }, () => measureGrid('.card-actions .grid'));

        const root = captureCursor(0, gridMove, () => measureGrid('.grid'));

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
                    rootNode.querySelector<HTMLElement>('.dropdown .btn').focus();
                    rootNode.querySelector<HTMLElement>('.dropdown input').focus();
                }
            })();
            return ev => {
                // this is probably a little expensive but since the visibility can be cancelled by mixing mouse and
                // keyboard interaction, it's the only safe way I can think of doing this
                const listVisible = getComputedStyle(rootNode.querySelector<HTMLElement>('.dropdown .dropdown-content')).visibility === 'visible';
                return (listVisible ? wadListController : wadScreenController)(ev);
            }
        };

        return [cursor, { episode, skill, wads, root, }];
    })();
    $: if ($cursor >= 0) msfx.pstop();
    $: keyController = screen === 'select-episode' ? keyboardController.episode() :
        screen === 'select-skill' ? keyboardController.skill() :
        screen === 'select-wads' ? keyboardController.wads() :
        keyboardController.root();
</script>

<svelte:window
    on:popstate={() => parseUrlHash(window.location.hash, iWads)}
    on:keydown={keyController}
/>

<div class="px-4 py-2 sm:px-8 mx-auto" bind:this={rootNode}>
{#if screen === 'select-iwad'}
    <div class="
        grid grid-cols-2 gap-4 place-content-start
        md:grid-cols-3 lg:grid-cols-4 sm:gap-8"
    >
        {#each iWads as iwad, i (iwad.name)}
            <a
                class="btn h-auto no-animation p-0 overflow-hidden shadow-2xl"
                href="#wad={iwad.name}"
                class:pulse-highlight={i === $cursor}
                class:btn-outline={i === $cursor}
                on:pointerenter={() => $cursor = i}
                in:receive|global={{ key: iwad.name }}
                out:send|global={{ key: iwad.name }}
            >
                <img width="320" height="200" src={iwad.image} alt={iwad.name} />
            </a>
        {/each}
    </div>
{:else}
    <div out:fly={{ y: '-100%' }} in:fly={{ delay: 200, y: '-100%' }} class="flex gap-2 absolute sm:top-2 sm:left-2 z-30">
        <a class="btn btn-secondary w-48 shadow-xl" href={"#"}><Icon src={Home} theme='solid' size="16px"/> Home</a>
    </div>

    {@const selectedWadName = selectedIWad.name}
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
    /* .card.image-full > figure img {
        object-fit: contain;
    } */
    .card.image-full::before {
        transition: opacity .3s;
    }
    .show-background::before {
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