<script lang="ts">
    import type { PlayerMapObject } from "../../doom";
    import { MapObjectIndex, SoundIndex, mapObjectInfo } from "../../doom";
    import { tweened } from "svelte/motion";
    import { idfa, idkfa, idclev, idmus, idchoppers, idbeholdAllMap, idbeholdBerserk, idbeholdInvisible, idbeholdInvulnerable, idbeholdLiteAmp, idbeholdRadiation } from "../Controls/KeyboardCheatControls";
    import { useAppContext } from "../DoomContext";

    export let player: PlayerMapObject;
    const { invicibility, noclip, freeFly } = player.map.game.settings;
    const { showPlayerInfo } = useAppContext().settings;
    let warpMap = player.map.name;
    let mapMusic = player.map.name;

    function revive() {
        // spawn a dead player where we revived (DSDA Doom at least has this behaviour and it's cool)
        player.map.spawn(MapObjectIndex.MT_MISC62, player.position.x, player.position.y);
        player.map.game.playSound(SoundIndex.sfx_slop, player);
        // undo effects of MapObject.kill()
        const tw = tweened(player.health.val);
        tw.subscribe(v => player.health.set(v));
        tw.set(100, { duration: 2000 });
        const mInfo = mapObjectInfo[MapObjectIndex.MT_PLAYER];
        player.setState(mInfo.spawnstate);
        player.info.height = mInfo.height;
        player.info.flags = mInfo.flags;
        player.weapon.val.activate(player);
    }
</script>

<ul class="menu">
    <li>
        <label class="label cursor-pointer flex gap-2">
            <div class="label-text"><em>iddqd</em> (invicibility)</div>
            <input type="checkbox" class="checkbox" bind:checked={$invicibility} />
        </label>
    </li>
    <li>
        <label class="label cursor-pointer flex gap-2">
            <div class="label-text"><em>idclip</em> (walk through walls)</div>
            <input type="checkbox" class="checkbox" bind:checked={$noclip} />
        </label>
    </li>
    <li>
        <label class="label cursor-pointer flex gap-2">
            <div class="label-text">free fly</div>
            <input type="checkbox" class="checkbox" bind:checked={$freeFly} />
        </label>
    </li>
    <li><button class="btn" on:click={revive}>Revive</button></li>
    <li><button class="btn" on:click={() => idchoppers(player.map.game)}><em>idchoppers</em> (give chainsaw)</button></li>
    <li><button class="btn" on:click={() => idfa(player.map.game)}><em>idfa</em> (full ammo and weapons)</button></li>
    <li><button class="btn" on:click={() => idkfa(player.map.game)}><em>idkfa</em> (keys, ammo, and weapons)</button></li>
    <li>
        <div class="flex flex-col">
            <span><em>idbehold</em> (toggle powerup)</span>
            <div class="join gap-0">
                <button class="btn join-item gap-0" on:click={() => idbeholdInvulnerable(player.map.game)}>In<b class="text-primary">V</b>ulnerability</button>
                <button class="btn join-item gap-0" on:click={() => idbeholdBerserk(player.map.game)}>Ber<b class="text-primary">S</b>erk</button>
                <button class="btn join-item gap-0" on:click={() => idbeholdAllMap(player.map.game)}><b class="text-primary">A</b>ll map</button>
            </div>
            <div class="join gap-0">
                <button class="btn join-item gap-0" on:click={() => idbeholdInvisible(player.map.game)}><b class="text-primary">I</b>nvisibility</button>
                <button class="btn join-item gap-0" on:click={() => idbeholdRadiation(player.map.game)}><b class="text-primary">R</b>adiation suit</button>
                <button class="btn join-item gap-0" on:click={() => idbeholdLiteAmp(player.map.game)}><b class="text-primary">L</b>ite goggles</button>
            </div>
        </div>
    </li>
    <li>
        <label class="label">
            <span class="label-text"><em>idclev</em> (change map)</span>
            <select class="select w-full max-w-xs" bind:value={warpMap}>
                <option>{warpMap}</option>
                {#each player.map.game.wad.mapNames as opt}
                    <option>{opt}</option>
                {/each}
            </select>
            <button class="btn btn-primary" on:click={() => idclev(player.map.game, warpMap)}>Go</button>
        </label>
    </li>
    <li>
        <label class="label">
            <span class="label-text"><em>idmus</em> (change music)</span>
            <select class="select w-full max-w-xs" bind:value={mapMusic}>
                <option>{warpMap}</option>
                {#each player.map.game.wad.mapNames as opt}
                    <option>{opt}</option>
                {/each}
            </select>
            <button class="btn btn-primary" on:click={() => idmus(player.map.game, mapMusic)}>Play</button>
        </label>
    </li>
    <li>
        <label class="label cursor-pointer flex gap-2">
            <div class="label-text"><em>idmypos</em> Debug player info</div>
            <input type="checkbox" class="checkbox" bind:checked={$showPlayerInfo} />
        </label>
    </li>
</ul>