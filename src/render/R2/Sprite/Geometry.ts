import { FloatType, InstancedBufferAttribute, InstancedMesh, IntType, Matrix4, Object3D, PlaneGeometry, Quaternion, Vector3 } from "three";
import { HALF_PI, MapObjectIndex, MFFlags, PlayerMapObject, type MapObject, type Sector, type Sprite  } from "../../../doom";
import type { SpriteSheet } from "./SpriteAtlas";
import { inspectorAttributeName } from "../MapMeshMaterial";
import type { SpriteMaterial } from "./Materials";

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

// temporary variables for positioning instanced geometry
const mat = new Matrix4();
const q = new Quaternion();
const s = new Vector3();

class RenderSprite {
    private lastSector: Sector = null;
    private isPlayer: boolean;
    private fixedSpriteFlags: number;

    constructor(
        readonly idx: number, public mo: MapObject,
        private mesh: InstancedMesh, private n: number,
        private env: { camera: string },
    ) {
        this.isPlayer = mo instanceof PlayerMapObject;
        // mapObject.explode() removes this flag but to offset the sprite properly, we want to preserve it
        this.fixedSpriteFlags = ((mo.info.flags & MFFlags.MF_MISSILE || mo.type === MapObjectIndex.MT_EXTRABFG) ? 2 : 0);

        // inspector attributes
        mesh.geometry.attributes[inspectorAttributeName].array[n] = mo.id;
        mesh.geometry.attributes[inspectorAttributeName].needsUpdate = true;
    }

    updateSprite(sprite: Sprite) {
        this.mesh.geometry.attributes.texN.array[this.n * 2] = sprite.state.spriteIndex;

        // rendering flags
        this.mesh.geometry.attributes.texN.array[this.n * 2 + 1] = (
            this.fixedSpriteFlags
            | (sprite.fullbright ? 1 : 0)
            | ((this.mo.info.flags & MFFlags.InvertSpriteYOffset) ? 4 : 0)
            | ((this.mo.info.flags & MFFlags.MF_SHADOW) ? 8 : 0)
            | ((this.mo.info.flags & MFFlags.MF_INFLOAT) ? 16 : 0));
        this.mesh.geometry.attributes.texN.needsUpdate = true;

        // movement info for interpolation
        this.mesh.geometry.attributes.motion.array[this.n * 4 + 0] = sprite.ticks ? this.mo.info.speed / sprite.ticks : 0;
        this.mesh.geometry.attributes.motion.array[this.n * 4 + 1] = this.mo.movedir;
        this.mesh.geometry.attributes.motion.array[this.n * 4 + 2] = this.mo.map.game.time.tick.val;
        this.mesh.geometry.attributes.motion.array[this.n * 4 + 3] = this.mo.direction;
        this.mesh.geometry.attributes.motion.needsUpdate = true;
    };

    updatePosition() {
        // use a fixed size so that inspector can hit objects (in material, we'll have to scale by 1/size)
        s.set(40, 40, 80);
        if (this.isPlayer && this.env.camera === '1p') {
            // hide player
            s.set(0, 0, 0);
        }
        this.mesh.setMatrixAt(this.n, mat.compose(this.mo.position, q, s));
        this.mesh.instanceMatrix.needsUpdate = true;

        if (this.lastSector !== this.mo.sector) {
            this.lastSector = this.mo.sector;
            this.mesh.geometry.attributes.doomLight.array[this.n] = this.mo.sector.num;
            this.mesh.geometry.attributes.doomLight.needsUpdate = true;
        }

        // NB: don't interpolate player velocity because they already update every frame
        if (!this.isPlayer) {
            // velocity for interpolation
            this.mesh.geometry.attributes.vel.array[this.n * 3 + 0] = this.mo.velocity.x;
            this.mesh.geometry.attributes.vel.array[this.n * 3 + 1] = this.mo.velocity.y;
            this.mesh.geometry.attributes.vel.array[this.n * 3 + 2] = this.mo.velocity.z;
            this.mesh.geometry.attributes.vel.needsUpdate = true;
        }
    };

    dispose() {
        // We can't actually remove an instanced geometry but we can hide it until something else uses the free slot.
        // We hide by moving it far away or scaling it very tiny (making it effectively invisible)
        s.set(0, 0, 0);
        this.mesh.setMatrixAt(this.n, mat.compose(this.mo.position, q, s));
        this.mesh.instanceMatrix.needsUpdate = true;
    }
}

export function createSpriteGeometry(spriteSheet: SpriteSheet, material: SpriteMaterial) {
    // What is an ideal chunksize? Chunks are probably better than resizing/re-initializing a large array
    // but would 10,000 be good? 20,000? 1,000? I'm not sure how to measure it.
    const chunkSize = 5_000;
    // track last used camera so we spawn chunks of geometry correctly
    let env = { camera: '1p' };

    let thingsMeshes: InstancedMesh[] = [];
    const createChunk = () => {
        const geometry = new PlaneGeometry();
        if (env.camera !== 'bird') {
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
        env.camera = cameraMode;
        material = mat;

        const ng = new PlaneGeometry();
        if (env.camera !== 'bird') {
            ng.rotateX(-HALF_PI);
        }
        for (const mesh of thingsMeshes) {
            mesh.material = material.material;
            mesh.customDepthMaterial = material.depthMaterial;
            mesh.customDistanceMaterial = material.distanceMaterial;
            mesh.geometry.attributes.position = ng.attributes.position;
        }
    }

    const rmobjs = new Map<number, RenderSprite>();
    const freeSlots: number[] = [];

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

        const rInfo = new RenderSprite(idx, mo, mesh, n, env);
        rInfo.updateSprite(mo.sprite.val);
        rInfo.updatePosition();
        rmobjs.set(mo.id, rInfo);
        return rInfo;
    }

    const remove = (mo: MapObject) => {
        const rInfo = rmobjs.get(mo.id);
        if (rInfo) {
            rmobjs.delete(rInfo.mo.id);
            freeSlots.push(rInfo.idx);
            rInfo.dispose();
        }
    }

    const dispose = () => {
        for (const rinfo of rmobjs.values()) {
            rinfo.dispose();
        }
        rmobjs.clear();
        freeSlots.length = 0;
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