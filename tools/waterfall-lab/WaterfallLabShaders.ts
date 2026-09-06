/**
 * Shaders for the waterfall lab.
 *
 * Everything here is written from the technique, not transplanted: the gorge
 * reference on Shadertoy is CC BY-NC-SA and this repository is MIT, so the ideas
 * are reimplemented and the expression is our own. Where the reference solved
 * something with a photographic sample, this solves it procedurally, because
 * every texture in this project is generated in code.
 *
 * The four ideas being prototyped:
 *
 *   1. cliff faces projected along the wall rather than from above;
 *   2. a curtain shaded by how deep the fragment sits in the falling water;
 *   3. plunge mist as an analytic volume, with no particles;
 *   4. a rainbow as a pure function of the view/sun angle.
 */

/** Value noise and fbm. Cheap on purpose — this runs over a full gorge frame. */
const NOISE = `
float labHash(vec3 p) {
  p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float labNoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(labHash(i + vec3(0.0, 0.0, 0.0)), labHash(i + vec3(1.0, 0.0, 0.0)), f.x),
      mix(labHash(i + vec3(0.0, 1.0, 0.0)), labHash(i + vec3(1.0, 1.0, 0.0)), f.x),
      f.y
    ),
    mix(
      mix(labHash(i + vec3(0.0, 0.0, 1.0)), labHash(i + vec3(1.0, 0.0, 1.0)), f.x),
      mix(labHash(i + vec3(0.0, 1.0, 1.0)), labHash(i + vec3(1.0, 1.0, 1.0)), f.x),
      f.y
    ),
    f.z
  );
}

float labFbm(vec3 p, int octaves) {
  float sum = 0.0;
  float amplitude = 0.5;
  float total = 0.0;
  for (int i = 0; i < 5; i += 1) {
    if (i >= octaves) break;
    sum += labNoise(p) * amplitude;
    total += amplitude;
    p *= 2.03;
    amplitude *= 0.5;
  }
  return sum / max(total, 1e-4);
}
`;

const LIGHTING = `
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uSkyColor;
uniform vec3 uGroundColor;

vec3 labHemisphere(vec3 normal) {
  return mix(uGroundColor, uSkyColor, normal.y * 0.5 + 0.5);
}
`;

export const TERRAIN_VERTEX = `
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vShelter;
attribute float shelter;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vShelter = shelter;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Rock, and the reason this lab exists.
 *
 * The world's terrain shader has no rock class at all and no slope input, so a
 * gorge wall inside the humidity radius is painted as shoreline gravel from top
 * to bottom. Here slope decides the material and humidity only modifies it:
 * turn uWetness to 1 and the wall gets darker and glossier, never gravelly.
 *
 * The projection matters as much as the palette. Sampling rock by world xz on a
 * near-vertical face stretches it into vertical smears — exactly the "deformed
 * terrain" look in the screenshots. Cliff faces are therefore projected along
 * the wall itself, using the horizontal tangent of the surface normal, and
 * blended against the flat-ground projection by how upward-facing the surface
 * is. Two projections, not triplanar's three, because a wall has only one
 * interesting axis.
 */
export const TERRAIN_FRAGMENT = `
precision highp float;
${NOISE}
${LIGHTING}
uniform float uWetness;
uniform float uRockDetail;
uniform float uWaterLevel;
varying vec3 vWorldPosition;
varying vec3 vWorldNormal;
varying float vShelter;

