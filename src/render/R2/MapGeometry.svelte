<script lang="ts">
    import { T, useThrelte } from '@threlte/core';
    import { BufferGeometry, MeshBasicMaterial } from 'three';
    import { useAppContext, useDoomMap } from '../DoomContext';
    import { MapTextureAtlas, TextureAtlas } from './TextureAtlas'
    import { buildMapGeometry } from './GeometryBuilder';
    import Wireframe from '../Debug/Wireframe.svelte';
    import { mapMeshMaterials } from './MapMeshMaterial';
    import { onDestroy } from 'svelte';
    import type { MapObject, MapRuntime } from '../../doom';
    import type { MapLighting } from './MapLighting';
    import { writable } from 'svelte/store';

    export let map: MapRuntime;
    export let lighting: MapLighting;

    const threlte = useThrelte();

    const { editor, settings } = useAppContext();
    const { fakeContrast, playerLight, useTextures } = settings;
    const { renderSectors } = useDoomMap();
    const { tick, partialTick } = map.game.time;

    console.time('map-geo')
    const ta = new MapTextureAtlas(map.game.wad, new TextureAtlas(threlte.renderer.capabilities.maxTextureSize));
    const { geometry, skyGeometry, translucentGeometry, dispose } = buildMapGeometry(ta, map, renderSectors);
    onDestroy(dispose);
    console.timeEnd('map-geo')

    const { material, distanceMaterial, depthMaterial, uniforms } = mapMeshMaterials(ta, lighting);
    const tranMaterial = mapMeshMaterials(ta, lighting);
    const tranUniforms = tranMaterial.uniforms;
    tranMaterial.material.transparent = true;
    tranMaterial.material.opacity = 0.8;
    tranMaterial.material.depthWrite = false;
    tranMaterial.material.alphaTest = 0;
    const skyMaterial = new MeshBasicMaterial({ depthWrite: true, colorWrite: false });
    const interpolateMovement = settings.interpolateMovement;

    // set material properties
    function updateMaterialTexture(useTextures: boolean) {
        tranMaterial.material.map =
            material.map = useTextures ? ta.texture : null;
        tranMaterial.material.needsUpdate =
            material.needsUpdate = true;
    }
    $: updateMaterialTexture($useTextures);

    const updateFakeContrast = (fakeContrast: string) =>
        $tranUniforms.doomFakeContrast.value =
        $uniforms.doomFakeContrast.value =
            fakeContrast === 'off' ? 0 :
            fakeContrast === 'classic' ? 1 :
            2;
    $: updateFakeContrast($fakeContrast);

    const updateTime = (time: number) =>
        $tranUniforms.time.value = $uniforms.time.value = time;
    $: updateTime($tick + ($interpolateMovement ? $partialTick : 0));

    const updateExtraLight = (extraLight: number) =>
        $tranUniforms.doomExtraLight.value =
        $uniforms.doomExtraLight.value =
        extraLight;
    $: updateExtraLight($extraLight / 255);

    function updateInspectors(edit: typeof $editor) {
        // map objects have 'health' so ignore those
        $tranUniforms.dInspect.value =
        $uniforms.dInspect.value =
        edit.selected && !('health' in edit.selected)
            ? [
                'special' in edit.selected ? 0 : 1,
                edit.selected.num,
            ]
            // clear selection
            : [-1, -1];
    }
    $: updateInspectors($editor);

    // magic https://stackoverflow.com/questions/49873459
    const shadowBias = -0.004;

    $: usePlayerLight = $playerLight !== '#000000';
    $: receiveShadow = usePlayerLight;
    $: castShadow = receiveShadow;
    const { position, extraLight } = map.player;

    const playerPosition = writable(position);
    const updatePlayer = (mo: MapObject) => {
        if (mo === map.player) {
            playerPosition.set(position);
        }
    };
    map.events.on('mobj-updated-position', updatePlayer);
    onDestroy(() => map.events.off('mobj-updated-position', updatePlayer));

    const hit = (geom: BufferGeometry) => (ev) => {
        if (!ev.face) {
            return;
        }
        ev.stopPropagation();

        // Also tran?
        const type = geom.attributes.doomInspect.array[ev.face.a * 2];
        const items = type === 0 ? map.data.linedefs : map.data.sectors;
        const num = geom.attributes.doomInspect.array[ev.face.a * 2 + 1];
        $editor.selected = items.find(e => e.num === num);
    }
</script>

<T.Mesh
    renderOrder={0}
    geometry={skyGeometry}
    material={skyMaterial}
>
    <Wireframe />
</T.Mesh>

<T.Mesh
    on:click={hit(geometry)}
    renderOrder={1}
    {geometry}
    {material}
    customDepthMaterial={depthMaterial}
    customDistanceMaterial={distanceMaterial}
    {receiveShadow}
    {castShadow}
>
    <Wireframe />
</T.Mesh>

<T.Mesh
    on:click={hit(translucentGeometry)}
    renderOrder={1}
    geometry={translucentGeometry}
    material={tranMaterial.material}
    customDepthMaterial={tranMaterial.depthMaterial}
    customDistanceMaterial={tranMaterial.distanceMaterial}
    {receiveShadow}
    {castShadow}
>
    <Wireframe />
</T.Mesh>

{#if usePlayerLight}
    <T.PointLight
        {castShadow}
        color={$playerLight}
        intensity={10}
        distance={400}
        decay={0.2}
        position.x={$playerPosition.x}
        position.y={$playerPosition.y}
        position.z={$playerPosition.z + 40}
        shadow.bias={shadowBias}
    />
{/if}