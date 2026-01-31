<script lang="ts">
    import { cubicOut } from "svelte/easing";
    import { fly } from "svelte/transition";

    export let key: string;
    export let duration = 2000;

    const easing = cubicOut
    let zi = 0;

    // Not a true DOOM screen wipe but kind of fun anyway. For a true screen wipe, we can probalby use shaders
    // (like this https://www.shadertoy.com/view/XtlyDn) but we render a lot of things using DOM nodes and not canvas
    // so we need to either switch to canvas or get DOM inside canvas. Threlte has an HTML helper element that may work
    // but I haven't play with it enough.
    function melt(node: Element, { delay = 0, duration = 400, easing = cubicOut } = {}) {
        const bounds = node.getBoundingClientRect();
        const h = bounds.height;
        const w = bounds.width;
        // based on https://css-tricks.com/animating-with-clip-path/#aa-melt but more svelty
        // It would be cool to generate these curves but the math turned out to be more complicated than I want to learn right now.
        const pathStart = [
            [w * 0.04165, -8.33, w * 0.08335, -12.5, w * .125, -12.5],
            [w * 0.1875, -12.5, w * 0.18285, -0.27, w * .25, 0],
            [w * 0.31715, 0.27, w * 0.3125, -34.37, w * .375, -34.37],
            [w * 0.4375, -34.37, w * 0.4375, -4.01, w * .5, 0],
            [w * 0.5625, 4.01, w * 0.5619, -18.34, w * .625, -18.34],
            [w * 0.6881, -18.34, w * 0.69045, 1.66, w * .75, 0],
            [w * 0.8143, -1.66, w * 0.8108, -25, w * .875, -25],
            [w * 0.91395, -25, w * 0.9564, -16.67, w, 0],
        ];
        const pathEnd = [
            [w * 0.04165, h * 1.35415, w * 0.08335, h * 1.53125, w * .125, h * 1.53125],
            [w * 0.1875, h * 1.53125, w * 0.18285, h * 1.1549, w * .25, h * 1.15625],
            [w * 0.31715, h * 1.15625, w * 0.3125, h * 1.4219, w * .375, h * 1.4219],
            [w * 0.4375, h * 1.4219, w * 0.4375, h * 1.04245, w * .5, h * 1.0625],
            [w * 0.5625, h * 1.08255, w * 0.5619, h * 1.50205, w * .625, h * 1.50205],
            [w * 0.6881, h * 1.50205, w * 0.69045, h * 1.1958, w * .75, h * 1.1875],
            [w * 0.8143, h * 1.1792, w * 0.8108, h * 1.46875, w * .875, h * 1.46875],
            [w * 0.91395, h * 1.46875, w * 0.9564, h * 1.3125, w, h],
        ];

        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
                clip-path: path('M0 ${u * h} ${pathStart.map((ps, i) =>
                            (ps.length === 6 ? 'C ' : 'S ') + ps.map((start, j) => t * start + u * pathEnd[i][j]).join(' ')
                    ).join(' ')} L${w} ${h} L0 ${h} L0 ${u * h} Z');`
        };
    }

    // hmmm... not ideal but without it, we can't scroll inside the wipe container and for the main menu, that is critical.
    let transitionActive = 0;

    // I wonder what other kinds of transitions might be fun to create...
</script>

<div class="absolute inset-0 z-0"
    class:overflow-hidden={transitionActive > 0}
>
    {#key key}
    <div
        class="absolute inset-0"
        style="z-index:{zi--}"
        out:melt={{ duration, easing }}
        on:outrostart={() => transitionActive += 1}
        on:outroend={() => transitionActive -= 1}
    >
        <div class="absolute inset-0" out:fly={{ easing, duration, opacity: 1, y: '100%' }}>
            <slot />
        </div>
    </div>
    {/key}
</div>
