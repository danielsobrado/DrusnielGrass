var Ss=Object.defineProperty;var vs=(t,e,s)=>e in t?Ss(t,e,{enumerable:!0,configurable:!0,writable:!0,value:s}):t[e]=s;var c=(t,e,s)=>vs(t,typeof e!="symbol"?e+"":e,s);import{f as ps,F as Gs,b as bs,P as p,c as Ts,a as M,N as w,U as Ds}from"./index-sSycTxWq.js";import{d as j}from"./ResourceDisposal-E4uLJYZq.js";import{ae as ys,ad as ae,B as Cs,J as W,e as R,V as Y,k as Es,am as xs,a7 as K,S as Rs,af as ws,h as _,an as as,ac as _s,ag as As,a as Ms,a2 as rs,a3 as Fs,a8 as Ee,$ as Z,a1 as Ns,Y as ns,a0 as Ps,ao as Ls,Z as xe,s as A,W as Bs,D as Is}from"./three.core-BloAwS4D.js";import{a as Ws}from"./WorldEnvironmentTuning-DyqZCphq.js";import{G as Q,a as Os}from"./GrassBiomeProfile-BI6FWDIa.js";const Vs=2,Re=2048,we=4,Us=/^#[0-9a-fA-F]{6}$/,_e=1e5,Ae=64,Me=5e6;function Hs(t){if(t.instanceCount>_e)throw new Error(`instanceCount must not exceed ${_e}.`);if(t.geometry.variantCount>Ae)throw new Error(`variantCount must not exceed ${Ae}.`);if(t.geometry.variantCount>t.instanceCount)throw new Error("variantCount must not exceed instanceCount.");if(t.instanceCount*t.geometry.bladesPerClump*t.geometry.bladeSegments>Me)throw new Error(`Configured near-grass workload must not exceed ${Me}.`);if(t.geometry.bladesPerClump<3)throw new Error("bladesPerClump must be at least 3.");if(t.geometry.bladeSegments<2)throw new Error("bladeSegments must be at least 2.");if(t.geometry.midBladesPerClump<2)throw new Error("midBladesPerClump must be at least 2.");if(t.geometry.midBladeSegments<1)throw new Error("midBladeSegments must be at least 1.");if(t.geometry.midBladesPerClump>t.geometry.bladesPerClump)throw new Error("midBladesPerClump must not exceed bladesPerClump.");if(t.geometry.midBladeSegments>=t.geometry.bladeSegments)throw new Error("midBladeSegments must be lower than bladeSegments.");if(t.geometry.bladeHeightMin>t.geometry.bladeHeightMax)throw new Error("bladeHeightMin must be less than or equal to bladeHeightMax.");if(t.geometry.bladeWidthMin>t.geometry.bladeWidthMax)throw new Error("bladeWidthMin must be less than or equal to bladeWidthMax.");if(t.geometry.bladeLeanMin>t.geometry.bladeLeanMax)throw new Error("bladeLeanMin must be less than or equal to bladeLeanMax.");if(t.distribution.densityMin>t.distribution.densityMax)throw new Error("densityMin must be less than or equal to densityMax.");if(t.lod.nearMaxDistance>=t.lod.midMaxDistance||t.lod.midMaxDistance>=t.lod.farMaxDistance)throw new Error("Grass LOD distances must increase from near to far.");if(t.lod.transitionDistance>=t.lod.nearMaxDistance)throw new Error("transitionDistance must be lower than nearMaxDistance.");if(t.lod.hysteresisDistance>=t.lod.nearMaxDistance-t.lod.transitionDistance)throw new Error("hysteresisDistance is too large for the near LOD band.");if(Math.hypot(t.wind.directionX,t.wind.directionZ)<Number.EPSILON)throw new Error("Grass wind direction must not be zero.");for(const[s,a]of[["baseColor",t.material.baseColor],["tipColor",t.material.tipColor],["dryColor",t.material.dryColor]])if(!Us.test(a))throw new Error(`Grass config value ${s} must be a six-digit hex color.`);if(t.impostor.viewsPerAxis<2)throw new Error("impostorViewsPerAxis must be at least 2.");if(t.impostor.viewsPerAxis>16)throw new Error("impostorViewsPerAxis must not exceed 16.");if(t.impostor.frameResolution<32)throw new Error("impostorFrameResolution must be at least 32.");if(t.impostor.padding<we)throw new Error(`impostorPadding must be at least ${we} pixels for mip-safe atlas isolation.`);if((t.impostor.frameResolution+t.impostor.padding*2)*t.impostor.viewsPerAxis*Vs>Re)throw new Error(`Impostor atlas size must not exceed ${Re} pixels.`);if(t.impostor.cameraMargin<1)throw new Error("impostorCameraMargin must be at least 1.")}const zs="./config/grass.yaml";function ks(){return`${zs}?v=${encodeURIComponent("v0.9.6+5a2200558672")}`}class Ka{async load(e=ks()){return this.parse(await ps(e,"grass config"))}parse(e){const s=Gs.parse(e,"grass"),a=new bs(s,"Grass"),r={instanceCount:a.number("instanceCount",M),patchSize:a.number("patchSize",p),geometry:{variantCount:a.number("variantCount",M),bladesPerClump:a.number("bladesPerClump",M),bladeSegments:a.number("bladeSegments",M),clumpRadius:a.number("clumpRadius",p),bladeHeightMin:a.number("bladeHeightMin",p),bladeHeightMax:a.number("bladeHeightMax",p),bladeWidthMin:a.number("bladeWidthMin",p),bladeWidthMax:a.number("bladeWidthMax",p),bladeLeanMin:a.number("bladeLeanMin",w),bladeLeanMax:a.number("bladeLeanMax",w),bladeCurve:a.number("bladeCurve",{minimum:0,maximum:1.2}),midBladesPerClump:a.number("midBladesPerClump",M),midBladeSegments:a.number("midBladeSegments",M),midRadiusScale:a.number("midRadiusScale",p),midHeightScale:a.number("midHeightScale",p),midWidthScale:a.number("midWidthScale",p),midLeanScale:a.number("midLeanScale",w)},distribution:{seed:a.number("seed",Ds),rootSink:a.number("rootSink",w),maxSlopeDegrees:a.number("maxSlopeDegrees",{minimum:0,maximum:89}),heightVariation:a.number("heightVariation",{minimum:0,maximum:.95}),widthVariation:a.number("widthVariation",{minimum:0,maximum:.95}),densityMin:a.number("densityMin",{minimum:0,maximum:1}),densityMax:a.number("densityMax",{minimum:0,maximum:1}),densityScale:a.number("densityScale",p)},wind:{directionX:a.number("windDirectionX"),directionZ:a.number("windDirectionZ"),strength:a.number("windStrength",w),gustScale:a.number("gustScale",p),gustSpeed:a.number("gustSpeed",w),flutterStrength:a.number("flutterStrength",w),flutterSpeed:a.number("flutterSpeed",w)},material:{baseColor:a.string("baseColor"),tipColor:a.string("tipColor"),dryColor:a.string("dryColor"),rootDarkening:a.number("rootDarkening",{minimum:0,maximum:1}),normalUp:a.number("normalUp",{minimum:0,maximum:1}),ambientBoost:a.number("ambientBoost",{minimum:0,maximum:1}),backlightStrength:a.number("backlightStrength",{minimum:0,maximum:1})},lod:{nearMaxDistance:a.number("nearMaxDistance",p),midMaxDistance:a.number("midMaxDistance",p),farMaxDistance:a.number("farMaxDistance",p),hysteresisDistance:a.number("hysteresisDistance",w),transitionDistance:a.number("transitionDistance",p)},qa:{warmupSeconds:a.number("qaWarmupSeconds",w),sampleSeconds:a.number("qaSampleSeconds",p)},impostor:{viewsPerAxis:a.number("impostorViewsPerAxis",M),frameResolution:a.number("impostorFrameResolution",M),padding:a.number("impostorPadding",Ts),cameraMargin:a.number("impostorCameraMargin",p)}};return s.assertFullyConsumed(),Hs(r),Object.freeze({...r,geometry:Object.freeze(r.geometry),distribution:Object.freeze(r.distribution),wind:Object.freeze(r.wind),material:Object.freeze(r.material),lod:Object.freeze(r.lod),qa:Object.freeze(r.qa),impostor:Object.freeze(r.impostor)})}}class Xs{constructor(e){c(this,"state");this.state=e>>>0}next(){this.state=this.state+1831565813>>>0;let e=this.state;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}range(e,s){return e+(s-e)*this.next()}}const $s=Math.PI*2,Fe=2654435769,qs=1e-4;function Ne(t,e,s){const a=R.clamp(s,0,1);if(!(e>qs))return{y:t*a,z:0};const r=a*a,o=e*r,n=t/e;return{y:n*Math.sin(o),z:n*(1-Math.cos(o))}}class Za{createLodVariants(e,s){const a={bladesPerClump:e.midBladesPerClump,bladeSegments:e.midBladeSegments,clumpRadius:e.clumpRadius*e.midRadiusScale,bladeHeightMin:e.bladeHeightMin*e.midHeightScale,bladeHeightMax:e.bladeHeightMax*e.midHeightScale,bladeWidthMin:e.bladeWidthMin*e.midWidthScale,bladeWidthMax:e.bladeWidthMax*e.midWidthScale,bladeLeanMin:e.bladeLeanMin*e.midLeanScale,bladeLeanMax:e.bladeLeanMax*e.midLeanScale,bladeCurve:e.bladeCurve};let r=[],o=[];try{return r=this.createVariants(e,e.variantCount,s),o=this.createVariants(a,e.variantCount,s^Fe),{near:r,mid:o}}catch(n){throw X([...r,...o],"LOD variant"),n}}createInstancedGeometry(e,s,a,r,o){var i,u;const n=new ys;try{e.index&&n.setIndex(e.index);for(const[m,S]of Object.entries(e.attributes))n.setAttribute(m,S);n.setAttribute("instanceVariation",(r==null?void 0:r.variation)??new ae(s,4));const h=s.length/4;r!=null&&r.shape&&n.setAttribute("instanceShape",r.shape);const d=a??new Float32Array(h).fill(1);return n.setAttribute("instanceCoverage",(r==null?void 0:r.coverage)??new ae(d,1)),n.setAttribute("instanceBiome",(r==null?void 0:r.biome)??new ae(o??new Float32Array(h),1)),n.boundingBox=((i=e.boundingBox)==null?void 0:i.clone())??null,n.boundingSphere=((u=e.boundingSphere)==null?void 0:u.clone())??null,n}catch(h){throw X([n],"instanced geometry"),h}}disposeInstancedGeometry(e,s=!1){for(const a of Object.keys(e.attributes))(s||a!=="instanceVariation"&&a!=="instanceShape"&&a!=="instanceCoverage"&&a!=="instanceBiome")&&e.deleteAttribute(a);e.setIndex(null),e.dispose()}disposeInstancedMesh(e,s=!1){const a=e.geometry;j([{dispose:()=>this.disposeInstancedGeometry(a,s)},s?void 0:e])}createVariants(e,s,a){const r=[];try{for(let o=0;o<s;o+=1)r.push(this.createClump(e,a+o*Fe));return r}catch(o){throw X(r,"partial variant set"),o}}createClump(e,s){const a=new Xs(s),r=[],o=[],n=[],i=[],u=[],h=[];for(let m=0;m<e.bladesPerClump;m+=1){const S=a.range(0,$s),v=Math.sqrt(a.next())*e.clumpRadius,y=Math.cos(S)*v,D=Math.sin(S)*v,C=S+a.range(-.85,.85),f=Math.cos(C)*.5,T=Math.sin(C)*.5,F=-Math.sin(C),E=Math.cos(C),N=S+a.range(-.65,.65),I=a.range(e.bladeLeanMin,e.bladeLeanMax),ve=Math.cos(N)*I,pe=Math.sin(N)*I,Ge=a.range(e.bladeHeightMin,e.bladeHeightMax),hs=a.range(e.bladeWidthMin,e.bladeWidthMax),ee=a.next(),se=a.next(),be=r.length/3;for(let P=0;P<e.bladeSegments;P+=1){const G=P/e.bladeSegments,De=G*G*(3-2*G),fs=Math.pow(1-G,.72),z=hs*fs,k=Ne(Ge,e.bladeCurve,G),ye=y+ve*De+F*k.z,Ce=D+pe*De+E*k.z;r.push(ye-f*z,k.y,Ce-T*z,ye+f*z,k.y,Ce+T*z),o.push(0,G,1,G),n.push(G,G),i.push(ee,ee),u.push(se,se)}const te=Ne(Ge,e.bladeCurve,1),ds=y+ve+F*te.z,ms=D+pe+E*te.z,gs=r.length/3;r.push(ds,te.y,ms),o.push(.5,1),n.push(1),i.push(ee),u.push(se);for(let P=0;P<e.bladeSegments-1;P+=1){const G=be+P*2;h.push(G,G+2,G+1,G+2,G+3,G+1)}const Te=be+(e.bladeSegments-1)*2;h.push(Te,gs,Te+1)}const d=new Cs;try{return d.setAttribute("position",new W(r,3)),d.setAttribute("uv",new W(o,2)),d.setAttribute("grassProgress",new W(n,1)),d.setAttribute("grassPhase",new W(i,1)),d.setAttribute("grassBladeShade",new W(u,1)),d.setIndex(h),d.computeVertexNormals(),d.computeBoundingBox(),d.computeBoundingSphere(),d}catch(m){throw X([d],"clump geometry"),m}}}function X(t,e){try{j(t)}catch(s){console.warn(`[Drusniel World] Grass ${e} cleanup failed.`,s)}}const js=0,is=Object.freeze({start:36,end:74,floor:.18}),Ja=1.12,Qa=1.1,er=1.2,sr=.35,Pe=.07,tr=.08,ar=.15;var b=(t=>(t[t.Near=0]="Near",t[t.Mid=1]="Mid",t[t.Far=2]="Far",t[t.Terrain=3]="Terrain",t))(b||{});class rr{constructor(e){c(this,"patches",new Map);this.patchSize=e}keyFor(e){return this.key(Math.floor(e.x/this.patchSize),Math.floor(e.z/this.patchSize))}coordinatesFor(e){return[Math.floor(e.x/this.patchSize),Math.floor(e.z/this.patchSize)]}register(e){if(this.patches.has(e.id))throw new Error(`Grass patch ${e.id} is already registered.`);this.patches.set(e.id,e)}values(){return this.patches.values()}clear(){this.patches.clear()}key(e,s){return`${e}:${s}`}}const re=.001,Ys=1/1024,Le=3,Ks=4;function Zs(t,e){let s=0,a=t.length;for(;s<a;){const r=s+a>>>1;t[r]>e?s=r+1:a=r}return s}class nr{constructor(e){c(this,"cameraPosition",new Y);c(this,"closestPoint",new Y);c(this,"projectionViewMatrix",new Es);c(this,"frustum",new xs);c(this,"midFalloff",{start:0,end:1,floor:1,scale:1});c(this,"submittedMidVertices",0);c(this,"submittedFarInstances",0);c(this,"midInstanceRadius",Ks);c(this,"compactFarthest",0);c(this,"matrixSwap",new Float32Array(16));c(this,"variationSwap",new Float32Array(4));this.config=e}setMidDensityFalloff(e){this.midFalloff=e}setMidInstanceRadius(e){Number.isFinite(e)&&e>0&&(this.midInstanceRadius=e)}update(e,s){e.updateMatrixWorld(),e.getWorldPosition(this.cameraPosition),this.projectionViewMatrix.multiplyMatrices(e.projectionMatrix,e.matrixWorldInverse),this.frustum.setFromProjectionMatrix(this.projectionViewMatrix),this.submittedMidVertices=0;const a=this.config.farMaxDistance+this.config.transitionDistance;for(const r of s){if(r.bounds.clampPoint(this.cameraPosition,this.closestPoint),r.distance=this.cameraPosition.distanceTo(this.closestPoint),r.distance>=a){r.inFrustum=!1,r.nearMesh&&(r.nearMesh.visible=!1),r.midMesh.visible=!1,r.farMesh&&(r.farMesh.visible=!1);continue}r.inFrustum=this.frustum.intersectsBox(r.bounds),r.farMesh||r.hasFarImpostor?this.updateThreeStagePatch(r):this.updateLegacyPatch(r)}}updateFarGroups(e){const s=this.config.farMaxDistance+this.config.transitionDistance,a=this.config.midMaxDistance-this.config.transitionDistance;this.submittedFarInstances=0;for(const r of e){if(r.bounds.clampPoint(this.cameraPosition,this.closestPoint),r.distance=this.cameraPosition.distanceTo(this.closestPoint),r.distance>=s){r.inFrustum=!1,r.mesh.visible=!1;continue}if(r.inFrustum=this.frustum.intersectsBox(r.bounds),!r.inFrustum){r.mesh.visible=!1;continue}const o=this.cameraPosition.distanceTo(r.boundingSphere.center)+r.boundingSphere.radius;r.mesh.visible=o>a,r.mesh.visible&&(this.submittedFarInstances+=r.mesh.count)}}getSubmittedMidVertices(){return this.submittedMidVertices}getSubmittedFarInstances(){return this.submittedFarInstances}updateThreeStagePatch(e){e.lod=this.resolveLevel(e.distance,e.lod,!0),e.nearCoverage=this.resolveNearCoverage(e.distance);const s=this.resolveFarEntry(e.distance);if(e.midCoverage=Math.max(0,(1-e.nearCoverage)*(1-s)),e.farCoverage=this.resolveFarCoverage(e.distance,e.nearCoverage,s),!e.inFrustum){e.nearMesh&&(e.nearMesh.visible=!1),e.midMesh.visible=!1,e.farMesh&&(e.farMesh.visible=!1);return}const a=this.cameraPosition.distanceTo(e.boundingSphere.center)+e.boundingSphere.radius,r=this.config.nearMaxDistance-this.config.transitionDistance,o=this.config.nearMaxDistance+this.config.transitionDistance,n=this.config.midMaxDistance-this.config.transitionDistance,i=this.config.midMaxDistance+this.config.transitionDistance,u=this.config.farMaxDistance+this.config.transitionDistance;e.nearMesh&&(e.nearMesh.visible=e.distance<o),e.midMesh.visible=a>r&&e.distance<i,e.midMesh.visible&&(this.compactMidInstances(e,r,a)===0?e.midMesh.visible=!1:this.trimMidDraw(e,Math.min(a,this.compactFarthest))),e.farMesh&&(e.farMesh.visible=a>n&&e.distance<u)}trimMidDraw(e,s){const a=e.midSortedDithers;if(!a)return;const r=this.resolveNearCoverage(s),o=this.resolveFarEntry(e.distance),n=Math.max(r,o),u=1-this.midFalloff.scale*R.lerp(1,this.midFalloff.floor,R.smoothstep(e.distance,this.midFalloff.start,this.midFalloff.end))*(1-n)-Ys,h=u<=0?a.length:Zs(a,u);e.midMesh.geometry.setDrawRange(0,h*Le),this.submittedMidVertices+=h*Le*e.midMesh.count}compactMidInstances(e,s,a){const r=e.midMesh,o=e.instanceCount;if(o<=0)return r.count=0,this.compactFarthest=0,0;if(e.distance>s)return r.count=o,this.compactFarthest=a,o;const n=r.instanceMatrix.array,i=r.geometry.getAttribute("instanceVariation"),u=r.geometry.getAttribute("instanceCoverage"),h=r.geometry.getAttribute("instanceBiome");if(!i||!u||!h)return r.count=o,this.compactFarthest=a,o;const d=i.array,m=u.array,S=h.array,v=e.baseMidCoverage,y=r.position,D=this.cameraPosition,C=this.midInstanceRadius;let f=0,T=0,F=!1;for(let E=0;E<o;E+=1){const N=E*16,I=Math.hypot(y.x+n[N+12]-D.x,y.y+n[N+13]-D.y,y.z+n[N+14]-D.z);I+C<=s||(T=Math.max(T,I),f!==E&&(F=!0,Be(n,f*16,N,16,this.matrixSwap),Be(d,f*4,E*4,4,this.variationSwap),ne(m,f,E),ne(S,f,E),v&&ne(v,f,E)),f+=1)}return f!==r.count&&(r.count=f),F&&(r.instanceMatrix.needsUpdate=!0,i.needsUpdate=!0,u.needsUpdate=!0,h.needsUpdate=!0),this.compactFarthest=f===0?0:T,f}updateLegacyPatch(e){const s=e.nearMesh;if(s){if(e.lod=this.resolveLevel(e.distance,e.lod,!1),e.nearCoverage=this.resolveNearCoverage(e.distance),e.midDistanceFade=this.resolveLegacyMidDistanceFade(e.distance),!e.inFrustum){s.visible=!1,e.midMesh.visible=!1;return}s.visible=e.nearCoverage>re,e.midMesh.visible=e.nearCoverage<1-re&&e.midDistanceFade>re}}resolveLevel(e,s,a){const r=this.config.hysteresisDistance;if(s===b.Near)return e>this.config.nearMaxDistance+r?b.Mid:b.Near;if(s===b.Mid){if(e<this.config.nearMaxDistance-r)return b.Near;const o=a?this.config.midMaxDistance:this.config.farMaxDistance;return e>o+r?a?b.Far:b.Terrain:b.Mid}return s===b.Far&&a?e<this.config.midMaxDistance-r?b.Mid:e>this.config.farMaxDistance+r?b.Terrain:b.Far:e>=this.config.farMaxDistance-r?b.Terrain:a?b.Far:b.Mid}resolveNearCoverage(e){const s=this.config.nearMaxDistance-this.config.transitionDistance,a=this.config.nearMaxDistance+this.config.transitionDistance;return 1-R.smoothstep(e,s,a)}resolveFarEntry(e){const s=this.config.midMaxDistance-this.config.transitionDistance,a=this.config.midMaxDistance+this.config.transitionDistance;return R.smoothstep(e,s,a)}resolveFarCoverage(e,s,a){const r=this.config.farMaxDistance-this.config.transitionDistance,o=this.config.farMaxDistance+this.config.transitionDistance,n=R.smoothstep(e,r,o),i=(1-s)*js;return R.lerp(i,1,a)*(1-n)}resolveLegacyMidDistanceFade(e){const s=this.config.farMaxDistance-this.config.transitionDistance,a=this.config.farMaxDistance+this.config.transitionDistance;return 1-R.smoothstep(e,s,a)}}function ne(t,e,s){const a=t[e];t[e]=t[s],t[s]=a}function Be(t,e,s,a,r){r.set(t.subarray(e,e+a)),t.copyWithin(e,s,s+a),t.set(r.subarray(0,a),s)}const Js=.18,Qs=2.5;function ir(t){return 1+Math.max(0,t)*Qs}const et=1e-4;function st(t,e,s){if(!(e>et))return{y:t*s,z:0};const a=s*s,r=e*a;return{y:t*Math.sin(r)/e,z:t*(1-Math.cos(r))/e}}function or(t,e){return st(t,e,1).z}function lr(t){if(Object.values(t).some(n=>!Number.isFinite(n)||n<0))throw new RangeError("Grass impostor bounds parameters must be finite and non-negative.");const s=t.cardRadius*t.maximumHorizontalScale*t.footprintScale,a=t.cardRadius*t.maximumVerticalScale,r=Math.hypot(s,a);return t.centerHeight*t.maximumVerticalScale+r+t.maximumWindDisplacement+t.safetyMargin}function ur(t){if(Object.values(t).some(i=>!Number.isFinite(i)||i<0))throw new RangeError("Grass single-blade bounds parameters must be finite and non-negative.");const s=(t.bladeLean+t.bladeWidth+t.bladeCurveReach+t.shapeReach)*t.maximumHorizontalScale,a=t.bladeHeight*t.maximumVerticalScale,r=Math.hypot(s,a),o=(t.windStrength+t.flutterStrength)*t.maximumArtWindScale*t.maximumInstanceWindScale*t.maximumWindStiffness*t.bladeHeight*t.maximumVerticalScale,n=Math.hypot(t.maximumInteractionStrength,t.maximumInteractionStrength*t.interactionVerticalScale);return r+o+n+t.safetyMargin}const J=new Y(...Ws).normalize(),tt=-J.x/Math.max(J.y,.2),at=-J.z/Math.max(J.y,.2),Ie=.001;class rt{constructor(){c(this,"disc",new K(0,0,0,1));c(this,"strengthValue",0)}set(e,s,a,r,o,n){if(!Number.isFinite(e)||!Number.isFinite(s)||!Number.isFinite(a)||!Number.isFinite(r)||!Number.isFinite(o)||!Number.isFinite(n)||r<=0||n<=Ie){this.clear();return}const i=Math.max(0,o);this.disc.set(e+tt*i,s,a+at*i,r),this.strengthValue=Math.min(1,n)}clear(){this.strengthValue=0}get strength(){return this.strengthValue}isEnabled(){return this.strengthValue>Ie}}const ie=new rt,V=4,We={resolution:256,coverage:24,recoveryRate:.5,freshnessRate:1.4},Oe=.04,nt=.3,it=1/30,ot=1e-6,Ve=.1,oe=8,lt=`
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`,ut=`
precision highp float;

