import * as THREE from "three";
import { WorldConfigLoader } from "../WorldConfigLoader";
import {
  applyStoneCoarseSurfaceShader,
  applyStoneSurfaceShader,
} from "./StoneGrowthShader";

interface ShaderProbe {
  uniforms: Record<string, { value: unknown }>;
  vertexShader: string;
  fragmentShader: string;
}

function fail(message: string): never {
  throw new Error(`[stones-shader] ${message}`);
}

function assert(condition: boolean, message: string): asserts condition {
  if (!condition) fail(message);
}

function probe(material: THREE.MeshLambertMaterial): ShaderProbe {
  const shader: ShaderProbe = {
    uniforms: {},
    vertexShader: "#include <common>\n#include <begin_vertex>",
    fragmentShader:
      "#include <common>\n#include <color_fragment>\n" +
      "#include <normal_fragment_begin>\n#include <opaque_fragment>",
  };
  material.onBeforeCompile(
    shader as unknown as THREE.WebGLProgramParametersWithUniforms,
    {} as THREE.WebGLRenderer,
  );
  return shader;
}

/** Verifies that far stones cannot regress into the near procedural shader. */
export function verifyStoneShaderPerformance(configSource: string): string {
  const config = new WorldConfigLoader().parse(configSource);

  const detailedMaterial = new THREE.MeshLambertMaterial({
    vertexColors: true,
  });
  applyStoneSurfaceShader(detailedMaterial, config);
  const detailed = probe(detailedMaterial);
  assert(
    detailed.fragmentShader.includes("stoneGrowthDistanceSquared") &&
      detailed.fragmentShader.includes("stoneColony(") &&
      detailed.fragmentShader.includes("stoneBedDistance") &&
      detailed.vertexShader.includes("stoneBedding") &&
      detailed.fragmentShader.includes("stoneSkySide") &&
      !detailed.fragmentShader.includes("distance(stoneGrowthLocalPosition"),
    "Detailed stone shader must keep bounded close detail and sky-side ambient.",
  );

  // Grain has two independent terms and the shipped world runs only the normal
  // one, so "the grain is on" is not enough: the bump has to reach the normal
  // chain, and its derivatives have to sit outside the fade branch or the fade
  // boundary shades wrong.
  const bumpConfig = { ...config, stoneGrainNormalStrength: 0.09 };
  const bumpMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  // A stand-in binding: the shader only needs a texture to exist to inject the
  // grain path, and constructing a real one needs a document this runs without.
  applyStoneSurfaceShader(
    bumpMaterial,
    bumpConfig,
    {} as unknown as THREE.Texture,
  );
  const bumped = probe(bumpMaterial);
  const bumpSegment = bumped.fragmentShader.slice(
    bumped.fragmentShader.indexOf("#include <normal_fragment_begin>"),
  );
  const bumpDerivative = bumpSegment.indexOf("dFdx(stoneGrain)");
  assert(
    bumpSegment.includes("stoneBumpGradient") &&
      bumpSegment.includes("uStoneGrainNormalStrength") &&
      bumpDerivative >= 0 &&
      !bumpSegment.slice(0, bumpDerivative).includes("if"),
    "Grain bump must perturb the shading normal with unbranched derivatives.",
  );
  bumpMaterial.dispose();

  const coarseMaterial = new THREE.MeshLambertMaterial({ vertexColors: true });
  applyStoneCoarseSurfaceShader(coarseMaterial);
  const coarse = probe(coarseMaterial);
  assert(
    !coarse.fragmentShader.includes("stoneGrowthNoise") &&
      !coarse.fragmentShader.includes("cameraPosition") &&
      !coarse.vertexShader.includes("stoneGrowthPosition") &&
      !coarse.fragmentShader.includes("stoneBedDistance") &&
      !coarse.fragmentShader.includes("stoneSheen") &&
      coarse.vertexShader.includes("stoneWet") &&
      coarse.fragmentShader.includes("uStoneWetDarken") &&
      coarse.fragmentShader.includes(
        "mix(1.0, uStoneWetDarken, vStoneWet)",
      ) &&
      coarse.uniforms.uStoneWetDarken !== undefined &&
      coarse.fragmentShader.includes("stoneSkySide") &&
      coarse.fragmentShader.includes("vStoneMoss"),
    "Coarse stone shader must keep wet albedo and sky ambient without near procedural work or sheen.",
  );

  detailedMaterial.dispose();
  coarseMaterial.dispose();
  return "bounded near bedding/fades · unbranched grain bump · coarse wet-albedo parity · shared sky-side ambient · noise-free coarse shader";
}
