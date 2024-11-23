<script lang="ts">
    import { type DoomError, type InvalidMap, type MissingMap } from '../../doom';
    import { ExclamationCircle, CheckCircle, XCircle, Home } from '@steeze-ui/heroicons'
    import { Icon } from '@steeze-ui/svelte-icon'
    import WadDropbox from '../../WadDropbox.svelte';
    import { WadStore } from '../../WadStore';

    export let error: DoomError;
    export let wadStore: WadStore;

    // TODO: if we start handling too many different error.codes here or the logic is
    // becoming too tangled then split this file into components. For now, it doesn't
    // seem too unreasonable

    let warpMap = '';
    const warpToMap = (err: MissingMap | InvalidMap) => () => {
        window.location.hash = '#' + [
            err.details.game.wad.name,
            'skill=' + err.details.game.skill,
            'map=' + warpMap,
        ].join('&');
    }

    const removeWadFromUrl = (name: string) => () => {
        window.location.hash = window.location.hash.replace(`wad=${name}`, '');
    }
</script>

<div class="w-screen h-screen flex flex-col red-honeycomb overflow-scroll">
    <a class="link link-primary max-w-32" href="/">
        <span><Icon src={Home} theme='solid' size="3rem"/></span>
    </a>
    <div class="flex flex-col gap-4 p-20">
        <h1 class="text-7xl flex gap-2">
            <span><Icon src={ExclamationCircle} theme='solid' size="5rem"/></span>
            <span>Error</span>
        </h1>
        <div>{error.message}</div>

        {#if error.code === 1 || error.code === 2}
            <label class="label max-w-xl">
                <span class="label-text">Available maps</span>
                <select class="select w-full max-w-xs" bind:value={warpMap}>
                    {#each error.details.game.wad.mapNames as opt}
                        <option>{opt}</option>
                    {/each}
                </select>
                <button class="btn btn-primary" on:click={warpToMap(error)}>Go</button>
            </label>
        {:else if error.code === 3}
            <ul class="pb-4">
                {#each error.details.failedWads as [name, err]}
                    <li class="pt-2 flex gap-4 items-center">
                        <Icon src={XCircle} theme="solid" size="2rem" />
                        {err}
                        <!--
                        future?
                        <button class="btn">Search idgames</button>
                        -->
                        <button class="btn btn-accent" on:click={removeWadFromUrl(name)}>Remove</button>
                    </li>
                {/each}
                {#each error.details.succeededWads as name}
                    <li class="pt-2 flex gap-4 items-center">
                        <Icon src={CheckCircle} theme="solid" size="2rem" />
                        {name}
                    </li>
                {/each}
            </ul>
            <WadDropbox {wadStore} />
        {/if}

        {#if 'exception' in error.details}
            {@const ex = error.details.exception}
            <div class="collapse collapse-arrow bg-base-300">
                <input type="checkbox" />
                <div class="collapse-title text-center text-xl font-medium">Details</div>
                <div class="collapse-content overflow-scroll">
                    {#if 'lineNumber' in ex && 'columnNumber' in ex && 'fileName' in ex}
                        <div>{ex.message} at {ex.lineNumber}:{ex.columnNumber} of {ex.fileName}:</div>
                    {:else}
                        <div>{ex.message}</div>
                    {/if}
                    <pre class="text-xs">
                        {ex.stack}
                    </pre>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .red-honeycomb {
        --b3: 5% .4 40;
        --b2: 20% .3 40;
        --b1: 20% .2 40;

        --honeycomb-c1: var(--b3);
        --honeycomb-c2: var(--b2);
        --honeycomb-gradient:
            radial-gradient(circle farthest-side at 0% 50%, oklch(var(--honeycomb-c1)) 23.5%, rgba(240,166,17,0) 0)
                calc(var(--honeycomb-size-x) * .5 + var(--honeycomb-border-size))
                calc(var(--honeycomb-size-y) * .5),
            radial-gradient(circle farthest-side at 0% 50%, oklch(var(--honeycomb-c2)) 24%, rgba(240,166,17,0) 0)
                calc(var(--honeycomb-size-x) * .5 - var(--honeycomb-border-size))
                calc(var(--honeycomb-size-y) * .5),
            linear-gradient(oklch(var(--honeycomb-c1)) 14%,rgba(240,166,17,0) 0, rgba(240,166,17,0) 85%,oklch(var(--honeycomb-c1)) 0) 0 0,
            linear-gradient(150deg, oklch(var(--honeycomb-c1)) 24%, oklch(var(--honeycomb-c2)) 0, oklch(var(--honeycomb-c2)) 26%, rgba(240,166,17,0) 0, rgba(240,166,17,0) 74%, oklch(var(--honeycomb-c2)) 0, oklch(var(--honeycomb-c2)) 76%, oklch(var(--honeycomb-c1)) 0) 0 0,
            linear-gradient(30deg, oklch(var(--honeycomb-c1)) 24%, oklch(var(--honeycomb-c2)) 0, oklch(var(--honeycomb-c2)) 26%, rgba(240,166,17,0) 0, rgba(240,166,17,0) 74%, oklch(var(--honeycomb-c2)) 0, oklch(var(--honeycomb-c2)) 76%, oklch(var(--honeycomb-c1)) 0) 0 0,
            linear-gradient(90deg, oklch(var(--honeycomb-c2)) 2%, oklch(var(--honeycomb-c1)) 0, oklch(var(--honeycomb-c1)) 98%, oklch(var(--honeycomb-c2)) 0%) 0 0,
            oklch(var(--honeycomb-c1));

        background: var(--honeycomb-gradient);
        background-size: var(--honeycomb-size-x) var(--honeycomb-size-y);
    }
</style>