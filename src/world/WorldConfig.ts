export interface WorldConfig {
  seed: number;
  worldSize: number;
  chunkSize: number;
  terrainRadiusDesktop: number;
  terrainRadiusCompact: number;
  grassRadiusDesktop: number;
  grassRadiusCompact: number;
  terrainNearResolution: number;
  terrainMidResolution: number;
  terrainFarResolution: number;
  terrainChunksPerFrame: number;
  /** 0 is the rollback flag for the permanent horizon shell. */
  horizonEnabled: number;
  /** Shell vertex spacing across the world proper, in metres. */
  horizonSpacing: number;
  /** Grid rings carrying the shell past the world edge into haze. */
  horizonApronRings: number;
  /** Per-ring growth of the apron's spacing. */
  horizonApronGrowth: number;
  grassChunksPerFrame: number;
  grassPatchSize: number;
  grassRenderBatchesPerAxis: number;
  grassFarImpostorsPerPatch: number;
  grassBladesPerSquareMeterDesktop: number;
  grassBladesPerSquareMeterCompact: number;
  grassNearTileSize: number;
  grassNearBladesPerSquareMeterDesktop: number;
  grassNearBladesPerSquareMeterCompact: number;
  grassUltraNearDistance: number;
  grassUltraNearTransitionDistance: number;
  grassUltraNearDensityMultiplier: number;
  /** Compact devices carry their own ultra-near multiplier. */
  grassUltraNearDensityMultiplierCompact: number;
  /**
   * How far the ultra-near layer's second blade population is carried, and over
   * what half-width it decays. The doubling used to end where the segmented
   * silhouette did, so density halved across one metre; these two split the
   * coverage job from the detail job.
   */
  grassNearDensityBoostDistance: number;
  /** Half-width of the density boost's decay. */
  grassNearDensityBoostTransition: number;
  /** Center of the exact-placement near-to-bridge handoff. */
  grassNearBridgeDistance: number;
  /** Half-width of the near-to-bridge handoff. */
  grassNearBridgeTransitionDistance: number;
  /**
   * Where the blade's own micro detail — the troughed normal, the per-blade tone
   * variation, and the flutter — begins fading toward the flat canopy response.
   *
   * This is a *shading* schedule, not a LOD schedule. Every near and mid layer
   * uploads the identical range, so a blade at a given world distance is lit the
   * same way whichever layer happens to draw it. It used to be derived from each
   * material's own `nearMaxDistance`, which gave the five layers five different
   * schedules and made the two co-located populations inside the ultra-near band
   * visibly different brightnesses.
   */
  grassMicroDetailFadeStart: number;
  /** Where micro detail is fully replaced by the flat canopy response. */
  grassMicroDetailFadeEnd: number;
  /** Retained share of a biome's expected density below which a clump is sparse. */
  grassSparseDensityRetentionThreshold: number;
  grassClumpRadiusScaleMin: number;
  grassClumpRadiusScaleMax: number;
  grassClumpAspectMin: number;
  grassClumpAspectMax: number;
  grassClumpRadialExponent: number;
  grassClumpDominantDirectionWeight: number;
  grassClumpRadialDirectionWeight: number;
  /** Fraction of blade-plane azimuth inherited from stable clump identity. */
  grassClumpPlaneCoherence: number;
  /** Minimum retained coverage at the frayed outer edge of a clump. */
  grassClumpEdgeCoverage: number;
  /** Baseline share of blades reserved for the tall accent tier. */
  grassAccentBladeShare: number;
  grassUnderstoryHeightScale: number;
  grassMainHeightScale: number;
  grassAccentHeightScale: number;
  /** Symmetric per-blade height jitter around the clump/tier height. */
  grassBladeHeightJitter: number;
  grassMacroPatchWorldSize: number;
  grassMacroPatchStrength: number;
  grassWetDensityBoost: number;
  grassDryDensityReduction: number;
  grassRockDensityReduction: number;
  grassClearingCoverage: number;
  grassClearingStrength: number;
  grassDisturbanceDensityReduction: number;
  grassWetHeightBoost: number;
  grassDryHeightReduction: number;
  grassDryColorStrength: number;
  /** How far every grass palette colour is pulled toward its own luminance. */
  grassPaletteDesaturation: number;
  /**
   * Vegetation communities: where they organise, how strongly ecology decides
   * which one, and how hard each expresses itself.
   *
   * The art tables -- prior weights, preference curves, responses, species
   * affinity -- live in src/world/ecology/WorldCommunityProfiles.json, because
   * those are the numbers a visual tuning pass edits.
   */
  grassCommunityWorldSize: number;
  /** Scale of the large historical territory/warp lattice, in metres. */
  grassCommunityWarpWorldSize: number;
  /** Maximum displacement of composition coordinates, in metres. */
  grassCommunityWarpDistance: number;
  grassCommunityEcologyStrength: number;
  grassCommunityStrength: number;
  grassCommunityBorderWidth: number;
  grassCommunityQuietStrength: number;
  terrainCommunityTintStrength: number;
  detailFoliageCommunityStrength: number;
  detailFoliageGrassHeightCoupling: number;
  detailFoliageDensity: number;
  detailFoliageColonyWorldSize: number;
  detailFoliageClumpWorldSize: number;
  detailFoliageColonyStrength: number;
  detailFoliageDominantFamilyShare: number;
  detailFoliageTintCoherence: number;
  detailFoliageQuietZoneThreshold: number;
  detailFoliageBackgroundSuppression: number;
  detailFoliageCoreHeightBias: number;
  detailFoliageMaturePhenotypeBias: number;
  detailFoliageEcologyStrength: number;
  detailFoliageEdgeCompanionStrength: number;
  detailFoliageStoneFringeStrength: number;
  detailFoliagePathFringeStrength: number;
  grassMidBladeFraction: number;
  grassUnderlayerFraction: number;
  grassPatchJitter: number;
  grassInteractionStrength: number;
  grassInteractionSpeedForFullEffect: number;
  grassLandingPulseRadius: number;
  grassLandingPulseStrength: number;
  grassLandingPulseDecay: number;
  grassTrailResolution: number;
  grassTrailCoverage: number;
  grassTrailRecoveryRate: number;
  grassTrailFreshnessRate: number;
  grassTrailMaxAngleDegrees: number;
  grassTrailWobbleFrequency: number;
  grassTrailWobbleAmplitude: number;
  grassFootContactRadius: number;
  grassFootContactStrength: number;
  grassBodyContactRadius: number;
  grassBodyContactStrength: number;
  spawnSearchRadius: number;
  spawnSearchStep: number;
  spawnNeighborhoodRadius: number;
  spawnEyeHeight: number;
  spawnPitchDegrees: number;
  baseHeight: number;
  rollingHeight: number;
  mountainHeight: number;
  mountainScale: number;
  detailScale: number;
  /** 0 disables terrain carving, wetness, grass exclusion, and water meshes. */
  waterEnabled: number;
  /** 0 standard, 1 high: richer water optics at a real fragment cost. */
  waterQuality: number;
  riverWidth: number;
  riverBankWidth: number;
  riverDepth: number;
  riverSpacing: number;
  riverMeander: number;
  riverMaxAltitude: number;
  riverWidthVariation: number;
  riverBendBankAsymmetry: number;
  riverDepthVariation: number;
  riverBendChannelShift: number;
  waterHumidityRadius: number;
  lakeSpacing: number;
  lakeChance: number;
  lakeRadiusMin: number;
  lakeRadiusMax: number;
  lakeDepth: number;
  lakeShoreWidth: number;
  waterSurfaceOffset: number;
  waterOpacity: number;
  waterRippleStrength: number;
  waterRippleScale: number;
  waterFlowSpeed: number;
  waterRiverPoolFlowScale: number;
  waterRiverRiffleFlowScale: number;
  waterFoamStrength: number;
  waterShoreFoamWeight: number;
  waterRiffleFoamWeight: number;
  waterStoneFoamWeight: number;
  waterFresnelStrength: number;
  waterDepthFade: number;
  waterDetailDistance: number;
  waterLakeWaveStrength: number;
  waterRoughness: number;
  waterFlowNoiseScale: number;
  waterFlowNoiseStrength: number;
  waterCausticStrength: number;
  waterGlintStrength: number;
  waterStoneWakeStrength: number;
  waterStoneWakeLength: number;
  /** Riverbed pebbles and algae seen through the sheet. 0 hides the bed entirely. */
  waterBedStrength: number;
  waterBedScale: number;
  waterBedRefraction: number;
  waterAlgaeStrength: number;
  /** Deterministic knickpoints along river corridors. 0 disables all falls. */
  waterfallEnabled: number;
  /** Multiplies every drop height, so the whole world's relief tunes together. */
  waterfallScale: number;
  waterfallFoamStrength: number;
  waterfallMistStrength: number;
  pathWidth: number;
  pathBranchWidth: number;
  pathSpacing: number;
  pathEdgeRoughness: number;
  pathGrassClearance: number;
  /**
   * How far the *vegetation* boundary wanders, against pathEdgeRoughness for the
   * mineral one. Must exceed it: trampling makes the plant edge more irregular
   * than the dirt it exposes, and a ragged core inside a clean green cut-out is
   * what made a verge read as a stencil.
   */
  pathGrassEdgeRoughness: number;
  /** Share of blades that survive in the tread itself. */
  grassPathPioneerChance: number;
  grassPathPioneerHeightLoss: number;
  grassPathPioneerCoverage: number;
  /** How far trampling shortens blades approaching a way. */
  grassDisturbanceHeightReduction: number;
  /** Mineral soil carried up into the vegetation beside a tread. */
  terrainVergeFleckStrength: number;
  /**
   * Ground substrate. Soil colour used to be a function of how the grass was
   * doing -- every term that greened the blades also warmed the earth under
   * them -- so the two could never separate. These give the ground its own
   * causes: parent material, drainage, curvature and organic matter.
   */
  terrainSoilHueWorldSize: number;
  terrainSoilHueStrength: number;
  terrainGroundFleckStrength: number;
  terrainHollowDarkening: number;
  terrainHollowMoisture: number;
  terrainMossStrength: number;
  /** Dark pool under each tuft, and the litter that gathers around it. */
  terrainClumpContactAo: number;
  terrainClumpLitterStrength: number;
  /**
   * Blade lighting.
   *
   * normalUp was one constant at 0.76, so three quarters of every blade normal
   * was world up and a blade facing the sun returned nearly the same response
   * as one facing away. This scales the near end of that schedule down; the
   * preset still carries the far value a distant card needs.
   */
  grassNearNormalUpScale: number;
  /** How much darker a blade sitting under its neighbours is. */
  grassCanopyDepthAo: number;
  /** How much darker a blade near the centre of its own tuft is. */
  grassClumpCoreAo: number;
  /**
   * Per-blade silhouette.
   *
   * Every near blade is an affine copy of one cached source triangle, with its
   * apex at local x = 0 — so the whole population is symmetric isoceles
   * triangles differing only in width, height, yaw and lean. These four give a
   * blade a shape of its own without adding a draw call or a source geometry.
   */
  grassBladeTipDrift: number;
  grassBroadBladeShare: number;
  grassBroadBladeWidthScale: number;
  grassBladeDamageShare: number;
  /**
   * A tuft is not N independent blades that happen to be close; it is one plant
   * with several leaves off one crown. These emit the extra leaves from a
   * placement cell that already paid for its field sampling, which is the
   * expensive part — so the cluster costs a few matrix composes, not a second
   * ecology lookup.
   */
  grassRosetteChance: number;
  grassRosetteFanRadians: number;
  /** World metres covered by one repeat of the generated surface-noise map. */
  terrainGroundNoiseWorldSize: number;
  terrainGroundMesoStrength: number;
  terrainGroundMicroStrength: number;
  terrainGroundNormalStrength: number;
  terrainGroundCanopyDarkening: number;
  terrainPathCoreDarkening: number;
  terrainPathVergeDryness: number;
  /**
   * The ground's own distance schedules, in metres.
   *
   * These used to be borrowed from the grass preset's near and mid distances,
   * which is what made the hillside band: three ground terms and three
   * vegetation terms all changed across the same two radii. Each now owns its
   * range and no two share an edge; `verify-lod-band-separation` enforces it.
   */
  terrainMicroDetailStart: number;
  terrainMicroDetailEnd: number;
  terrainMesoDetailStart: number;
  terrainMesoDetailEnd: number;
  terrainCanopyMergeStart: number;
  terrainCanopyMergeEnd: number;
  /** Ceiling on how far the ground may be replaced by canopy colour. */
  terrainCanopyMergeStrength: number;
  /** Share of a schedule's transition width spent wandering in world space. */
  lodBandJitterRatio: number;
  grassMinAltitude: number;
  grassMaxAltitude: number;
  grassMaxSlopeDegrees: number;
  /** 0 is the rollback flag for every stone system. */
  stonesEnabled: number;
  stoneCellSize: number;
  /** Global macro-formation frequency; lowering it removes whole formations. */
  stoneDensity: number;
  stoneVariantsPerArchetype: number;
  /** Final macro-cluster activation multiplier. */
  stoneClusterChance: number;
  stoneClusterSpacing: number;
  stoneClusterCenterJitter: number;
  stoneClusterRadiusMin: number;
  stoneClusterRadiusMax: number;
  stoneClusterAspectMin: number;
  stoneClusterAspectMax: number;
  stoneClusterBudgetMin: number;
  stoneClusterBudgetMax: number;
  stoneClusterCoreRatio: number;
  stoneClusterShoulderRatio: number;
  stoneClusterHaloRatio: number;
  stoneClusterDensityResponse: number;
  /** Share of eligible anchors that become true detached two-piece formations. */
  stoneFormationChance: number;
  /** Minimum visible aperture as a share of the stable parent footprint. */
  stoneFormationGapRatioMin: number;
  /** Maximum visible aperture as a share of the stable parent footprint. */
  stoneFormationGapRatioMax: number;
  /** Absolute cap on a formation aperture, in world metres. */
  stoneFormationGapMax: number;
  /** Allowed terrain mismatch as a share of the parent stone height. */
  stoneFormationSupportHeightRatio: number;
  /** Absolute cap on terrain mismatch under a detached fragment, in metres. */
  stoneFormationSupportHeightMax: number;
  stoneSingletonChance: number;
  stoneGrassClearanceFeather: number;
  stoneRadiusDesktop: number;
  stoneRadiusCompact: number;
  stoneDetailRadius: number;
  stoneDetailRadiusCompact: number;
  /** Terrain chunks grouped per stone render batch axis. */
  stoneRenderBatchChunksPerAxis: number;
  /** Maximum completed stone render batches per frame. */
  stoneChunksPerFrame: number;
  stoneVergeChance: number;
  stoneGrainStrength: number;
  stoneGrainNormalStrength: number;
  stoneGrainSize: number;
  stoneGrainFadeDistance: number;
  stoneGrowthDetailStrength: number;
  stoneGrowthDetailSize: number;
  stoneGrowthDetailFadeDistance: number;
  stoneMossExposureStrength: number;
  stoneMossExposureAzimuthDegrees: number;
  stoneMossExposureElevationDegrees: number;
  stoneMossStreakStrength: number;
  grassNearDistance: number;
  grassMidDistance: number;
  grassFarDistance: number;
  grassTransitionDistance: number;
  grassHysteresisDistance: number;
  flySpeed: number;
  flyBoostMultiplier: number;
  flyMinSpeed: number;
  flyMaxSpeed: number;
  initialAltitude: number;
  initialDistance: number;
  characterScale: number;
  characterWalkSpeed: number;
  characterRunSpeed: number;
  characterRollInitialSpeedMultiplier: number;
  characterRollSustainSpeedMultiplier: number;
  characterAcceleration: number;
  characterDeceleration: number;
  characterTurnRate: number;
  characterJumpSpeed: number;
  characterGravity: number;
  characterFallGravityMultiplier: number;
  characterAirControl: number;
  characterCoyoteTime: number;
  characterJumpBufferTime: number;
  characterJumpHoldTime: number;
  characterJumpHoldGravityScale: number;
  characterLandingRecoveryTime: number;
  characterLandingImpactForFullEffect: number;
  characterCameraDistance: number;
  characterCameraMinDistance: number;
  characterCameraMaxDistance: number;
  characterCameraLookHeight: number;
  characterCameraElevationDegrees: number;
  characterCameraMinElevationDegrees: number;
  characterCameraMaxElevationDegrees: number;
  characterCameraFollowRate: number;
  characterCameraGroundClearance: number;
  characterMouseLookSensitivity: number;
  characterTouchLookSensitivity: number;
  characterZoomSensitivity: number;
  /** 0 is the rollback flag for streamed fauna. */
  faunaEnabled: number;
  faunaDeerDesktopCount: number;
  faunaDeerCompactCount: number;
  faunaVillagerDesktopCount: number;
  faunaVillagerCompactCount: number;
  faunaVillagerWalkSpeed: number;
  /** How far from the player herds are collected, in metres. */
  faunaStreamRadius: number;
  faunaDeerWalkSpeed: number;
  /** Animation quality thresholds, in metres, increasing. */
  faunaFullDistance: number;
  faunaReducedDistance: number;
  faunaMinimalDistance: number;
  faunaCullDistance: number;
  /** Pose update rates at the reduced and minimal levels. */
  faunaReducedUpdateHz: number;
  faunaMinimalUpdateHz: number;
  /** How often an animal decides what to do next. */
  faunaBehaviorHz: number;
}
