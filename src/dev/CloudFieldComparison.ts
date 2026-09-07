import { MeshBasicNodeMaterial, QuadMesh, RenderTarget, type WebGPURenderer } from "three/webgpu";
import { OrthographicCamera, PlaneGeometry, Mesh, Scene, ShaderMaterial, Vector2,
  WebGLRenderer, WebGLRenderTarget, NoToneMapping } from "three";
import { uv, vec3, float } from "three/tsl";
import { createCloudFieldNodes } from "../world/sky/WorldCloudFieldNodes";
import { WORLD_CLOUD_FIELD_GLSL, WORLD_CLOUD_VERTICAL_PROFILE_GLSL } from "../world/sky/WorldCloudFieldShader";
import type { RuntimeProfile } from "../runtime/RuntimeConfig";
import { readRenderTargetRgba8 } from "../render/RenderTargetReadback";

/** Dev-only GPU comparison against the unchanged legacy equations. */
export async function compareCloudField(renderer: WebGPURenderer, profile: RuntimeProfile) {
  const width = 96, height = 64;
  const config = profile.cloud;
  const field = createCloudFieldNodes(config, profile.compact);
  field.time.value = 120;
  const world = uv().sub(0.5).mul(16384);
  const material = new MeshBasicNodeMaterial({ depthTest: false, depthWrite: false, toneMapped: false });
  material.colorNode = vec3(field.density(world).x, field.verticalProfile(world, float(0.5)), field.fbm(world.mul(0.001)));
  const quad = new QuadMesh(material);
  const target = new RenderTarget(width, height, { depthBuffer: false });
  const legacy = new WebGLRenderer({ antialias: false });
  legacy.toneMapping = NoToneMapping;
  const legacyTarget = new WebGLRenderTarget(width, height, { depthBuffer: false });
  const legacyMaterial = new ShaderMaterial({ depthTest: false, depthWrite: false, toneMapped: false,
    defines: profile.compact ? { WORLD_CLOUD_COMPACT: 1 } : {},
    uniforms: {
      uTime: { value: 120 }, uCloudWind: { value: new Vector2(config.windX, config.windZ) },
      uCloudDetailWind: { value: new Vector2(config.detailWindX, config.detailWindZ) },
      uCloudMacroScale: { value: config.macroScale }, uCloudDetailScale: { value: config.detailScale },
      uCloudWeatherScale: { value: config.weatherScale }, uCloudCoverage: { value: config.coverage },
      uCloudSoftness: { value: config.softness },
    },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float uTime; uniform vec2 uCloudWind;
      uniform vec2 uCloudDetailWind; uniform float uCloudMacroScale; uniform float uCloudDetailScale;
      uniform float uCloudWeatherScale; uniform float uCloudCoverage; uniform float uCloudSoftness;
      ${WORLD_CLOUD_FIELD_GLSL}\n${WORLD_CLOUD_VERTICAL_PROFILE_GLSL}
      void main(){vec2 p=(vUv-0.5)*16384.0;float w=0.0;float d=0.0;
      gl_FragColor=vec4(cloudDensity(p,w,d),cloudVerticalProfile(p,0.5),cloudFbm(p*0.001),1.0);}`,
  });
  const geometry = new PlaneGeometry(2, 2);
  const scene = new Scene();
  scene.add(new Mesh(geometry, legacyMaterial));
  const previous = renderer.getRenderTarget();
  try {
    renderer.setRenderTarget(target);
    quad.render(renderer);
    const nodePixels = await readRenderTargetRgba8(renderer, target, width, height);
    legacy.setRenderTarget(legacyTarget);
    legacy.render(scene, new OrthographicCamera(-1, 1, 1, -1, 0, 1));
    const pixels = new Uint8Array(width * height * 4);
    legacy.readRenderTargetPixels(legacyTarget, 0, 0, width, height, pixels);
    const compare = (flip: boolean) => {
      let maximum = 0, total = 0;
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
        const delta = Math.abs(Number(nodePixels[(y * width + x) * 4 + c]) - pixels[((flip ? height - y - 1 : y) * width + x) * 4 + c]);
        maximum = Math.max(maximum, delta); total += delta;
      }
      return { maximum, mean: total / (width * height * 3), flippedRows: flip };
    };
    const direct = compare(false), flipped = compare(true);
    return { width, height, compact: profile.compact, ...(direct.mean <= flipped.mean ? direct : flipped) };
  } finally {
    renderer.setRenderTarget(previous);
    material.dispose(); target.dispose(); legacyMaterial.dispose(); geometry.dispose();
    legacyTarget.dispose(); legacy.dispose();
  }
}