#define MAX_CONTACTS ${V}

uniform sampler2D uPrevious;
uniform vec2 uCenter;
uniform vec2 uPreviousCenter;
uniform float uCoverage;
uniform float uInitialize;
uniform float uDelta;
uniform float uRecoveryRate;
uniform float uRecoveryFloor;
uniform float uFreshnessRate;
uniform int uContactCount;
// xy world position, z radius, w strength
uniform vec4 uContacts[MAX_CONTACTS];
// xy travel direction, z inner radius fraction, w directional blend
uniform vec4 uContactShapes[MAX_CONTACTS];

varying vec2 vUv;

void main() {
  vec2 world = uCenter + (vUv - 0.5) * uCoverage;

  // Reproject through the scroll delta. Texels that just entered the covered
  // square have no history and read neutral.
  vec2 previousUv = (world - uPreviousCenter) / uCoverage + 0.5;
  vec4 previous = vec4(0.5, 0.5, 0.0, 0.0);
  if (
    uInitialize < 0.5 &&
    previousUv.x >= 0.0 && previousUv.x <= 1.0 &&
    previousUv.y >= 0.0 && previousUv.y <= 1.0
  ) {
    previous = texture2D(uPrevious, previousUv);
  }

  vec2 direction = previous.rg * 2.0 - 1.0;
  // Exponential decay alone leaves faint crush hanging around forever, and on
  // the 8-bit fallback target it freezes outright: below roughly 0.24 the
  // per-frame decrement rounds to zero and the texel never recovers. The linear
  // floor term guarantees the field returns to neutral in bounded time.
  float crush = max(
    0.0,
    previous.b * exp(-uRecoveryRate * uDelta) - uRecoveryFloor * uDelta
  );
  float freshness = max(0.0, previous.a - uFreshnessRate * uDelta);

  float appliedCrush = 0.0;
  vec2 appliedDirection = vec2(0.0);
  for (int index = 0; index < MAX_CONTACTS; index += 1) {
    if (index >= uContactCount) {
      break;
    }
    vec4 contact = uContacts[index];
    vec4 shape = uContactShapes[index];
    vec2 offset = world - contact.xy;
    // Contacts occupy well under one percent of the trail square. Reject the
    // other texels before paying for sqrt and the smoothstep falloffs.
    float distanceSquared = dot(offset, offset);
    float radiusSquared = contact.z * contact.z;
    if (distanceSquared >= radiusSquared) {
      continue;
    }
    float distanceToContact = sqrt(distanceSquared);
    // A disc for footfalls (inner = 0); a ring for the expanding landing pulse.
    float inner = contact.z * shape.z;
    float ringMask = inner > 0.0
      ? smoothstep(inner * 0.4, inner, distanceToContact)
      : 1.0;
    float falloff =
      ringMask *
      (1.0 - smoothstep(max(inner, contact.z * 0.25), contact.z, distanceToContact));
    float amount = falloff * contact.w;
    if (amount <= 0.0) {
      continue;
    }
    vec2 away = distanceToContact > 1e-4
      ? offset / distanceToContact
      : shape.xy;
    vec2 push = mix(away, shape.xy, shape.w);
    float pushLength = length(push);
    push = pushLength > 1e-4 ? push / pushLength : away;
    appliedDirection += push * amount;
    appliedCrush = max(appliedCrush, amount);
  }

  if (appliedCrush > 0.0) {
    float appliedLength = length(appliedDirection);
    vec2 newDirection = appliedLength > 1e-4
      ? appliedDirection / appliedLength
      : direction;
    // A stronger contact overrides the stored lay of the grass; a weaker one
    // only nudges it, so a light brush does not undo a deep footprint.
    float authority = appliedCrush / max(crush, appliedCrush);
    direction = mix(direction, newDirection, clamp(authority, 0.0, 1.0));
    float directionLength = length(direction);
    direction = directionLength > 1e-4 ? direction / directionLength : newDirection;
    crush = max(crush, appliedCrush);
    freshness = max(freshness, appliedCrush);
  }

  gl_FragColor = vec4(direction * 0.5 + 0.5, clamp(crush, 0.0, 1.0), clamp(freshness, 0.0, 1.0));
}
`;class ct{constructor(){c(this,"config",{...We});c(this,"inverseCoverage",1/We.coverage);c(this,"renderer");c(this,"targets");c(this,"readTarget",0);c(this,"recoveryFloorRatio",Oe);c(this,"scene",new Rs);c(this,"camera",new ws(-1,1,1,-1,0,1));c(this,"center",new _);c(this,"previousCenter",new _);c(this,"focus",new _);c(this,"contacts",new Float32Array(V*oe));c(this,"contactCount",0);c(this,"accumulatedDeltaSeconds",0);c(this,"material");c(this,"quad");c(this,"hasFocus",!1);c(this,"enabled",!1)}configure(e){const s={...this.config,...e};if(ht(s),this.config=s,this.inverseCoverage=1/this.config.coverage,this.renderer){const a=this.renderer;this.releaseTargets(),this.attach(a)}}attach(e){if(this.targets){if(this.renderer===e)return;this.releaseTargets()}this.renderer=e;const s=[];let a;try{const r=this.targetSize(),o=mt(e);this.recoveryFloorRatio=o===as?Oe:nt;const n=Ue(r,o);s.push(n);const i=Ue(r,o);s.push(i),this.targets=[n,i],s.length=0,this.material=new _s({vertexShader:lt,fragmentShader:ut,depthTest:!1,depthWrite:!1,uniforms:{uPrevious:{value:this.targets[0].texture},uCenter:{value:new _},uPreviousCenter:{value:new _},uCoverage:{value:this.config.coverage},uInitialize:{value:0},uDelta:{value:0},uRecoveryRate:{value:this.config.recoveryRate},uRecoveryFloor:{value:this.config.recoveryRate*this.recoveryFloorRatio},uFreshnessRate:{value:this.config.freshnessRate},uContactCount:{value:0},uContacts:{value:Array.from({length:V},()=>new K)},uContactShapes:{value:Array.from({length:V},()=>new K(0,1,0,0))}}}),a=new As(2,2),this.quad=new Ms(a,this.material),a=void 0,this.quad.frustumCulled=!1,this.scene.add(this.quad),this.enabled=!0,this.primeTargets()}catch(r){try{j(s)}catch(o){console.warn("[Drusniel World] Pending grass trail target cleanup failed.",o)}if(a)try{a.dispose()}catch(o){console.warn("[Drusniel World] Pending grass trail geometry cleanup failed.",o)}try{this.releaseTargets()}catch(o){console.warn("[Drusniel World] Grass trail attach cleanup failed.",o)}throw this.renderer=void 0,r}}setFocus(e,s){!Number.isFinite(e)||!Number.isFinite(s)||(this.focus.set(e,s),this.hasFocus=!0)}submitContact(e,s,a,r,o,n,i,u){if(!dt(e,s,a,r,o,n,i,u)||r<=0||a<=0||this.contactCount>=V)return;const h=this.contactCount*oe;this.contacts[h]=e,this.contacts[h+1]=s,this.contacts[h+2]=a,this.contacts[h+3]=r,this.contacts[h+4]=o,this.contacts[h+5]=n,this.contacts[h+6]=i,this.contacts[h+7]=u,this.contactCount+=1}render(e){const s=this.renderer,a=this.targets,r=this.material;if(!s||!a||!r||!this.enabled||!this.hasFocus){this.resetPendingFrame();return}if(s.getContext().isContextLost()){this.resetPendingFrame();return}if(!Number.isFinite(e)||e<=0){this.resetPendingFrame();return}if(this.accumulatedDeltaSeconds=Math.min(Ve,this.accumulatedDeltaSeconds+Math.min(e,Ve)),this.accumulatedDeltaSeconds+ot<it)return;const o=this.accumulatedDeltaSeconds;this.accumulatedDeltaSeconds=0,this.previousCenter.copy(this.center);const n=this.config.coverage/this.targetSize();this.center.set(Math.round(this.focus.x/n)*n,Math.round(this.focus.y/n)*n);const i=r.uniforms;i.uPrevious.value=a[this.readTarget].texture,i.uCenter.value.copy(this.center),i.uPreviousCenter.value.copy(this.previousCenter),i.uCoverage.value=this.config.coverage,i.uDelta.value=o,i.uRecoveryRate.value=this.config.recoveryRate,i.uRecoveryFloor.value=this.config.recoveryRate*this.recoveryFloorRatio,i.uFreshnessRate.value=this.config.freshnessRate,i.uContactCount.value=this.contactCount;const u=i.uContacts.value,h=i.uContactShapes.value;for(let S=0;S<this.contactCount;S+=1){const v=S*oe;u[S].set(this.contacts[v],this.contacts[v+1],this.contacts[v+2],this.contacts[v+3]),h[S].set(this.contacts[v+4],this.contacts[v+5],R.clamp(this.contacts[v+6],0,.95),R.clamp(this.contacts[v+7],0,1))}this.contactCount=0;const d=1-this.readTarget,m=s.getRenderTarget();try{s.setRenderTarget(a[d]),s.render(this.scene,this.camera),this.readTarget=d}finally{s.setRenderTarget(m)}}isEnabled(){return this.enabled&&this.hasFocus&&this.targets!==void 0}getTexture(){var e;return((e=this.targets)==null?void 0:e[this.readTarget].texture)??null}getCenter(){return this.center}getInverseCoverage(){return this.inverseCoverage}dispose(){this.renderer=void 0,this.enabled=!1,this.hasFocus=!1,this.resetPendingFrame(),this.releaseTargets()}targetSize(){return Math.max(32,Math.round(this.config.resolution))}resetPendingFrame(){this.contactCount=0,this.accumulatedDeltaSeconds=0}releaseTargets(){const e=this.quad,s=this.material,a=this.targets;this.quad=void 0,this.material=void 0,this.targets=void 0,this.readTarget=0,this.enabled=!1,j([{dispose:()=>e==null?void 0:e.removeFromParent()},e==null?void 0:e.geometry,s,...a??[]])}primeTargets(){const e=this.renderer,s=this.targets,a=this.material;if(!e||!s||!a)return;a.uniforms.uInitialize.value=1,a.uniforms.uContactCount.value=0,a.uniforms.uDelta.value=0;const r=e.getRenderTarget();try{for(const o of s)e.setRenderTarget(o),e.render(this.scene,this.camera)}finally{e.setRenderTarget(r),a.uniforms.uInitialize.value=0}}}function ht(t){if(!Number.isInteger(t.resolution)||t.resolution<32)throw new Error("Grass trail resolution must be an integer of at least 32.");for(const[e,s]of[["coverage",t.coverage],["recoveryRate",t.recoveryRate],["freshnessRate",t.freshnessRate]])if(!Number.isFinite(s)||s<=0)throw new Error(`Grass trail ${e} must be a positive finite number.`)}function dt(...t){return t.every(Number.isFinite)}function mt(t){const e=t.extensions;return e.has("EXT_color_buffer_half_float")||e.has("EXT_color_buffer_float")?as:rs}function Ue(t,e){const s=new Fs(t,t,{format:Ns,type:e,minFilter:Z,magFilter:Z,wrapS:Ee,wrapT:Ee,depthBuffer:!1,stencilBuffer:!1,generateMipmaps:!1});return s.texture.colorSpace=ns,s}const $=new ct,gt=1/48,ft=.06,St=.085,vt=.55,pt=.037,Gt=.31,bt=1.7,Tt=.72,Dt=.28,yt=.34,Ct=.073,Et=1.45;function xt(t){return`mix(${yt.toFixed(2)}, 1.0, 0.5 + 0.5 * sin(${t} * ${Ct.toFixed(3)}))`}function Rt(t){return`fract(dot(floor(${t} * ${Et.toFixed(2)}), vec2(0.1731, 0.4197)))`}function wt(t){const{target:e,position:s,windDirection:a,time:r,scale:o,speed:n}=t;return`
float ${e} = 0.5 + 0.5 * (
  sin(
    dot(${s}, ${a}) * ${o} -
    ${r} * ${n}
  ) * ${Tt.toFixed(2)} +
  sin(
    dot(
      ${s},
      vec2(-${a}.y, ${a}.x)
    ) * ${pt.toFixed(3)} +
    ${r} * ${Gt.toFixed(2)} +
    ${bt.toFixed(2)}
  ) * ${Dt.toFixed(2)}
);
`}const x=128,le=4,ue=11;function q(t,e,s){let a=Math.imul(t,374761393)^Math.imul(e,668265263)^s;return a=Math.imul(a^a>>>13,1274126177),((a^a>>>16)>>>0)/4294967296}function He(t,e,s,a){const r=Math.floor(t),o=Math.floor(e),n=t-r,i=e-o,u=n*n*(3-2*n),h=i*i*(3-2*i),d=(r%s+s)%s,m=(o%s+s)%s,S=(d+1)%s,v=(m+1)%s,y=q(d,m,a),D=q(S,m,a),C=q(d,v,a),f=q(S,v,a),T=y+(D-y)*u,F=C+(f-C)*u;return T+(F-T)*h}function ze(t){return Math.max(0,Math.min(255,Math.round(t*255)))}function _t(t=1597334677){const e=new Uint8Array(x*x*2);for(let a=0;a<x;a+=1)for(let r=0;r<x;r+=1){const o=r/x*le,n=a/x*le,i=He(o,n,le,t),u=He(r/x*ue,a/x*ue,ue,t^2654435769),h=(i+u*.5)/1.5,d=h*h*(3-2*h),m=(a*x+r)*2;e[m]=ze(d),e[m+1]=ze(u)}const s=new Ps(e,x,x,Ls,rs);return s.name="grass-wind-noise",s.wrapS=xe,s.wrapT=xe,s.minFilter=Z,s.magFilter=Z,s.generateMipmaps=!1,s.colorSpace=ns,s.needsUpdate=!0,s}let U;function cr(){return U||(U=_t()),U}function hr(){const t=U;U=void 0,t==null||t.dispose()}const At=.38,Mt=1,Ft=1.24,Nt=.9,Pt=.18,Lt=.2,Bt=.035,It=.52,Wt=.22,Ot=.62,Vt=.5,Ut=.84,Ht=1.05,zt=.44,kt=0,Xt=.33,$t=.62,qt=.4,jt=.5,l={tipStart:At,tipEnd:Mt,tipLuminanceScale:Ft,dryLuminanceScale:Nt,shadeDrynessPivot:Pt,shadeDrynessScale:Lt,shadeDrynessMaximum:Bt,instanceDrynessBase:It,instanceDrynessTip:Wt,drynessMaximum:Ot,rootFadeEnd:Vt,shadeLightMinimum:Ut,shadeLightMaximum:Ht,shadowDesaturation:zt,groundContactStart:kt,groundContactEnd:Xt,groundContactStrength:$t,groundContactBaseScale:qt,groundContactDryScale:jt},L=new Y(.2126,.7152,.0722);function g(t){if(!Number.isFinite(t))throw new TypeError("Grass palette GLSL values must be finite.");return Number.isInteger(t)?`${t}.0`:String(t)}function H(t){return t.r*L.x+t.g*L.y+t.b*L.z}const ke=new A;let os=0;function dr(t){os=Number.isFinite(t)?Math.min(Math.max(t,0),1):0}function ce(t,e=os){if(!(e>0))return;const s=H(t);ke.setRGB(s,s,s),t.lerp(ke,Math.min(e,1))}function Se(t,e,s,a,r,o){t.set(a),e.set(r),s.set(o);const n=Math.max(H(t),1e-4);e.multiplyScalar(n*l.tipLuminanceScale/Math.max(H(e),1e-4)),s.multiplyScalar(n*l.dryLuminanceScale/Math.max(H(s),1e-4)),ce(t),ce(e),ce(s)}const Yt=.62,Kt=g(Yt),Xe=.44,Zt=.32,$e=.15;function B(t,e,s){const a=Math.min(1,Math.max(0,(s-t)/(e-t)));return a*a*(3-2*a)}function he(t){const e=B(l.tipStart,l.tipEnd,t),s=Math.min(l.drynessMaximum,$e*(l.instanceDrynessBase+e*l.instanceDrynessTip)),a=(1+(l.tipLuminanceScale-1)*e*Zt)*(1-s)+l.dryLuminanceScale*s,r=Xe+(1-Xe)*B(0,l.rootFadeEnd,t),o=1-B(l.groundContactStart,l.groundContactEnd,t),n=l.groundContactBaseScale+(l.groundContactDryScale-l.groundContactBaseScale)*$e;return r*(a-l.groundContactStrength*o*(a-n))}const ls=Jt();function Jt(){let e=0;for(let n=0;n<4096;n+=1){const i=(n+.5)/4096;e+=he(i)*2*(1-i)}e/=4096;const s=1.5*e-.5*he(1);let a=0,r=1;for(let n=0;n<64;n+=1){const i=(a+r)*.5;he(i)<s?a=i:r=i}const o=(a+r)*.5;if(!Number.isFinite(o)||o<0||o>=1)throw new RangeError("The grass vertex-palette root progress must resolve inside the blade.");return o}const Qt=g(Number(ls.toFixed(5))),ea=1/3,qe=.5,je=.95,de=new A,Ye=new A,me=new A,ge=new A,fe=new A,Ke=new A;function Ze(t,e,s,a,r,o,n,i,u,h){const d=B(l.tipStart,l.tipEnd,r);t.copy(e).lerp(s,d*u);const m=Math.min(Math.max(0,(l.shadeDrynessPivot-o)*l.shadeDrynessScale),l.shadeDrynessMaximum),S=n*(l.instanceDrynessBase+d*l.instanceDrynessTip);t.lerp(a,Math.min(Math.max(0,m+S),l.drynessMaximum));const v=h+(1-h)*B(0,l.rootFadeEnd,r),y=l.shadeLightMinimum+(l.shadeLightMaximum-l.shadeLightMinimum)*o,D=v*y*i;t.multiplyScalar(D);const C=1-B(l.groundContactStart,l.groundContactEnd,r);de.copy(e).multiplyScalar(l.groundContactBaseScale),Ye.copy(a).multiplyScalar(l.groundContactDryScale),de.lerp(Ye,n).multiplyScalar(D),t.lerp(de,C*l.groundContactStrength);const f=H(t),T=Math.min(Math.max(0,(1-D)*l.shadowDesaturation),1);return t.r+=(f-t.r)*T,t.g+=(f-t.g)*T,t.b+=(f-t.b)*T,t}function Je(t,e,s,a,r,o,n){Ze(t,e,s,a,ls,qe,r,je,n,o),Ze(Ke,e,s,a,1,qe,r,je,n,o),t.lerp(Ke,ea)}function Qe(t,e,s,a,r,o,n){Se(me,ge,fe,s,a,r),Je(t,me,ge,fe,0,o,n),Je(e,me,ge,fe,1,o,n)}const us=`
vec3 grassResolvePalette(
  vec3 baseColor,
  vec3 tipColor,
  vec3 dryColor,
  float progress,
  float shade,
  float dryness,
  float rootAo,
  float tipColorStrength,
  float rootDarkening
) {
  float tipProfile = smoothstep(
    ${g(l.tipStart)},
    ${g(l.tipEnd)},
    progress
  );
  vec3 healthyColor = mix(
    baseColor,
    tipColor,
    tipProfile * tipColorStrength
  );
  float shadeDryness = clamp(
    (${g(l.shadeDrynessPivot)} - shade) *
      ${g(l.shadeDrynessScale)},
    0.0,
    ${g(l.shadeDrynessMaximum)}
  );
  float instanceDryness = dryness * (
    ${g(l.instanceDrynessBase)} +
    tipProfile * ${g(l.instanceDrynessTip)}
  );
  vec3 paletteColor = mix(
    healthyColor,
    dryColor,
    clamp(
      shadeDryness + instanceDryness,
      0.0,
      ${g(l.drynessMaximum)}
    )
  );
  float rootLight = mix(
    rootDarkening,
    1.0,
    smoothstep(0.0, ${g(l.rootFadeEnd)}, progress)
  );
  float bladeVariation = mix(
    ${g(l.shadeLightMinimum)},
    ${g(l.shadeLightMaximum)},
    shade
  );
  float occlusion = rootLight * bladeVariation * rootAo;
  vec3 shadedColor = paletteColor * occlusion;
  float groundContact = 1.0 - smoothstep(
    ${g(l.groundContactStart)},
    ${g(l.groundContactEnd)},
    progress
  );
  vec3 groundColor = mix(
    baseColor * ${g(l.groundContactBaseScale)},
    dryColor * ${g(l.groundContactDryScale)},
    dryness
  ) * occlusion;
  shadedColor = mix(
    shadedColor,
    groundColor,
    groundContact * ${g(l.groundContactStrength)}
  );
  // Root darkening and shade variation are scalars, so a blade can get darker
  // without its green ever getting less pure — and a dark, fully saturated
  // green is not a colour ACES can carry. Its output matrix takes red negative
  // and the clamp eats it: in a settled capture 7.5% of near-field vegetation
  // pixels had red at exactly zero, against 0.0% in the far field. That
  // clipping is most of what reads as a neon carpet rather than a meadow, and
  // no amount of palette retuning fixes it while the darkening stays purely
  // multiplicative. Ground contact mixes toward a brown/olive, but that mix is
  // still lit by the same occlusion so shadowed roots cannot lift.
  //
  // Shadowed vegetation is lit by the sky and by bounce off the ground, not by
  // nothing, so it loses saturation as it darkens. Letting it do that here puts
  // the albedo back inside the gamut as a side effect of being more correct.
  //
  // The blend runs toward the colour's own luminance, so it cannot shift the
  // field's brightness — which is what lets one shared function change every
  // LOD at once without moving the near/mid/far parity budget.
  return mix(
    shadedColor,
    vec3(dot(shadedColor, vec3(
      ${g(L.x)},
      ${g(L.y)},
      ${g(L.z)}
    ))),
    clamp(
      (1.0 - occlusion) * ${g(l.shadowDesaturation)},
      0.0,
      1.0
    )
  );
}
`,sa=1.29,ta=12,aa=.16,ra=.55,es=.035,na=42,ia=18,ss=.55,oa=.00107,la=1.15,ua=3,ts=.06,ca=is.start,ha=is.end,cs=`
#define GRASS_MAX_BIOMES ${Q}
uniform vec3 uGrassBiomeBase[GRASS_MAX_BIOMES];
uniform vec3 uGrassBiomeTip[GRASS_MAX_BIOMES];
uniform vec3 uGrassBiomeDry[GRASS_MAX_BIOMES];
// x: root darkening, y: tip colour strength.
uniform vec2 uGrassBiomeShade[GRASS_MAX_BIOMES];

