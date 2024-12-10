<script lang="ts">
    import { ticksPerSecond, type IntermissionScreen, SoundIndex } from "../../doom";
    import Picture from "../Components/Picture.svelte";
    import AnimatedBackground from "./AnimatedBackground.svelte";
    import STNumber from "../Components/STNumber.svelte";
    import Time from "./Time.svelte";
    import { writable } from "svelte/store";
    import MapNamePic from "../Components/MapNamePic.svelte";

    export let details: IntermissionScreen;
    export let complete: boolean;

    const game = details.finishedMap.game;
    const sum = (playerStats: IntermissionScreen['playerStats'], key: keyof IntermissionScreen['playerStats'][0]) =>
        playerStats.map(e => e[key]).reduce((total, val) => total + val, 0)
    const mapNum = (mapName: string) => parseInt(mapName.substring(3, 5)) - 1;

    let tickN = game.time.tickN;
    let stats = details.finishedMap.stats;
    let episodeMaps = !details.nextMapName.startsWith('MAP');
    let episode = parseInt(details.nextMapName[1]);

    // Doom1 (copied from g_game.c)
    const parTimes1 = [
        [30,75,120,90,165,180,180,30,165],
        [90,90,90,120,90,360,240,30,170],
        [90,45,90,150,90,90,165,30,135],
        [165,255,135,150,180,390,135,360,180],
    ];
    // Doom2 (and plutonia/tnt)
    const parTimes2 = [
        30,90,120,120,90,150,120,120,270,90,	//  1-10
        210,150,150,150,210,150,420,150,210,150,	// 11-20
        240,150,180,150,150,300,330,420,300,180,	// 21-30
        120,30					// 31-32
    ];

    let state: 'count' | 'wait' | 'next-map' = 'count';
    const ticker = (tickRate: number, count: number, total?: number) => {
        let n = -1;
        let value = writable(0);
        const update = () => value.set(total ? (n * 100 / total) : n);
        return {
            set: value.set,
            update: value.update,
            subscribe: value.subscribe,
            isComplete: () => n === count,
            complete: () => {
                n = count;
                update();
            },
            tick: () => {
                if (n === count) {
                    game.playSound(SoundIndex.sfx_barexp);
                    return;
                }
                if (!(game.time.tickN.val & 3)) {
                    // only every 4th tick
                    game.playSound(SoundIndex.sfx_pistol);
                }
                n = Math.min(count, n + tickRate);
                update();
            },
        };
    };
    let killPercent = ticker(2, sum(details.playerStats, 'kills'), stats.totalKills);
    let itemPercent = ticker(2, sum(details.playerStats, 'items'), stats.totalItems);
    let secretPercent = ticker(2, sum(details.playerStats, 'secrets'), stats.totalSecrets);
    let parTime = ticker(3, episodeMaps
        ? parTimes1[episode - 1][mapNum(details.finishedMap.name)]
        : parTimes2[mapNum(details.finishedMap.name)]);
    let mapTime = ticker(3, stats.elapsedTime);
    let gameTime = ticker(3, details.finishedMap.game.time.playTime);

    let allowSkip = false;
    let pauseTime = ticksPerSecond;
    let tickers = [];
    $: if (tickN && $tickN) tickUpdate();
    function tickUpdate() {
        // TODO: the logic in this function is _very_ complex. I wonder if we could do better with
        // transitions and in/out to trigger next animation or pause?

        // check for button presses to skip animations
        if (!allowSkip) {
            // prevent fast skip (like a left-over use-press from flipping the switch at the end of the level)
            allowSkip = !game.input.attack && !game.input.use;
        } else if (game.input.attack || game.input.use) {
            allowSkip = false;
            if (state === 'count') {
                game.input.attack = false;
                game.input.use = false;
                tickers = [killPercent, itemPercent, secretPercent, parTime, mapTime, gameTime];
                tickers.forEach(e => e.complete());
            } else {
                pauseTime = 0;
            }
        }

        pauseTime -= 1;
        if (pauseTime >= 0) {
            return;
        }

        if (state === 'wait') {
            state = 'next-map';
            pauseTime = 4 * ticksPerSecond;
            game.playSound(SoundIndex.sfx_sgcock);
            return;
        } else if (state === 'next-map') {
            // we've finished our wait for entering state so go to next map
            // NOTE: stop the ticker because it can take time to load the next map and we don't want any more ticks
            tickN = null;
            complete = true;
            return;
        }

        if (tickers.every(e => e.isComplete())) {
            const next =
                secretPercent.isComplete() ? [parTime, mapTime, gameTime] :
                itemPercent.isComplete() ? [secretPercent] :
                killPercent.isComplete() ? [itemPercent] :
                [killPercent];
            tickers = [...tickers, ...next];
            if (tickers.every(e => e.isComplete())) {
                // 4 second pause to see next map name (and "you are here" in doom1)
                state = 'wait';
                pauseTime = 4 * ticksPerSecond;
            }
            return;
        }

        tickers.forEach(e => e.tick());
        // if we just finished our tickers, add pause time
        if (tickers.every(e => e.isComplete())) {
            pauseTime = ticksPerSecond;
        }
    }
