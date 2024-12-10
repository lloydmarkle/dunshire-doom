<script lang="ts">
    import { fade } from "svelte/transition";
    import { ticksPerSecond, type IntermissionScreen, type Vertex } from "../../doom";
    import Picture from "../Components/Picture.svelte";
    import { useDoom } from "../DoomContext";
    import { randInt } from "three/src/math/MathUtils";

    export let details: IntermissionScreen;
    export let episode: number;
    export let showLocation: boolean;

    const { game } = useDoom();
    const tickN = game.time.tickN;

    $: nextMapNum = parseInt(details.nextMapName.substring(3, 5)) - 1;
    $: finishedMapNum = parseInt(details.finishedMap.name.substring(3, 5)) - 1;
    $: levelNum = (finishedMapNum === 8) ? nextMapNum - 1 : nextMapNum;

    const splatImg = game.wad.graphic('WISPLAT');
    // Animation and "splat" stuff copied from wi_stuff.c
    const splatDefs: Vertex[][] = [
        [
            { x: 185, y: 164 },
            { x: 148, y: 143 },
            { x: 69, y: 122 },
            { x: 209, y: 102 },
            { x: 116, y: 89 },
            { x: 166, y: 55 },
            { x: 71, y: 56 },
            { x: 135, y: 29 },
            { x: 71, y: 24 },
        ],
        [
            { x: 254, y: 25 },
            { x: 97, y: 50 },
            { x: 188, y: 64 },
            { x: 128, y: 78 },
            { x: 214, y: 92 },
            { x: 133, y: 130 },
            { x: 208, y: 136 },
            { x: 148, y: 140 },
            { x: 235, y: 158 },
        ],
        [
            { x: 156, y: 168 },
            { x: 48, y: 154 },
            { x: 174, y: 95 },
            { x: 265, y: 75 },
            { x: 130, y: 48 },
            { x: 279, y: 23 },
            { x: 198, y: 48 },
            { x: 140, y: 25 },
            { x: 281, y: 136 },
        ],
    ];

    const anim = (type: 'always' | 'level', period: number, frameCount: number, point: Vertex, level: number = undefined) =>
        ({ type, period, frameCount, point, level });
    const animDefs = [
        [
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 224, y: 104 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 184, y: 160 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 112, y: 136 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 72, y: 112 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 88, y: 96 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 64, y: 48 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 192, y: 40 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 136, y: 16 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 80, y: 16 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 64, y: 24 }),
        ],
        [
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 1),
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 2),
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 3),
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 4),
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 5),
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 6),
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 7),
            anim('level', Math.floor(ticksPerSecond / 3), 3, { x: 192, y: 144 }, 8),
            anim('level', Math.floor(ticksPerSecond / 3), 1, { x: 128, y: 136 }, 8),
        ],
        [
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 104, y: 168 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 40, y: 136 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 160, y: 96 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 104, y: 80 }),
            anim('always', Math.floor(ticksPerSecond / 3), 3, { x: 120, y: 32 }),
            anim('always', ticksPerSecond / 4, 3, { x: 40, y: 0 }),
        ],
    ];

    $: splats = splatDefs[episode].slice(0, levelNum);
    $: anims = animDefs[episode].map((anim, j) => {
        // level anims only show up if we've passed the given level
        if (anim.type === 'level' && nextMapNum < anim.level) {
            return null;
        }

        // a "mondo" hack
        j = (episode === 1 && j === 8) ? 4 : j;
        let frames: string[] = [];
        for (let i = 0; i < anim.frameCount; i++) {
            frames.push('WIA' + episode + String(j).padStart(2, '0') + String(i).padStart(2, '0'));
        }
        const nextTick = anim.type === 'always' ? randInt(1, anim.period) : 1;
        return { ...anim, nextTick, frames, index: 0 };
    }).filter(e => e);

    $: showHere = ($tickN % ticksPerSecond) > (ticksPerSecond / 2);
    const here1 = game.wad.graphic('WIURH0');
    const here2 = game.wad.graphic('WIURH1');
    $: hereSpot = splatDefs[episode][levelNum];
    $: hereImageName = hereSpot.x + here1.width - here1.xOffset < 320 && hereSpot.y + here1.height - here1.yOffset < 200 ? 'WIURH0' : 'WIURH1';
    $: here = {
        x: hereSpot.x - ((hereImageName === 'WIURH0') ? here1 : here2).xOffset,
        y: hereSpot.y - ((hereImageName === 'WIURH0') ? here1 : here2).yOffset,
    }

    $: if ($tickN) {
        anims.forEach(anim => {
            anim.nextTick -= 1;
            if (anim.nextTick) {
                return;
            }

            anim.nextTick = anim.period;
            anim.index += 1;
            if (anim.index === anim.frameCount) {
                anim.index = 0;
            }
        });
        anims = anims;
    }
</script>

<Picture name="WIMAP{episode}" />

{#each anims as anim}
    <div class="decal" style="top:{anim.point.y}px; left:{anim.point.x}px;"
        ><Picture name={anim.frames[anim.index]}
    /></div>
{/each}

{#if showLocation}
    {#each splats as splat}
        <div class="decal" style="top:{splat.y - splatImg.yOffset}px; left:{splat.x - splatImg.xOffset}px;"
            ><Picture name="WISPLAT"
        /></div>
    {/each}

    {#if showHere}
        <div class="decal" style="top:{here.y}px; left:{here.x}px;"
            transition:fade={{ duration: 100 }}
            ><Picture name={hereImageName}
        /></div>
    {/if}
{/if}

<style>
    div {
        line-height: 0px;
    }

    .decal {
        position: absolute;
    }
</style>