void main() {
  vec3 normal = normalize(vWorldNormal);
  float upness = clamp(normal.y, 0.0, 1.0);
  // Squared, so the transition to cliff behaviour happens well before vertical.
  float flatness = upness * upness;
  float cliff = 1.0 - flatness;

  // Wall-aligned coordinates: horizontal distance along the face, and height.
  vec2 tangent = normalize(vec2(-normal.z, normal.x) + vec2(1e-5));
  vec2 wallUv = vec2(dot(vWorldPosition.xz, tangent), vWorldPosition.y);
  vec3 wallPoint = vec3(wallUv.x * 0.86, wallUv.y * 0.78, dot(vWorldPosition.xz, tangent.yx) * 0.14);
  vec3 groundPoint = vWorldPosition * 0.4;

  float wallDetail = labFbm(wallPoint, 4);
  float groundDetail = labFbm(groundPoint, 3);
  float grain = mix(groundDetail, wallDetail, cliff);

  /**
   * Bedding, as discrete beds rather than as a sine wash.
   *
   * A sine band gives a cliff that undulates like marble; what makes rock read
   * as rock is that it is built of separate beds, each with its own tone and
   * hardness, meeting at sharp partings. So the height is quantised, each bed
   * is given a hashed tone, and a thin recessive line is cut at every boundary.
   * This is macro structure — the answer to a melted-looking wall is never
   * another octave of noise, which only makes a smoother kind of mush.
   */
  float bandWarp = labFbm(vWorldPosition * 0.045, 2) * 3.4;
  // Warped hard along the bed, so the beds undulate, pinch and thicken instead
  // of running dead level across the whole gorge like courses of masonry.
  float bedCoord = vWorldPosition.y * 0.135 + bandWarp * 0.42;
  float bedIndex = floor(bedCoord);
  float bedFraction = fract(bedCoord);
  float bedTone = labHash(vec3(bedIndex, 3.1, 7.7));
  float parting =
    smoothstep(0.0, 0.05, bedFraction) *
    (1.0 - smoothstep(0.93, 1.0, bedFraction));
  float strata = mix(0.5, bedTone, cliff * uRockDetail);

  /**
   * Vertical fractures. Wide, sparse and offset bed by bed, because a joint
   * that runs unbroken down a whole cliff reads as a seam in a texture. These
   * are the hard transitions between rock masses.
   */
  float fractureSeed = labHash(vec3(bedIndex, 11.3, 2.9));
  float fracture =
    1.0 - abs(fract(wallUv.x * 0.055 + fractureSeed * 3.0) * 2.0 - 1.0);
  fracture = pow(clamp(fracture, 0.0, 1.0), 12.0) * cliff * uRockDetail;
  float jointNoise = labFbm(vec3(wallUv.x * 0.16, vWorldPosition.y * 0.02, 3.7), 2);
  float joint = 1.0 - abs(fract(wallUv.x * 0.09 + jointNoise * 1.7) * 2.0 - 1.0);
  joint = pow(clamp(joint, 0.0, 1.0), 9.0) * cliff * uRockDetail;

  vec3 rockDark = vec3(0.062, 0.057, 0.052);
  vec3 rockLight = vec3(0.355, 0.328, 0.286);
  // Structure leads, grain follows. Letting the bed tone dominate outright
  // flattened the wall into stripes, so the two are kept closer in weight.
  vec3 rock = mix(
    rockDark,
    rockLight,
    clamp(grain * 0.78 + strata * 0.52 - 0.14, 0.0, 1.0)
  );
  rock *= 1.0 - joint * 0.4;
  rock *= 1.0 - fracture * 0.62;
  rock *= mix(0.72, 1.0, parting);
  // Cavity shading. Without it the macro forms read as painted-on shading only.
  rock *= 1.0 - vShelter * 0.35;

  // Soil only where the ground is flat enough to hold it. This is the priority
  // the world shader is missing: geology first, cover second.
  vec3 soil = mix(vec3(0.223, 0.196, 0.141), vec3(0.313, 0.278, 0.196), groundDetail);
  vec3 albedo = mix(rock, soil, flatness * smoothstep(0.35, 0.85, upness));

  // Moss belongs in sheltered, damp cracks, never on the exposed faces. This is
  // the one place humidity is allowed to change *what* the surface is, and it is
  // gated on shelter so it cannot spread across an open wall.
  float moss = vShelter * uWetness * smoothstep(0.35, 0.8, grain) * uRockDetail;
  albedo = mix(albedo, vec3(0.176, 0.243, 0.133), moss * 0.55);

  // Humidity as a modifier: darker, glossier, never a different material.
  float damp = uWetness * (0.35 + 0.65 * smoothstep(6.0, 0.0, vWorldPosition.y - uWaterLevel));
  albedo *= 1.0 - damp * 0.34;

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float diffuse = clamp(dot(normal, uSunDirection), 0.0, 1.0);
  vec3 lighting = uSunColor * diffuse + labHemisphere(normal);

  /**
   * Gorge bounce.
   *
   * In a slot, the shaded wall is lit almost entirely by light thrown off the
   * sunlit wall facing it. Leaving it to the sky term alone crushes it to a
   * flat near-black mass — every bed and fracture above is still there and
   * simply cannot be seen. Real gorges are dark on that side but never
   * featureless, so surfaces turned away from the sun horizontally get a warm
   * fill at a fraction of the direct term.
   */
  vec3 sunHorizontal = normalize(vec3(uSunDirection.x, 0.0, uSunDirection.z));
  float bounce = clamp(dot(normal, -sunHorizontal), 0.0, 1.0);
  // Kept low. At 0.19 this recovered the shaded wall's detail and destroyed the
  // gorge's contrast along with it — both walls went pale and the depth the
  // lighting split was there to create disappeared.
  lighting += uSunColor * vec3(1.0, 0.93, 0.82) * bounce * 0.085;

  vec3 color = albedo * lighting;

  // Wet rock shines; wet rock does not turn pale. Specular only, no albedo lift.
  vec3 half3 = normalize(uSunDirection + viewDirection);
  float gloss = pow(clamp(dot(normal, half3), 0.0, 1.0), mix(18.0, 96.0, damp));
  color += uSunColor * gloss * damp * 0.28;

  gl_FragColor = vec4(color, 1.0);
}
`;

export const CURTAIN_VERTEX = `
attribute vec3 cascade;
attribute float crest;
varying vec3 vCascade;
varying float vCrest;
varying vec3 vWorldPosition;

