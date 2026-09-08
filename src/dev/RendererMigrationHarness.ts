import { AmbientLight, BoxGeometry, Color, DataTexture, DirectionalLight,
  DoubleSide, InstancedMesh, Matrix4, Mesh, MeshBasicNodeMaterial,
  MeshStandardNodeMaterial, PerspectiveCamera, PlaneGeometry, RenderPipeline,
  RGBAFormat, Scene, SRGBColorSpace, UnsignedByteType, Vector3 } from "three/webgpu";
import { pass, texture, uv, float } from "three/tsl";
import { createRendererSession, resolveRendererRequest, type RendererSession } from "../render/RendererSession";
import { disposeResources, type DisposableResource } from "../render/ResourceDisposal";
import { RuntimeConfigLoader } from "../runtime/RuntimeConfigLoader";
import { resolveRuntimeProfile } from "../runtime/ViewportProfile";
import { createRendererSceneryFixture } from "./RendererSceneryFixture";

/** Development fixture only. This is deliberately not a replacement world. */
export class RendererMigrationHarness {
  private readonly scene = new Scene();
  private readonly camera = new PerspectiveCamera(45, 1, 0.1, 100);
  private readonly owned: DisposableResource[] = [];
  private pipeline?: RenderPipeline;
  private frame = 0;
  private disposed = false;
  private running = false;
  private readonly swatchPixels = new Uint8Array([40, 150, 50, 255]);
  private swatch?: DataTexture;
  private scenery?: ReturnType<typeof createRendererSceneryFixture>;
  private grass?: { update(elapsedSeconds: number): void };

  private constructor(private readonly session: RendererSession) {}

