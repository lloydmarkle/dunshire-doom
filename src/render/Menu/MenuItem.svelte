<script lang="ts">
    import type { MenuSetting } from "../DoomContext";

    // without runes, the <select /> binding causes some kind of infinite loop. The combination
    // of $state and $effect allows most of the code to stay the same. Long term, there is probably
    // a simpler way to manage settings
    interface Props {
        item: MenuSetting;
        active: boolean,
    }
    let { item, active = false }: Props = $props();
    let val = $derived(item.val);

    const formatNumber = (num: number) => num.toLocaleString(undefined, { maximumFractionDigits: 2, minimumFractionDigits: 0 });
</script>

{#if item.type === 'range'}
    <label class="label" class:active={active}>
        <span class="label-text">{item.text} <span class="text-xs text-primary">[{formatNumber($val)}]</span></span>
        <input type="range" class="range" min={item.min} max={item.max} step={item.step} bind:value={$val} />
    </label>
{:else if item.type === 'option'}
    <label class="label" class:active={active}>
        <span class="label-text">{item.text}</span>
        <select class="select w-full max-w-xs" bind:value={$val}>
            {#each item.options as opt}
                <option>{opt}</option>
            {/each}
        </select>
    </label>
{:else if item.type === 'color'}
    <label class="label cursor-pointer" class:active={active}>
        <span class="label-text">{item.text}</span>
        <input type="color" bind:value={$val} />
    </label>
{:else if item.type === 'toggle'}
    <label class="label cursor-pointer" class:active={active}>
        <span class="label-text">{item.text}</span>
        <input type="checkbox" class="checkbox" bind:checked={$val} />
    </label>
{/if}