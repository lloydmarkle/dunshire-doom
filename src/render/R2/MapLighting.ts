import { DataTexture, SRGBColorSpace } from "three";
import { sineIn } from "svelte/easing";
import type { MapRuntime, Sector } from "../../doom";

// TODO: How many copies of this function do we have?
function findNearestPower2(n: number) {
    let t = 1;
    while (t < n) {
        t *= 2;
    }
    return t;
}

// TODO: Should we use sectors or render sector (because of renderSector.flatLighting)?
export type MapLighting = ReturnType<typeof buildLightMap>;
export function buildLightMap(map: MapRuntime) {
    // NB: only use SRGBColorSpace for one texture because otherwise we apply it twice.
    // Also, applying to lightLevels seems to look a little brighter than applying to lightMap
    const maxLight = 255;
    const scaledLight = new Uint8ClampedArray(16 * 16 * 4);
    const lightLevels = new DataTexture(scaledLight, 16, 16);
    for (let i = 0; i < maxLight + 1; i++) {
        // scale light using a curve to make it look more like doom
        const light = Math.floor(sineIn(i / maxLight) * maxLight);
        scaledLight[i * 4 + 0] = light;
        scaledLight[i * 4 + 1] = light;
        scaledLight[i * 4 + 2] = light;
        scaledLight[i * 4 + 3] = 255;
    }
    lightLevels.colorSpace = SRGBColorSpace;
    lightLevels.needsUpdate = true;

    const textureSize = findNearestPower2(Math.sqrt(map.data.sectors.length));
    const sectorLights = new Uint8ClampedArray(textureSize * textureSize * 4);
    const lightMap = new DataTexture(sectorLights, textureSize, textureSize);
    const updateLight = (sector: Sector) => {
        const lightVal = Math.max(0, Math.min(maxLight, sector.light));
        sectorLights[sector.num * 4 + 0] = lightVal;
        sectorLights[sector.num * 4 + 1] = lightVal;
        sectorLights[sector.num * 4 + 2] = lightVal;
        sectorLights[sector.num * 4 + 3] = 255;
        lightMap.needsUpdate = true;
    }
    map.data.sectors.forEach(updateLight);
    map.events.on('sector-light', updateLight);

    const dispose = () => map.events.off('sector-light', updateLight);
    return { lightMap, lightLevels, dispose };
}
