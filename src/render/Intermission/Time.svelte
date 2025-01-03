<script lang="ts">
    import Picture from "../Components/Picture.svelte";

    export let time: number;

    $: dt = Math.max(0, time);
    $: hours = Math.floor(dt / 3600) % 24;
    $: minutes = Math.floor(dt / 60) % 60;
    $: seconds = Math.floor(dt % 60);
</script>

<div class="inline-flex gap-[1.2px]">
    {#if time > 3600}
        <Picture name="WINUM{hours % 10}" />
        <Picture name="WICOLON" />
    {/if}
    {#if time > 60}
        <Picture name="WINUM{Math.floor(minutes / 10)}" />
        <Picture name="WINUM{minutes % 10}" />
    {/if}
    <Picture name="WICOLON" />
    <Picture name="WINUM{Math.floor(seconds / 10)}" />
    <Picture name="WINUM{seconds % 10}" />
</div>
