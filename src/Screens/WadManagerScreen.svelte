<script lang="ts">
    import { fly } from "svelte/transition";
    import type { WADInfo, WadStore } from "../WadStore";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { ExclamationTriangle, MagnifyingGlass, Trash } from '@steeze-ui/heroicons'
    import WadDropbox from "../render/Components/WadDropbox.svelte";
    import WadInfoScreen from "./WadInfoScreen.svelte";
    import { WadFile } from "../doom";
    import { flip } from "svelte/animate";

    let { wadStore }: { wadStore: WadStore } = $props();
    const wads = $derived(wadStore.wads);

    let searchText = $state('');
    let wadTextFilter = $derived(searchText.toLowerCase());
    let visibleWads = $derived($wads.filter(e => e.name.includes(wadTextFilter)));

    let selectedPWadIndex = $state(-1);
    let selectedPWad = $derived($wads[selectedPWadIndex]);
    let selectAll = $state(false);
    const changeSelectionBox = () => selectedPWadIndex = -1;

    let confirmDelete = $state(false);
    function removeSelectedPWads() {
        if (selectAll) {
            visibleWads.forEach(wad => wadStore.removeWad(wad.name));
        } else {
            wadStore.removeWad(selectedPWad.name);
        }
        confirmDelete = false;
    }

    const loadWadFile = (wadInfo: WADInfo) =>
        wadStore.fetchWad(wadInfo.name).then(buff => new WadFile(wadInfo.name, buff));
    let selectedWadFile = $derived(selectedPWad ? loadWadFile(selectedPWad) : Promise.resolve<WadFile>(null));

    $effect(() => {
        const params = new URLSearchParams(window.location.hash.substring(1));
        if (selectedPWad) {
            params.set('inspect', selectedPWad.name);
        } else {
            params.delete('inspect');
        }
        window.location.hash = params.toString();
    });
    function parseUrlHash(hash: string) {
        const params = new URLSearchParams(hash.substring(1));
        const pwadName = params.get('inspect');
        if (pwadName && pwadName !== selectedPWad?.name) {
            selectedPWadIndex = $wads.findIndex(e => e.name === pwadName);
            const element = document.querySelectorAll('.wad-list .wad-box').item(selectedPWadIndex);
            element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }
    $effect.pre(() => parseUrlHash(window.location.hash));
</script>

<svelte:window on:popstate={() => parseUrlHash(window.location.hash)} />

<div class="grid grid-cols-[max-content_1fr] grid-rows-1 max-h-full overflow-y-scroll">
    <div class="flex flex-col relative max-w-sm">
        <div class="flex flex-wrap gap-4 p-2 items-center justify-start bg-base-300">
            <!-- <span class="text-xs">{selectedPWads.length} of {$wads.length} selected</span> -->
            <input type="checkbox" class="checkbox"
                bind:checked={selectAll}
                indeterminate={selectedPWadIndex > -1 && !selectAll}
                onchange={changeSelectionBox}
            />

            <button class="btn" class:btn-disabled={!selectAll && selectedPWadIndex === -1} onclick={() => confirmDelete = true}>
                <Icon src={Trash} theme='outline' size="12px" />
            </button>

            <label class="input input-bordered input-sm flex items-center gap-2 ms-auto">
                <input type="text" class="grow" placeholder="Search" bind:value={searchText} />
                <Icon src={MagnifyingGlass} theme='outline' size="8px" />
            </label>
        </div>

        {#if confirmDelete}
        <div
            transition:fly={{ y:'-4rem' }}
            class="alert alert-warning flex absolute top-16"
        >
            <span><Icon src={ExclamationTriangle} theme='outline' size="24px" /></span>
            <span>Remove {selectAll ? visibleWads.length : 1} WAD{selectAll && visibleWads.length > 1 ? 's' : ''}?</span>
            <div class="flex gap-2 ms-auto">
                <button class="btn" onclick={removeSelectedPWads}>Yes</button>
                <button class="btn" onclick={() => confirmDelete = false}>No</button>
            </div>
        </div>
        {/if}

        <div
            class={["wad-list overflow-scroll", confirmDelete && 'shift-down']}
            style:--tr-shift-down="6rem"
        >
            <ul class="flex flex-col gap-1 menu">
                {#each visibleWads as wad, i (wad.name)}
                    <li
                        transition:fly={{ y:'-4rem' }}
                        animate:flip={{ duration: 200 }}
                        class="relative rounded-lg overflow-hidden z-10"
                    >
                        <a
                            href="#tab=wads&inspect={wad.name}"
                            onclick={() => selectedPWadIndex = i}
                            class={[
                                "wad-box px-6",
                                (selectAll || i === selectedPWadIndex) && 'active border',
                            ]}
                            style:--tw-bg-opacity={.4}
                            style:--wad-bg="url({wad.image})"
                        >
                            {wad.name}
                            <span class="text-xs">[{wad.mapCount} map{wad.mapCount === 1 ? '' : 's'}{(wad.episodicMaps ? ' (episodic)' : '')}]</span>
                        </a>
                    </li>
                {/each}
            </ul>
        </div>

        {#if selectedPWad}
        <div in:fly={{ y: '100%' }} class="h-48 mt-auto">
            <WadDropbox {wadStore} />
        </div>
        {/if}
    </div>

    <div class="max-h-full overflow-scroll bg-base-100 px-4 relative">
        {#if selectAll}
            <div class="flex flex-col items-center justify-center gap-4 h-full">
                {visibleWads.length} WAD{visibleWads.length > 1 ? 's' : ''} selected.
            </div>
        {:else if !selectedPWad}
            <WadDropbox {wadStore}>
                <span>Inspect a WAD by selecting it.</span>
                <div class="divider">OR</div>
            </WadDropbox>
        {:else}
            {#await selectedWadFile}
                <div class="flex justify-center pt-24">
                    <span class="loading loading-spinner loading-md"></span>
                </div>
            {:then wadFile}
                <WadInfoScreen {wadFile} wadInfo={selectedPWad} />
            {/await}
        {/if}
    </div>
</div>

<style>
    .wad-list {
        transform: none;
        transition: transform 300ms cubic-bezier(0.215, 0.610, 0.355, 1.000);
    }
    .shift-down {
        transform: translate(0, var(--tr-shift-down));
    }

    .wad-box {
        padding-block: var(--wadlist-boxHeight, 1.5rem);
    }

    .wad-box:after {
        content:'';
        position: absolute;
        inset: 0;
        background:
            linear-gradient(.4turn, var(--fallback-sc,oklch(var(--sc)/1)), var(--fallback-sc,oklch(var(--sc)/.5))),
            var(--wad-bg);
        background-position: 0% 30%;
        background-size: cover;
        z-index: -1;
    }
</style>