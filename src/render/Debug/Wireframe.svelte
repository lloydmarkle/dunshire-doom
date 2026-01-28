<script lang="ts">
    import { T } from "@threlte/core";
    import { Edges } from "@threlte/extras";
    import { Color } from "three";
    import { useAppContext, useDoom } from "../DoomContext";

    const { wireframe } = useAppContext().settings;
    const { game } = useDoom();
    const tickN = game.time.tickN;
</script>

{#if $wireframe === 'visible' || $wireframe === 'all'}
    {#key $tickN}
    <Edges thresholdAngle={0} renderOrder={1000}>
        <!-- color doesn't work here... I wonder why? -->
        <T.LineBasicMaterial
            color={Color.NAMES.yellow}
            depthTest={$wireframe === 'visible'}
        />
    </Edges>
    {/key}
{/if}