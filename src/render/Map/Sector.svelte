<script lang="ts">
    import Flat from "./Flat.svelte";
    import type { RenderSector } from "../RenderData";
    import WallHackTransparentDoor from "./WallHackTransparentDoor.svelte";
    import Thing from "./Thing.svelte";
    import { MapObjectIndex } from "../../doom";
    import Wall from "./Wall.svelte";
    import ExtraFlat from "./ExtraFlat.svelte";

    export let renderSector: RenderSector;
    const { zFloor, zCeil, floorFlat, ceilFlat, light } = renderSector.sector.renderData;
    const { geometry, mobjs, extraFlats } = renderSector;
    $: mo = [...$mobjs].sort((a, b) => a.id - b.id);

    // Why wrap this in a div? It reduces the cost of reflow from adding/removing DOM nodes.
    // From profiling data, we reduce reflow from 20% of the overall time to 1%. Also mark the div
    // as position:absolute to hopefully help(?)
</script>

<div class="absolute">
    {#if geometry}
        <Flat
            {renderSector}
            light={$light}
            vertical={$zFloor}
            textureName={$floorFlat}
        />

        <Flat
            ceiling
            {renderSector}
            light={$light}
            vertical={renderSector.sector.skyHeight ?? $zCeil}
            textureName={$ceilFlat}
        />

        {#each extraFlats as flat}
            <ExtraFlat {renderSector} {flat} />
        {/each}
    {/if}

    {#each renderSector.linedefs as linedef}
        {#if linedef.transparentDoorHack}
            <WallHackTransparentDoor {linedef} />
        {:else}
            <Wall {renderSector} {linedef} />
        {/if}
    {/each}
    {#each mo as thing (thing.id)}
        {#if thing.type !== MapObjectIndex.MT_PLAYER}
            <Thing {renderSector} {thing} />
        {/if}
    {/each}
</div>