  static async create(canvas: HTMLCanvasElement): Promise<RendererMigrationHarness> {
    const session = await createRendererSession({
      request: resolveRendererRequest(window.location.search), options: { canvas, antialias: true },
    });
    const harness = new RendererMigrationHarness(session);
    try {
      harness.initialize();
      const params = new URLSearchParams(window.location.search);
      if (params.get("materialFixture") === "palette") {
        const { compareGrassPalette } = await import("./GrassPaletteComparison");
        session.renderer.domElement.dataset.paletteComparison = JSON.stringify(await compareGrassPalette(session.renderer));
      }
      if (params.get("materialFixture") === "grass") {
        const variant = params.get("profile") === "compact" ? "compact" : "desktop";
        const { createRendererGrassFixture } = await import("./RendererGrassFixture");
        harness.grass = harness.own(createRendererGrassFixture(harness.scene, variant));
        harness.camera.position.set(0, 0.62, 2.35);
        harness.camera.near = 0.05;
        harness.camera.lookAt(0, 0.2, 0);
        harness.camera.updateProjectionMatrix();
        const { compareGrassNearMaterial } = await import("./GrassNearComparison");
        const reports = [];
        // Both variants run on either profile: the compact feature set is a
        // material selection, not a device capability, and a desktop-only check
        // would leave the sine gust and the vertex palette unverified.
        for (const compared of ["desktop", "compact", "islandNear", "islandMid"] as const) {
          for (const mode of ["deformation", "albedo", "ambient", "directional"] as const) {
            reports.push(await compareGrassNearMaterial(session.renderer, compared, mode));
          }
        }
        session.renderer.domElement.dataset.grassComparison = JSON.stringify(reports);
      }
      if (params.get("materialFixture") === "impostor") {
        const { createRendererImpostorFixture } = await import("./RendererImpostorFixture");
        harness.grass = harness.own(createRendererImpostorFixture(harness.scene,
          params.get("profile") === "compact" ? "compact" : "desktop"));
        harness.camera.position.set(0, 1.6, 4.5);
        harness.camera.far = 200;
        harness.camera.lookAt(0, 0.6, -14);
        harness.camera.updateProjectionMatrix();
        const { compareGrassImpostorMaterial } = await import("./GrassImpostorComparison");
        const reports = [];
        for (const compared of ["desktop", "compact"] as const) {
          reports.push(await compareGrassImpostorMaterial(session.renderer, compared));
        }
        session.renderer.domElement.dataset.impostorComparison = JSON.stringify(reports);
      }
      if (params.get("materialFixture") === "foliage") {
        const { createRendererFoliageFixture } = await import("./RendererFoliageFixture");
        harness.grass = harness.own(createRendererFoliageFixture(harness.scene,
          params.get("profile") === "compact" ? "compact" : "desktop"));
        harness.camera.position.set(0, 0.55, 1.6);
        harness.camera.near = 0.05;
        harness.camera.lookAt(0, 0.25, -6);
        harness.camera.updateProjectionMatrix();
        const { compareGrassFoliageMaterial } = await import("./GrassFoliageComparison");
        const reports = [];
        for (const compared of ["desktop", "compact"] as const) {
          for (const singlePass of [true, false]) {
            reports.push(await compareGrassFoliageMaterial(session.renderer, compared, singlePass));
          }
        }
        session.renderer.domElement.dataset.foliageComparison = JSON.stringify(reports);
      }
      if (params.get("materialFixture") === "trail") {
        const { compareGrassTrailPass } = await import("./GrassTrailComparison");
        const scrolled = await compareGrassTrailPass(session.renderer, 24, true);
        const stationary = await compareGrassTrailPass(session.renderer, 24, false);
        session.renderer.domElement.dataset.trailComparison =
          JSON.stringify([scrolled, stationary]);
      }
      if (params.get("materialFixture") === "bake") {
        const { compareImpostorBake } = await import("./ImpostorBakeComparison");
        session.renderer.domElement.dataset.bakeComparison =
          JSON.stringify(await compareImpostorBake(session.renderer));
      }
      if (params.get("materialFixture") === "stone") {
        const { WorldConfigLoader } = await import("../world/WorldConfigLoader");
        const worldConfig = await new WorldConfigLoader().load();
        const { compareStoneSurface } = await import("./StoneSurfaceComparison");
        const reports = [];
        for (const variant of ["detail", "coarse"] as const) {
          for (const mode of ["albedo", "normal", "lit"] as const) {
            if (variant === "coarse" && mode === "normal") continue;
            reports.push(await compareStoneSurface(session.renderer, worldConfig, variant, mode));
          }
        }
        session.renderer.domElement.dataset.stoneComparison = JSON.stringify(reports);
        const { verifyStoneNodeShaderPerformance } = await import("./StoneShaderNodeVerification");
        session.renderer.domElement.dataset.stoneShader =
          JSON.stringify(await verifyStoneNodeShaderPerformance(session.renderer, worldConfig));
      }
      if (params.get("materialFixture") === "actor") {
        const { compareActorEnvironment } = await import("./ActorEnvironmentComparison");
        // The unpatched run is the control: it records what the two lighting
        // implementations differ by on their own, so the patched run is judged
        // against that rather than against an absolute zero it cannot reach.
        const reports = [];
        for (const feature of
          ["flat", "vertexColors", "map", "skinned", "backSide"] as const) {
          for (const respond of [false, true]) {
            reports.push(await compareActorEnvironment(session.renderer, feature, respond));
          }
        }
        session.renderer.domElement.dataset.actorComparison = JSON.stringify(reports);
      }
      if (params.get("materialFixture") === "cloudresponse") {
        const { compareCloudShadowResponse } = await import("./CloudShadowResponseComparison");
        const reports = [];
        // Full strength is the grass and terrain case; the reduced strength is
        // what the horizon takes, and it is a separate compiled constant on the
        // legacy side rather than a uniform.
        for (const strength of [1, 0.45]) {
          reports.push(await compareCloudShadowResponse(session.renderer, strength));
        }
        session.renderer.domElement.dataset.cloudResponseComparison = JSON.stringify(reports);
      }
      if (params.get("materialFixture") === "water") {
        const { WorldConfigLoader } = await import("../world/WorldConfigLoader");
        const worldConfig = await new WorldConfigLoader().load();
        const { compareWaterBed } = await import("./WaterBedComparison");
        const reports = [];
        for (const compact of [false, true]) {
          reports.push(await compareWaterBed(session.renderer, worldConfig, compact));
        }
        session.renderer.domElement.dataset.waterComparison = JSON.stringify(reports);
        const { compareWaterSurface } = await import("./WaterSurfaceComparison");
        const surface = [];
        // Albedo and alpha run both optics presets because the branch is what
        // separates them; the normal and the roughness are the same shader
        // either way, so a second run of each would measure nothing new.
        for (const quality of [0, 1]) {
          surface.push(await compareWaterSurface(session.renderer, worldConfig, "albedo", quality));
          surface.push(await compareWaterSurface(session.renderer, worldConfig, "alpha", quality));
        }
        surface.push(await compareWaterSurface(session.renderer, worldConfig, "normal", 1));
        surface.push(await compareWaterSurface(session.renderer, worldConfig, "roughness", 1));
        surface.push(await compareWaterSurface(session.renderer, worldConfig, "albedo", 1, true));
        session.renderer.domElement.dataset.waterSurfaceComparison = JSON.stringify(surface);
        const { compareWaterCascade } = await import("./WaterCascadeComparison");
        const cascade = [];
        for (const channel of ["albedo", "alpha"] as const) {
          for (const compact of [false, true]) {
            cascade.push(
              await compareWaterCascade(session.renderer, worldConfig, channel, compact));
          }
        }
        session.renderer.domElement.dataset.cascadeComparison = JSON.stringify(cascade);
        const { compareWaterRefraction } = await import("./WaterRefractionComparison");
        const refraction = [];
        for (const channel of ["capture", "coverage"] as const) {
          refraction.push(await compareWaterRefraction(session.renderer, channel));
        }
        session.renderer.domElement.dataset.refractionComparison = JSON.stringify(refraction);
      }
      if (params.get("materialFixture") === "terrain") {
        const { WorldConfigLoader } = await import("../world/WorldConfigLoader");
        const { createRendererTerrainFixture } = await import("./RendererTerrainFixture");
        const worldConfig = await new WorldConfigLoader().load();
        harness.own(createRendererTerrainFixture(harness.scene, worldConfig, params.get("profile") === "compact"));
        harness.camera.position.set(38, 28, 45);
        harness.camera.far = 500;
        harness.camera.lookAt(0, 0, 0);
        harness.camera.updateProjectionMatrix();
        const { compareTerrainMaterial } = await import("./TerrainMaterialComparison");
        session.renderer.domElement.dataset.terrainComparison = JSON.stringify(await compareTerrainMaterial(session.renderer, worldConfig, params.get("profile") === "compact"));
        session.renderer.domElement.dataset.terrainNormalComparison = JSON.stringify(await compareTerrainMaterial(session.renderer, worldConfig, params.get("profile") === "compact", "normal"));
      }
      if (["scenery", "volume"].includes(params.get("materialFixture") ?? "")) {
        const config = await new RuntimeConfigLoader().load("./config/runtime.yaml");
        const profile = resolveRuntimeProfile(config, { compact: params.get("profile") === "compact" });
        harness.camera.far = 10000;
        harness.camera.lookAt(0, 5, -20);
        harness.camera.updateProjectionMatrix();
        harness.scenery = harness.own(createRendererSceneryFixture(harness.scene, profile,
          session.renderer, session.capabilities, harness.camera, params.get("materialFixture") === "volume"));
        session.renderer.domElement.dataset.skyEnvironment = String(harness.scene.environment !== null);
        if (params.get("verifyCloudField") === "1") {
          const { compareCloudField } = await import("./CloudFieldComparison");
          const report = await compareCloudField(session.renderer, profile);
          session.renderer.domElement.dataset.cloudComparison = JSON.stringify(report);
          const { compareSkyMaterial, compareHorizonMaterial } = await import("./SceneryMaterialComparison");
          session.renderer.domElement.dataset.skyComparison = JSON.stringify(await compareSkyMaterial(session.renderer, profile));
          session.renderer.domElement.dataset.horizonComparison = JSON.stringify(await compareHorizonMaterial(session.renderer));
          const { compareCloudShadows } = await import("./CloudShadowComparison");
          session.renderer.domElement.dataset.shadowComparison = JSON.stringify(await compareCloudShadows(session.renderer, profile, session.capabilities));
          if (params.get("materialFixture") === "volume") {
            const { compareCloudVolume } = await import("./CloudVolumeComparison");
            session.renderer.domElement.dataset.volumeComparison = JSON.stringify(await compareCloudVolume(session.renderer, profile));
            const { compareCloudTemporal } = await import("./CloudTemporalComparison");
            session.renderer.domElement.dataset.temporalComparison = JSON.stringify(await compareCloudTemporal(session.renderer, profile));
          }
        }
      }
      await session.renderer.compileAsync(harness.scene, harness.camera);
      if (params.get("dumpTerrainShader") === "1") {
        const terrain = harness.scene.children.find(object => object instanceof Mesh && object.material.name === "world-terrain-node-material");
        if (terrain) Object.assign(window, { terrainShader: await session.renderer.debug.getShaderAsync(harness.scene, harness.camera, terrain) });
      }
      session.renderer.domElement.dataset.materialReady = "true";
      return harness;
    } catch (error) {
      harness.dispose();
      throw error;
    }
  }