// Indexing a uniform array out of range is undefined behaviour in GLSL ES 3.0,
// so the row is clamped rather than trusted. The data is always in range today;
// this is what keeps a future profile-count mismatch a wrong colour instead of
// a driver-dependent crash.
int grassResolveBiomeRow(float biome) {
  return int(clamp(biome, 0.0, float(GRASS_MAX_BIOMES - 1)) + 0.5);
}
`,da=`
attribute float grassProgress;
attribute float grassPhase;
attribute float grassBladeShade;
attribute vec4 instanceVariation;
attribute float instanceCoverage;
attribute float instanceBiome;
uniform float uGrassTime;
uniform vec2 uGrassWindDirection;
uniform float uGrassWindStrength;
uniform float uGrassGustScale;
uniform float uGrassGustSpeed;
uniform float uGrassFlutterStrength;
uniform float uGrassFlutterSpeed;
uniform vec2 uGrassNormalUpRange;
uniform float uGrassWindLodScale;
uniform float uGrassDitherSeed;
uniform vec2 uGrassMicroFadeRange;
uniform float uGrassNearDistance;
uniform float uGrassMidDistance;
uniform float uGrassTransitionDistance;
uniform float uGrassDetailMode;
uniform float uGrassDetailNearDistance;
uniform float uGrassDetailTransitionDistance;
uniform float uGrassLodInvert;
uniform float uGrassArtDensityScale;
uniform float uGrassBladeCurvature;
uniform float uGrassGustFrontScale;
uniform float uGrassGustFrontSpeed;
uniform float uGrassGustFrontDepth;
uniform float uGrassGustTipBoost;
uniform float uGrassSheenFadeDistance;
uniform float uGrassDensityFalloffStart;
uniform float uGrassDensityFalloffEnd;
uniform float uGrassDensityFloor;
uniform float uGrassLodDensityScale;
varying vec2 vGrassSheen;