</script>

<div class="relative w-[320px] h-[200px]">
    {#if episodeMaps && episode < 4}
        <AnimatedBackground episode={episode - 1} {details} showLocation={state === 'next-map'} />
    {:else}
        <Picture name="INTERPIC" />
    {/if}
    <div class="content">
        {#if state === 'next-map'}
            {#if details.finishedMap.name !== 'MAP30'}
                <div class="dtitle">
                    <span><Picture name="WIENTER" /></span>
                    <span><MapNamePic name={details.nextMapName} /></span>
                </div>
            {/if}
        {:else}
            <div class="dtitle">
                <span><MapNamePic name={details.finishedMap.name} /></span>
                <span><Picture name="WIF" /></span>
            </div>

            <div class="dstats">
                <div>
                    <span><Picture name="WIOSTK" /></span>
                    <span class:transparent={tickers.length < 1}><STNumber sprite="WINUM" percent value={$killPercent} /></span>
                </div>
                <div>
                    <span><Picture name="WIOSTI" /></span>
                    <span class:transparent={tickers.length < 2}><STNumber sprite="WINUM" percent value={$itemPercent} /></span>
                </div>
                <div>
                    <span><Picture name="WISCRT2" /></span>
                    <span class:transparent={tickers.length < 3}><STNumber sprite="WINUM" percent value={$secretPercent} /></span>
                </div>
            </div>

            <div class="time">
                <div class="game-time">
                    <div class="time-pair">
                        <span><Picture name="WITIME" /></span>
                        <span class:transparent={tickers.length < 4}><Time time={$mapTime} /></span>
                    </div>
                    <div class="time-pair">
                        <span></span>
                        <span class:transparent={tickers.length < 4}><Time time={$gameTime} /></span>
                    </div>
                </div>
                <div class="time-pair">
                    <span><Picture name="WIPAR" /></span>
                    <span class:transparent={tickers.length < 4}><Time time={$parTime} /></span>
                </div>
            </div>
        {/if}
    </div>
</div>

<style>
    .transparent {
        opacity: 0;
    }

    .content {
        top: 0;
        left: 0;
        bottom: 0;
        right: 0;
        position: absolute;

        display: flex;
        flex-direction: column;
        justify-content: space-between;
    }

    .content div {
        display: flex;
    }

    .dtitle {
        align-self: center;
        align-items: center;
    }
    .dtitle, .dstats {
        flex-direction: column;
    }
    .dstats div {
        margin: 0em 4em;
        justify-content: space-between;
    }

    .time {
        justify-content: space-around;
        margin-bottom: 2em;
    }
    .game-time {
        display: flex;
        flex-direction: column;
    }
    .time-pair {
        gap: 20px;
        justify-content: space-between;
    }

    span {
        margin-top: 5px;
        line-height: 0;
    }
</style>