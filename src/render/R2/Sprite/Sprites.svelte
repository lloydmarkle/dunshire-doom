<script lang="ts">
    import { T, useTask, useThrelte } from "@threlte/core";
    import { useAppContext, useDoomMap } from "../../DoomContext";
    import type { SpriteSheet } from "./SpriteAtlas";
    import { createSpriteMaterialTransparent, createSpriteMaterial } from "./Materials";
    import { Camera, Euler, Quaternion, Vector3 } from "three";
    import { createSpriteGeometry } from "./Geometry";
    import { onDestroy } from "svelte";
    import { MapRuntime, MFFlags, PlayerMapObject, tickTime, type MapObject as MO, type Sprite } from "../../../doom";
    import type { MapLighting } from "../MapLighting";

    export let map: MapRuntime;
    export let spriteSheet: SpriteSheet;
    export let lighting: MapLighting;

    // Neat! We augment mobj.renderData to make intellisense work
    type GeoType = ReturnType<typeof createSpriteGeometry>;
    interface MapObject extends MO {
        renderData: {
            'rinfo': ReturnType<GeoType['add']>,
            'geo': GeoType
        },
    }

    const { camera } = useDoomMap();
    const { extraLight } = map.player;
    // TODO: draw tracers?
    // let tracers: typeof map.tracers;
    // $: if ($trev) {
    //     tracers = map.tracers;
    // }

    const { editor, settings } = useAppContext();
    const { playerLight, interpolateMovement, cameraMode, useTextures } = settings;

    function hit(ev) {
        if (!ev.instanceId) {
            return;
        }
        ev.stopPropagation();

        const id = ev.object.geometry.attributes.doomInspect.array[ev.instanceId];
        $editor.selected = [...map.objs].find(e => e.id === id);
    }

    let material = createSpriteMaterial(spriteSheet, lighting, { cameraMode: $cameraMode });
    let uniforms = material.uniforms;
    let tranMaterial = createSpriteMaterialTransparent(spriteSheet, lighting, { cameraMode: $cameraMode });
    let tranUniforms = tranMaterial.uniforms;

    const threlteCam = useThrelte().camera;
    const { position, angle } = camera;
    const updateCameraUniforms = (() => {
        // https://discourse.threejs.org/t/mesh-points-to-the-camera-on-only-2-axis-with-shaders/21555/7
        const q = new Quaternion();
        const z0 = new Vector3(0, -1, 0);
        const z1 = new Vector3();
        return (cam: Camera, p: Vector3, a: Euler) => {
            cam.getWorldDirection(z1);
            // if we want to remove a dependency on $threlteCamera, we could use:
            // z1.set(0, 0, -1);
            // z1.applyEuler(a);
            z1.setZ(0).negate().normalize();
            q.setFromUnitVectors(z0, z1);

            $uniforms.camQ.value.copy(q);
            $tranUniforms.camQ.value.copy(q);

            $uniforms.camP.value.copy(p);
            $tranUniforms.camP.value.copy(p);
        }
    })();
    function updateTimeUniforms(time: number) {
        const t2 = time * tickTime
        $uniforms.time.value = t2;
        $uniforms.tics.value = $interpolateMovement ? time : 0;
        $tranUniforms.time.value = t2;
        $tranUniforms.tics.value =  $interpolateMovement ? time : 0;
    }
    // NOTE: use a task instead of $: to make sure we have the latest value before rendering
    useTask(() => {
        updateCameraUniforms($threlteCam, $position, $angle)
        updateTimeUniforms(map.game.time.tick.val);
    }, { stage: useThrelte().renderStage });

    function updateInspectorUniforms(edit) {
        // map objects have 'health' so only handle those
        $uniforms.dInspect.value = edit.selected && 'health' in edit.selected
            ? edit.selected.id
            // clear selection
            : -1;
        $tranUniforms.dInspect.value = $uniforms.dInspect.value;
    }
    $: updateInspectorUniforms($editor);

    function updateExtraLightUniforms(extraLight: number) {
        $uniforms.doomExtraLight.value = extraLight;
        $tranUniforms.doomExtraLight.value = extraLight;
    }
    $: updateExtraLightUniforms($extraLight / 255);

    function updateCameraMode(cameraMode: string) {
        material = createSpriteMaterial(spriteSheet, lighting, { cameraMode });
        uniforms = material.uniforms;
        tranMaterial = createSpriteMaterialTransparent(spriteSheet, lighting, { cameraMode });
        tranUniforms = tranMaterial.uniforms;

        opaqGeo.resetGeometry($cameraMode, material);
        tranGeo.resetGeometry($cameraMode, tranMaterial);
        // set camera uniforms so we project sprites properly on the first frame
        updateCameraUniforms($threlteCam, $position, $angle);
        // force player position update because player sprite is hidden in 1p but visible in other cams
        map.player.positionChanged();
    }
    $: updateCameraMode($cameraMode);

    function setShadowsEnabled(state: boolean) {
        opaqGeo.shadowState(state);
        tranGeo.shadowState(state);
    }
    // shadows don't look right from overhead cam and I don't have a good idea how to fix it so disable them
    $: setShadowsEnabled($cameraMode !== 'bird' && $playerLight !== '#000000');

    const opaqGeo = createSpriteGeometry(spriteSheet, material);
    onDestroy(opaqGeo.dispose);
    const tranGeo = createSpriteGeometry(spriteSheet, tranMaterial);
    onDestroy(tranGeo.dispose);

    const addMobj = (mo: MapObject) => {
        if (mo.info.flags & MFFlags.MF_NOSECTOR) {
            return;
        }
        const geo = (mo.info.flags & MFFlags.MF_SHADOW) ? tranGeo : opaqGeo;
        mo.renderData['rinfo'] = geo.add(mo);
        mo.renderData['geo'] = geo;
    }
    const updateMobjSprite = (mo: MapObject, sprite: Sprite) => {
        const geo = mo.renderData['geo'];
        if (!geo) {
            // updateSprite events can happen before mobj-added so we have to be careful
            return;
        }

        // swap from spector to non?
        const isSpectre = mo.info.flags & MFFlags.MF_SHADOW;
        if (geo === opaqGeo && isSpectre) {
            opaqGeo.remove(mo);
            mo.renderData['rinfo'] = tranGeo.add(mo);
            mo.renderData['geo'] = tranGeo;
            return;
        } else if (geo === tranGeo && !isSpectre) {
            tranGeo.remove(mo);
            mo.renderData['rinfo'] = opaqGeo.add(mo);
            mo.renderData['geo'] = opaqGeo;
            return;
        }

        if (mo instanceof PlayerMapObject) {
            // weapon sprites are also updated this way so we have to be careful
            sprite = mo.sprite.val;
            // make sure weapon sprites update
            mo.weapon.val.sprite.set(map.player.weapon.val.sprite.val);
            mo.weapon.val.flashSprite.set(map.player.weapon.val.flashSprite.val);
        }
        mo.renderData['rinfo']?.updateSprite(sprite);
    }
    const removeMobjs = (mo: MapObject) => {
        mo.renderData['geo']?.remove(mo);
        mo.renderData['geo'] = mo.renderData['rinfo'] = null;
    }
    const updateMobjPosition = (mo: MapObject) => mo.renderData['rinfo']?.updatePosition()

    map.objs.forEach(addMobj);
    map.events.on('mobj-added', addMobj);
    map.events.on('mobj-removed', removeMobjs);
    map.events.on('mobj-updated-sprite', updateMobjSprite);
    map.events.on('mobj-updated-position', updateMobjPosition);
    onDestroy(() => {
        map.events.off('mobj-added', addMobj);
        map.events.off('mobj-removed', removeMobjs);
        map.events.off('mobj-updated-sprite', updateMobjSprite);
        map.events.off('mobj-updated-position', updateMobjPosition);
    });
</script>

<T is={opaqGeo.root} on:click={hit} renderOrder={1} />
<T is={tranGeo.root} on:click={hit} renderOrder={2} />
