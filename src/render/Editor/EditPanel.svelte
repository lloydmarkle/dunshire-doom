<script lang="ts">
    import { fly } from "svelte/transition";
    import type { MapRuntime } from "../../doom";
    import { useAppContext } from "../DoomContext";
    import LinedefEditor from "./LinedefEditor.svelte";
    import SectorEditor from "./SectorEditor.svelte";
    import ThingEditor from "./ThingEditor.svelte";

    export let map: MapRuntime;

    const { editor } = useAppContext();

    function close() {
        $editor.selected = null;
    }
</script>

{#if $editor.selected}
    <div class="bg-honeycomb" transition:fly|global={{ x: `100%` }}>
        <button class="btn btn-accent btn-sm rounded-full w-20 block self-start" on:click={close}>X</button>
        {#key $editor.selected}
            {#if 'special' in $editor.selected}
                <LinedefEditor {map} linedef={$editor.selected} />
            {:else if 'info' in $editor.selected}
                <ThingEditor {map} thing={$editor.selected} />
            {:else if 'zFloor' in $editor.selected}
                <SectorEditor {map} sector={$editor.selected} />
            {/if}
        {/key}
    </div>
{/if}

<style>
    div {
        position: absolute;
        right: 0;
        top: 0;
        padding-inline-start: 1em;
        padding-inline-end: 1em;
        user-select: text;

        height: 100vh;
        overflow-y: scroll;
        width: 25em;
        padding: 1em .5em;
        border-top-right-radius: .5em;
        border-bottom-right-radius: .5em;
        display: flex;
        gap: 1em;
        flex-direction: column;
        justify-content: baseline;
        text-align: start;
    }
</style>