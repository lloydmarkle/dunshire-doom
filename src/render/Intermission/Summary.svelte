<script lang="ts">
    import { ticksPerSecond, type IntermissionScreen, SoundIndex } from "../../doom";
    import Picture from "../Components/Picture.svelte";
    import AnimatedBackground from "./AnimatedBackground.svelte";
    import STNumber from "../Components/STNumber.svelte";
    import Time from "./Time.svelte";
    import { get, writable } from "svelte/store";
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

    const ticker = (tickRate: number, count: number, total?: number) => {
        count = count ?? 0;
        const target = total ? (count * 100) / total : count;
        const value = writable(-1);
        return {
            subscribe: value.subscribe,
            isComplete: () => get(value) === target,
            complete: () => value.set(target),
            tick: () => value.update(v => Math.min(target, v + tickRate)),
        };
    };

    type StateFn = (buttonPressed: boolean) => StateFn;
    const nextMapState: StateFn = (() => {
        const initialWaitTime = 4 * ticksPerSecond;
        let waitTime = initialWaitTime;
        return button => {
            if (waitTime === initialWaitTime) {
                game.playSound(SoundIndex.sfx_sgcock);
            }
            waitTime = button ? 0 : waitTime - 1;
            if (waitTime > 0) {
                return nextMapState;
            }
            complete = true;
            return nextMapState;
        };
    })();

    const waitState: StateFn = button => button ? nextMapState : waitState;

    let tickers = [];
    const killPercent = ticker(2, sum(details.playerStats, 'kills'), stats.totalKills);
    const itemPercent = ticker(2, sum(details.playerStats, 'items'), stats.totalItems);
    const secretPercent = ticker(2, sum(details.playerStats, 'secrets'), stats.totalSecrets);
    const parTime = ticker(3, episodeMaps
        ? parTimes1[episode - 1][mapNum(details.finishedMap.name)]
        : parTimes2[mapNum(details.finishedMap.name)]);
    const mapTime = ticker(3, stats.elapsedTime);
    const gameTime = ticker(3, details.finishedMap.game.time.playTime);
    const countState: StateFn = (() => {
        let waitTime = ticksPerSecond;
        return button => {
            if (button) {
                tickers = [killPercent, itemPercent, secretPercent, parTime, mapTime, gameTime];
                const alreadyComplete = tickers.every(e => e.isComplete());
                if (!alreadyComplete) {
                    game.playSound(SoundIndex.sfx_barexp);
                }
                tickers.forEach(e => e.complete());
                return alreadyComplete ? nextMapState : waitState;
            }

            if (waitTime > 0) {
                waitTime -= 1;
                return countState;
            }

            if (tickers.every(e => e.isComplete())) {
                const next =
                    secretPercent.isComplete() ? [parTime, mapTime, gameTime] :
                    itemPercent.isComplete() ? [secretPercent] :
                    killPercent.isComplete() ? [itemPercent] :
                    [killPercent];
                tickers = [...tickers, ...next];
                return countState;
            }

            if (!($tickN & 3)) {
                // only every 4th tick
                game.playSound(SoundIndex.sfx_pistol);
            }
            tickers.forEach(e => e.tick());
            // if we just finished a ticker, add pause time
            if (tickers.every(e => e.isComplete())) {
                game.playSound(SoundIndex.sfx_barexp);
                waitTime = ticksPerSecond;
            }
            return countState;
        };
    })();

    let stateFn: StateFn = countState;
    let allowButton = false;
    $: if (tickN && $tickN) tickUpdate();
    function tickUpdate() {
        // prevent fast skip (like a left-over use-press from flipping the switch at the end of the level)
        let buttonPressed = false;
        if (!allowButton) {
            allowButton = !game.input.attack && !game.input.use;
        } else if (game.input.attack || game.input.use) {
            buttonPressed = true;
            allowButton = false;
            game.input.attack = false;
            game.input.use = false;
        }

        stateFn = stateFn?.(buttonPressed);
    }
</script>

<div class="relative w-[320px] h-[200px]">
    {#if episodeMaps && episode < 4}
        <AnimatedBackground episode={episode - 1} {details} showLocation={stateFn === nextMapState} />
    {:else}
        <Picture name="INTERPIC" />
    {/if}
    <div class="content">
        {#if stateFn === nextMapState}
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