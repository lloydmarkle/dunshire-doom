<script lang="ts">
    import { fly } from "svelte/transition";
    import type { WADInfo, WadStore } from "../WadStore";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { ExclamationTriangle, MagnifyingGlass, Trash } from '@steeze-ui/heroicons'
    import WadDropbox from "../render/Components/WadDropbox.svelte";
    import WadList from "../render/Components/WadList.svelte";
    import WadInfoScreen from "./WadInfoScreen.svelte";
    import { WadFile } from "../doom";

    export let wadStore: WadStore;
    const wads = wadStore.wads;

    let confirmDelete = false;
    let selectedPWads: WADInfo[] = [];
    let searchText = '';
    $: wadTextFilter = searchText.toLowerCase();
    $: visibleWads = $wads.filter(e => e.name.includes(wadTextFilter));
    $: confirmDelete = confirmDelete && selectedPWads.length > 0;

    function removeSelectedPWads() {
        selectedPWads.forEach(wad => wadStore.removeWad(wad.name));
        selectedPWads = [];
        confirmDelete = false;
    }

    let wadSelectCheckbox: HTMLInputElement;
    function changeSelectionBox() {
        confirmDelete = confirmDelete && wadSelectCheckbox.checked;
        selectedPWads = !wadSelectCheckbox.checked ? [] :
            [...visibleWads, ...selectedPWads].filter((e, i, arr) => arr.indexOf(e) === i);
    }

    const loadWadFile = (wadInfo: WADInfo) =>
        wadStore.fetchWad(wadInfo.name).then(buff => new WadFile(wadInfo.name, buff));
    $: selectedWadFile = selectedPWads.length ? loadWadFile(selectedPWads[0]) : Promise.resolve();
</script>

<!-- TODO: would grid be better than flex here? Probably... -->
<div class="flex max-h-[calc(100vh-4rem)] gap-2">
    <!-- <WadList {wadStore} /> -->

    <div class="flex flex-col relative max-w-sm">
        <div class="flex flex-wrap gap-4 p-2 items-center justify-start z-10 bg-base-300">
            <!-- <span class="text-xs">{selectedPWads.length} of {$wads.length} selected</span> -->
            <input type="checkbox" class="checkbox"
                bind:this={wadSelectCheckbox}
                checked={selectedPWads.length && visibleWads.every(wad => selectedPWads.includes(wad))}
                indeterminate={selectedPWads.length && visibleWads.some(wad => !selectedPWads.includes(wad))}
                on:change={changeSelectionBox}
            />

            <button class="btn" class:btn-disabled={!selectedPWads.length || confirmDelete} on:click={() => confirmDelete = true}>
                <Icon src={Trash} theme='outline' size=".8rem" />
            </button>

            <label class="input input-bordered input-sm flex items-center gap-2 ms-auto">
                <input type="text" class="grow" placeholder="Search" bind:value={searchText} />
                <Icon src={MagnifyingGlass} theme='outline' size=".5rem" />
            </label>
        </div>

        {#if confirmDelete}
        <div
            transition:fly={{ y:'-4rem' }}
            class="alert alert-warning flex absolute top-16"
        >
            <span><Icon src={ExclamationTriangle} theme='outline' size="1.5rem" /></span>
            <span>Remove {selectedPWads.length} wad{selectedPWads.length === 1 ? '' : 's'}?</span>
            <div class="flex gap-2 ms-auto">
                <button class="btn" on:click={removeSelectedPWads}>Yes</button>
                <button class="btn" on:click={() => confirmDelete = false}>No</button>
            </div>
        </div>
        {/if}

        <div
            class="wad-list overflow-scroll"
            class:shift-down={confirmDelete}
            style:--tr-shift-down="6rem"
        >
            <WadList wads={visibleWads} bind:selected={selectedPWads} multiSelect={false} />
        </div>

        <div class="h-48">
            <WadDropbox {wadStore} />
        </div>
    </div>

    <div class="flex-grow max-h-[calc(100vh-4rem)] overflow-scroll bg-base-100 px-4">
        {#await selectedWadFile}
            <div class="flex justify-center">
                <span class="loading loading-spinner loading-md"></span>
            </div>
        {:then wadFile}
            {#if wadFile}
                <WadInfoScreen {wadFile} wadInfo={selectedPWads[0]} />
            {/if}
        {/await}
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
</style>