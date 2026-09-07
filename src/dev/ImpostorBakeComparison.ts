import {
  AmbientLight, Box3, BoxGeometry, ConeGeometry, Group, Mesh, MeshBasicNodeMaterial,
  Scene, WebGPUCoordinateSystem, type WebGPURenderer,
} from "three/webgpu";
import { MeshBasicMaterial, WebGLRenderer } from "three";
import { OctahedralImpostorBaker } from "../grass/impostors/OctahedralImpostorBaker";
import { OctahedralImpostorNodeBaker } from "../grass/impostors/OctahedralImpostorNodeBaker";
import { disposeResources } from "../render/ResourceDisposal";

const CONFIG = { viewsPerAxis: 4, frameResolution: 24, padding: 2, cameraMargin: 1.2 };
const FACE_COLORS = [0xd94f3d, 0x3fa34d, 0x3b6fd9, 0xd9c23d, 0x8b3fd9, 0xd9853f];

/**
 * A source whose every side is a different colour.
 *
 * The atlas packs one view per cell, so a source that looks the same from every
 * direction would let a wrong cell, a wrong row order or a swapped view pass
 * unnoticed. The cone breaks the symmetry between up and down as well.
 */
function createSource(node: boolean): Group {
  const group = new Group();
  const box = new BoxGeometry(1, 1, 1);
  const materials = FACE_COLORS.map(color => node
    ? new MeshBasicNodeMaterial({ color }) : new MeshBasicMaterial({ color }));
  group.add(new Mesh(box, materials));
  const cone = new ConeGeometry(0.42, 0.9, 12);
  const coneMesh = new Mesh(cone, node
    ? new MeshBasicNodeMaterial({ color: 0xf2f0e6 }) : new MeshBasicMaterial({ color: 0xf2f0e6 }));
  coneMesh.position.set(0.1, 0.85, -0.15);
  group.add(coneMesh);
  return group;
}

/**
 * Compares the portable impostor exporter against the shipped WebGL one.
 *
 * The exported PNG is consumed by the atlas factory and the QA scene, so the
 * two bakers have to agree texel for texel, not merely produce similar-looking
 * atlases. Both readbacks are brought into the canvas row order the encoder
 * uses before they are compared, which is exactly the orientation decision the
 * node baker has to get right.
 */
export async function compareImpostorBake(renderer: WebGPURenderer) {
  const legacy = new WebGLRenderer({ antialias: false });
  const nodeScene = new Scene();
  const legacyScene = new Scene();
  const nodeSource = createSource(true);
  const legacySource = createSource(false);
  nodeScene.add(nodeSource, new AmbientLight(0xffffff, 1));
  legacyScene.add(legacySource, new AmbientLight(0xffffff, 1));
  nodeScene.updateMatrixWorld(true);
  legacyScene.updateMatrixWorld(true);
  const bounds = new Box3().setFromObject(nodeSource);
  try {
    const legacyResult = await new OctahedralImpostorBaker(legacy)
      .bake({ scene: legacyScene, source: legacySource, bounds, config: CONFIG });
    const nodeResult = await new OctahedralImpostorNodeBaker(renderer)
      .bake({ scene: nodeScene, source: nodeSource, bounds, config: CONFIG });

    const atlasSize = nodeResult.metadata.atlasSize;
    const flip = renderer.coordinateSystem === WebGPUCoordinateSystem;
    let maximum = 0, total = 0, covered = 0, legacyCovered = 0, differing = 0;
    for (let y = 0; y < atlasSize; y++) for (let x = 0; x < atlasSize; x++) {
      const offset = (y * atlasSize + x) * 4;
      // The legacy readback is bottom-up; the node readback is top-down on
      // WebGPU and bottom-up on WebGL 2, exactly as the encoder is told.
      const reference = ((flip ? atlasSize - y - 1 : y) * atlasSize + x) * 4;
      if (nodeResult.pixels[offset + 3] > 8) covered++;
      if (legacyResult.pixels[reference + 3] > 8) legacyCovered++;
      for (let channel = 0; channel < 4; channel++) {
        const delta = Math.abs(nodeResult.pixels[offset + channel]
          - legacyResult.pixels[reference + channel]);
        maximum = Math.max(maximum, delta); total += delta;
        if (delta > 1) differing++;
      }
    }
    const metadataMatches = JSON.stringify(nodeResult.metadata)
      === JSON.stringify(legacyResult.metadata);
    return { atlasSize, maximum, mean: total / (atlasSize * atlasSize * 4), differing,
      covered, legacyCovered, metadataMatches, frames: nodeResult.metadata.frames.length,
      atlasBytes: nodeResult.atlas.size, flippedRows: flip };
  } finally {
    const materials = [...nodeSource.children, ...legacySource.children]
      .flatMap(child => child instanceof Mesh
        ? [child.geometry, ...(Array.isArray(child.material) ? child.material : [child.material])]
        : []);
    disposeResources([...materials, legacy]);
    nodeScene.clear();
    legacyScene.clear();
  }
}
