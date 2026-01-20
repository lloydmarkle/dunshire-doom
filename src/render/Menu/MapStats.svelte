<script lang="ts">
    import type { MapRuntime } from "../../doom";

    export let map: MapRuntime;
    $: player = map?.player;
</script>

{#if map}
<div class="grid grid-cols-2 items-center text-sm">
    <span class:text-primary={player.stats.kills >= map.stats.totalKills}>
        Monsters [{player.stats.kills} / {map.stats.totalKills}]
    </span>
    <progress class="progress" max="1"
        value={map.stats.totalKills === 0 ? 0 : player.stats.kills / map.stats.totalKills}
        class:progress-primary={player.stats.kills >= map.stats.totalKills}></progress>

    <span class:text-primary={player.stats.items >= map.stats.totalItems}>
        Items [{player.stats.items} / {map.stats.totalItems}]
    </span>
    <progress class="progress" max="1"
        value={map.stats.totalItems === 0 ? 0 : player.stats.items / map.stats.totalItems}
        class:progress-primary={player.stats.items >= map.stats.totalItems}></progress>

    <span class:text-primary={player.stats.secrets >= map.stats.totalSecrets}>
        Secrets [{player.stats.secrets} / {map.stats.totalSecrets}]
    </span>
    <progress class="progress" max="1"
        value={map.stats.totalSecrets === 0 ? 0 : player.stats.secrets / map.stats.totalSecrets}
        class:progress-primary={player.stats.secrets >= map.stats.totalSecrets} ></progress>
</div>
{/if}