void main() {
  vCascade = cascade;
  vCrest = crest;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The curtain, in two passes from one geometry.
 *
 * `uCoreMode` picks which half of the sheet this material draws. The dense
 * whitewater core is drawn opaque with depth writes, so the pool, the bed and
 * the far wall behind it are rejected before they are ever shaded; the thin
 * strands and edges are drawn transparent over the top. That split is the whole
 * point of the prototype — it is the one change to the gorge frame that removes
 * fragment work instead of moving it around.
 *
 * Thickness is analytic rather than marched. The reference traces twelve steps
 * through a spray volume to find how much water a ray crosses; the same cue —
 * dense in the middle, thin at the edges, denser as the sheet compresses on
 * landing — falls straight out of the geometry's own coordinates for no cost.
 */
export const CURTAIN_FRAGMENT = `
precision highp float;
${NOISE}
${LIGHTING}
uniform float uTime;
uniform float uCoreMode;
uniform float uCoreThreshold;
uniform vec3 uWaterColor;
uniform vec3 uFoamColor;
varying vec3 vCascade;
varying float vCrest;
varying vec3 vWorldPosition;

void main() {
  float across = vCascade.x;
  float fall = clamp(vCascade.y, 0.0, 1.0);
  float drop = max(0.5, vCascade.z);

  /**
   * Falling water accelerates, so the streaks have to stretch and speed up on
   * the way down — but the acceleration belongs in the *mapping*, never in a
   * scroll rate multiplied by absolute time.
   *
   * Writing it as coordinate = f(fall) - uTime * speed(fall) looks right for a
   * few seconds and is broken: the spatial gradient of that expression carries a
   * -uTime * dSpeed/dFall term, so the pattern compresses further every second
   * and, once the time term overtakes the spatial one, the whole curtain
   * visibly reverses and runs upward. That is a real defect and it is in the
   * shipped WaterCascadeShader.ts too, in exactly this form.
   *
   * A parcel in free fall has covered distance proportional to the square of its
   * age, so its age goes as the square root of the fall. Advecting the texture
   * by that age and scrolling at one constant rate gives the same accelerating
   * look, stretched toward the base, and it is stable for any run length.
   */
  float fallAge = sqrt(fall);
  float strandU = across * 7.0;
  float flowV = fallAge * drop * 0.34 - uTime * 1.55;

  // Two octaves each, and a high vertical frequency. Single-octave value noise
  // at this scale gives the curtain visible rectangles instead of strands.
  float fine = labFbm(vec3(strandU * 4.6, flowV * 7.5, 0.0), 2);
  float coarse = labFbm(vec3(strandU * 1.5 + 0.21, flowV * 2.6 - uTime * 0.35, 4.7), 2);

  /**
   * The sheet leaves the lip whole and pulls apart as it falls — but it does not
   * pull apart at the same height all the way across. Driving breakup from the
   * fall alone puts a ruled horizontal line across the curtain where whitewater
   * starts, and leaves everything above it one coherent card. Jittering the
   * height per column, with noise that varies across the lip, makes the sheet
   * tear where it happens to be thinnest instead of on a contour.
   */
  float tearJitter = (labFbm(vec3(across * 3.3, 0.7, 0.0), 2) - 0.5) * 0.42;
  float breakup = smoothstep(0.04, 0.72, fall + tearJitter);
  float strand = mix(coarse, fine, 0.4 + 0.45 * breakup);
  float gap = smoothstep(0.3, 0.72, strand);
  float sheet = 1.0 - breakup * gap * 0.92;

  // Narrow. A wide crest band forced to high alpha becomes a solid rectangle at
  // the lip, and with the core pass enabled it is an *opaque* one.
  float crest = 1.0 - smoothstep(0.0, 0.05, fall);
  float impact = clamp(
    smoothstep(0.55, 1.0, fall) * (0.55 + 0.75 * coarse) +
    smoothstep(0.86, 1.0, fall) * 0.35,
    0.0,
    1.0
  );
  /**
   * Falling water is not foam until it has entrained air. Starting aeration at
   * 0.28 everywhere made the whole curtain read as one white sheet with no water
   * in it; a clean lip is green-grey and translucent, and only the broken and
   * landing parts go white.
   */
  float aeration = clamp(
    0.05 + breakup * 0.66 + impact * 0.95 + (1.0 - gap) * 0.3,
    0.0,
    1.0
  );

  // How much water this ray crosses: thickest down the middle of the sheet,
  // thinner at the necking edges, and compressed again where it lands.
  float thickness = sqrt(clamp(1.0 - across * across, 0.0, 1.0)) * sheet;
  thickness = mix(thickness, thickness * 1.35, impact);

  // Depth into the water shades it: the reference's cheapest and best trick.
  float depthShade = 0.34 + sqrt(clamp(thickness, 0.0, 1.0)) * 0.52;

  vec3 color = mix(uWaterColor, uFoamColor, aeration);
  color *= 0.72 + depthShade * 0.5 + crest * 0.22;
  color *= labHemisphere(vec3(0.0, 1.0, 0.0)) * 0.4 + uSunColor * 0.5;

  /**
   * Both edges and the base have to lose the geometry's silhouette, and a long
   * gentle ramp does not achieve that. Falling off linearly all the way to the
   * geometry boundary leaves a wide skirt of low-alpha fragments either side of
   * the strands: individually almost invisible, collectively a pale rectangle
   * with the mesh's own straight edges and square corners. Squaring the ramp and
   * closing it before the boundary is what actually dissolves the outline.
   */
  float edgeNoise = 0.55 + coarse * 0.3;
  float edge = 1.0 - smoothstep(0.34 * edgeNoise, 0.9, abs(across));
  edge *= edge;
  float alpha = clamp(
    (0.16 + aeration * 0.95) * edge * mix(0.12, 1.0, sheet),
    0.0,
    1.0
  );
  alpha *= 1.0 - smoothstep(0.82, 1.0, fall) * 0.5;
  alpha = max(alpha, crest * 0.2 * edge);

  /**
   * The lip is a straight line in the geometry and must not be one on screen.
   * Above the point where breakup starts, the sheet is still coherent, so every
   * fragment across the top row lands at the same opacity and the core pass
   * turns the whole band into one opaque card with a ruled top edge. Water
   * spills over uneven rock, so the boundary is dissolved along the lip instead.
   */
  float lipNoise = labFbm(vec3(across * 6.5, 1.7, 0.0), 2);
  alpha *= smoothstep(0.0, 0.03 + lipNoise * 0.14, fall);

  // Less water crosses the sill where the rock stands proud, and it thins out
  // and tears sooner. This is the shading half of the crest profile the
  // geometry already carries; without it the sheet is uniform across an uneven
  // lip, which reads as a curtain hung on a rail.
  float proud = clamp(vCrest, 0.0, 1.0);
  alpha *= mix(1.0, 0.42, proud);

  float density = alpha * thickness;
  if (uCoreMode > 0.5) {
    // Opaque pass: only the whitewater core, fully opaque, writing depth.
    if (density < uCoreThreshold) discard;
    gl_FragColor = vec4(color, 1.0);
  } else {
    // Veil pass: everything else. Fragments behind the core are already gone.
    if (density >= uCoreThreshold) discard;
    gl_FragColor = vec4(color, alpha);
  }
}
`;

export const WATER_VERTEX = `
attribute float depth;
varying float vDepth;
varying vec3 vWorldPosition;

void main() {
  vDepth = depth;
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * Pool water. Deliberately simple, because the point it has to make is about
 * geometry rather than about shading: absorption is exponential in depth, so
 * once the plunge bowl is actually excavated the pool darkens, hides its floor
 * and shifts colour with no shader change at all. Turn the scour off and the
 * same shader gives back the flat grey floor.
 */
export const WATER_FRAGMENT = `
precision highp float;
${NOISE}
${LIGHTING}
uniform float uTime;
uniform vec3 uShallowColor;
uniform vec3 uDeepColor;
uniform vec3 uExtinction;
uniform vec3 uImpactCenter;
varying float vDepth;
varying vec3 vWorldPosition;

void main() {
  if (vDepth <= 0.02) discard;

  vec2 flow = vec2(1.0, 0.0);
  float wave =
    labFbm(vec3(vWorldPosition.xz * 0.55 - flow * uTime * 0.6, uTime * 0.15), 2) - 0.5;
  float wave2 =
    labFbm(vec3(vWorldPosition.xz * 1.7 + flow * uTime * 0.35, uTime * 0.3), 2) - 0.5;
  // Fine chop, so the pool is never glassy between the larger swells.
  float chop =
    labNoise(vec3(vWorldPosition.xz * 4.4 - flow * uTime * 1.1, uTime * 0.8)) - 0.5;

  /**
   * Rings from the plunge. A pool below a waterfall is not a lake — it is being
   * struck continuously, and the wave train spreading from the strike is what
   * says so. Amplitude decays with distance, and the innermost couple of metres
   * are left to the impact foam rather than fighting it for the same pixels.
   */
  vec2 toImpact = vWorldPosition.xz - uImpactCenter.xz;
  float impactDistance = length(toImpact);
  vec2 radial = toImpact / max(impactDistance, 1e-4);
  float ringPhase = impactDistance * 1.15 - uTime * 3.4;
  float ringDecay =
    exp(-impactDistance * 0.07) * smoothstep(1.2, 5.5, impactDistance);
  // Jittered so the rings are a disturbed wave train, not clean sonar circles.
  float ringJitter = labFbm(vec3(radial * 2.6, uTime * 0.25), 2) - 0.5;
  float rings = sin(ringPhase + ringJitter * 3.1) * ringDecay;

  vec2 slope =
    vec2(wave * 0.5 + wave2 * 0.28, wave2 * 0.42) +
    vec2(chop * 0.3, chop * 0.24) +
    radial * rings * 0.34;
  vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));

  vec3 transmittance = exp(-uExtinction * vDepth);
  vec3 color = uShallowColor * transmittance + uDeepColor * (1.0 - transmittance);

  /**
   * Aerated water around the strike.
   *
   * A plunge grades white foam -> pale turquoise -> deep water -> ordinary
   * river, and the turquoise band is the one that was missing: without it the
   * pool jumps straight from the foam patch to its depth colour and reads as a
   * single flat value. The colour comes from entrained bubbles scattering light
   * back out before it can be absorbed, so it follows the same falloff as the
   * air the fall drags under, and it lifts opacity with it.
   */
  float aerated = exp(-impactDistance * 0.115) * 0.9;
  color = mix(color, vec3(0.66, 0.83, 0.81), clamp(aerated, 0.0, 1.0));

  vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
  float facing = clamp(dot(normal, viewDirection), 0.0, 1.0);
  float fresnel = 0.02 + 0.98 * pow(1.0 - facing, 5.0);
  // Held well below a physical mirror on purpose: at the grazing angles you get
  // standing in a gorge, a correct Fresnel turns the whole pool into sky and
  // the plunge bowl's depth stops being visible at all.
  color = mix(color, uSkyColor, clamp(fresnel, 0.0, 1.0) * 0.32);

  vec3 half3 = normalize(uSunDirection + viewDirection);
  color += uSunColor * pow(clamp(dot(normal, half3), 0.0, 1.0), 110.0) * 0.4;

  float alpha = mix(0.55, 0.93, 1.0 - dot(transmittance, vec3(0.333)));
  // Bubbled water hides its bed, so opacity climbs with aeration too.
  alpha = mix(alpha, 1.0, clamp(aerated, 0.0, 1.0) * 0.8);
  // Fade out at the waterline, or the sheet ends on a hard cut across the bank.
  alpha *= smoothstep(0.0, 0.4, vDepth);
  gl_FragColor = vec4(color, alpha);
}
`;

export const IMPACT_VERTEX = `
varying vec3 vWorldPosition;

