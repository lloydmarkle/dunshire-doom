import { FloatType, InstancedBufferAttribute, InstancedMesh, IntType, Matrix4, Object3D, PlaneGeometry, Quaternion, Vector3 } from "three";
import { HALF_PI, MapObjectIndex, MFFlags, PlayerMapObject, type MapObject, type Sprite  } from "../../../doom";
import type { SpriteSheet } from "./SpriteAtlas";
import { inspectorAttributeName } from "../MapMeshMaterial";
import type { SpriteMaterial } from "./Materials";

export function createSpriteGeometry(spriteSheet: SpriteSheet, material: SpriteMaterial) {
    // What is an ideal chunksize? Chunks are probably better than resizing/re-initializing a large array
    // but would 10,000 be good? 20,000? 1,000? I'm not sure how to measure it.
    const chunkSize = 5_000;
    // track last used camera so we spawn chunks of geometry correctly
    let camera = '1p';

    let thingsMeshes: InstancedMesh[] = [];
    const int16BufferFrom = (items: number[], vertexCount: number) => {
        const array = new Uint16Array(items.length * vertexCount);
        for (let i = 0; i < vertexCount * items.length; i += items.length) {
            for (let j = 0; j < items.length; j++) {
                array[i + j] = items[j];
            }
        }
        const attr = new InstancedBufferAttribute(array, items.length);
        attr.gpuType = IntType;
        return attr;
    }

    const floatBufferFrom = (items: number[], vertexCount: number) => {
        const array = new Float32Array(items.length * vertexCount);
        for (let i = 0; i < vertexCount * items.length; i += items.length) {
            for (let j = 0; j < items.length; j++) {
                array[i + j] = items[j];
            }
        }
        const attr = new InstancedBufferAttribute(array, items.length);
        attr.gpuType = FloatType;
        return attr;
    }

    const createChunk = () => {
        const geometry = new PlaneGeometry();
        if (camera !== 'bird') {
            geometry.rotateX(-HALF_PI);
        }
        const mesh = new InstancedMesh(geometry, material.material, chunkSize);
        mesh.customDepthMaterial = material.depthMaterial;
        mesh.customDistanceMaterial = material.distanceMaterial;
        // sector number that lights this object
        mesh.geometry.setAttribute('doomLight', int16BufferFrom([0], chunkSize));
        mesh.geometry.setAttribute(inspectorAttributeName, int16BufferFrom([-1], chunkSize));
        mesh.geometry.setAttribute('vel', floatBufferFrom([0, 0, 0], chunkSize));
        // [speed/tic, movedir, start tics, direction]
        mesh.geometry.setAttribute('motion', floatBufferFrom([0, 0, 0, 0], chunkSize));
        // texture index and fullbright
        mesh.geometry.setAttribute('texN', int16BufferFrom([0, 0], chunkSize));
        mesh.receiveShadow = mesh.castShadow = castShadows;
        mesh.count = 0;
        // NB: transparent objects in particular need frustum culling turned off
        mesh.frustumCulled = false;
        root.add(mesh);
        return mesh;
    }

    const resetGeometry = (cameraMode: string, mat: SpriteMaterial) => {
        camera = cameraMode;
        material = mat;

        const ng = new PlaneGeometry();
        if (camera !== 'bird') {
            ng.rotateX(-HALF_PI);
        }
        for (const mesh of thingsMeshes) {
            mesh.material = material.material;
            mesh.customDepthMaterial = material.depthMaterial;
            mesh.customDistanceMaterial = material.distanceMaterial;
            mesh.geometry.attributes.position = ng.attributes.position;
        }
    }

    // Now that we've got some functions here, maybe a class is better? (because we won't create memory for closures?)
    // It would be interesting to measure it though I'm not sure how
    interface RenderInfo {
        mo: MapObject;
        updateSprite: (sprite: Sprite) => void;
        updatePosition: () => void;
        dispose: () => void;
    }
    const rmobjs = new Map<number, RenderInfo>();

    const freeSlots: number[] = [];

    const mat = new Matrix4();
    const q = new Quaternion();
    const s = new Vector3();
    const add = (mo: MapObject) => {
        let idx = freeSlots.pop() ?? rmobjs.size;

        let m = Math.floor(idx / chunkSize);
        let n = idx % chunkSize;
        if (n === 0 && idx > 0) {
            // this chunk is full
            thingsMeshes[m - 1].count = chunkSize;
        }
        // create new chunk if needed
        if (thingsMeshes.length === m) {
            thingsMeshes.push(createChunk());
            thingsMeshes = thingsMeshes;
        }
        const mesh = thingsMeshes[m];
        // set count on last chunk (assume everything else stays at chunkSize)
        // NB: count will not decrease because removed items may not be at the end of the list
        mesh.count = Math.max(n + 1, mesh.count);

        const isPlayer = mo instanceof PlayerMapObject;
        // mapObject.explode() removes this flag but to offset the sprite properly, we want to preserve it
        const spriteFlags =
            ((mo.info.flags & MFFlags.MF_MISSILE || mo.type === MapObjectIndex.MT_EXTRABFG) ? 2 : 0) |
            ((mo.info.flags & MFFlags.InvertSpriteYOffset) ? 4 : 0);

        const updateSprite = (sprite: Sprite) => {
            mesh.geometry.attributes.texN.array[n * 2] = sprite.state.spriteIndex;

            // // rendering flags
            mesh.geometry.attributes.texN.array[n * 2 + 1] = (
                spriteFlags
                | (sprite.fullbright ? 1 : 0)
                | ((mo.info.flags & MFFlags.MF_SHADOW) ? 8 : 0)
                | ((mo.info.flags & MFFlags.MF_INFLOAT) ? 16 : 0));
                mesh.geometry.attributes.texN.needsUpdate = true;

            // movement info for interpolation
            mesh.geometry.attributes.motion.array[n * 4 + 0] = sprite.ticks ? mo.info.speed / sprite.ticks : 0;
            mesh.geometry.attributes.motion.array[n * 4 + 1] = mo.movedir;
            mesh.geometry.attributes.motion.array[n * 4 + 2] = mo.map.game.time.tick.val + mo.map.game.time.partialTick.val;
            mesh.geometry.attributes.motion.array[n * 4 + 3] = mo.direction;
            mesh.geometry.attributes.motion.needsUpdate = true;
        };

        const updatePosition = () => {
            // use a fixed size so that inspector can hit objects (in material, we'll have to scale by 1/size)
            s.set(40, 40, 80);
            if (isPlayer && camera === '1p') {
                // hide player
                s.set(0, 0, 0);
            }
            mesh.setMatrixAt(n, mat.compose(mo.position, q, s));
            mesh.instanceMatrix.needsUpdate = true;

            // NB: don't interpolate player velocity because they already update every frame
            if (!isPlayer) {
                // velocity for interpolation
                mesh.geometry.attributes.vel.array[n * 3 + 0] = mo.velocity.x;
                mesh.geometry.attributes.vel.array[n * 3 + 1] = mo.velocity.y;
                mesh.geometry.attributes.vel.array[n * 3 + 2] = mo.velocity.z;
                mesh.geometry.attributes.vel.needsUpdate = true;
            }
        };

        const subs = [];
        const dispose = () => {
            subs.forEach(fn => fn());
            rmobjs.delete(mo.id);
            freeSlots.push(idx);

            // We can't actually remove an instanced geometry but we can hide it until something else uses the free slot.
            // We hide by moving it far away or scaling it very tiny (making it effectively invisible)
            s.set(0, 0, 0);
            mesh.setMatrixAt(n, mat.compose(mo.position, q, s));
            mesh.instanceMatrix.needsUpdate = true;
        };

        // custom attributes
        subs.push(mo.sector.subscribe(sec => {
            mesh.geometry.attributes.doomLight.array[n] = sec.num;
            mesh.geometry.attributes.doomLight.needsUpdate = true;
        }));

        mesh.geometry.attributes[inspectorAttributeName].array[n] = mo.id;
        mesh.geometry.attributes[inspectorAttributeName].needsUpdate = true;

        updateSprite(mo.sprite.val);
        updatePosition();
        const rInfo = { mo, dispose, updateSprite, updatePosition };
        rmobjs.set(mo.id, rInfo);
        return rInfo;
    }

    const remove = (mo: MapObject) => rmobjs.get(mo.id)?.dispose();

    const dispose = () => {
        for (const rinfo of rmobjs.values()) {
            rinfo.dispose();
        }
    }

    let castShadows = false;
    const shadowState = (val: boolean) => {
        castShadows = val;
        thingsMeshes.forEach(m => m.castShadow = m.receiveShadow = castShadows);
    };

    const root = new Object3D();
    root.frustumCulled = false;
    return { add, remove, dispose, root, shadowState, resetGeometry };
}