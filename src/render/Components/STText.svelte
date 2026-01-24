<script lang="ts">
    import Picture from "./Picture.svelte";

    let { text }: { text: string } = $props();
    let utext = $derived(text.toUpperCase());
</script>

<div class="flex flex-wrap items-center">
    {#each utext as char, i}
        {#if char === ' '}
            <span class="space"></span>
        {:else}
            <Picture name={`STCFN${utext.charCodeAt(i).toString().padStart(3, '0')}`} type='sprite' />
        {/if}
    {/each}
</div>

<style>
    .space {
        width: 5px;
        height: 7px;
        display: inline-block;
    }
</style>