vec3 grassRotateAroundAxis(
  vec3 value,
  vec3 axis,
  float sine,
  float cosine
) {
  return value * cosine + cross(axis, value) * sine +
    axis * dot(axis, value) * (1.0 - cosine);
}
`,ma=`
uniform float uGrassPixelWorldScale;
uniform float uGrassMinPixelWidth;
uniform float uGrassBladeHalfWidth;
uniform float uGrassMaxWidenDistance;
`,ga=`
uniform sampler2D uGrassTrailMap;
uniform vec2 uGrassTrailCenter;
uniform float uGrassTrailInverseCoverage;
uniform float uGrassTrailStrength;
uniform float uGrassTrailMaxAngle;
uniform float uGrassTrailWobbleFrequency;
uniform float uGrassTrailWobbleAmplitude;
uniform vec4 uGrassGroundShadowDisc;
uniform float uGrassGroundShadowStrength;
varying float vGrassGroundShade;
`,fa=`
bool grassKeepLod;
if (uGrassLodInvert < 0.5) {
  grassKeepLod = grassDither <= grassNearCoverage * grassDensityFalloff;
} else {
  grassDensityFalloff *= mix(
    1.0,
    uGrassDensityFloor,
    smoothstep(
      uGrassDensityFalloffStart,
      uGrassDensityFalloffEnd,
      grassCameraDistance
    )
  );
  float grassLodCut = max(grassNearCoverage, grassFarDistanceEntry);
  grassKeepLod = grassDither > 1.0 - grassDensityFalloff * (1.0 - grassLodCut);
}
`,Sa=`
bool grassKeepLod = uGrassLodInvert < 0.5
  ? grassDither <= uGrassLodThreshold
  : grassDither > uGrassLodThreshold && grassDither <= uGrassDistanceFade;
