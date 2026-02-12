<script lang="ts">
    import { onDestroy, onMount, tick } from 'svelte';
    import { data, exportMap, MapRuntime } from '../../doom';
    import { SaveGameStore, type SaveGame } from '../../SaveGameStore.svelte';
    import { useAppContext, useDoom } from '../DoomContext';
    import { Icon } from '@steeze-ui/svelte-icon';
    import { ExclamationTriangle, Funnel, MagnifyingGlass, Trash } from '@steeze-ui/heroicons';
    import { fade, fly } from 'svelte/transition';
    import { menuSoundPlayer } from './Menu.svelte';

    interface Props {
        menuSounds: ReturnType<typeof menuSoundPlayer>;
        map: MapRuntime;
        deleteGameMode: boolean;
        editMode: boolean;
        mode: 'load' | 'save';
        keyboardActive: boolean;
    }
    let { menuSounds, map, deleteGameMode = $bindable(), mode, keyboardActive, editMode = $bindable() }: Props = $props();

    const { restoreGame, lastRenderScreenshot, pointerLock } = useAppContext();
    const { game } = useDoom();

    function resumeGame() {
        pointerLock.requestLock();
    }

    let saveSearch: HTMLInputElement;
    onMount(() => saveSearch.focus());
    onDestroy(() => deleteGameMode = false);

    let selectedSave = $state(-2);
    let saveGameName = $state('');
    let saveMenu = $derived(mode === 'save' && !deleteGameMode);

    let vcursor = $state(0);
    $effect(() => vcursor === undefined ? null : menuSounds.sfx.pstop());
    let hcursor = $state(0);
    $effect(() => hcursor === undefined ? null : menuSounds.sfx.pstop());

    const wrapAround = (n: number, max: number, min = 0) => n > max - 1 ? min : n < min ? max - 1 : n;
    const wrapAndScroll = (cursor: number, speed: number, selector: string) => {
        const items = document.querySelectorAll<HTMLElement>(selector);
        cursor = wrapAround(cursor + speed, items.length);
        items.item(cursor)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
        return cursor;
    }

    const sgs = new SaveGameStore(restoreGame);
    let lastWadName = game.wad.name.split('&').pop().split('=').pop().toUpperCase();
    let selectedFilters = $state([lastWadName]);
    let visibleGameFilters = $derived.by(async (): Promise<string[]> => [
            lastWadName,
            ...(await sgs.filters).filter(e => e[1] > 2 && e[0].length > 1 && !e[0].startsWith('M')).map(e => e[0]),
        ].filter((e, i, arr) => arr.indexOf(e) === i));

    let loadGameSearchText = $state('');
    let searchTerms = $derived([
        ...(loadGameSearchText.toUpperCase().match(/\w+|"[^"]+"/g) ?? []).map(s => s.replace(/^"|"$/g, '')),
        ...selectedFilters,
    ]);
    let filteredSaveGames = $derived(sgs.rev && sgs.loadGames(searchTerms));
    let placeholderGames = $derived(!saveMenu ? [] : [{
        id: -1,
        image: $lastRenderScreenshot ?? '',
        name: '',
        mapInfo: { name: map.name },
    } as SaveGame]);
    let allSaveGames = $derived.by(async () => [
        ...placeholderGames,
        ...(await filteredSaveGames),
    ].filter(e => e));

    function saveGame(name: string, id?: number) {
        const img = $lastRenderScreenshot ?? "";
        const save = exportMap(map);
        sgs.storeGame(name, img, map.game, save, id === -1 ? undefined : id);
        map.player.hudMessage.set('Game saved.');
        menuSounds.sfx.pistol();
        resumeGame();
    }

    async function loadGame(save: SaveGame) {
        if (!save) {
            return;
        }
        menuSounds.sfx.pistol();
        window.location.hash = save.launchUrl;
        save.restoreMap();
        resumeGame();
    }

    const deleteSave = async (id: number) => {
        await sgs.deleteGame(id);
        menuSounds.sfx.pistol();
        selectedSave = -2;
        tick().then(() => vcursor = wrapAndScroll(vcursor, 0, '.saves .btn'));
    };

    const selectSaveSlot = (name: string, id: number) => {
        editMode = true;
        selectedSave = id;
        saveGameName = name;
        menuSounds.sfx.pistol();
        tick().then(() => document.querySelector<HTMLElement>('.saves .btn-outline input')?.focus());
    }

    const activateSave = (save: SaveGame) => () =>
        deleteGameMode ? selectedSave = save.id :
        mode === 'save' ? selectSaveSlot(save.name, save.id) :
        loadGame(save);

    const toggleGameFilter = (name: string) => () => {
        if (selectedFilters.includes(name)) {
            selectedFilters = selectedFilters.filter(e => e !== name);
        } else {
            selectedFilters = [...selectedFilters, name];
        }
        menuSounds.sfx.pistol();
    }

    function keydown(ev: KeyboardEvent) {
        switch (ev.code) {
            case 'Enter':
            case 'Return':
                if (!deleteGameMode && mode === 'load') {
                    allSaveGames.then(sg => loadGame(sg[vcursor]));
                } else if (selectedSave === -2) {
                    allSaveGames.then(sg => selectSaveSlot(sg[vcursor].name, sg[vcursor].id));
                } else if (deleteGameMode) {
                    allSaveGames.then(sg => deleteSave(sg[vcursor].id));
                } else if (mode === 'save') {
                    saveGame(saveGameName, selectedSave);
                }
                break;
        }
        if (editMode) {
            return;
        }
        const speed = ev.shiftKey ? 3 : 1
        switch (ev.code) {
            case 'ArrowUp':
                vcursor = wrapAndScroll(vcursor, -speed, '.saves .btn');
                break;
            case 'ArrowDown':
                vcursor = wrapAndScroll(vcursor, speed, '.saves .btn');
                break;
            case 'Delete':
                if (mode === 'save') {
                    // offset cursor if we are in save mode because the placeholder will be hidden
                    const dir = deleteGameMode ? 1 : -1;
                    vcursor = Math.max(0, vcursor + dir);
                }
                deleteGameMode = !deleteGameMode;
                break;
            // TODO: left-right-space is awkward for toggling filters and also with search box highlighted. hmmm
            case 'ArrowLeft':
                hcursor = wrapAndScroll(hcursor, -speed, '.save-filters label');
                break;
            case 'ArrowRight':
                hcursor = wrapAndScroll(hcursor, speed, '.save-filters label');
                break;
            case 'Space':
                document.querySelectorAll<HTMLElement>('.save-filters label').item(hcursor)?.click();
                saveSearch?.focus();
                break;
        }
    }

    function keyup(ev: KeyboardEvent) {
        switch (ev.code) {
            case 'Backquote':
            case 'Escape':
                editMode = false;
                if (selectedSave !== -2) {
                    selectedSave = -2;
                    menuSounds.sfx.swtchx();
                    return;
                }
                if (deleteGameMode) {
                    deleteGameMode = false;
                    return;
                }
                ev.stopImmediatePropagation();
                break;
        }
    }
</script>

<svelte:window
    on:keyup={keyup}
    on:keydown={keydown}
/>

<h2 class="flex justify-center sticky top-12 bg-base-200 z-20 md:hidden">Load</h2>
<div class="flex flex-wrap gap-4 p-2 items-center justify-start sticky top-0 z-10 bg-inherit shadow-2xl">
    <button class="btn"
        class:btn-outline={deleteGameMode}
        onclick={() => deleteGameMode = !deleteGameMode}
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

{#await allSaveGames}
    <div class="absolute inset-0 flex justify-center items-center z-20" out:fade={{ duration: 400 }}>
        <span class="loading loading-spinner loading-lg"></span>
    </div>
{:then games}
    {@render quickFilters(games)}

    <div class={[
        "saves flex flex-col gap-2 px-8 py-2",
        mode === 'save' && deleteGameMode && 'pt-[7.7rem]',
        deleteGameMode && 'delete-mode'
    ]}>
    {#each games as save, i (save.id)}
        <div class="relative">
            <button
                class="btn w-full h-auto no-animation p-0 overflow-hidden shadow-2xl relative"
                onclick={activateSave(save)}
                class:btn-outline={i === vcursor}
                onpointerenter={() => vcursor = i}
            >
                <img width="320" height="100" src={save.image} alt={save.mapInfo.name} />

                {#if save.id !== -1}
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

                    {#if selectedSave !== save.id && save.name.length}
                    <div class="absolute left-2 p-2 bg-black rounded-lg text-start text-primary text-xl max-w-60 overflow-hidden text-ellipsis"
                        style:--tw-bg-opacity={.5}
                    >
                        {save.name}
                    </div>
                    {/if}
                {:else if selectedSave !== save.id}
                    <div class="absolute flex justify-center items-center text-xl text-secondary rounded-lg"
                        style:--tw-bg-opacity={.2}
                    >New Save Game</div>
                {/if}

                {#if saveMenu && selectedSave === save.id}
                <div class="savegame-text absolute left-2 p-2 bg-black rounded-lg text-start text-primary text-xl max-w-60 overflow-hidden text-ellipsis"
                    style:--tw-bg-opacity={.5}
                >
                    <input type="text" class="absolute opacity-0 h-0 w-0" bind:value={saveGameName} />
                    {saveGameName}
                </div>
                {/if}

                {#if vcursor === i}
                <div
                    class="absolute text-2xl text-secondary"
                    class:hidden={!deleteGameMode}
                ><Icon src={Trash} theme='outline' size="36px" /></div>
                {/if}
            </button>

            {#if deleteGameMode && selectedSave === save.id}
                <div
                    transition:fly={{ y:'-4rem', duration: 200 }}
                    class="alert alert-warning flex absolute top-4 z-20"
                >
                    <span><Icon src={ExclamationTriangle} theme='outline' size="24px" /></span>
                    <span>Delete save {save.name.length ? "{save.name}" : ''}?</span>
                    <div class="flex gap-2 ms-auto">
                        <button class="btn" onclick={() => deleteSave(save.id)}>Yes</button>
                        <button class="btn" onclick={() => selectedSave = -2}>No</button>
                    </div>
                </div>
            {/if}
        </div>
    {/each}
    </div>
{/await}

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
                    class:active={i === hcursor}
                    onpointerenter={() => hcursor = i}
                >
                    <input type="checkbox" class="checkbox checkbox-xs no-animation" {checked}
                        onchange={toggleGameFilter(filter)} />
                    <span class="label-text text-sm lowercase">{filter}</span>
                </label>
            </li>
        {/each}
        </ul>
    </div>
    {/await}
{/snippet}

<style>
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

    .delete-mode .btn {
        filter: grayscale(100%);
    }

    .savegame-text::after {
        content: '_';
        animation: cursor-pulse .2s cubic-bezier(0.4, 0, 0.6, 1) infinite alternate-reverse;
    }
    @keyframes cursor-pulse {
        to { opacity: 0.3; }
    }
</style>