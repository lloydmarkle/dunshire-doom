import { DataTexture } from "three";
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
    const maxLight = 255;
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
    return { lightMap, dispose };
}
