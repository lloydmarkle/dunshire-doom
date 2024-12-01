<script lang="ts">
    import type { ExtraFlat, RenderSector } from "../RenderData";
    import Flat from "./Flat.svelte";

    export let renderSector: RenderSector;
    export let flat: ExtraFlat;

    const zOffset = flat.ceil ? -0.001 : 0.001;
    const light = flat.lightSector.renderData['light'];
    const texture = flat.flatSector.renderData[flat.ceil ? 'ceilFlat' : 'floorFlat'];
    const z = flat.zSector.renderData[flat.ceil ? 'zCeil' : 'zFloor'];
</script>

<Flat
    ceiling={flat.ceil}
    {renderSector}
    light={$light}
    vertical={$z + zOffset}
    textureName={$texture}
/>