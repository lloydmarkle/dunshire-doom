<script lang="ts" context="module">
    // NOTE: map name comparison should match up with const data below. Ideally we would not copy this but I don't have a simple solution
    const mapsWithText = ['E1M8','E2M8','E3M8','E4M8','MAP06','MAP11','MAP20','MAP30','MAP15','MAP31'];
    export const hasVictoryText = (mapName: string) => mapsWithText.includes(mapName);
</script>
<script lang="ts">
    import { useDoom } from "../DoomContext";
    import { type MessageId, _T } from "../../doom";
    import STText from "../Components/STText.svelte";
    import { imageDataUrl } from '../Components/Picture.svelte';

    export let mapName: string;
    export let complete: boolean;

    const { wad, game } = useDoom();

    // A hack to decide if we are Doom2, plutonia, or TNT (and it will often be wrong when we've loaded pwads but then
    // modern PWADs have some kind of map info that we would want to read anyway)
    const endoom = wad.lumpByName('ENDOOM')
    const chars = endoom.data.map((c, i) => !(i & 1) ? c : null).filter(e => e);
    const endoomText = String.fromCharCode(...chars);
    const messageFlavour =
        endoomText.includes('Final DOOM: TNT - Evilution') ? 'T' :
        endoomText.includes('Final DOOM: The Plutonia Experiment') ? 'P' :
        'C'
    const texts: { [key: string]: MessageId } = {
        c1: `${messageFlavour}1TEXT`,
        c2: `${messageFlavour}2TEXT`,
        c3: `${messageFlavour}3TEXT`,
        c4: `${messageFlavour}4TEXT`,
        c5: `${messageFlavour}5TEXT`,
        c6: `${messageFlavour}6TEXT`,
    }
    const data: { [key: string] : { flat: string, text: MessageId } } = {
        'E1M8': { flat: 'FLOOR4_8', text: 'E1TEXT' },
        'E2M8': { flat: 'SFLR6_1', text: 'E2TEXT' },
        'E3M8': { flat: 'MFLR8_4', text: 'E3TEXT' },
        'E4M8': { flat: 'MFLR8_3', text: 'E4TEXT' },
        'MAP06': { flat: 'SLIME16', text: texts.c1 },
        'MAP11': { flat: 'RROCK14', text: texts.c2 },
        'MAP20': { flat: 'RROCK07', text: texts.c3 },
        'MAP30': { flat: 'RROCK17', text: texts.c4 },
        'MAP15': { flat: 'RROCK13', text: texts.c5 },
        'MAP31': { flat: 'RROCK19', text: texts.c6 },
    };

    const victoryFlat = data[mapName]?.flat;

    const victoryText = _T(data[mapName]?.text ?? 'CC_ARACH');
    const width = 8 * victoryText.split('\n').reduce((max, line) => Math.max(max, line.length), 0);
    const height = 8 * victoryText.split('\n').length;

    let allowSkip = false;
    let textComplete = false;
    let readyPressed = false;
    const tickN = game.time.tickN;
    let startTick = $tickN;
    $: if ($tickN) {
        let skipAttempt = false;
        if (!allowSkip) {
            allowSkip = !game.input.attack && !game.input.use;
        } else if (game.input.use || game.input.attack) {
            skipAttempt = true;
            allowSkip = false;
        }

        if (textComplete && skipAttempt) {
            readyPressed = true;
        }
        if ($tickN - startTick > 50 && skipAttempt) {
            textComplete = true;
        }
    }
    $: text = textComplete ? victoryText : victoryText.substring(0, ($tickN - startTick) / 3);
    $: textLines = text.split('\n');
    $: complete = mapName !== 'E1M8' && (!victoryFlat || (textComplete && readyPressed));

    const url = victoryFlat && imageDataUrl(wad, victoryFlat, 'flat');
</script>

<div
    class="absolute inset-0 flex justify-center items-center"
    style="background-image:url({url});"
>
    <div class="flex flex-col gap-px" style="width:{width}px; height:{height}px;">
        {#each textLines as line}
            <STText text={line + ' '} />
        {/each}
    </div>
</div>