void main() {
  vec4 world = modelMatrix * vec4(position, 1.0);
  vWorldPosition = world.xyz;
  gl_Position = projectionMatrix * viewMatrix * world;
}
`;

/**
 * The impact zone, as its own local effect rather than as the bottom of the
 * curtain. Where a fall lands, the water is not a surface with white paint on
 * it — it is thick, turbulent and full of air, boiling outward from the strike
 * and dissipating downstream. Keeping it separate from the curtain means the
 * violence stays where the jet actually hits, and it costs one small mesh over
 * the pool instead of another full-height transparent sheet.
 */
export const IMPACT_FRAGMENT = `
precision highp float;
${NOISE}
${LIGHTING}
uniform float uTime;
uniform vec3 uImpactCenter;
uniform float uImpactRadius;
uniform vec3 uFoamColor;
varying vec3 vWorldPosition;

void main() {
  vec2 offset = vWorldPosition.xz - uImpactCenter.xz;
  vec2 direction = normalize(offset + vec2(1e-5));

  // A plunge is not a disc. Lobing the boundary and drifting it slowly is what
  // stops the foam reading as a circular decal dropped on the pool.
  float bearing = atan(offset.y, offset.x);
  float lobe = 1.0 +
    0.26 * sin(bearing * 3.0 + 0.7) +
    0.15 * sin(bearing * 5.0 - 1.3) +
    0.18 * (labNoise(vec3(cos(bearing) * 1.7, sin(bearing) * 1.7, uTime * 0.11)) - 0.5);
  float radius = length(offset) / (uImpactRadius * lobe);
  if (radius > 1.0) discard;
  // Turbulence advected outward from the strike, so the boil travels.
  float churn = labFbm(
    vec3(vWorldPosition.xz * 0.62 - direction * uTime * 1.7, uTime * 0.45),
    3
  );
  float rings = 0.5 + 0.5 * sin(radius * 13.0 - uTime * 3.1 + churn * 5.4);

  /**
   * The strike should be the brightest, most violent thing in the frame, and
   * dense enough that the eye cannot find the line where the curtain geometry
   * stops and the pool begins. It was previously weak enough that the join was
   * plainly visible, which gives the whole fall away.
   */
  float core = 1.0 - smoothstep(0.0, 0.52, radius);
  float spread = 1.0 - smoothstep(0.24, 1.0, radius);
  float foam = clamp(core * core * 2.1 + spread * rings * churn * 1.05, 0.0, 1.0);

  // Foam is carried away by the flow, so the downstream side thins out first.
  float downstream = smoothstep(-0.25, 0.95, offset.x / uImpactRadius);
  foam *= mix(1.05, 0.5, downstream);
  foam *= smoothstep(0.0, 0.18, 1.0 - radius);

  vec3 color = uFoamColor * (labHemisphere(vec3(0.0, 1.0, 0.0)) * 0.55 + uSunColor * 0.55);
  gl_FragColor = vec4(color, clamp(foam, 0.0, 1.0));
}
`;

/**
 * Splash. The one place a particle actually earns its cost.
 *
 * Everything else in this lab avoids particles deliberately — the mist is an
 * analytic volume precisely so it cannot be seen edge-on and costs no extra
 * geometry. But thrown droplets have silhouettes that a volume cannot fake, and
 * they are what makes an impact read as violent rather than as a bright patch.
 *
 * Each point carries only a seed. Its whole ballistic arc is evaluated in the
 * vertex shader and looped on its own lifetime, so the system is one draw call
 * with no CPU work and no buffer updates per frame.
 */
export const SPLASH_VERTEX = `
attribute vec4 splash;
uniform float uTime;
uniform vec3 uImpactCenter;
uniform float uImpactRadius;
uniform float uSplashSize;
varying float vAge;

