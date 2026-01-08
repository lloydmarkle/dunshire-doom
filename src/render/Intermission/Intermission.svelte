<script lang="ts">
    import VictoryArt from "./VictoryArt.svelte";
    import VictoryCast from "./VictoryCast.svelte";
    import VictoryText, { hasVictoryText } from "./VictoryText.svelte";
    import Summary from "./Summary.svelte";
    import { type IntermissionScreen } from "../../doom";
    import { useDoom } from "../DoomContext";
    import WipeContainer from "../Components/WipeContainer.svelte";

    interface Props {
        details: IntermissionScreen;
        musicTrack: string;
    }
    let { details, musicTrack = $bindable() }: Props = $props();

    const { viewSize, game } = useDoom();
    let scale = $derived(Math.min($viewSize.width / 320, $viewSize.height / 200));

    let mapName = $derived(details.finishedMap.name);
    let episodeEnd = $derived(mapName.endsWith('M8'));
    let summaryComplete = $derived(episodeEnd);
    let textComplete = $derived(!hasVictoryText(mapName));
    let artComplete = $derived(!episodeEnd);
    $effect(() => {
        if (summaryComplete && textComplete && artComplete && mapName !== 'MAP30' && !episodeEnd) {
            game.startMap(details.nextMapName);
        }
    });

    let screenName = $derived(
        !summaryComplete ? 'summary' :
        !textComplete ? 'text' :
        !artComplete ? 'art' :
        mapName === 'MAP30' ? 'cast' : '');

    $effect(() => { musicTrack =
        !summaryComplete ? (game.episodic ? 'D_INTER' : 'D_DM2INT') :
        mapName === 'E3M8' && textComplete ? 'D_BUNNY' :
        mapName === 'MAP30' && textComplete ? 'D_EVIL' :
        mapName[0] === 'E' ? 'D_VICTOR' : 'D_READ_M' });
</script>

<WipeContainer key={screenName} >
    <div class="absolute inset-0 overflow-hidden select-none">
        <div
            class="relative h-full w-full flex justify-center items-center"
            style="transform:scale({scale});"
        >
            {#if screenName == 'summary'}
                <Summary {details} bind:complete={summaryComplete}/>
            {:else if screenName == 'text'}
                <VictoryText {mapName} bind:complete={textComplete} />
            {:else if screenName === 'art'}
                <VictoryArt {mapName} bind:complete={artComplete} />
            {:else if screenName === 'cast'}
                <VictoryCast />
            {/if}
        </div>
    </div>
</WipeContainer>