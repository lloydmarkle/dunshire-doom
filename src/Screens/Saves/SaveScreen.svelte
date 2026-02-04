<script lang="ts">
    import { fade, fly } from "svelte/transition";
    import { data } from "../../doom";
    import { useAppContext } from "../../render/DoomContext";
    import { SaveGameStore, type SaveGame } from "../../SaveGameStore";
    import { Icon } from "@steeze-ui/svelte-icon";
    import { ArrowDownTray, ExclamationTriangle, Funnel, MagnifyingGlass, Trash } from "@steeze-ui/heroicons";
    import type { ChangeEventHandler } from "svelte/elements";
    import { Unzip, UnzipInflate, Zip, ZipDeflate } from "fflate";
    import { toTrianglesDrawMode } from "three/examples/jsm/utils/BufferGeometryUtils";

    const { restoreGame } = useAppContext();

    let deleteMode = $state(false);
    let selected = $state<{ [key: number]: SaveGame }>({});
    let selectedCount = $derived(Object.keys(selected).length);

    const sgs = new SaveGameStore();
    const fetchSaves = () => sgs.loadGames([loadGameSearchText.toUpperCase(), ...selectedFilters].join(' '));
    const skipFilters = [/^MAP$/, /^\d\d$/, /^MAP\d\d$/, /^E\dM\d$/, /^E\d$/, /^M\d$/];
    let saveFilters = $derived(sgs.filters.then(f => f.filter(e => !skipFilters.some(re => re.test(e[0])) && e[0].length > 1).map(e => e[0])));

    let loadGameSearchText = $state('');
    let selectedFilters = $state([]);
    let storedSaveGames = $derived.by(fetchSaves);
    let saveGames = $derived(storedSaveGames.then(games => [
            ...games,
            ...Object.values(selected),
        ].filter((e, i, arr) => arr.findIndex(g => g.id === e.id) === i)));
    let selectAll = $derived(selectedCount && saveGames.then(sg => sg.every(save => selected[save.id])));

    const loadGame = (save: SaveGame) => async () => {
        const mapExport = await save.mapExport();
        // loading a game may need to recreate the game instance (if skill level or wads change) but even if it doesn't,
        // we need to load the game state so set a flag here to be loaded in the main doom component.
        window.location.hash = `#${save.wads.map(e => 'wad=' + e).join('&')}&skill=${save.skill}&map=${save.mapInfo.name}`;
        restoreGame.set(mapExport);
    }

    const toggleGameFilter = (name: string) => () => {
        if (selectedFilters.includes(name)) {
            selectedFilters = selectedFilters.filter(e => e !== name);
        } else {
            selectedFilters = [...selectedFilters, name];
        }
    }

    const changeSelectionBox: ChangeEventHandler<HTMLInputElement> = ev => {
        if (ev.currentTarget.checked) {
            saveGames.then(sg => sg.forEach(s => selected[s.id] = s));
        } else {
            selected = {};
        }
    }

    const selectSave = (save: SaveGame) => {
        if (save.id in selected) {
            delete selected[save.id];
        } else {
            selected[save.id] = save;
        }
    }

    const deleteGames = async () => {
        await Promise.all(Object.keys(selected).map(id => sgs.deleteGame(parseInt(id))));
        storedSaveGames = fetchSaves();
        selected = {};
        deleteMode = false;
    }

    let importSaveFiles = $state<FileList>();
    $effect(() => {
        if (importSaveFiles) {
            importGames(importSaveFiles);
        }
    });
    const importGames = async (files: FileList) => {
        const unzip = new Unzip();
        unzip.register(UnzipInflate);
        unzip.onfile = file => {
            file.ondata = async (err, data) => {
                if (err) {
                    console.warn('save-import failed', err);
                    return;
                }

                const saveState = JSON.parse(new TextDecoder().decode(data));
                const mapExport = saveState.mapExport;
                delete saveState.mapExport;
                // avoid save injection where a malicious save could overwrite an existing save
                delete saveState.id;
                await sgs.storeGameRecord(mapExport, saveState);
                storedSaveGames = fetchSaves();
            };
            file.start();
        };

        for (const file of files) {
            const buff = await file.arrayBuffer();
            unzip.push(new Uint8Array(buff));
        }
    }

    const exportGames = async () => {
        const zippedChunks: Uint8Array[] = [];
        const zip = new Zip((err, dat, final) => {
            if (err) {
                // TODO: where do we report this error? In fact, where do we report and SaveGameStore errors?
                console.error('fail', err);
                return;
            }
            zippedChunks.push(dat);

            if (final) {
                const parts = zippedChunks.map(e => e.buffer) as BlobPart[];
                const blob = new Blob(parts, { type: 'application/zip' });

                // download file
                const a = document.createElement('a');
                a.href = URL.createObjectURL(blob);
                a.download = 'doom-saves.zip';
                document.body.appendChild(a);
                a.click();
                // ... and cleanup
                URL.revokeObjectURL(a.href);
                document.body.removeChild(a);
            }
        });

        // to be a little more memory efficient, only deal with one save game at a time
        const saves = Object.values(selected);
        for (let i = 0; i < saves.length; i++) {
            const mapExport = await saves[i].mapExport();
            const copy = { ...saves[i], mapExport };
            delete copy.searchText;
            delete copy.saveData;
            delete copy.id;

            // TODO: do we get a smaller file size if we store the image separately? (as binary). We could also store
            // gamedata that way but I like it being human readable.
            const filename = `save-${i.toString().padStart(3, '0')}.json`;
            const file = new ZipDeflate(filename);
            zip.add(file);
            file.push(new TextEncoder().encode(JSON.stringify(copy)), true);
        }
        zip.end();
    }

    // a second copy of this function. Hmmm...
    function formatTime(dt: number) {
        dt = Math.max(0, dt);
        let hours = String(Math.floor(dt / 3600) % 24).padStart(2, '0');
        let minutes = String(Math.floor(dt / 60) % 60).padStart(2, '0');
        let seconds = String(Math.floor(dt % 60)).padStart(2, '0');
        return hours + ':' + minutes + ':' + seconds;
    }