`,va=`
uniform float uGrassLodThreshold;
uniform float uGrassDistanceFade;
`,pa=`
// The instance root, its camera distance, and the shading micro fade resolve
// here rather than in the wind chunk below.
//
// They have to: this chunk runs in beginnormal_vertex, ahead of begin_vertex,
// and the normal now depends on distance. Nothing here needs anything the
// vertex stage does not already hold, and the wind chunk reuses these rather
// than recomputing them.
vec4 grassWorldRoot = modelMatrix * vec4(instanceMatrix[3].xyz, 1.0);
float grassCameraDistance = distance(cameraPosition, grassWorldRoot.xyz);
// Deliberately NOT derived from this material's own LOD distance. Micro fade
// drives the troughed normal, the normal flattening, the per-blade tone
// variation and the flutter — all shading, none of it LOD. Keying it to
// uGrassNearDistance gave the five near/mid layers five different schedules
// (3.4 m, 9.4 m, 14.6 m), so the two co-located populations inside the
// ultra-near band were lit differently and the handoff at 6-7 m read as a
// brightness ring following the camera.
float grassMicroFade = 1.0 - smoothstep(
  uGrassMicroFadeRange.x,
  uGrassMicroFadeRange.y,
  grassCameraDistance
);
vec3 grassWidthAxis = cross(vec3(0.0, 1.0, 0.0), objectNormal);
float grassWidthAxisLength = length(grassWidthAxis);
grassWidthAxis = grassWidthAxisLength > 0.0001
  ? grassWidthAxis / grassWidthAxisLength
  : vec3(1.0, 0.0, 0.0);
float grassSide = uv.x * 2.0 - 1.0;
vec3 grassBladePlaneNormal = normalize(cross(
  grassWidthAxis,
  vec3(0.0, 1.0, 0.0)
));
/**
 * How far the blade normal is flattened toward world up — a schedule now,
 * rather than one constant.
 *
 * At the shipped 0.76 more than three quarters of every blade normal was world
 * up, so a blade facing the sun and a blade facing away returned nearly the
 * same Lambert response: the near field had no form, only colour. It also
 * flattened grassThinness in the fragment stage, which is the transmission
 * term — so the backlighting was implemented correctly and then suppressed by
 * the same constant.
 *
 * The flat normal is right for a card at 200 m that must not shimmer and wrong
 * for a blade filling forty pixels, so it interpolates between the two. The far
 * value must stay equal to the impostor material's own flattening, or the
 * mid-to-far handoff shifts hue under the camera.
 */
float grassNormalUpHere = mix(
  uGrassNormalUpRange.y,
  uGrassNormalUpRange.x,
  grassMicroFade
);
objectNormal = normalize(
  mix(objectNormal, vec3(0.0, 1.0, 0.0), grassNormalUpHere)
);
grassBladePlaneNormal = normalize(
  mix(grassBladePlaneNormal, vec3(0.0, 1.0, 0.0), grassNormalUpHere)
);
`,Ga=`
varying float vGrassProgress;
varying float vGrassShade;
varying float vGrassDryness;
varying float vGrassRootAo;
flat varying float vGrassBiome;
varying float vGrassGust;
`,ba=`
attribute vec4 instanceShape;
attribute float grassBladeWidth;
uniform float uGrassShapeTipDrift;
`,Ta=`
float grassShapeDrift = instanceShape.x * 2.0 - 1.0;
float grassShapeTaper = mix(0.42, 1.20, instanceShape.y);
float grassShapeDamage = instanceShape.z;
float grassShapeBend = instanceShape.w * 2.0 - 1.0;

// Rebuild the centre line so the half-width can be *replaced* rather than
// added to. A row's two vertices sit either side of it along the width axis,
// and the apex is on it — uv.x is 0.5 there, so grassSide is zero and the
// reconstruction costs nothing at the one vertex where the width is zero.
float grassShapeHead = max(1.0 - grassProgress, 0.0);
vec3 grassShapeArm = grassWidthAxis * grassSide;
vec3 grassShapeCenter =
  transformed - grassShapeArm * (grassBladeWidth * pow(grassShapeHead, 0.72));

// 0.72 is the exponent baked into the source blade at build time. Tapering
// again would compound the two, so the new profile replaces it outright.
float grassShapeWidth = grassBladeWidth * pow(grassShapeHead, grassShapeTaper);
// A broken blade is blunt, not shorter-with-a-point: it holds width where an
// intact one would have almost none, and gives up the last of its rise.
grassShapeWidth = max(
  grassShapeWidth,
  grassBladeWidth * 0.55 * grassShapeDamage *
    smoothstep(0.5, 0.85, grassProgress)
);
grassShapeCenter.y *= 1.0 -
  0.1 * grassShapeDamage * smoothstep(0.9, 1.0, grassProgress);

// Tip drift grows quadratically, so the root stays planted and only the upper
// half leans. This is the term that breaks the mirrored-isoceles read.
grassShapeCenter += grassWidthAxis * (
  grassShapeDrift * uGrassShapeTipDrift * grassBladeWidth *
  grassProgress * grassProgress
);
// Extra flop along the blade's own depth axis, as a fraction of the height it
// has reached rather than a fixed distance, so a short blade bends short.
grassShapeCenter += normalize(cross(grassWidthAxis, vec3(0.0, 1.0, 0.0))) * (
  grassShapeBend * GRASS_SHAPE_BEND * grassShapeCenter.y *
  pow(grassProgress, 1.6)
);

transformed = grassShapeCenter + grassShapeArm * grassShapeWidth;
`.replace("GRASS_SHAPE_BEND",Js.toFixed(3)),Da=`
// The instance's translation is its fourth column; multiplying the full matrix
// by the origin is the same value for eight times the work, per vertex.
float grassDither = fract(
  grassBladeShade * 0.754877666 +
  grassPhase * 0.569840296 +
  GRASS_DITHER_INSTANCE_TERM
  uGrassDitherSeed
);
GRASS_GUST_NOISE
float grassFieldDither = fract(
  grassBladeShade * 0.438289 +
  grassPhase * 0.819173 +
  instanceVariation.x * 0.347193 +
  uGrassDitherSeed * 1.618034
);
// Motion phase is deliberately a *separate* quantity from the dithers above.
//
// The single-blade layers instance one source blade, so its grassPhase is the
// same 0.5 for every near instance: flutter timing and stiffness were therefore
// synchronised across the whole near field, which on compact — where the gust
// source is a single coherent sine — reads as rows of grass bending together.
// Folding in the per-instance variation decorrelates both.
//
// It must not be substituted into either dither: the mid layer's CPU draw
// truncation reproduces grassDither exactly and depends on it carrying no
// per-instance term, so LOD selection and motion have to stay independent.
float grassMotionPhase = fract(grassPhase + instanceVariation.x);
mat3 grassInstanceBasis = mat3(instanceMatrix);
vec3 grassWidthAxisView = normalize(
  normalMatrix * grassInstanceBasis * grassWidthAxis
);
// Three.js applies this inverse-scale correction to objectNormal in
// defaultnormal_vertex. The macro blade-plane normal bypasses that chunk, so it
// must mirror the same transform here or Phase 5's broad/non-uniform instances
// skew the far end of the Phase 6 lighting fade.
vec3 grassInstanceScaleSquared = vec3(
  dot(grassInstanceBasis[0], grassInstanceBasis[0]),
  dot(grassInstanceBasis[1], grassInstanceBasis[1]),
  dot(grassInstanceBasis[2], grassInstanceBasis[2])
);
vec3 grassBladePlaneNormalView = normalize(
  normalMatrix * grassInstanceBasis *
    (grassBladePlaneNormal / max(grassInstanceScaleSquared, vec3(1e-8)))
);
// Trough curvature is micro detail: progressively remove it without erasing
// the direction of the blade plane itself.
vNormal = normalize(
  vNormal + grassWidthAxisView *
    (grassSide * uGrassBladeCurvature * grassMicroFade)
);
float grassNearCoverage = 1.0 - smoothstep(
  uGrassNearDistance - uGrassTransitionDistance,
  uGrassNearDistance + uGrassTransitionDistance,
  grassCameraDistance
);
float grassFarDistanceEntry = smoothstep(
  uGrassMidDistance - uGrassTransitionDistance,
  uGrassMidDistance + uGrassTransitionDistance,
  grassCameraDistance
);
float grassDetailCoverage = 1.0 - smoothstep(
  uGrassDetailNearDistance - uGrassDetailTransitionDistance,
  uGrassDetailNearDistance + uGrassDetailTransitionDistance,
  grassCameraDistance
);
// Starts at the quality governor's global scale and, for the mid layer, picks
// up the distance falloff inside the keep test below. The sub-pixel width clamp
// reads the final value to widen the survivors by the area the thinning gave up.
float grassDensityFalloff = uGrassLodDensityScale;
GRASS_KEEP_LOD
bool grassKeepDetail = uGrassDetailMode < 0.5 ||
  (uGrassDetailMode < 1.5
    ? grassDither > grassDetailCoverage
    : grassDither <= grassDetailCoverage);
// instanceCoverage carries both the per-instance field coverage and the
// streaming fade-in. Both used to be separate uniforms, but three only uploads
// a shared material's uniforms once per contiguous run of draws, so per-mesh
// values never reached the GPU. Per-instance data has no such problem.
bool grassKeepBlade =
  grassKeepLod &&
  grassKeepDetail &&
  grassFieldDither <= min(instanceCoverage * uGrassArtDensityScale, 1.0);

