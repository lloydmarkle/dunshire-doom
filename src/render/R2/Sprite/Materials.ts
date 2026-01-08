import { DoubleSide, MeshBasicMaterial, MeshDepthMaterial, MeshDistanceMaterial, MeshStandardMaterial, Vector3, Vector4, type IUniform } from "three";
import type { SpriteSheet } from "./SpriteAtlas";
import { store } from "../../../doom";
import type { MapLighting } from "../MapLighting";

export type SpriteMaterial = ReturnType<typeof createSpriteMaterial>;
export const inspectorAttributeName = 'doomInspect';
export function createSpriteMaterial(sprites: SpriteSheet, lighting: MapLighting, params: { cameraMode: string }) {
    const pars_prefix = [
        params.cameraMode === 'bird' ? '#define BIRD_CAM' : ''
    ].join('\n')

    const vertex_pars = pars_prefix + `
    #include <common>

    uniform vec4 camQ;
    uniform vec3 camP;
    uniform sampler2D tSpriteUVs;
    uniform uint tSpriteUVsWidth;
    uniform isampler2D tSpriteInfo;
    uniform float tSpritesWidth;
    uniform sampler2D tLightLevels;
    uniform sampler2D tLightMap;
    uniform uint tLightMapWidth;
    uniform float time;
    uniform float tics;

    attribute uvec2 texN;
    attribute vec3 vel;
    attribute vec4 motion;

    varying vec4 sUV;
    varying vec2 vDim;
    varying float renderSpectre;

    const uint flag_fullBright = uint(0);
    const uint flag_isMissile = uint(1);
    const uint flag_invertZOffset = uint(2);
    const uint flag_isSpectre = uint(3);
    const uint flag_isFloating = uint(4);
    // returns 1.0 if flag is set or else 0.0
    float flagBit(uint val, uint bit) {
        return float((val >> bit) & uint(1));
    }

    const float split1 = 0.9238795325112867; //cos(PI/8);
    const float split2 = 0.38268343236508984; //cos(PI/8 * 3);
    float spriteRotation(vec4 tpos, float tdir, vec3 camP) {
        vec2 cdir = normalize( tpos.xy - camP.xy );
        vec2 vdir = vec2( cos(tdir), sin(tdir) );

        // dot and dot of a normal to figure out quadrant
        float dot1 = dot( cdir, vdir );
        float dot2 = dot( cdir, vec2(-vdir.y, vdir.x) );

        // It took a while to work this out but... NO BRANCHING! :)
        float h2 = step(split2 - dot2, 0.0) + step(split1 - dot1, 0.0);
        float rot =
            (1.0 - h2) * (
                step(-dot1 - split1, 0.0)
                + step(-dot1 - split2, 0.0)
                + step(-dot1 + split2, 0.0))
            + h2 * (4.0
                + step(dot1 - split1, 0.0)
                + step(dot1 - split2, 0.0)
                + step(dot1 + split2, 0.0));
        return rot;
    }

    const float oneSixteenth = 1.0 / 16.0;
    float scaleLightLevel(float level) {
        float light = level * 256.0;
        vec2 luv = vec2( mod(light, oneSixteenth), floor(light * oneSixteenth) );
        vec4 scaledLight = texture2D( tLightLevels, (luv + .5) * oneSixteenth );
        return scaledLight.g;
    }

    // https://discourse.threejs.org/t/instanced-geometry-vertex-shader-question/2694/3
    vec3 applyQuaternionToVector( vec4 q, vec3 v ){
        return v + 2.0 * cross( q.xyz, cross( q.xyz, v ) + q.w * v );
    }
    `;

    const uv_vertex = `
    #include <uv_vertex>

    float fSpriteUVWidth = float(tSpriteUVsWidth);
    float invSpriteUVsWidth = 1.0 / fSpriteUVWidth;
    float spriteN = float(texN.x);
    vec2 tUV = vec2( mod(spriteN, fSpriteUVWidth), floor(spriteN * invSpriteUVsWidth));
    tUV = (tUV + .5) * invSpriteUVsWidth;
    // sprite info (offsets, mirrored, etc)
    ivec4 info = texture2D( tSpriteInfo, tUV );

    #ifndef BIRD_CAM
    if (info.w > 0) {
        // sprite has rotations so figure out which one to use
        // NB: don't use actual position here but use origin because we are rendering planes from (-.5,0,-.5)-(.5,0,.5)
        // so we really just choose one point otherwise some vertices may use a different rotation.
        vec4 pos = instanceMatrix * vec4( 0, 0, 0, 1 );
        float rot = spriteRotation( pos, float(motion.w), camP );

        spriteN += rot;
        tUV = vec2( mod(spriteN, fSpriteUVWidth), floor(spriteN * invSpriteUVsWidth));
        tUV = (tUV + .5) * invSpriteUVsWidth;
        info = texture2D( tSpriteInfo, tUV );
    }
    #endif

    // sprite dimensions
    sUV = texture2D( tSpriteUVs, tUV );
    vDim = vec2( sUV.z - sUV.x, sUV.w - sUV.y );
    `
    const begin_vertex = `
    #include <begin_vertex>

    renderSpectre = flagBit(texN.y, flag_isSpectre);

    // scale based on texture size (vDim) and mirror (info.z)
    vec2 dim = vDim * tSpritesWidth;
    transformed *= vec3(dim.x * float(info.z), dim.y, dim.y);

    // and position based on texture size and offsets (info.xy)
    float invertZ = 1.0 - 2.0 * flagBit(texN.y, flag_invertZOffset);
    float offZ = float(info.y) - dim.y;
    offZ = max(offZ, 0.0) + (dim.y * .5 * invertZ) + (flagBit(texN.y, flag_isMissile) * offZ);
    // only apply sprite offset on x-axis because that's the one facing the camera after applying the camera quaternion
    float offX = dim.x * .5 - float(info.x);
    transformed += vec3(offX, 0.0, offZ);

    // apply camera angle quaternion after scale and offset otherwise offsets won't look right
    // (Doom2's burning barrels wiggle if we apply the quaternion before applying sprite offsets)
    #ifdef BIRD_CAM
    // Grr... burning barrels still wiggle in bird cam but I doubt it's a common use case so I'm going to ignore it for now
    float halfAng = (motion.w - PI_HALF) * .5;
    vec4 angleQuat = vec4(0.0, 0.0, sin(halfAng), cos(halfAng));
    transformed = applyQuaternionToVector(angleQuat, transformed);
    #else
    transformed = applyQuaternionToVector(camQ, transformed);
    #endif

    // motion interpolation (motion = [speed/tic, direction, startTimeTics])
    const float notMoving = -0.01;
    float useMovement = (1.0 - flagBit(texN.y, flag_isFloating)) * step(notMoving, motion.y);
    float partialMove = motion.x * max(0.0, tics - motion.z) * useMovement;
    vec3 vMotion = vel * fract(tics);
    vMotion.x += cos(motion.y) * partialMove;
    vMotion.y += sin(motion.y) * partialMove;
    transformed += vMotion;

    // downscale because of fixed geometry size for inspector
    transformed *= 1.0 / vec3(40, 40, 80);
    `;

    const fragment_pars = pars_prefix + `
    #include <common>

    // noise for objects with "shadows" flag (like spectres)
    float noise( vec2 st ) {
        // vec2 v2 = vec2(12.9898,78.233);
        vec2 v2 = vec2(0.39, 0.41);
        return fract( sin( dot( st.xy, v2 ) ) * 43758.5453123);
    }

    uniform float time;

    varying vec4 sUV;
    varying vec2 vDim;
    varying float renderSpectre;
    `;
    const depthDist_map_fragment = `
    #ifdef USE_MAP

    vec2 mapUV = mod(vMapUv * vDim, vDim) + sUV.xy;
    vec4 sampledDiffuseColor = texture2D( map, mapUV );
    if (sampledDiffuseColor.a < 1.0) discard;

    sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.0), renderSpectre);
    vec2 ipos = floor(vMapUv * 200.0);
    float n = fract( time * noise(ipos) );
    sampledDiffuseColor.a *= mix(sampledDiffuseColor.a, n, renderSpectre);

    #endif
    `;

    const uniforms = store({
        dInspect: { value: -1 } as IUniform,
        doomExtraLight: { value: 0 } as IUniform,
        time: { value: 0 } as IUniform,
        tics: { value: 0 } as IUniform,
        camQ: { value: new Vector4() } as IUniform,
        camP: { value: new Vector3() } as IUniform,
        // map lighting info
        tLightLevels: { value: lighting.lightLevels },
        tLightMap: { value: lighting.lightMap },
        tLightMapWidth: { value: lighting.lightMap.image.width },
        // sprite meta data
        tSpriteInfo: { value: sprites.spriteInfo },
        tSpritesWidth: { value: sprites.sheet.image.width },
        tSpriteUVs: { value: sprites.uvIndex },
        tSpriteUVsWidth: { value: sprites.uvIndex.image.width },
    });

    const material = new MeshStandardMaterial({
        map: sprites.sheet,
        alphaTest: 1.0,
        side: DoubleSide, // to mirror, we scale by -1 so we need both front and back side
        shadowSide: DoubleSide,
    });
    material.onBeforeCompile = shader => {
        Object.keys(uniforms.val).forEach(key => shader.uniforms[key] = uniforms.val[key])

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', vertex_pars + `
            uniform float doomExtraLight;
            attribute uint doomLight;
            varying float doomLightLevel;

            uniform uint dInspect;
            attribute uint ${inspectorAttributeName};
            varying vec3 doomInspectorEmissive;
            `)
            .replace('#include <uv_vertex>', uv_vertex)
            .replace(`#include <beginnormal_vertex>`,`
            #include <beginnormal_vertex>
            objectNormal = normalize(applyQuaternionToVector(camQ, objectNormal));
            `)
            .replace(`#include <begin_vertex>`, begin_vertex + `
            // faded magenta if selected for inspection
            doomInspectorEmissive = step(float(${inspectorAttributeName} - dInspect), 0.0) * vec3(1.0, 0.0, 1.0) * .1;

            // sector light level
            float dLf = float(doomLight);
            float invLightMapWidth = 1.0 / float(tLightMapWidth);
            vec2 lightUV = vec2(
                mod(dLf, float(tLightMapWidth)),
                floor(dLf * invLightMapWidth) );
            vec4 sectorLight = texture2D( tLightMap, (lightUV + .5) * invLightMapWidth );
            float fullBright = flagBit(texN.y, flag_fullBright);
            doomLightLevel = clamp(scaleLightLevel(sectorLight.g + doomExtraLight + fullBright), 0.0, 1.0);
            `);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars + `
            varying float doomLightLevel;
            varying vec3 doomInspectorEmissive;
            `)
            .replace('#include <map_fragment>', `
            // #include <map_fragment>
            #ifdef USE_MAP

            vec2 mapUV = mod(vMapUv * vDim, vDim) + sUV.xy;
            vec4 sampledDiffuseColor = texture2D( map, mapUV );

            // render shadows (optional)
            sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, vec3(0.0), renderSpectre);
            float n = fract( time * noise( floor(vMapUv * 200.0) ) );
            sampledDiffuseColor.a *= mix(sampledDiffuseColor.a, n, renderSpectre);

            #ifdef DECODE_VIDEO_TEXTURE
                // use inline sRGB decode until browsers properly support SRGB8_ALPHA8 with video textures (#26516)
                sampledDiffuseColor = vec4( mix( pow( sampledDiffuseColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), sampledDiffuseColor.rgb * 0.0773993808, vec3( lessThanEqual( sampledDiffuseColor.rgb, vec3( 0.04045 ) ) ) ), sampledDiffuseColor.w );
            #endif
            diffuseColor *= sampledDiffuseColor;

            #endif

            totalEmissiveRadiance += doomInspectorEmissive;
            `)
            .replace('#include <lights_fragment_begin>', `
            #include <lights_fragment_begin>

            // apply lighting
            material.diffuseContribution.rgb *= doomLightLevel;
            `);
    };

    const depthMaterial = new MeshDepthMaterial();
    depthMaterial.onBeforeCompile = shader => {
        Object.keys(uniforms.val).forEach(key => shader.uniforms[key] = uniforms.val[key])

        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', vertex_pars)
            .replace('#include <uv_vertex>', uv_vertex)
            .replace(`#include <begin_vertex>`, begin_vertex);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars)
            .replace('#include <map_fragment>', depthDist_map_fragment);
    };

    const distanceMaterial = new MeshDistanceMaterial();
    distanceMaterial.onBeforeCompile = shader => {
        Object.keys(uniforms.val).forEach(key => shader.uniforms[key] = uniforms.val[key])

        // ideally we would "face" the light, not the camera but I don't fully understand the threejs shadow code
        // so I'm not quite sure how to do that. For now, this makes the shadow match the rendered sprite.
        // Perhaps rendering sprites as BoxGeometry would be slightly better?
        shader.vertexShader = shader.vertexShader
            .replace('#include <common>', vertex_pars)
            .replace('#include <uv_vertex>', uv_vertex)
            .replace(`#include <begin_vertex>`, begin_vertex);

        shader.fragmentShader = shader.fragmentShader
            .replace('#include <common>', fragment_pars)
            .replace('#include <map_fragment>', depthDist_map_fragment);
    };
    return { material, distanceMaterial, depthMaterial, uniforms };
}

export function createSpriteMaterialTransparent(sprites: SpriteSheet, lighting: MapLighting, params: { cameraMode: string }) {
    const mat = createSpriteMaterial(sprites, lighting, params);
    mat.material.alphaTest = 0;
    mat.material.depthWrite = false;
    mat.material.transparent = true;
    return mat;
}