</script>

<div class="max-w-sm sm:max-w-xl mx-auto bg-base-100 overflow-y-scroll relative">
    <div class="flex flex-col px-4 justify-start sticky top-0 z-20 shadow-2xl bg-inherit">
        <h2>Manage Save Games</h2>

        <div class="flex flex-wrap gap-2 items-center">
            <div class="text-sm grow">
                {#await saveGames then games}{games.length}{/await} games displayed
            </div>
            <label class="label cursor-pointer gap-2">
                {#await selectAll then hasAll}
                <span class="text-sm grow">{selectedCount} selected</span>
                <input type="checkbox" class="checkbox"
                    checked={hasAll}
                    indeterminate={selectedCount && !hasAll}
                    onchange={changeSelectionBox}
                />
                {/await}
            </label>
            <button class="btn" onclick={exportGames} disabled={!selectedCount}>
                <Icon src={ArrowDownTray} theme='outline' size="18px" />
            </button>
            <button class="btn" onclick={() => deleteMode = true} disabled={!selectedCount}>
                <Icon src={Trash} theme='outline' size="18px" />
            </button>
            <label class="label md:text-lg" for="import-saves">
                <span class="btn">Import</span>
                <input class="file-input hidden" type="file" id="import-saves" name="import-saves"
                    accept="application/zip, application/json" multiple
                    bind:files={importSaveFiles} />
            </label>
            <label class="input input-bordered flex items-center gap-2 text-sm grow">
                <Icon src={MagnifyingGlass} theme='outline' size="16px" />
                <input type="text" placeholder="Search" bind:value={loadGameSearchText} />
            </label>
        </div>

        <div class="flex gap-2 items-center justify-start py-2 px-4">
            <span><Icon src={Funnel} theme='outline' size="16px" /></span>
            <ul class="save-filters menu menu-horizontal flex-nowrap overflow-x-scroll">
                {#await saveFilters then filters}
                {#each filters as filter, i}
                    {@const checked = selectedFilters.includes(filter)}
                    <li>
                        <label class="label cursor-pointer gap-1">
                            <input type="checkbox" class="checkbox checkbox-xs no-animation" {checked}
                                onchange={toggleGameFilter(filter)} />
                            <span class="label-text text-sm lowercase">{filter}</span>
                        </label>
                    </li>
                {/each}
                {/await}
            </ul>
        </div>
    </div>

    {#if deleteMode}
    <div
        transition:fly={{ y:'-4rem' }}
        class="alert alert-warning flex absolute top-8 z-30"
    >
        <span><Icon src={ExclamationTriangle} theme='outline' size="24px" /></span>
        <span>Remove {selectedCount} save game{selectedCount === 1 ? '' : 's'}?</span>
        <div class="flex gap-2 ms-auto">
            <button class="btn" onclick={deleteGames}>Yes</button>
            <button class="btn" onclick={() => deleteMode = false}>No</button>
        </div>
    </div>
    {/if}

    {#await saveGames}
        <div class="absolute inset-0 flex justify-center items-center z-20" out:fade={{ duration: 400 }}>
            <span class="loading loading-spinner loading-lg"></span>
        </div>
    {:then saves}
        <ul class="menu pb-24 gap-1">
        {#each saves as save}
            <li class="relative rounded-lg overflow-hidden z-10" style:--bg-image="url({save.image})">
                <label class="label cursor-pointer justify-start gap-4">
                    <input type="checkbox" class="checkbox"
                        checked={save.id in selected} onchange={() => selectSave(save)} />

                    <div class="h-32 flex items-center text-xl text-primary max-w-96 overflow-hidden text-ellipsis">{save.name}</div>

                    <div class="absolute bottom-2 right-2 p-2 items-end flex flex-col gap-1 rounded-lg text-secondary"
                        style:--tw-bg-opacity={.5}
                    >
                        <div class="flex items-end">
                            <span>{save.mapInfo.name}:</span>
                            <span>{data.skills[save.skill - 1].alias}</span>
                        </div>
                        <div class="flex flex-col items-end text-xs">
                            <span>{formatTime(save.mapInfo.time)}</span>
                            {@render mapStat('K', save.mapInfo.kills, save.mapInfo.totalKills)}
                            {@render mapStat('I', save.mapInfo.items, save.mapInfo.totalItems)}
                            {@render mapStat('S', save.mapInfo.secrets, save.mapInfo.totalSecrets)}
                        </div>
                        <div>
                        {#each save.wads as name}
                            <div class="badge badge-secondary badge-xs">{name}</div>
                        {/each}
                        </div>
                    </div>
                </label>
            </li>
        {/each}
        </ul>
    {/await}
</div>

{#snippet mapStat(label: 'K' | 'I' | 'S', progress: number, total: number)}
    <span>
        {label} {total === 0 ? '100' : Math.floor(progress * 100 / total)}% ({progress} / {total})
    </span>
{/snippet}

<style>
    .menu li:after {
        transition: transform .2s;
        content: '';
        position: absolute;
        inset: 0;
        background:
            linear-gradient(.4turn, var(--fallback-sc,oklch(var(--sc)/1)), var(--fallback-sc,oklch(var(--sc)/.3))),
            var(--bg-image);
        background-position: 0% 50%;
        background-size: cover;
        z-index: -1;
    }
    @media (prefers-reduced-motion: no-preference) {
        .menu li:hover:after {
            transform: scale(1.02);
        }
    }
</style>