if (!grassKeepBlade) {
  // Every vertex in a blade shares the keep decision, so a rejected blade
  // collapses to a zero-area triangle and is dropped at primitive assembly.
  // This is the only place blades are rejected: evaluating it here rather than
  // as a fragment discard is what lets the fragment shader stay early-Z
  // friendly, and it is also exact, since the decision no longer depends on
  // interpolating a constant varying across the triangle.
  transformed = vec3(0.0);
}

GRASS_SHEEN_VARYING

float grassCoverage = 1.0;
GRASS_GROUND_SHADE_INIT
GRASS_SUBPIXEL_WIDTH

if (grassKeepBlade && grassProgress > 0.001) {
  vec2 grassWindDirection = uGrassWindDirection;
  float grassHorizontalScale = max(length(grassInstanceBasis[0]), 0.0001);
  float grassVerticalScale = max(length(grassInstanceBasis[1]), 0.0001);
  float grassDepthScale = max(length(grassInstanceBasis[2]), 0.0001);
  // A gust front travelling along the wind, tens of metres between crests.
  // Weather and tuft phase keep neighbouring blades in a clump moving together
  // while neighbouring tufts and calm stretches still differ. The envelope only
  // ever scales the bend down, which is what lets the reserved bounds and the
  // configured wind strength keep their existing meaning.
  float grassWeather = ${xt("uGrassTime")};
  float grassTuftPhase = ${Rt("grassWorldRoot.xz")};
  float grassGustEnvelope =
    mix(1.0 - uGrassGustFrontDepth, 1.0, grassGustNoise) * grassWeather;
  float grassGust = sin(
    dot(grassWorldRoot.xz, grassWindDirection) / uGrassGustScale +
    uGrassTime * uGrassGustSpeed +
    grassTuftPhase * 1.15 +
    instanceVariation.x * 0.42
  );
  float grassFlutter = GRASS_FLUTTER_TERM;
  float grassStiffness = mix(
    0.76,
    1.12,
    fract(grassTuftPhase * 1.61803398875 + instanceVariation.x * 0.31)
  ) * mix(1.0, 0.72, instanceVariation.w);
  float grassBend = (
    grassGust * uGrassWindStrength +
    grassFlutter * uGrassFlutterStrength * grassMicroFade
  ) * instanceVariation.y * grassStiffness * pow(grassProgress, 1.65) *
    uGrassWindLodScale * grassGustEnvelope;
  vec3 grassWorldWind = vec3(grassWindDirection.x, 0.0, grassWindDirection.y);
  // Rotate about the root instead of translating the vertex. Translation makes
  // a bent blade longer than a straight one; the trail bend below documents
  // that as the source of the rubbery look and was rewritten to rotate, but the
  // wind path kept the old form and stretched every blade it moved.
  vec2 grassWindLocal = vec2(
    dot(grassWorldWind, grassInstanceBasis[0] / grassHorizontalScale),
    dot(grassWorldWind, grassInstanceBasis[2] / grassDepthScale)
  );
  float grassWindSin = sin(grassBend);
  float grassWindCos = cos(grassBend);
  float grassWindHeight = transformed.y;
  transformed.x += grassWindLocal.x * grassWindHeight * grassWindSin *
    (grassVerticalScale / grassHorizontalScale);
  transformed.z += grassWindLocal.y * grassWindHeight * grassWindSin *
    (grassVerticalScale / grassDepthScale);
  transformed.y *= grassWindCos;
  vec3 grassWindAxis = vec3(grassWindLocal.y, 0.0, -grassWindLocal.x);
  float grassWindAxisLength = length(grassWindAxis);
  if (grassWindAxisLength > 0.0001) {
    vec3 grassWindAxisView = normalize(
      mat3(modelViewMatrix) * grassInstanceBasis *
        (grassWindAxis / grassWindAxisLength)
    );
    vNormal = normalize(grassRotateAroundAxis(
      vNormal,
      grassWindAxisView,
      grassWindSin,
      grassWindCos
    ));
    grassBladePlaneNormalView = normalize(grassRotateAroundAxis(
      grassBladePlaneNormalView,
      grassWindAxisView,
      grassWindSin,
      grassWindCos
    ));
  }
GRASS_TRAIL_BEND
}

if (grassKeepBlade) {
  // The far end of the micro fade keeps the wind/trail-oriented blade plane.
  // It no longer collapses every blade toward the same world-up normal.
  vNormal = normalize(mix(
    vNormal,
    grassBladePlaneNormalView,
    1.0 - grassMicroFade
  ));
}

`,ya=`
vGrassSheen = vec2(
  (1.0 - smoothstep(
    uGrassSheenFadeDistance * 0.55,
    uGrassSheenFadeDistance,
    grassCameraDistance
  )) * (0.45 + 0.85 * grassGustNoise),
  mix(0.55, 1.0, grassProgress)
);
`,Ca=`
vGrassSheen = vec2(0.0, mix(0.55, 1.0, grassProgress));
`,Ea=`
vec2 grassGustUv = grassWorldRoot.xz * uGrassWindNoiseScale -
  uGrassWindDirection * (uGrassTime * uGrassWindNoiseSpeed);
float grassGustNoise = texture2D(uGrassWindNoise, grassGustUv).r;
`,xa=wt({target:"grassGustNoise",position:"grassWorldRoot.xz",windDirection:"uGrassWindDirection",time:"uGrassTime",scale:"uGrassGustFrontScale",speed:"uGrassGustFrontSpeed"}),Ra=`
uniform sampler2D uGrassWindNoise;
uniform float uGrassWindNoiseScale;
uniform float uGrassWindNoiseSpeed;
`,wa=`
if (grassKeepBlade) {
  float grassWidthScale = max(length(vec3(instanceMatrix[0])), 0.0001);
  float grassSourceHalfWidth = uGrassBladeHalfWidth * grassWidthScale;
  // inversesqrt(falloff) is the width a survivor needs to cover the ground its
  // dropped neighbours used to. Thinning without it would read as the field
  // going bald with distance; thinning with it is invisible, and the colour
  // payback below keeps average brightness flat across the LOD handoff.
  float grassTargetHalfWidth = min(
    grassCameraDistance * uGrassPixelWorldScale * uGrassMinPixelWidth * 0.5 *
      inversesqrt(max(grassDensityFalloff, 0.04)),
    uGrassMaxWidenDistance
  );
  float grassWidenedHalfWidth = max(grassSourceHalfWidth, grassTargetHalfWidth);
  grassCoverage = grassSourceHalfWidth / grassWidenedHalfWidth;
  // grassSide is 0 at the single-triangle blade's apex, so the blade widens at
  // the base and keeps its point.
  transformed += grassWidthAxis *
    (grassSide * (grassWidenedHalfWidth - grassSourceHalfWidth) / grassWidthScale);
}
`,_a=`
  // Contact occlusion under the character. Grass takes no part in the shadow
  // map (see GrassGroundShadow), so without this the field stays fully lit right
  // up to the feet standing in it and the character reads as a decal.
  //
  // Two falloffs, because a body near the ground occludes two different things.
  // Across the ground it is a soft disc, squared so the darkest part stays
  // small and the edge stays wide. Up the blade it is strongest at the root and
  // gone by the tip: the sky the root cannot see is most of what lights it,
  // while a tip standing clear of the disc is lit normally. Fading it out that
  // way also hides the disc's edge, which is the tell on a fake like this.
  if (uGrassGroundShadowStrength > 0.0) {
    vec2 grassGroundOffset = grassWorldRoot.xz - uGrassGroundShadowDisc.xz;
    float grassGroundRadius = max(uGrassGroundShadowDisc.w, 0.0001);
    float grassGroundFalloff = 1.0 - saturate(
      length(grassGroundOffset) / grassGroundRadius
    );
    if (grassGroundFalloff > 0.0) {
      // The root's own height above the contact point, so grass on a bank above
      // the character does not darken as if it were underfoot.
      float grassGroundLift = 1.0 - saturate(
        abs(grassWorldRoot.y - uGrassGroundShadowDisc.y) * 0.6
      );
      vGrassGroundShade = 1.0 -
        grassGroundFalloff * grassGroundFalloff * grassGroundLift *
        uGrassGroundShadowStrength * (1.0 - grassProgress * 0.72);
    }
  }
  if (uGrassTrailStrength > 0.0) {
    // The AABB reject is the whole early-out: two compares before any fetch,
    // and the trail square only ever covers a couple of dozen metres around the
    // character while this layer draws every blade in the near band.
    vec2 grassTrailUv =
      (grassWorldRoot.xz - uGrassTrailCenter) * uGrassTrailInverseCoverage + 0.5;
    vec2 grassTrailInside = step(vec2(0.0), grassTrailUv) * step(grassTrailUv, vec2(1.0));
    if (grassTrailInside.x * grassTrailInside.y > 0.0) {
      vec4 grassTrailSample = texture2D(uGrassTrailMap, grassTrailUv);
      float grassTrailCrush = grassTrailSample.b;
      vec2 grassTrailDirection = grassTrailSample.rg * 2.0 - 1.0;
      float grassTrailDirectionLength = length(grassTrailDirection);
      if (grassTrailCrush > 0.004 && grassTrailDirectionLength > 0.02) {
        grassTrailDirection /= grassTrailDirectionLength;
        // Blades differ in how hard they resist, so a footprint is not a
        // uniformly flattened disc. This mixes in instanceVariation as well as
        // grassPhase: the single-blade layers instance one source blade, so a
        // phase-only seed would be identical for every blade in the field.
        float grassTrailSeed = fract(instanceVariation.x * 3.719 + grassPhase * 2.61803398875);
        float grassTrailStiffness = mix(1.22, 0.78, grassTrailSeed);
        // Saturating: blades directly under a foot flatten hard without the
        // response running away and pushing them through the ground.
        float grassTrailResponse = 1.0 - exp(-3.4 * grassTrailCrush * grassTrailStiffness);
        // Alpha is contact recency, re-seeded for as long as a contact covers
        // the texel, so this rings hardest while a foot is working the grass
        // and dies away over the second or so after it lifts.
        float grassTrailWobble = 1.0 + uGrassTrailWobbleAmplitude * grassTrailSample.a *
          sin(uGrassTime * uGrassTrailWobbleFrequency + grassTrailSeed * 6.28318530718);
        float grassHabitatBend = mix(
          0.7,
          1.22,
          saturate((grassVerticalScale - 0.68) * 1.9)
        ) * (1.0 - instanceVariation.w * 0.48);
        float grassTrailAngle = clamp(
          uGrassTrailMaxAngle * uGrassTrailStrength * grassTrailResponse *
            grassTrailWobble * grassHabitatBend,
          0.0,
          1.48
        );
        // The angle grows towards the tip, so the blade curves instead of
        // tilting rigidly out of the ground.
        float grassTrailTheta = grassTrailAngle * pow(grassProgress, 0.85);
        float grassTrailSin = sin(grassTrailTheta);
        float grassTrailCos = cos(grassTrailTheta);
        vec3 grassTrailWorld = vec3(grassTrailDirection.x, 0.0, grassTrailDirection.y);
        vec2 grassTrailLocal = vec2(
          dot(grassTrailWorld, grassInstanceBasis[0] / grassHorizontalScale),
          dot(grassTrailWorld, grassInstanceBasis[2] / grassDepthScale)
        );
        // World height of this vertex is localY * verticalScale; a rotation by
        // theta moves it localY * verticalScale * sin(theta) horizontally and
        // leaves localY * cos(theta) of local height. Converting the horizontal
        // part back through the instance's own scales keeps non-uniformly
        // scaled blades correct.
        float grassTrailHeight = transformed.y;
        transformed.x += grassTrailLocal.x * grassTrailHeight * grassTrailSin *
          (grassVerticalScale / grassHorizontalScale);
        transformed.z += grassTrailLocal.y * grassTrailHeight * grassTrailSin *
          (grassVerticalScale / grassDepthScale);
        transformed.y *= grassTrailCos;
        vec3 grassTrailAxis = vec3(
          grassTrailLocal.y,
          0.0,
          -grassTrailLocal.x
        );
        float grassTrailAxisLength = length(grassTrailAxis);
        if (grassTrailAxisLength > 0.0001) {
          vec3 grassTrailAxisView = normalize(
            mat3(modelViewMatrix) * grassInstanceBasis *
              (grassTrailAxis / grassTrailAxisLength)
          );
          vNormal = normalize(grassRotateAroundAxis(
            vNormal,
            grassTrailAxisView,
            grassTrailSin,
            grassTrailCos
          ));
          grassBladePlaneNormalView = normalize(grassRotateAroundAxis(
            grassBladePlaneNormalView,
            grassTrailAxisView,
            grassTrailSin,
            grassTrailCos
          ));
        }
      }
    }
  }
