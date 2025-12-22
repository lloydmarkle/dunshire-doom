<script lang="ts">
    import type { EventHandler } from "svelte/elements";
    import { type PlayerMapObject } from "../../doom";
    import type { Action, ActionReturn } from "svelte/action";
    import Picture from "../Components/Picture.svelte";
    import { useAppContext, useDoom } from "../DoomContext";
    import { fade, fly } from "svelte/transition";

    export let player: PlayerMapObject = null;
    export let defaultTouchZonePosition: Point = null;
    export let showDeadZone = false;

    const { game } = useDoom();
    const hasSuperShotgun = Boolean(game.wad.spriteTextureData('SHT2A0'));
    $: tickN = game.time.tickN;
    $: inventory = player?.inventory;
    $: playerWeapons = $inventory?.weapons;
    $: currentWeaponNum = (playerWeapons ?? []).findIndex(p => p?.name === player?.weapon?.val?.name);

    const { settings } = useAppContext();
    const { touchDeadZone, tapTriggerTime, touchLookSpeed, analogMovement, touchAreaSize } = settings;
    $: halfTouchSize = $touchAreaSize / 2;
    const nowTime = () => new Date().getTime() * 0.001;
    const weaponSprites: [string, number, number][] = [
        ['PUNGB0', 26, -5],
        ['SAWGC0', 23, -10],
        ['PISGA0', 25, 0],
        ['SHTGA0', 29, 0],
        ['SHT2A0', 27, 8],
        ['CHGGA0', 14, 0],
        ['MISGB0', 13, -5],
        ['PLSGA0', 17, -7],
        ['BFGGA0', 9, -11],
    ];

    let useButton = false;
    let useLock = false;
    let attackButton = false;
    let attackLock = false;
    $: if ($tickN) {
        game.input.attack = false;
        game.input.use = false;
        if (attackButton || attackLock) {
            game.input.attack = true;
            attackButton = false;
        }
        if (useButton || useLock) {
            game.input.use = true;
            useButton = false;
        }
    }

    function analogClip(val: number) {
        if (Math.abs(val) < $touchDeadZone) {
            return 0;
        }
        const scaled = Math.sign(val) * (Math.abs(val) - $touchDeadZone) / (1 - $touchDeadZone);
        return Math.max(-1, Math.min(1, scaled));
    }

    function dpadClip(val: number) {
        if (Math.abs(val) < $touchDeadZone) {
            return 0;
        }
        return Math.max(-1, Math.min(1, Math.sign(val)));
    }

    function findTouch(tl: TouchList, id: number) {
        for (let i = 0; i < tl.length; i++) {
            if (tl[i].identifier === id) {
                return tl[i];
            }
        }
        return tl[0];
    }

    type Params = {
        touchAreaSize: number;
        clipFn: (x: number) => number;
    };
    type Point = { x: number, y: number };
    interface Attributes {
        'on:tzone-start': EventHandler<CustomEvent<Point>>;
        'on:tzone-point': EventHandler<CustomEvent<Point>>;
        'on:tzone-tap': EventHandler;
        'on:tzone-lock': EventHandler;
        'on:tzone-unlock': EventHandler;
    }

    const touchZoneControls: Action<HTMLElement, Params, Attributes> = (node, params): ActionReturn<Params, Attributes> => {
        let tapLock = false;
        let touchTime = 0;
        let touchNum: number;
        let touchActive = false;
        let invTouchBoxSize = 1 / params.touchAreaSize;
        let startPoint = { x: 0, y: 0 };
        let point = { x: 0, y: 0 };

        // TODO: I wonder how hard it would be to rewrite this with pointer events? No need to fuss with touch ids?
        node.addEventListener('touchstart', touchstart);
        node.addEventListener('touchmove', touchmove);
        node.addEventListener('touchend', touchend);
        node.addEventListener('touchcancel', touchend);
        const update = (params: Params) => {
            invTouchBoxSize = 1 / params.touchAreaSize;
        };
        const destroy = () => {
            node.removeEventListener('touchstart', touchstart);
            node.removeEventListener('touchmove', touchmove);
            node.removeEventListener('touchend', touchend);
            node.removeEventListener('touchcancel', touchend);
        }
        return { update, destroy };

        function touchstart(ev: TouchEvent) {
            ev.preventDefault();
            ev.timeStamp
            const now = nowTime();
            const elapsed = (now - touchTime);
            if (elapsed < 2 * $tapTriggerTime) {
                tapLock = true;
                node.dispatchEvent(new Event('tzone-lock'));
            }
            touchTime = now;

            touchNum = ev.changedTouches[0].identifier;
            // don't start a second tick function if one is already active
            if (!touchActive) {
                requestAnimationFrame(onTick);
            }
            touchActive = true;
            initTouch(findTouch(ev.touches, touchNum));
        }

        function touchmove(ev: TouchEvent) {
            ev.preventDefault();
            updateTouch(findTouch(ev.touches, touchNum));
        }

        function touchend(ev: TouchEvent) {
            ev.preventDefault();
            if (nowTime() - touchTime < $tapTriggerTime) {
                node.dispatchEvent(new Event('tzone-tap'));
            }
            tapLock = false;
            node.dispatchEvent(new Event('tzone-unlock'));
            touchActive = false;
            point.x = point.y = 0;
        }

        function initTouch(t: Touch) {
            const bounds = node.getBoundingClientRect();
            const relativeStart = {
                x: t.clientX - bounds.x,
                y: t.clientY - bounds.y,
            };
            node.dispatchEvent(new CustomEvent('tzone-start', { detail: relativeStart }));

            startPoint.x = point.x = t.clientX;
            startPoint.y = point.y = t.clientY;
            updateTouch(t);
        }
        function updateTouch(t: Touch) {
            point.x = params.clipFn((t.clientX - startPoint.x) * invTouchBoxSize);
            point.y = params.clipFn((t.clientY - startPoint.y) * invTouchBoxSize);
        }

        function onTick() {
            node.dispatchEvent(new CustomEvent('tzone-point', { detail: point }));
            if (touchActive) {
                requestAnimationFrame(onTick);
            }
        }
    };

    let showWeaponMenu = false;
    function weaponTouchMove(ev: PointerEvent) {
        const btn = document.elementFromPoint(ev.clientX, ev.clientY);
        if (btn instanceof HTMLButtonElement && btn.getAttribute('class').includes('wbutton')) {
            btn.focus()
        }
    }
    function weaponTouchEnd(ev: PointerEvent) {
        const btn = document.elementFromPoint(ev.clientX, ev.clientY);
        if (btn instanceof HTMLButtonElement && btn.getAttribute('class').includes('wbutton')) {
            btn.click();
        }
        showWeaponMenu = false
    }
    const selectWeapon = (num: number) => () => {
        showWeaponMenu = false;
        if (player.weapon.val.name !== playerWeapons[num].name) {
            player.nextWeapon = playerWeapons[num];
        }
    }

    $: moveStartPoint = defaultTouchZonePosition;
    let movePoint = { x: 50, y: 50 };
    function touchMove(ev: CustomEvent<Point>) {
        movePoint.x = (ev.detail.x + 1) * 50;
        movePoint.y = (ev.detail.y + 1) * 50;
        game.input.move.x = ev.detail.x;
        game.input.move.y = -ev.detail.y;
    }

    $: lookStartPoint = defaultTouchZonePosition;
    let lookPoint = { x: 50, y: 50 };
    function touchLook(ev: CustomEvent<Point>) {
        lookPoint.x = (ev.detail.x + 1) * 50;
        lookPoint.y = (ev.detail.y + 1) * 50;
        game.input.aim.x = $touchLookSpeed * Math.sign(ev.detail.x) * (ev.detail.x * ev.detail.x);
        game.input.aim.y = $touchLookSpeed * Math.sign(ev.detail.y) * (ev.detail.y * ev.detail.y);
    }
