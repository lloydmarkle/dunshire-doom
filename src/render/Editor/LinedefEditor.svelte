<script lang="ts">
    import { HALF_PI, type LineDef, type MapRuntime } from "../../doom";
    import { useAppContext, useDoomMap } from "../DoomContext";
    import FlagList from "./FlagList.svelte";
    import NumberChooser from "./NumberChooser.svelte";
    import SidedefEditor from "./SidedefEditor.svelte";

    export let map: MapRuntime;
    export let linedef: LineDef;

    const { editor } = useAppContext();
    const { renderSectors } = useDoomMap();
    // https://doomwiki.org/wiki/Linedef
    const flagInfo: [number, string][] = [
        [0x0001, 'blocks players and monsters'],
        [0x0002, 'blocks monsters'],
        [0x0004, 'two sided'],
        [0x0008, 'upper texture is unpegged'],
        [0x0010, 'lower texture is unpegged'],
        [0x0020, 'secret (shows as one-sided on automap), and monsters cannot open if it is a door (type 1)'],
        [0x0040, 'blocks sound'],
        [0x0080, 'never shows on automap'],
        [0x0100, 'always shows on automap '],
    ];

    function tagSector() {
        $editor.selected = renderSectors.find(e => e.sector.tag === linedef.tag);
    }

    function goto() {
        const vx = linedef.v[1].x - linedef.v[0].x;
        const vy = linedef.v[1].y - linedef.v[0].y;
        const angle = Math.atan2(vy, vx) - HALF_PI;
        map.player.position.set(linedef.v[0].x, linedef.v[0].y, linedef.right.sector.zFloor + 41);
        map.player.pitch = 0;
        map.player.direction = angle + Math.PI;
        map.events.emit('mobj-updated-position', map.player);
    }

    function changeLinedef(ev) {
        const linedef = map.data.linedefs.find(e => e.num === ev.detail)
        if (linedef) {
            $editor.selected = linedef
        }
    }
</script>

<h3 class="text-2xl">
    Linedef <NumberChooser num={linedef.num} on:select={changeLinedef} />
</h3>
<div>
<FlagList info={flagInfo} bind:flags={linedef.flags} />
</div>
<div class="text-xs">{JSON.stringify(linedef.v)} <button class="btn" on:click={goto}>Goto</button></div>
<div>
    Special {linedef.special}
    {#if linedef.special}
        <button class="btn" on:click={tagSector}>Tag: {linedef.tag}</button>
    {/if}
</div>
<div>
    {#if linedef.left}
        <h4>Right sidedef</h4>
    {/if}
    <SidedefEditor {map} {linedef} side="right" />
</div>
{#if linedef.left && linedef.left.sector === linedef.right.sector}
    <div class="alert alert-warning">SELF-REF</div>
{:else if linedef.left}
    <div>
        <h4>Left sidedef</h4>
        <SidedefEditor {map} {linedef} side="left" />
    </div>
{/if}

<style>
    h4 {
        border-top: 2px solid grey;
    }
</style>