`,Aa=`
vGrassProgress = grassProgress;
vGrassShade = mix(grassBladeShade, 0.5, (1.0 - grassMicroFade) * 0.86);
vGrassDryness = instanceVariation.w;
vGrassRootAo = instanceVariation.z;
vGrassBiome = instanceBiome;
vGrassGust = grassGustNoise;
`,Ma=`
int grassBiomeRow = grassResolveBiomeRow(instanceBiome);
// The palette is resolved at a progress lifted off the root, not at the raw
// attribute. A one-triangle blade only has progress 0 and 1 to offer, so the
// rasteriser draws a chord under a strongly concave curve; evaluating the root
// vertices slightly up the blade makes that chord carry the correct
// area-weighted mean. See GRASS_VERTEX_PALETTE_ROOT_PROGRESS. Only the palette
// argument is remapped: grassProgress itself still drives wind, taper, the gust
// tip lift below, and vGrassProgress for the fragment stage's backlight.
vec3 grassPaletteColor = grassResolvePalette(
  uGrassBiomeBase[grassBiomeRow],
  uGrassBiomeTip[grassBiomeRow],
  uGrassBiomeDry[grassBiomeRow],
  mix(${Qt}, 1.0, grassProgress),
  mix(grassBladeShade, 0.5, (1.0 - grassMicroFade) * 0.86),
  instanceVariation.w,
  instanceVariation.z,
  uGrassBiomeShade[grassBiomeRow].y,
  uGrassBiomeShade[grassBiomeRow].x
);
grassPaletteColor = mix(
  grassPaletteColor,
  uGrassBiomeTip[grassBiomeRow],
  grassGustNoise * uGrassGustTipBoost * grassProgress
);
vec3 grassBiomeCanopy = mix(
  uGrassBiomeCanopyHealthy[grassBiomeRow],
  uGrassBiomeCanopyDry[grassBiomeRow],
  instanceVariation.w
);
vGrassColor = mix(grassPaletteColor, grassBiomeCanopy, 1.0 - grassCoverage);
vGrassProgress = grassProgress;
vGrassDryness = instanceVariation.w;
`,Fa=`
${cs}
uniform vec3 uGrassBiomeCanopyHealthy[GRASS_MAX_BIOMES];
uniform vec3 uGrassBiomeCanopyDry[GRASS_MAX_BIOMES];
varying vec3 vGrassColor;
varying float vGrassProgress;
varying float vGrassDryness;
${us}
`,Na=`
${cs}
uniform vec3 uGrassTipColor;
uniform float uGrassGustTipBoost;
uniform float uGrassAmbientBoost;
uniform float uGrassBacklightStrength;
uniform float uGrassSheenStrength;
uniform float uGrassSheenPower;
varying float vGrassProgress;
varying float vGrassShade;
varying float vGrassDryness;
varying float vGrassRootAo;
flat varying float vGrassBiome;
varying float vGrassGust;
varying vec2 vGrassSheen;
${us}
`,Pa=`
varying float vGrassGroundShade;
`,La=`
diffuseColor.rgb *= vGrassGroundShade;
`,Ba=`
uniform vec3 uGrassTipColor;
uniform float uGrassAmbientBoost;
uniform float uGrassBacklightStrength;
uniform float uGrassSheenStrength;
uniform float uGrassSheenPower;
varying vec3 vGrassColor;
varying vec2 vGrassSheen;
varying float vGrassProgress;
varying float vGrassDryness;
`,Ia=`
#include <color_fragment>
diffuseColor.rgb = vGrassColor;
GRASS_GROUND_SHADE_APPLY
reflectedLight.indirectDiffuse += diffuseColor.rgb * uGrassAmbientBoost;
`,Wa=`
#include <color_fragment>
int grassBiomeRow = grassResolveBiomeRow(vGrassBiome);
diffuseColor.rgb = grassResolvePalette(
  uGrassBiomeBase[grassBiomeRow],
  uGrassBiomeTip[grassBiomeRow],
  uGrassBiomeDry[grassBiomeRow],
  vGrassProgress,
  vGrassShade,
  vGrassDryness,
  vGrassRootAo,
  uGrassBiomeShade[grassBiomeRow].y,
  uGrassBiomeShade[grassBiomeRow].x
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  uGrassBiomeTip[grassBiomeRow],
  vGrassGust * uGrassGustTipBoost * vGrassProgress
);
GRASS_GROUND_SHADE_APPLY
reflectedLight.indirectDiffuse += diffuseColor.rgb * uGrassAmbientBoost;
`,Oa=`
float grassBackLight = 0.0;
vec3 grassSheen = vec3(0.0);
#if NUM_DIR_LIGHTS > 0
  vec3 grassViewDirection = normalize(vViewPosition);
  vec3 grassSunDirection = directionalLights[0].direction;
  // Transmission, not a rim. Light has to reach the camera through the blade,
  // so the sun must be behind it, the blade must be turned edge-on to the sun,
  // and a thin tip passes more of it than the thick base. The term this
  // replaces had only the first of those three and so lit every blade facing
  // the camera equally, which reads as a plastic outline rather than a leaf.
  float grassIntoSun = saturate(dot(-grassViewDirection, grassSunDirection));
  float grassThinness = 1.0 - abs(dot(normal, grassSunDirection));
  float grassRootAttenuation = smoothstep(0.12, 0.72, vGrassProgress);
  float grassViewFacing = saturate(dot(normal, grassViewDirection));
  float grassWetTransmission = mix(0.78, 1.14, 1.0 - vGrassDryness);
  grassBackLight = min(
    grassIntoSun * grassIntoSun * grassThinness * grassRootAttenuation *
      (0.35 + 0.65 * grassViewFacing) * vGrassSheen.y * grassWetTransmission,
    0.82
  );
GRASS_SHEEN_OUTPUT
#endif
vec3 grassLambertLight =
  reflectedLight.directDiffuse +
  reflectedLight.indirectDiffuse +
  totalEmissiveRadiance;
vec3 outgoingLight =
  mix(diffuseColor.rgb, grassLambertLight, ${Kt}) +
  mix(diffuseColor.rgb, uGrassTipColor, 0.35) *
    grassBackLight * uGrassBacklightStrength +
  grassSheen;
`,Va=`
  // Skip both the half-vector normalization and the high-power lobe once the
  // contribution has faded. This branch is coherent across distant quads.
  if (vGrassSheen.x > 0.001) {
    vec3 grassSunPlusView = grassSunDirection + grassViewDirection;
    vec3 grassHalfVector = length(grassSunPlusView) > 1e-4
      ? normalize(grassSunPlusView)
      : normal;
    grassSheen = directionalLights[0].color * (
      pow(saturate(dot(normal, grassHalfVector)), uGrassSheenPower) *
      uGrassSheenStrength * vGrassSheen.x *
      smoothstep(0.3, 0.92, vGrassProgress)
    );
  }
`,Ua=`
    sin(
      dot(grassWorldRoot.xz, vec2(-grassWindDirection.y, grassWindDirection.x)) /
        (uGrassGustScale * 0.37) +
      uGrassTime * uGrassFlutterSpeed +
      grassMotionPhase * 6.28318530718
    ) * mix(0.72, 1.18, instanceVariation.w)