void main() {
  float lifetime = 0.9 + splash.x * 1.1;
  float age = mod(uTime + splash.w * 11.37, lifetime);
  float normalized = age / lifetime;

  // Launched from around the strike, not from a single point.
  float bearing = splash.z;
  float ring = uImpactRadius * (0.12 + splash.x * 0.42);
  vec3 origin = uImpactCenter + vec3(cos(bearing) * ring, 0.0, sin(bearing) * ring);

  float outward = splash.y * (1.6 + splash.x * 3.4);
  vec3 velocity = vec3(
    cos(bearing) * outward,
    3.4 + splash.y * 5.2,
    sin(bearing) * outward
  );
  vec3 world = origin + velocity * age + vec3(0.0, -4.9 * age * age, 0.0);

  vAge = normalized;
  vec4 viewPosition = viewMatrix * vec4(world, 1.0);
  gl_Position = projectionMatrix * viewPosition;
  gl_PointSize = uSplashSize * (1.0 - normalized * 0.4) * 42.0 /
    max(0.6, -viewPosition.z);
}
`;

export const SPLASH_FRAGMENT = `
precision highp float;
uniform vec3 uFoamColor;
varying float vAge;

void main() {
  vec2 offset = gl_PointCoord * 2.0 - 1.0;
  float falloff = 1.0 - dot(offset, offset);
  if (falloff <= 0.0) discard;
  // Fade in off the surface and out again as the droplet loses itself.
  float fade = smoothstep(0.0, 0.12, vAge) * (1.0 - smoothstep(0.55, 1.0, vAge));
  gl_FragColor = vec4(uFoamColor, falloff * falloff * fade * 0.55);
}
`;

export const COMPOSITE_VERTEX = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/**
 * Mist and rainbow, in one pass over the finished frame.
 *
 * The mist is a sphere of optical depth around the plunge, not a particle
 * system. The ray is intersected with the sphere, the far end is clamped to
 * whatever the scene depth says is in the way, and the chord that survives is
 * the amount of water the ray travelled through. One analytic volume replaces a
 * cloud of billboards, adds no transparent geometry, and cannot be seen edge-on.
 *
 * The rainbow is the reason to bother. It is a pure function of the angle
 * between the view ray and the sun: red at 137.6 degrees for the primary bow,
 * violet at 139.4, and the secondary bow reversed at 129.6 and 126.6. Between
 * the two lies Alexander's dark band, which is darker than the sky outside
 * either bow — the reference leaves that out, and it is what makes a rendered
 * bow look painted on rather than lit.
 */
export const COMPOSITE_FRAGMENT = `
precision highp float;
${NOISE}
${LIGHTING}
uniform sampler2D tColor;
uniform sampler2D tDepth;
uniform mat4 uInverseViewProjection;
uniform vec3 uCameraPosition;
uniform vec3 uMistCenter;
uniform float uMistRadius;
uniform float uMistDensity;
uniform float uRainbowStrength;
uniform float uPoolLevel;
uniform float uTime;
uniform float uExposure;
varying vec2 vUv;

