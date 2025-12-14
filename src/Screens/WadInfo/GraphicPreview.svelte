<script lang="ts">
    import Picture from "../../render/Components/Picture.svelte";
    import type {  DoomWad, Lump } from "../../doom";

    let viewSize = { width: 1024, height: 600 };

    export let wad: DoomWad;
    export let lump: Lump;

    $: gfx = wad.graphic(lump.name);
    $: isFlat = lump.data.length === 4096;
    $: style = [
        `transform: scale(${Math.min(4, viewSize.width / (isFlat ? 64 : gfx.width), viewSize.height / (isFlat ? 64 : gfx.height))})`,
        `transform-origin: top`,
    ].join(';');
</script>

<div
    class="h-full w-full bg-black"
    bind:clientHeight={viewSize.height}
    bind:clientWidth={viewSize.width}
>
    <div class="flex justify-around h-full">
        <div style="{style}">
            <Picture {wad} name={lump.name} type={isFlat ? 'flat' : 'any'} />
        </div>
    </div>
</div>
