<script lang="ts">
    import Picture from "../Components/Picture.svelte";

    export let key: 'B' | 'Y' | 'R';
    export let keys: string;

    $: card1 =
        key === 'B' && keys.includes('B') ? 0 :
        key === 'Y' && keys.includes('Y') ? 1 :
        key === 'R' && keys.includes('R') ? 2 :
        null;
    $: card2 =
        key === 'B' && keys.includes('b') ? 3 :
        key === 'Y' && keys.includes('y') ? 4 :
        key === 'R' && keys.includes('r') ? 5 :
        null;
</script>

{#if card1 && card2}
<div class="relative">
    <span><Picture name={'STKEYS' + card1} /></span>
    <span><Picture name={'STKEYS' + card2} /></span>
</div>
{:else}
    <Picture name={'STKEYS' + (card1 ?? card2)} />
{/if}

<style>
    div {
        position: relative;
    }
    span {
        position: absolute;
        display: inline-block;
    }
    span:nth-child(1) {
        transform: translate(-2px, -2px) scale(0.8);
    }
    span:nth-child(2) {
        transform: translate(2px, 0px) scale(0.7);
    }
</style>