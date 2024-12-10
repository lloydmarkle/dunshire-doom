<script lang="ts">
    import Picture from "../Components/Picture.svelte";
    import { useDoom } from "../DoomContext";
    import { SoundIndex } from "../../doom";

    export let mapName: string;
    export let complete: boolean;

    const { game } = useDoom();
    const tickN = game.time.tickN;

    complete = mapName.startsWith('MAP') || mapName.endsWith('E1');

    const waitTime = 50;
    let startTick = $tickN;
    $: if ($tickN) {
        if ((game.input.use || game.input.attack) && $tickN - startTick > waitTime) {
            startTick = -Infinity;
        }
    }
    $: transform = -160 + Math.min(320, Math.max(0, ($tickN - startTick - 230) / 2));

    let endTick = 0;
    $: if (!endTick && transform === 160) {
        endTick = $tickN;
    }
    $: endItem = Math.floor(Math.min(6, Math.max(0, ($tickN - endTick - waitTime) / 5)));
    $: if (mapName === 'E3M8' && endTick && endItem > 0) {
        game.playSound(SoundIndex.sfx_pistol);
    }
</script>

{#if mapName === 'E2M8'}
    <Picture name="VICTORY2" />
{:else if mapName === 'E3M8'}
    <div class="flex" style="transform: translateX({transform}px)">
        <Picture name="PFUB2" />
        <Picture name="PFUB1" />
    </div>
    {#if endTick > 0}
        <div class="absolute w-[101px] h-[63px]">
            <Picture name="END{endItem}" />
        </div>
    {/if}
{:else if mapName === 'E4M8'}
    <Picture name="ENDPIC" />
{/if}