</script>

<div class="absolute inset-0 overflow-hidden">
    <div
        class="opacity-50 h-full flex justify-center items-end"
        style:--deadZone="{$touchDeadZone * 100}%"
    >
        <div
            class="absolute top-0 left-0 w-1/2 h-full"
            use:touchZoneControls={{ touchAreaSize: $touchAreaSize, clipFn: $analogMovement ? analogClip : dpadClip }}
            on:tzone-start={ev => moveStartPoint = ev.detail}
            on:tzone-tap={() => useButton = true}
            on:tzone-lock={() => useLock = true}
            on:tzone-unlock={() => useLock = false}
            on:tzone-point={touchMove}
            on:touchend={() => moveStartPoint = null}
        >
            {#if moveStartPoint}
            <div
                transition:fade
                style:--px="{movePoint.x}%"
                style:--py="{movePoint.y}%"
                style:--opx="{moveStartPoint.x - halfTouchSize}px"
                style:--opy="{moveStartPoint.y - halfTouchSize}px"
                style:--size="{$touchAreaSize}px"
                class="touchGradient border-2 border-accent border-opacity-40 rounded-full"
                class:show-dead-zone={showDeadZone}
                class:extra-active={useButton || useLock}
                class:dpad-move={!$analogMovement}
            />
            {/if}
        </div>

        <div
            class="absolute top-0 right-0 w-1/2 h-full"
            use:touchZoneControls={{ touchAreaSize: $touchAreaSize, clipFn: analogClip }}
            on:tzone-start={ev => lookStartPoint = ev.detail}
            on:tzone-tap={() => attackButton = true}
            on:tzone-lock={() => attackLock = true}
            on:tzone-unlock={() => attackLock = false}
            on:tzone-point={touchLook}
            on:touchend={() => lookStartPoint = null}
        >
            {#if lookStartPoint}
            <div
                transition:fade
                style:--px="{lookPoint.x}%"
                style:--py="{lookPoint.y}%"
                style:--opx="{lookStartPoint.x - halfTouchSize}px"
                style:--opy="{lookStartPoint.y - halfTouchSize}px"
                style:--size="{$touchAreaSize}px"
                class="touchGradient border-2 border-accent border-opacity-40 rounded-full"
                class:show-dead-zone={showDeadZone}
                class:extra-active={attackButton || attackLock}
            />
            {/if}
        </div>

        <button
            class="touchGradient rounded-full absolute"
            style="--px:50%; --py:50%; --size:{$touchAreaSize * 1.2}px"
            on:click={() => showWeaponMenu = !showWeaponMenu}
        />
    </div>

    {#if showWeaponMenu && player}
        <div class="absolute bottom-0 grid grid-cols-3 grid-rows-3 place-content-around gap-1 p-4">
            {#each weaponSprites as [spriteName], num}
                {#if hasSuperShotgun || spriteName !== 'SHT2A0'}
                {@const weaponNum = !hasSuperShotgun && num > 3 ? num + 1 : num}
                <button
                    transition:fly|global={{ y: '100%', duration: 100, delay: num * 20 }}
                    class="btn no-animation w-full h-full overflow-hidden"
                    class:selected-weapon={currentWeaponNum === num}
                    class:opacity-0={!playerWeapons[weaponNum]}
                    class:opacity-80={playerWeapons[weaponNum]}
                    disabled={!playerWeapons[weaponNum]}
                    on:click={selectWeapon(num)}
                >
                    <span class="scale-[1.5] translate-y-1/4 pointer-events-none"><Picture name={spriteName} /></span>
                </button>
                {/if}
            {/each}
        </div>
    {/if}
</div>

<style>
    /* https://stackoverflow.com/questions/4472891 */
    :root {
        touch-action: pan-x pan-y;
    }

    .touchGradient {
        --grad-bg: transparent;
        --grad-size: 25%;
        transform: translate(var(--opx), var(--opy));
        background-image: radial-gradient(
            circle at var(--px) var(--py),
            oklch(var(--a)), oklch(var(--a)) var(--grad-size), var(--grad-bg) calc(var(--grad-size) + 5%));
        width: var(--size);
        height: var(--size);
    }

    .dpad-move {
        --grad-size: 40%;
        clip-path: polygon(35% 0%,65% 0%,65% 35%,100% 35%,100% 60%,65% 60%,65% 100%,35% 100%,35% 60%,0% 60%,0% 35%,35% 35%);
        /* background-color: oklch(var(--b1)); */
        border: none;
        border-radius: 0;
    }

    .extra-active {
        --a: var(--s);
        --grad-bg: oklch(var(--b3));
    }

    .show-dead-zone {
        --a: var(--b1);
        --grad-bg: oklch(var(--p));
        --grad-size: var(--deadZone);
    }

    .selected-weapon {
        --btn-color: var(--a);
    }
</style>