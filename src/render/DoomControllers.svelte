<script lang="ts">
    import { keyboardControls } from "./Controls/KeyboardControls";
    import { mouseControls } from "./Controls/MouseControls";
    import TouchControls from "./Controls/TouchControls.svelte";
    import { keyboardCheatControls } from "./Controls/KeyboardCheatControls";
    import { Icon } from '@steeze-ui/svelte-icon'
    import { Bars3BottomLeft } from '@steeze-ui/heroicons'
    import { useAppContext, useDoom } from "./DoomContext";

    export let paused: boolean;

    const { game } = useDoom();
    const { settings, pointerLock } = useAppContext();
    const { cameraMode, keymap, mouseSensitivity, mouseInvertY, mouseSwitchLeftRightButtons, hudStyle } = settings;
    const touchDevice = matchMedia('(hover: none)').matches;
    const isPointerLocked = pointerLock.isPointerLocked;

    $: map = game.map;
</script>

{#if !paused || $cameraMode === 'svg'}
<div use:keyboardControls={{ input: game.input, keymap: $keymap }} />
<div use:keyboardCheatControls={game} />
{/if}
{#if $isPointerLocked && !touchDevice}
<div use:mouseControls={{ input: game.input, mouseSpeed: $mouseSensitivity, invertY: $mouseInvertY, swapButtons: $mouseSwitchLeftRightButtons }} />
{/if}
{#if touchDevice && !paused}
    <button
        class="absolute top-12 left-4 text-4xl z-10"
        class:top-4={$hudStyle === 'bottom'}
        on:click={() => $isPointerLocked = false}
    >
        <Icon class="swap-on fill-current opacity-60" src={Bars3BottomLeft} theme='solid' size="2rem"/>
    </button>
    <TouchControls player={$map?.player} />
{/if}