<script lang="ts">
    import { Color } from "three";
    import { hittableThing, MapObjectIndex, ToDegrees } from "../../doom";
    import type { MapObject } from "../Map/SvelteBridge";

    export let mobj: MapObject;

    const { position, direction } = mobj.renderData;
    const radius = mobj.info.radius;
    const tRadius = radius * Math.sqrt(2) / 2;
    const doubleRadius = radius * 2;

    function thingColor(mobj: MapObject) {
        const c =
            mobj.type === MapObjectIndex.MT_PLAYER ? Color.NAMES.green :
            mobj.class === 'M' ? Color.NAMES.red :
            mobj.class === 'W' ? Color.NAMES.orange :
            mobj.class === 'A' ? Color.NAMES.yellow :
            mobj.class === 'I' ? Color.NAMES.blue :
            mobj.class === 'P' ? Color.NAMES.magenta :
            mobj.class === 'K' ? Color.NAMES.violet :
            mobj.class === 'O' ? Color.NAMES.gray :
            mobj.class === 'D' ? Color.NAMES.brown :
            mobj.class === 'S' ? Color.NAMES.indigo :
            Color.NAMES.white;
        return '#' + c.toString(16).padStart(6, '0');
    }

    let showSquare = (mobj.info.flags & hittableThing) !== 0;
    let showTriangle = mobj.class === 'S' || mobj.class === 'M' || mobj.type === MapObjectIndex.MT_PLAYER;
    let showCircle = showTriangle || mobj.class === 'I' || mobj.class === 'A' || mobj.class === 'P' || !mobj.description;

    const blockMapBounds = mobj.map.data.blockMap.dimensions;
    const showBlocks = false;
    $: blocks = (showBlocks && $position) ? mobj.blockArea : null;
    $: thingOpacity = mobj.info.flags & hittableThing ? 1 : .3;
</script>

<g
    opacity={thingOpacity}
    fill='transparent'
    stroke={thingColor(mobj)}
>

    {#if blocks}
        {#each Array(blocks[2] - blocks[0]) as _, bx}
            {#each Array(blocks[3] - blocks[1]) as _, by}
                <rect
                    x={(blocks[0] + bx) * 128 + blockMapBounds.originX}
                    y={(blocks[1] + by) * 128 + blockMapBounds.originY}
                    width={128} height={128}
                    opacity={0.2}
                    fill={'blue'}
                />
            {/each}
        {/each}
    {/if}

    {#if showSquare}
        <rect
            x={$position.x - radius} y={$position.y - radius}
            width={doubleRadius} height={doubleRadius}
        />
    {/if}

    {#if showCircle}
        <circle cx={$position.x} cy={$position.y} r={radius} />
    {/if}

    {#if showTriangle}
        <polygon
            transform="
                rotate({$direction * ToDegrees - 90} {$position.x} {$position.y})
                translate({$position.x} {$position.y})
            "
            points="0 -{radius}, {tRadius} {tRadius}, -{tRadius} {tRadius}"/>
    {/if}

    <!-- <line
        x1={$position.x}
        y1={$position.y}
        y2={radius * Math.sin($direction) + $position.y}
        x2={radius * Math.cos($direction) + $position.x}
        fill={thingColor(mobj)}
        marker-end="url(#arrow)"
    /> -->

    <text
        x={$position.x - radius} y={-$position.y}
        stroke='none'
        fill={thingColor(mobj)}
    >{mobj.id}:{mobj.description ?? MapObjectIndex[mobj.type]}</text>
</g>

<style>
    text {
        font-size: small;
        width: 10em;
        transform: scaleY(-1);
    }
</style>