`;function O(t){return Array.from({length:Q},()=>new A(t))}function Ha(t,e){return Array.from({length:Q},()=>new _(t,e))}class mr{constructor(e){c(this,"material");c(this,"colorControls",{baseColor:"#273f22",tipColor:"#83a96b",dryColor:"#a8a06a"});c(this,"nearNormalUpScale",1);c(this,"uniforms",{uGrassTime:{value:0},uGrassShapeTipDrift:{value:0},uGrassWindDirection:{value:new _(.8,.35).normalize()},uGrassWindStrength:{value:.14},uGrassGustScale:{value:.08},uGrassGustSpeed:{value:.65},uGrassFlutterStrength:{value:.035},uGrassFlutterSpeed:{value:3.4},uGrassBiomeBase:{value:O(this.colorControls.baseColor)},uGrassBiomeTip:{value:O(this.colorControls.tipColor)},uGrassBiomeDry:{value:O(this.colorControls.dryColor)},uGrassBiomeShade:{value:Ha(.55,.5)},uGrassBiomeCanopyHealthy:{value:O(this.colorControls.baseColor)},uGrassBiomeCanopyDry:{value:O(this.colorControls.dryColor)},uGrassTipColor:{value:new A(this.colorControls.tipColor)},uGrassNormalUpRange:{value:new _(.45,.45)},uGrassAmbientBoost:{value:.12},uGrassBacklightStrength:{value:.16},uGrassLodInvert:{value:0},uGrassLodThreshold:{value:1},uGrassDistanceFade:{value:1},uGrassDitherSeed:{value:0},uGrassWindLodScale:{value:1},uGrassMicroFadeRange:{value:new _(3,10)},uGrassNearDistance:{value:0},uGrassMidDistance:{value:0},uGrassTransitionDistance:{value:1},uGrassDetailMode:{value:0},uGrassDetailNearDistance:{value:0},uGrassDetailTransitionDistance:{value:1},uGrassArtDensityScale:{value:1},uGrassBladeCurvature:{value:ra},uGrassSheenStrength:{value:es},uGrassSheenPower:{value:na},uGrassSheenFadeDistance:{value:ia},uGrassGustFrontScale:{value:St},uGrassGustFrontSpeed:{value:vt},uGrassGustFrontDepth:{value:ss},uGrassGustTipBoost:{value:Pe},uGrassWindNoise:{value:null},uGrassWindNoiseScale:{value:gt},uGrassWindNoiseSpeed:{value:ft},uGrassDensityFalloffStart:{value:ca},uGrassDensityFalloffEnd:{value:ha},uGrassDensityFloor:{value:1},uGrassLodDensityScale:{value:1},uGrassPixelWorldScale:{value:oa},uGrassMinPixelWidth:{value:la},uGrassBladeHalfWidth:{value:.017},uGrassMaxWidenDistance:{value:ts},uGrassTrailMap:{value:null},uGrassTrailCenter:{value:new _},uGrassTrailInverseCoverage:{value:1},uGrassTrailStrength:{value:0},uGrassTrailMaxAngle:{value:sa},uGrassTrailWobbleFrequency:{value:ta},uGrassTrailWobbleAmplitude:{value:aa},uGrassGroundShadowDisc:{value:new K(0,0,0,1)},uGrassGroundShadowStrength:{value:0}});c(this,"interactive");c(this,"baseWindStrength",.14);c(this,"baseFlutterStrength",.035);c(this,"artRootDarkening",.55);c(this,"artTipColorStrength",.5);this.interactive=e.interactive===!0,this.uniforms.uGrassLodInvert.value=e.invertLodCoverage?1:0,this.uniforms.uGrassWindLodScale.value=e.windLodScale??1,this.uniforms.uGrassDetailMode.value=e.detailMode??0,this.uniforms.uGrassDitherSeed.value=(e.ditherSeed??0)/4294967296,this.setPaletteColors(),this.material=new Bs({side:Is,color:16777215,transparent:!1,depthWrite:!0}),this.material.name=e.name;const s=e.vertexPalette===!0,a=e.worldLod!==!1,r=e.subPixelWidth===!0,o=e.sheen!==!1,n=e.noiseWind===!0,i=e.microWind!==!1,u=e.instanceFreeDither===!0,h=e.shapeVariation===!0,d=a?fa:Sa;this.material.onBeforeCompile=m=>{Object.assign(m.uniforms,this.uniforms),m.vertexShader=m.vertexShader.replace("#include <common>",`#include <common>${da}${this.interactive?ga:""}${a?"":va}${r?ma:""}${h?ba:""}${n?Ra:""}${s?Fa:Ga}`).replace("#include <beginnormal_vertex>",`#include <beginnormal_vertex>${pa}`).replace("#include <begin_vertex>",`#include <begin_vertex>${h?Ta:""}${Da.replace("GRASS_KEEP_LOD",d).replace("GRASS_DITHER_INSTANCE_TERM",u?"":"instanceVariation.x +").replace("GRASS_GUST_NOISE",n?Ea:xa).replace("GRASS_FLUTTER_TERM",i?Ua:"0.0").replace("GRASS_SHEEN_VARYING",o?ya:Ca).replace("GRASS_SUBPIXEL_WIDTH",r?wa:"").replace("GRASS_TRAIL_BEND",this.interactive?_a:"").replace("GRASS_GROUND_SHADE_INIT",this.interactive?"vGrassGroundShade = 1.0;":"")}${s?Ma:Aa}`),m.fragmentShader=m.fragmentShader.replace("#include <common>",`#include <common>${s?Ba:Na}${this.interactive?Pa:""}`).replace("#include <color_fragment>",(s?Ia:Wa).replace("GRASS_GROUND_SHADE_APPLY",this.interactive?La:"")).replace("vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;",Oa.replace("GRASS_SHEEN_OUTPUT",o?Va:""))},this.material.customProgramCacheKey=()=>e.cacheKey}configure(e,s){this.colorControls.baseColor=e.baseColor,this.colorControls.tipColor=e.tipColor,this.colorControls.dryColor=e.dryColor,this.artRootDarkening=e.rootDarkening,this.setPaletteColors(),this.setNormalUp(e.normalUp),this.uniforms.uGrassAmbientBoost.value=e.ambientBoost,this.uniforms.uGrassBacklightStrength.value=e.backlightStrength,this.uniforms.uGrassWindDirection.value.set(s.directionX,s.directionZ).normalize(),this.baseWindStrength=s.strength,this.baseFlutterStrength=s.flutterStrength,this.uniforms.uGrassWindStrength.value=s.strength,this.uniforms.uGrassGustScale.value=s.gustScale,this.uniforms.uGrassGustSpeed.value=s.gustSpeed,this.uniforms.uGrassFlutterStrength.value=s.flutterStrength,this.uniforms.uGrassFlutterSpeed.value=s.flutterSpeed}applyArtDirection(e){this.colorControls.baseColor=e.baseColor,this.colorControls.tipColor=e.tipColor,this.colorControls.dryColor=e.dryColor,this.artRootDarkening=e.rootDarkening,this.artTipColorStrength=e.tipColorStrength,this.setPaletteColors(),this.setNormalUp(e.normalUp),this.uniforms.uGrassAmbientBoost.value=e.ambientBoost,this.uniforms.uGrassBacklightStrength.value=e.backlightStrength,this.uniforms.uGrassArtDensityScale.value=e.densityScale,this.uniforms.uGrassWindStrength.value=this.baseWindStrength*e.windStrengthScale,this.uniforms.uGrassFlutterStrength.value=this.baseFlutterStrength*e.flutterStrengthScale,this.configureGust(e.gustDepth??ss,e.gustTipBoost??Pe),this.uniforms.uGrassSheenFadeDistance.value=e.nearDistance}setViewportPixelScale(e){Number.isFinite(e)&&e>0&&(this.uniforms.uGrassPixelWorldScale.value=e)}setBladeHalfWidth(e){const s=Math.max(e,1e-4);this.uniforms.uGrassBladeHalfWidth.value=s,this.uniforms.uGrassMaxWidenDistance.value=Math.min(s*ua,ts)}getDitherSeed(){return this.uniforms.uGrassDitherSeed.value}setNormalUp(e){const s=this.uniforms.uGrassNormalUpRange.value;s.y=e,s.x=e*this.nearNormalUpScale}setShapeTipDrift(e){this.uniforms.uGrassShapeTipDrift.value=Math.max(0,e)}setNearNormalUpScale(e){this.nearNormalUpScale=Number.isFinite(e)?Math.min(1,Math.max(0,e)):1,this.setNormalUp(this.uniforms.uGrassNormalUpRange.value.y)}setLodThreshold(e,s=1){this.uniforms.uGrassLodThreshold.value=e,this.uniforms.uGrassDistanceFade.value=s}setMicroDetailFadeRange(e,s){if(!Number.isFinite(e)||!Number.isFinite(s)||e>=s)throw new Error("The grass micro-detail fade range must be a finite increasing interval.");this.uniforms.uGrassMicroFadeRange.value.set(e,s)}configureLod(e){this.uniforms.uGrassNearDistance.value=e.nearMaxDistance,this.uniforms.uGrassMidDistance.value=e.midMaxDistance,this.uniforms.uGrassTransitionDistance.value=e.transitionDistance}configureDetailLod(e){this.uniforms.uGrassDetailNearDistance.value=e.nearMaxDistance,this.uniforms.uGrassDetailTransitionDistance.value=e.transitionDistance}update(e){if(this.uniforms.uGrassTime.value=e,!!this.interactive){if(ie.isEnabled()?(this.uniforms.uGrassGroundShadowDisc.value.copy(ie.disc),this.uniforms.uGrassGroundShadowStrength.value=ie.strength):this.uniforms.uGrassGroundShadowStrength.value=0,!$.isEnabled()){this.uniforms.uGrassTrailStrength.value=0;return}this.uniforms.uGrassTrailMap.value=$.getTexture(),this.uniforms.uGrassTrailCenter.value.copy($.getCenter()),this.uniforms.uGrassTrailInverseCoverage.value=$.getInverseCoverage(),this.uniforms.uGrassTrailStrength.value=1}}configureTrail(e){this.uniforms.uGrassTrailMaxAngle.value=e.maxAngleRadians,this.uniforms.uGrassTrailWobbleFrequency.value=e.wobbleFrequency,this.uniforms.uGrassTrailWobbleAmplitude.value=e.wobbleAmplitude}setPaletteColors(){const e=this.uniforms.uGrassBiomeBase.value,s=this.uniforms.uGrassBiomeTip.value,a=this.uniforms.uGrassBiomeDry.value,r=this.uniforms.uGrassBiomeShade.value,o=this.uniforms.uGrassBiomeCanopyHealthy.value,n=this.uniforms.uGrassBiomeCanopyDry.value;Se(e[0],s[0],a[0],this.colorControls.baseColor,this.colorControls.tipColor,this.colorControls.dryColor),r[0].set(this.artRootDarkening,this.artTipColorStrength),this.uniforms.uGrassTipColor.value.copy(s[0]),Qe(o[0],n[0],this.colorControls.baseColor,this.colorControls.tipColor,this.colorControls.dryColor,this.artRootDarkening,this.artTipColorStrength);for(let i=1;i<Q;i+=1){const u=Os[i];if(!u||u.paletteSource==="art"){e[i].copy(e[0]),s[i].copy(s[0]),a[i].copy(a[0]),r[i].copy(r[0]),o[i].copy(o[0]),n[i].copy(n[0]);continue}Se(e[i],s[i],a[i],u.baseColor,u.tipColor,u.dryColor),r[i].set(u.rootDarkening,u.tipColorStrength),Qe(o[i],n[i],u.baseColor,u.tipColor,u.dryColor,u.rootDarkening,u.tipColorStrength)}}setWindNoise(e,s,a){this.uniforms.uGrassWindNoise.value=e,this.uniforms.uGrassWindNoiseScale.value=s,this.uniforms.uGrassWindNoiseSpeed.value=a}configureDensityFalloff(e,s,a){this.uniforms.uGrassDensityFalloffStart.value=e,this.uniforms.uGrassDensityFalloffEnd.value=s,this.uniforms.uGrassDensityFloor.value=a}getDensityFalloff(){return{start:this.uniforms.uGrassDensityFalloffStart.value,end:this.uniforms.uGrassDensityFalloffEnd.value,floor:this.uniforms.uGrassDensityFloor.value}}setLodDensityScale(e){this.uniforms.uGrassLodDensityScale.value=R.clamp(e,.05,1)}getLodDensityScale(){return this.uniforms.uGrassLodDensityScale.value}configureGust(e,s){this.uniforms.uGrassGustFrontDepth.value=e,this.uniforms.uGrassGustTipBoost.value=s}setSheenEnabled(e){this.uniforms.uGrassSheenStrength.value=e?es:0}setupGUI(e,s=[]){const a=[this,...s],r=e.addFolder("Grass Props");r.addColor(this.colorControls,"baseColor").onChange(n=>{for(const i of a)i.colorControls.baseColor=n,i.setPaletteColors()}),r.addColor(this.colorControls,"tipColor").onChange(n=>{for(const i of a)i.colorControls.tipColor=n,i.setPaletteColors()}),r.addColor(this.colorControls,"dryColor").onChange(n=>{for(const i of a)i.colorControls.dryColor=n,i.setPaletteColors()});const o={value:this.artTipColorStrength};r.add(o,"value",.15,.75,.01).name("Tip Mix").onChange(n=>{for(const i of a)i.artTipColorStrength=n,i.setPaletteColors()}),r.add(this.uniforms.uGrassWindStrength,"value",0,.45,.005).name("Wind Strength").onChange(n=>{for(const i of s)i.uniforms.uGrassWindStrength.value=n}),r.add(this.uniforms.uGrassFlutterStrength,"value",0,.15,.0025).name("Tip Flutter").onChange(n=>{for(const i of s)i.uniforms.uGrassFlutterStrength.value=n}),r.add(this.uniforms.uGrassNormalUpRange.value,"y",0,.9,.01).name("Normal Up (far)").onChange(n=>{for(const i of s){const u=i.uniforms.uGrassNormalUpRange.value;u.y=n,u.x=n*this.nearNormalUpScale}}),r.add(this.uniforms.uGrassAmbientBoost,"value",0,.4,.01).name("Ambient Boost").onChange(n=>{for(const i of s)i.uniforms.uGrassAmbientBoost.value=n}),r.add(this.uniforms.uGrassBacklightStrength,"value",0,.5,.01).name("Backlight").onChange(n=>{for(const i of s)i.uniforms.uGrassBacklightStrength.value=n}),r.add(this.uniforms.uGrassBladeCurvature,"value",0,1.2,.01).name("Blade Curve").onChange(n=>{for(const i of s)i.uniforms.uGrassBladeCurvature.value=n}),r.add(this.uniforms.uGrassSheenStrength,"value",0,.3,.005).name("Sheen").onChange(n=>{for(const i of s)i.uniforms.uGrassSheenStrength.value=n}),r.add(this.uniforms.uGrassSheenPower,"value",8,96,1).name("Sheen Focus").onChange(n=>{for(const i of s)i.uniforms.uGrassSheenPower.value=n}),r.add(this.uniforms.uGrassGustFrontDepth,"value",0,.9,.01).name("Gust Fronts").onChange(n=>{for(const i of s)i.uniforms.uGrassGustFrontDepth.value=n}),r.add(this.uniforms.uGrassGustFrontSpeed,"value",0,1.6,.01).name("Gust Speed").onChange(n=>{for(const i of s)i.uniforms.uGrassGustFrontSpeed.value=n}),r.open()}}const za=.1;class gr{constructor(){c(this,"elapsedSeconds",0)}update(e){return!Number.isFinite(e)||e<=0?this.elapsedSeconds:(this.elapsedSeconds+=Math.min(e,za),this.elapsedSeconds)}}function fr(){const t=Math.max(1,window.innerWidth),e=Math.max(1,window.innerHeight);return{width:t,height:e,aspect:t/e}}function Sr(t){const e=window.devicePixelRatio,s=Number.isFinite(e)&&e>0?e:1;return Math.min(s,t)}export{us as A,Kt as B,wt as C,xt as D,sr as E,vt as F,Ka as G,St as H,ur as I,Js as J,cr as K,hr as L,dr as M,Xs as S,gr as W,Za as a,mr as b,rr as c,nr as d,b as e,Sr as f,ie as g,$ as h,ir as i,is as j,Re as k,Vs as l,st as m,or as n,lr as o,Qa as p,tr as q,fr as r,Se as s,ar as t,er as u,Ja as v,Pe as w,ft as x,gt as y,js as z};
