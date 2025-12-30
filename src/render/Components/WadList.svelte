<script lang="ts">
    import { fly } from "svelte/transition";
    import type { WADInfo } from "../../WadStore";
    import { flip } from 'svelte/animate';

    export let wads: WADInfo[];
    export let selected: WADInfo[] = [];
    export let multiSelect = true;
    export let highlightIndex = -1;

    $: if (highlightIndex > -1) {
        const element = document.querySelectorAll('.wad-box').item(highlightIndex);
        element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    $: activeOpacity = multiSelect ? .3 : .7;
    // for non-small lists (50 items), this can be slow
    function toggleSelected(pwad: WADInfo) {
        if (!multiSelect) {
            selected = selected.includes(pwad) ? [] : [pwad];
            return;
        }

        if (selected.includes(pwad)) {
            selected = selected.filter(pw => pw !== pwad);
        } else {
            selected = [...selected, pwad];
        }
    }
</script>

<ul class="flex flex-col gap-1 menu">
    {#each wads as wad, i (wad.name)}
        {@const checked = selected.includes(wad)}
        <li
            transition:fly={{ y:'-4rem' }}
            animate:flip={{ duration: 300 }}
            class="relative rounded-lg overflow-hidden"
        >
            <label
                class="wad-box px-6 label cursor-pointer"
                class:active={checked}
                class:pulse-highlight={i === highlightIndex}
                style:--tw-bg-opacity={activeOpacity}
                style:--wad-bg="url({wad.image})"
            >
                <span class="label-text">
                    {wad.name}
                    <span class="text-xs">[{wad.mapCount} map{wad.mapCount === 1 ? '' : 's'}{(wad.episodicMaps ? ' (episodic)' : '')}]</span>
                </span>
                <input type="checkbox" class="checkbox"
                    class:hidden={!multiSelect}
                    {checked} on:change={() => toggleSelected(wad)} />
            </label>
        </li>
    {/each}
</ul>

<style>
    .wad-box {
        padding-block: var(--wadlist-boxHeight, 1.5rem);
    }

    .pulse-highlight {
        animation: pulse-brightness .4s infinite alternate-reverse;
    }
    @keyframes pulse-brightness {
        0% { filter: brightness(1.6); }
        100% { filter: brightness(2); }
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