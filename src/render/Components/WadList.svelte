<script lang="ts">
    import { fly } from "svelte/transition";
    import type { WADInfo, WadStore } from "../../WadStore";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { ExclamationTriangle, MagnifyingGlass, Trash } from '@steeze-ui/heroicons'
    import { flip } from 'svelte/animate';

    export let wadStore: WadStore;
    const wads = wadStore.wads;

    let confirmDelete = false;
    let selectedPWads: WADInfo[] = [];
    let searchText = '';
    $: wadTextFilter = searchText.toLowerCase();
    $: visibleWads = $wads.filter(e => e.name.includes(wadTextFilter));
    function togglePWad(pwad: WADInfo) {
        if (selectedPWads.includes(pwad)) {
            selectedPWads = selectedPWads.filter(pw => pw !== pwad)
        } else {
            selectedPWads = [...selectedPWads, pwad]
        }
        confirmDelete = confirmDelete && selectedPWads.length > 0;
    }

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
</script>

<div class="relative min-w-fit">
    <div class="flex flex-wrap gap-4 p-2 items-center justify-start z-10 relative bg-base-300">
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
        class="alert alert-warning absolute flex"
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
        class="wad-list max-h-80 overflow-scroll"
        class:shift-down={confirmDelete}
        style:--tr-shift-down="6rem"
    >
        <ul class="flex flex-col gap-2 menu">
            {#each visibleWads as wad (wad.name)}
            {@const checked = selectedPWads.includes(wad)}
            <li
                transition:fly={{ y:'-4rem' }}
                animate:flip={{ duration: 300 }}
                class="relative rounded-lg overflow-hidden"
            >
                <label class="wad-box p-6 label cursor-pointer" style="--wad-bg:url({wad.image})">
                    <span class="label-text">
                        {wad.name}
                        <span class="text-xs">[{wad.mapCount} maps{(wad.episodicMaps ? ' (episodic)' : '')}]</span>
                    </span>
                    <!-- <button class="btn btn-ghost p-4 content-center"><Icon src={Trash} theme='outline' size="2rem" /></button> -->
                    <input type="checkbox" class="checkbox" {checked} on:change={() => togglePWad(wad)} />
                </label>
            </li>
            {/each}
        </ul>
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

    .wad-box:before {
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