<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { useTask, useThrelte } from '@threlte/core';
    import Stats from 'three/examples/jsm/libs/stats.module';
    import { useAppContext } from '../DoomContext';
    import { useDoomMap } from '../Map/Context.svelte';
    import type { MapObject } from '../../doom';

    const { renderer, renderStage, canvas } = useThrelte();
    const { map } = useDoomMap();
    const { showStats } = useAppContext().settings;
    renderer.info.autoReset = false;

    const moving = new Set<MapObject>();
    onMount(map.events.auto('mobj-updated-position', mo => moving.add(mo)));

    const stats = new Stats();
    onMount(() => canvas.parentElement.appendChild(stats.dom));
    onDestroy(() => canvas.parentElement.removeChild(stats.dom));

    const infoPanel = (fetch: () => number, name: string, foreground: string, background: string) => {
        let max = 0;
        const panel = new Stats.Panel(name, foreground, background);
        stats.addPanel(panel);

        const updateInfo = () => {
            const value = fetch();
            max = Math.max(max, value);
            panel.update(value, max);
        }
        return { updateInfo };
    }

    const panels = [
        infoPanel(() => moving.values().reduce((count, mo) => count + (!mo.isDead && mo.isMonster ? 1 : 0), 0), 'monsters', 'plum', 'navy'),
        infoPanel(() => renderer.info.render.triangles, 'tri', 'darkgrey', 'black'),
        infoPanel(() => renderer.info.render.calls, 'draw', 'darkgrey', 'black'),
    ];
    stats.dom.style.left = null;
    stats.dom.style.right = '0px';

    const { start, stop } = useTask(() => {
        stats.end();
        panels.forEach(p => p.updateInfo());

        renderer.info.reset();
        stats.begin();
    }, { stage: renderStage, after: 'doom-render' });

    $effect(() => {
        if ($showStats) {
            start();
            stats.dom.style.display = null;
        } else {
            stop();
            stats.dom.style.display = 'none';
        }
    });
</script>
