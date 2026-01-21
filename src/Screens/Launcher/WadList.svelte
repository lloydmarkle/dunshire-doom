<script lang="ts">
    import { type Snippet } from "svelte";
    import { type WADInfo } from "../../WadStore";
    import { fly } from "svelte/transition";
    import { flip } from "svelte/animate";

    interface Props {
        wads: WADInfo[];
        item: Snippet<[WADInfo, number]>;
    }
    let { wads, item }: Props = $props();
</script>

<ul class="flex flex-col gap-1 menu">
    {#each wads as wad, i (wad.name)}
        <li
            transition:fly={{ y:'-4rem' }}
            animate:flip={{ duration: 200 }}
            class="relative rounded-lg overflow-hidden wad-box"
            style:--tw-bg-opacity={.4}
            style:--wad-bg="url({wad.image})"
        >
            {@render item(wad, i)}
        </li>
    {/each}
</ul>

<style>
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