  private own<T extends DisposableResource>(resource: T): T {
    this.owned.push(resource);
    return resource;
  }

  private initialize(): void {
    const { renderer, diagnostics, capabilities } = this.session;
    this.scene.background = new Color("#607a95");
    this.camera.position.set(7, 6, 10);
    this.camera.lookAt(0, 0, 0);
    this.scene.add(new AmbientLight(0xffffff, 1.5));
    const sun = new DirectionalLight(0xffffff, 3);
    sun.position.set(3, 7, 4);
    this.scene.add(sun);
    const ground = new Mesh(this.own(new PlaneGeometry(12, 12)),
      this.own(new MeshStandardNodeMaterial({ color: "#677c40", roughness: 0.9 })));
    ground.rotation.x = -Math.PI / 2;
    this.scene.add(ground);

    const box = this.own(new BoxGeometry(0.85, 0.85, 0.85));
    for (const [index, color] of ["#ffffff", "#808080", "#ff0000", "#00ff00", "#0000ff"].entries()) {
      const cube = new Mesh(box, this.own(new MeshBasicNodeMaterial({ color })));
      cube.position.set(index * 1.1 - 2.2, 0.45, -1.5);
      this.scene.add(cube);
    }
    this.swatch = this.own(new DataTexture(this.swatchPixels, 1, 1, RGBAFormat, UnsignedByteType));
    this.swatch.colorSpace = SRGBColorSpace;
    this.swatch.needsUpdate = true;
    const leafMaterial = this.own(new MeshBasicNodeMaterial({ side: DoubleSide, alphaTest: 0.5,
      alphaToCoverage: true }));
    leafMaterial.colorNode = texture(this.swatch).rgb;
    leafMaterial.opacityNode = float(1).sub(uv().sub(0.5).length().smoothstep(0.32, 0.48));
    const leaves = new InstancedMesh(this.own(new PlaneGeometry(1, 2)), leafMaterial, 12);
    this.own(leaves);
    const matrix = new Matrix4();
    for (let i = 0; i < leaves.count; i++) {
      matrix.makeRotationY(i * 0.4);
      matrix.setPosition(new Vector3((i % 6) - 2.5, 1, Math.floor(i / 6) * 1.5 + 0.5));
      leaves.setMatrixAt(i, matrix);
    }
    leaves.instanceMatrix.needsUpdate = true;
    this.scene.add(leaves);

    const scenePass = this.own(pass(this.scene, this.camera, { samples: 4 }));
    this.pipeline = this.own(new RenderPipeline(renderer));
    this.pipeline.outputNode = scenePass.getTextureNode("output");
    renderer.domElement.dataset.renderer = diagnostics.actual;
    document.body.dataset.rendererHarness = "true";
    const fixtureStyle = document.createElement("style");
    fixtureStyle.textContent = "body[data-renderer-harness] #world-reveal, body[data-renderer-harness] .app-title, body[data-renderer-harness] #world-stats { display: none !important; }";
    document.head.append(fixtureStyle);
    this.own({ dispose: () => { fixtureStyle.remove(); delete document.body.dataset.rendererHarness; } });
    const label = document.createElement("pre");
    label.id = "renderer-harness-status";
    label.style.cssText = "position:fixed;left:12px;top:12px;z-index:9999;background:#111d;color:white;padding:12px;pointer-events:none";
    label.textContent = `Development material fixture\n${JSON.stringify({ ...diagnostics, capabilities }, null, 2)}`;
    document.body.append(label);
    this.own({ dispose: () => label.remove() });
    window.addEventListener("resize", this.resize);
    this.resize();
  }

  private readonly resize = (): void => {
    if (this.disposed) return;
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.session.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.session.renderer.setSize(window.innerWidth, window.innerHeight);
  };

  start(): void {
    if (this.running || this.disposed) return;
    this.running = true;
    this.render();
  }

  private readonly render = (): void => {
    if (this.disposed || !this.running) return;
    // Exercise texture uploads after shader compilation without changing geometry.
    this.swatchPixels[0] = 40 + Math.round((Math.sin(performance.now() * 0.001) + 1) * 40);
    if (this.swatch) this.swatch.needsUpdate = true;
    this.scenery?.update();
    this.grass?.update(performance.now() * 0.001);
    this.pipeline?.render();
    this.frame = requestAnimationFrame(this.render);
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.running = false;
    cancelAnimationFrame(this.frame);
    window.removeEventListener("resize", this.resize);
    try { disposeResources(this.owned.reverse()); } finally { this.session.dispose(); }
  }
}
