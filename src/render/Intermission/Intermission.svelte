<script lang="ts">
    import type { Size } from "@threlte/core";
    import VictoryArt from "./VictoryArt.svelte";
    import VictoryCast from "./VictoryCast.svelte";
    import VictoryText, { hasVictoryText } from "./VictoryText.svelte";
    import Summary from "./Summary.svelte";
    import { type IntermissionScreen } from "../../doom";
    import WipeContainer from "../Components/WipeContainer.svelte";

    export let details: IntermissionScreen;
    export let screenName: string;
    export let size: Size;
    export let musicTrack = '';

    $: scale = Math.min(size.width / 320, size.height / 200);
    $: game = details.finishedMap.game;

    const mapName = details.finishedMap.name;
    let episodeEnd = mapName.endsWith('M8');
    let summaryComplete = episodeEnd;
    let textComplete = !hasVictoryText(mapName);
    let artComplete = !episodeEnd;
    $: screenName =
        !summaryComplete ? 'summary' :
        !textComplete ? 'text' :
        !artComplete ? 'art' :
        mapName === 'MAP30' ? 'cast' :
        screenName;
    $: if (summaryComplete && textComplete && artComplete && mapName !== 'MAP30' && !episodeEnd) {
        game.startMap(details.nextMapName);
    }

    $: musicTrack =
        !summaryComplete ? (game.episodic ? 'D_INTER' : 'D_DM2INT') :
        mapName === 'E3M8' && textComplete ? 'D_BUNNY' :
        mapName === 'MAP30' && textComplete ? 'D_EVIL' :
        mapName[0] === 'E' ? 'D_VICTOR' : 'D_READ_M';
</script>

<WipeContainer key={screenName}>
    <div class="absolute inset-0 overflow-hidden select-none">
        <div
            class="h-full w-full flex justify-center items-center"
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