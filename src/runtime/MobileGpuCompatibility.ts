const PATCH_FLAG = "__drusnielMobileGrassImpostorPatch" as const;
const IMPOSTOR_ATLAS_MARKER = "uniform sampler2D uAtlas;";
const IMPOSTOR_FRAME_MARKER = "vec4 sampleFrame(";
const COMPACT_MIP_SAMPLE =
  "return textureLod(uAtlas, atlasUv, log2(max(texelsPerPixel, 1.0)));";
const BASE_LEVEL_SAMPLE = "return textureLod(uAtlas, atlasUv, 0.0);";
const ALPHA_CUTOFF_MARKER = "  float cutoff = mix(";
const INVALID_ATLAS_GUARD = `  bool validAtlasSample =\n    atlasColor.a >= 0.0 && atlasColor.a <= 1.0 &&\n    all(greaterThanEqual(atlasColor.rgb, vec3(0.0))) &&\n    all(lessThanEqual(atlasColor.rgb, vec3(1.0)));\n  // Transparent canvas texels must never become opaque black card pixels.\n  if (\n    !validAtlasSample ||\n    (atlasColor.a > 0.99 && dot(atlasColor.rgb, atlasColor.rgb) < 1e-6)\n  ) {\n    discard;\n  }\n\n`;

type ShaderSourceFunction = (shader: WebGLShader, source: string) => void;
type ShaderSourcePrototype = {
  shaderSource?: ShaderSourceFunction;
  [PATCH_FLAG]?: boolean;
};

/**
 * Keeps the compact grass impostor path off unstable generated mip levels.
 * Desktop rendering remains untouched.
 */
export function installMobileGpuCompatibility(compact: boolean): void {
  if (!compact) {
    return;
  }

  patchPrototype(globalThis.WebGL2RenderingContext?.prototype);
  patchPrototype(globalThis.WebGLRenderingContext?.prototype);
}

function patchPrototype(candidate: unknown): void {
  if (!candidate || typeof candidate !== "object") {
    return;
  }

  const prototype = candidate as ShaderSourcePrototype;
  if (prototype[PATCH_FLAG] || typeof prototype.shaderSource !== "function") {
    return;
  }

  const originalShaderSource = prototype.shaderSource;
  Object.defineProperty(prototype, PATCH_FLAG, { value: true });
  prototype.shaderSource = function shaderSource(
    shader: WebGLShader,
    source: string,
  ): void {
    originalShaderSource.call(this, shader, patchImpostorFragment(source));
  };
}

function patchImpostorFragment(source: string): string {
  if (
    !source.includes(IMPOSTOR_ATLAS_MARKER) ||
    !source.includes(IMPOSTOR_FRAME_MARKER) ||
    !source.includes(COMPACT_MIP_SAMPLE)
  ) {
    return source;
  }

  const baseLevelSource = source.replace(COMPACT_MIP_SAMPLE, BASE_LEVEL_SAMPLE);
  if (
    baseLevelSource.includes(INVALID_ATLAS_GUARD) ||
    !baseLevelSource.includes(ALPHA_CUTOFF_MARKER)
  ) {
    return baseLevelSource;
  }

  return baseLevelSource.replace(
    ALPHA_CUTOFF_MARKER,
    `${INVALID_ATLAS_GUARD}${ALPHA_CUTOFF_MARKER}`,
  );
}
