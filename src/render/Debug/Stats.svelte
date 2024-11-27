<script lang="ts">
    import { onDestroy, onMount } from 'svelte';
    import { useTask, useThrelte } from '@threlte/core';
    import Stats from 'three/examples/jsm/libs/stats.module';
    import type { WebGLRenderer } from 'three';
    import { useAppContext } from '../DoomContext';

    const { renderer, renderStage } = useThrelte();
    const { showStats } = useAppContext().settings;
    renderer.info.autoReset = false;

    class RenderInfoPanel {
       max: number;
       panel: Stats.Panel;

       constructor(readonly field: keyof WebGLRenderer['info']['render'], name: string, foreground: string, background: string) {
           this.panel = new Stats.Panel(name, foreground, background)
       }

       updateInfo() {
           const value = renderer.info.render[this.field];
           this.max = Math.max(this.max, value);
           this.panel.update(value, this.max);
       }
    }

    const stats = new Stats();
    stats.dom.style.left = null;
    stats.dom.style.right = '0px';

    const panels = [
        new RenderInfoPanel('triangles', 'tri', 'white', 'black'),
        new RenderInfoPanel('calls', 'draw', 'white', 'black'),
    ];
    panels.forEach(p => stats.addPanel(p.panel));

    const { start, stop } = useTask(() => {
        stats.end();
        panels.forEach(p => p.updateInfo());

        renderer.info.reset();
        stats.begin();
    }, { stage: renderStage });

    $: if ($showStats) {
        start();
        stats.dom.style.display = null;
    } else {
        stop();
        stats.dom.style.display = 'none';
    }

    onMount(() => document.body.appendChild(stats.dom));
    onDestroy(() => document.body.removeChild(stats.dom));
</script>