vec3 labUnproject(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = uInverseViewProjection * clip;
  return world.xyz / world.w;
}

/** One bow. Each channel peaks at its own deviation angle. */
vec3 labBow(float theta, vec3 peaks, float width, float brightness) {
  vec3 distance = abs(theta - peaks) / width;
  vec3 band = clamp(1.0 - distance, 0.0, 1.0);
  return brightness * band * band * (3.0 - 2.0 * band);
}

void main() {
  vec3 color = texture2D(tColor, vUv).rgb;
  float depth = texture2D(tDepth, vUv).x;

  vec3 farPoint = labUnproject(vUv, 1.0);
  vec3 rayDirection = normalize(farPoint - uCameraPosition);
  float sceneDistance = depth >= 1.0
    ? 1.0e5
    : distance(labUnproject(vUv, depth), uCameraPosition);

  // Ray against the mist volume.
  vec3 toCenter = uCameraPosition - uMistCenter;
  float b = dot(toCenter, rayDirection);
  float c = dot(toCenter, toCenter) - uMistRadius * uMistRadius;
  float h = b * b - c;
  float mist = 0.0;
  vec3 midPoint = uCameraPosition;

  if (h > 0.0) {
    float root = sqrt(h);
    float near = max(-b - root, 0.0);
    float far = min(-b + root, sceneDistance);
    if (far > near) {
      midPoint = uCameraPosition + rayDirection * (near + far) * 0.5;
      // Spray is thickest at the foot of the fall and thins upward.
      float height = exp(-max(0.0, midPoint.y - uPoolLevel) * 0.11);
      float radial = 1.0 - clamp(length(midPoint - uMistCenter) / uMistRadius, 0.0, 1.0);
      float churn = 0.72 + 0.56 * labFbm(midPoint * 0.09 + vec3(0.0, -uTime * 0.35, 0.0), 3);
      float opticalDepth =
        (far - near) * uMistDensity * height * radial * radial * churn;
      mist = 1.0 - exp2(-opticalDepth);
    }
  }

  if (mist > 0.001) {
    vec3 mistColor = uSkyColor * 0.72 + uSunColor * 0.22;
    color = mix(color, mistColor, clamp(mist, 0.0, 1.0));

    float theta = degrees(acos(clamp(dot(rayDirection, uSunDirection), -1.0, 1.0)));
    vec3 primary = labBow(theta, vec3(137.6, 138.5, 139.4), 1.9, 1.0);
    vec3 secondary = labBow(theta, vec3(129.6, 128.1, 126.6), 2.3, 0.34);

    // A bow is scattered light, not a tint, so it does not scale linearly with
    // how much mist the ray crossed — thin spray already shows one clearly.
    float bowMist = pow(clamp(mist, 0.0, 1.0), 0.55);

    // Alexander's dark band: the sky between the two bows really is darker.
    float alexander =
      smoothstep(130.2, 131.6, theta) * (1.0 - smoothstep(135.8, 137.2, theta));
    color *= 1.0 - alexander * bowMist * 0.2 * uRainbowStrength;
    color += (primary + secondary) * bowMist * uRainbowStrength * 0.85;
  }

  color *= uExposure;
  // Filmic-ish shoulder, then gamma. The lab writes to a linear target and does
  // its own conversion, so nothing is applied twice.
  color = color / (color + vec3(0.72));
  color = pow(clamp(color, 0.0, 1.0), vec3(1.0 / 2.2));
  gl_FragColor = vec4(color, 1.0);
}
`;
