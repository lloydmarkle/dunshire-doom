<script lang="ts">
    import { useDoom } from "../DoomContext";
    import { _T, MapObjectIndex, MapRuntime } from "../../doom";
    import STText from "../Components/STText.svelte";
    import Picture from "../Components/Picture.svelte";

    const { wad, game } = useDoom();
    const tick = game.time.tick;

    const yScale = (16 / 10) / (4 / 3);

    let map = new MapRuntime('MAP30', wad.readMap('MAP30'), game);
    let castNumber = 0;
    const cast: [MapObjectIndex, string][] = [
        [MapObjectIndex.MT_POSSESSED, _T('CC_ZOMBIE')],
        [MapObjectIndex.MT_SHOTGUY, _T('CC_SHOTGUN')],
        [MapObjectIndex.MT_CHAINGUY, _T('CC_HEAVY')],
        [MapObjectIndex.MT_TROOP, _T('CC_IMP')],
        [MapObjectIndex.MT_SERGEANT, _T('CC_DEMON')],
        [MapObjectIndex.MT_SKULL, _T('CC_LOST')],
        [MapObjectIndex.MT_HEAD, _T('CC_CACO')],
        [MapObjectIndex.MT_KNIGHT, _T('CC_HELL')],
        [MapObjectIndex.MT_BRUISER, _T('CC_BARON')],
        [MapObjectIndex.MT_BABY, _T('CC_ARACH')],
        [MapObjectIndex.MT_PAIN, _T('CC_PAIN')],
        [MapObjectIndex.MT_UNDEAD, _T('CC_REVEN')],
        [MapObjectIndex.MT_FATSO, _T('CC_MANCU')],
        [MapObjectIndex.MT_VILE, _T('CC_ARCH')],
        [MapObjectIndex.MT_SPIDER, _T('CC_SPIDER')],
        [MapObjectIndex.MT_CYBORG, _T('CC_CYBER')],
        [MapObjectIndex.MT_PLAYER, _T('CC_HERO')],
    ];

    let mobj = map.spawn(cast[castNumber][0], 0, 0);
    let sprite = mobj.sprite;
    let frames = wad.spriteFrames($sprite.name);
    let frame = frames[$sprite.frame][0];
    let allowAttack = false;
    const deathPauseTicks = 15;

    $: if ($tick) {
        mobj.tick();
        frame = frames[$sprite.frame][0];

        let attack = false;
        if (!allowAttack) {
            allowAttack = !game.input.attack && !game.input.use;
        } else if (game.input.use || game.input.attack) {
            attack = true;
            allowAttack = false;
        }

        if (mobj.isDead) {
            // This is a hack but I don't have a better idea to tell when the mobj is in a dead state
            if ((mobj as any)._state.ticks === -1) {
                frameCount += 1;
            }
            if (frameCount > deathPauseTicks) {
                frameCount = 0;
                castNumber = (castNumber + 1) % cast.length;
                mobj = map.spawn(cast[castNumber][0], 0, 0);
                mobj.chaseTarget = map.player;
                sprite = mobj.sprite;
                frames = wad.spriteFrames($sprite.name);
            }
        } else if (attack) {
            frameCount = 0;
            mobj.damage(mobj.health.val);
        }
    }

    let meleeAttack = true;
    let attacking = false;
    let frameCount = 0;
    // loop through a few frames of walking and a frames of attacking
    $: if (!mobj.isDead && frames[$sprite.frame][0]) {
        frameCount += 1;

        if (frameCount > 12 && !attacking) {
            attacking = true;
            meleeAttack = !meleeAttack;
            let attackState =
                (meleeAttack ? mobj.info.meleestate : mobj.info.missilestate)
                || (meleeAttack ? mobj.info.missilestate : mobj.info.meleestate);
            mobj.setState(attackState);
        }
        if (frameCount > 24 && attacking) {
            attacking = false;
            frameCount = 0;
        }
    }
</script>

<div class="relative w-[320px] h-[200px] flex justify-center">
    <Picture name="BOSSBACK" />
    {#if frame}
        <div
            class="absolute bottom-[40px]"
            style="transform: scaleX({frame.mirror ? -1 : 1}) scaleY({yScale})"
        >
            <Picture name={frame.name} />
        </div>
        <div class="absolute bottom-[20px]">
            <STText text={cast[castNumber][1]} />
        </div>
    {/if}
</div>