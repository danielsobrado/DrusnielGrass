import{a2 as bt,aY as jr,aZ as Ct,r as ea,s as $e,a_ as ta,a$ as Ze,b0 as Be,a7 as mt,b1 as oi,k as $t,am as _r,b2 as si,a3 as Pt,aU as Qe,_ as qt,an as Gt,D as Lt,L as St,K as sn,V as Ie,b3 as na,a4 as ln,B as Mn,J as li,b4 as ia,a as wt,af as gr,b5 as qe,b6 as ra,P as _n,b7 as aa,b8 as Pn,h as _t,a1 as Ut,b9 as Zt,ba as Qt,bb as cn,a5 as kt,bc as oa,a0 as sa,ao as Jt,$ as vt,a8 as Wn,l as Ne,bd as la,Y as Kt,be as ci,bf as ca,bg as fa,bh as tn,bi as da,bj as ua,bk as pa,bl as ha,bm as ma,bn as _a,bo as ga,bp as va,bq as Sa,br as Ea,bs as xa,bt as Ma,bu as Ta,bv as Aa,bw as Ra,aC as ba,Z as Ca,aA as Ln,az as pn,aB as Pa,a9 as Wt,bx as La,by as Ua,bz as qn,bA as Da,bB as Zn,bC as wa,bD as Ia,bE as Na,i as ya,bF as Fa,bG as Oa,ac as It,E as gn,al as vn,bH as Ba,bI as Dt,bJ as an,bK as Ot,bL as Ga,bM as vr,bN as Sr,bO as Er,bP as xn,bQ as xr,bR as Mr,bS as Tr,ag as Ar,bT as fn,bU as jt,x as $n,M as Ha,bV as Va,bW as Wa,bX as ka,bY as za,bZ as Rr,b_ as Xa,b$ as Ya,c0 as Ka,c1 as Un,c2 as Dn,c3 as wn,c4 as In,c5 as fi,c6 as di,c7 as ui,c8 as pi,c9 as hi,ca as mi,cb as _i,cc as gi,cd as vi,ce as kn,cf as Si,cg as Ei,ch as xi,ci as Mi,cj as Ti,ck as Ai,cl as Ri,cm as bi,cn as Ci,co as Pi,cp as Li,cq as Ui,cr as Di,cs as wi,ct as Ii,cu as Ni,cv as yi,cw as Fi,cx as Oi,cy as Bi,cz as zn,cA as Gi,cB as qa,cC as Za,cD as $a,cE as Qa,cF as Ja,cG as ja,cH as eo,cI as to,cJ as Hi,cK as no,cL as Sn,cM as io,cN as Vi,cO as Wi,cP as ki,cQ as br,ab as ro,cR as Tn,cS as zi,cT as ao,cU as Cr,cV as Xn,cW as Pr,cX as oo,cY as Lr,cZ as Ur,c_ as Dr,c$ as wr,d0 as Ir,d1 as Nr,d2 as yr,av as Fr,d3 as Xi,d4 as Or,d5 as Nn,d6 as yn,d7 as so,d8 as lo,d9 as Yi,da as ht,db as co,dc as fo,dd as uo,de as po,df as ho,dg as mo,t as _o,dh as go,di as vo,dj as So}from"./three.core-BloAwS4D.js";/**
 * @license
 * Copyright 2010-2026 Three.js Authors
 * SPDX-License-Identifier: MIT
 */function Br(){let e=null,n=!1,t=null,i=null;function c(o,d){t(o,d),i=e.requestAnimationFrame(c)}return{start:function(){n!==!0&&t!==null&&e!==null&&(i=e.requestAnimationFrame(c),n=!0)},stop:function(){e!==null&&e.cancelAnimationFrame(i),n=!1},setAnimationLoop:function(o){t=o},setContext:function(o){e=o}}}function Eo(e){const n=new WeakMap;function t(_,C){const M=_.array,W=_.usage,D=M.byteLength,p=e.createBuffer();e.bindBuffer(C,p),e.bufferData(C,M,W),_.onUploadCallback();let S;if(M instanceof Float32Array)S=e.FLOAT;else if(typeof Float16Array<"u"&&M instanceof Float16Array)S=e.HALF_FLOAT;else if(M instanceof Uint16Array)_.isFloat16BufferAttribute?S=e.HALF_FLOAT:S=e.UNSIGNED_SHORT;else if(M instanceof Int16Array)S=e.SHORT;else if(M instanceof Uint32Array)S=e.UNSIGNED_INT;else if(M instanceof Int32Array)S=e.INT;else if(M instanceof Int8Array)S=e.BYTE;else if(M instanceof Uint8Array)S=e.UNSIGNED_BYTE;else if(M instanceof Uint8ClampedArray)S=e.UNSIGNED_BYTE;else throw new Error("THREE.WebGLAttributes: Unsupported buffer data format: "+M);return{buffer:p,type:S,bytesPerElement:M.BYTES_PER_ELEMENT,version:_.version,size:D}}function i(_,C,M){const W=C.array,D=C.updateRanges;if(e.bindBuffer(M,_),D.length===0)e.bufferSubData(M,0,W);else{D.sort((S,b)=>S.start-b.start);let p=0;for(let S=1;S<D.length;S++){const b=D[p],G=D[S];G.start<=b.start+b.count+1?b.count=Math.max(b.count,G.start+G.count-b.start):(++p,D[p]=G)}D.length=p+1;for(let S=0,b=D.length;S<b;S++){const G=D[S];e.bufferSubData(M,G.start*W.BYTES_PER_ELEMENT,W,G.start,G.count)}C.clearUpdateRanges()}C.onUploadCallback()}function c(_){return _.isInterleavedBufferAttribute&&(_=_.data),n.get(_)}function o(_){_.isInterleavedBufferAttribute&&(_=_.data);const C=n.get(_);C&&(e.deleteBuffer(C.buffer),n.delete(_))}function d(_,C){if(_.isInterleavedBufferAttribute&&(_=_.data),_.isGLBufferAttribute){const W=n.get(_);(!W||W.version<_.version)&&n.set(_,{buffer:_.buffer,type:_.type,bytesPerElement:_.elementSize,version:_.version});return}const M=n.get(_);if(M===void 0)n.set(_,t(_,C));else if(M.version<_.version){if(M.size!==_.array.byteLength)throw new Error("THREE.WebGLAttributes: The size of the buffer attribute's array buffer does not match the original size. Resizing buffer attributes is not supported.");i(M.buffer,_,C),M.version=_.version}}return{get:c,remove:o,update:d}}var xo=`#ifdef USE_ALPHAHASH
	if ( diffuseColor.a < getAlphaHashThreshold( vPosition ) ) discard;
#endif`,Mo=`#ifdef USE_ALPHAHASH
	const float ALPHA_HASH_SCALE = 0.05;
	float hash2D( vec2 value ) {
		return fract( 1.0e4 * sin( 17.0 * value.x + 0.1 * value.y ) * ( 0.1 + abs( sin( 13.0 * value.y + value.x ) ) ) );
	}
	float hash3D( vec3 value ) {
		return hash2D( vec2( hash2D( value.xy ), value.z ) );
	}
	float getAlphaHashThreshold( vec3 position ) {
		float maxDeriv = max(
			length( dFdx( position.xyz ) ),
			length( dFdy( position.xyz ) )
		);
		float pixScale = 1.0 / ( ALPHA_HASH_SCALE * maxDeriv );
		vec2 pixScales = vec2(
			exp2( floor( log2( pixScale ) ) ),
			exp2( ceil( log2( pixScale ) ) )
		);
		vec2 alpha = vec2(
			hash3D( floor( pixScales.x * position.xyz ) ),
			hash3D( floor( pixScales.y * position.xyz ) )
		);
		float lerpFactor = fract( log2( pixScale ) );
		float x = ( 1.0 - lerpFactor ) * alpha.x + lerpFactor * alpha.y;
		float a = min( lerpFactor, 1.0 - lerpFactor );
		vec3 cases = vec3(
			x * x / ( 2.0 * a * ( 1.0 - a ) ),
			( x - 0.5 * a ) / ( 1.0 - a ),
			1.0 - ( ( 1.0 - x ) * ( 1.0 - x ) / ( 2.0 * a * ( 1.0 - a ) ) )
		);
		float threshold = ( x < ( 1.0 - a ) )
			? ( ( x < a ) ? cases.x : cases.y )
			: cases.z;
		return clamp( threshold , 1.0e-6, 1.0 );
	}
#endif`,To=`#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, vAlphaMapUv ).g;
#endif`,Ao=`#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,Ro=`#ifdef USE_ALPHATEST
	#ifdef ALPHA_TO_COVERAGE
	diffuseColor.a = smoothstep( alphaTest, alphaTest + fwidth( diffuseColor.a ), diffuseColor.a );
	if ( diffuseColor.a == 0.0 ) discard;
	#else
	if ( diffuseColor.a < alphaTest ) discard;
	#endif
#endif`,bo=`#ifdef USE_ALPHATEST
	uniform float alphaTest;
#endif`,Co=`#ifdef USE_AOMAP
	float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;
	reflectedLight.indirectDiffuse *= ambientOcclusion;
	#if defined( USE_CLEARCOAT ) 
		clearcoatSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_SHEEN ) 
		sheenSpecularIndirect *= ambientOcclusion;
	#endif
	#if defined( USE_ENVMAP ) && defined( STANDARD )
		float dotNV = saturate( dot( geometryNormal, geometryViewDir ) );
		reflectedLight.indirectSpecular *= computeSpecularOcclusion( dotNV, ambientOcclusion, material.roughness );
	#endif
#endif`,Po=`#ifdef USE_AOMAP
	uniform sampler2D aoMap;
	uniform float aoMapIntensity;
#endif`,Lo=`#ifdef USE_BATCHING
	#if ! defined( GL_ANGLE_multi_draw )
	#define gl_DrawID _gl_DrawID
	uniform int _gl_DrawID;
	#endif
	uniform highp sampler2D batchingTexture;
	uniform highp usampler2D batchingIdTexture;
	mat4 getBatchingMatrix( const in float i ) {
		int size = textureSize( batchingTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( batchingTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( batchingTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( batchingTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( batchingTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
	float getIndirectIndex( const in int i ) {
		int size = textureSize( batchingIdTexture, 0 ).x;
		int x = i % size;
		int y = i / size;
		return float( texelFetch( batchingIdTexture, ivec2( x, y ), 0 ).r );
	}
#endif
#ifdef USE_BATCHING_COLOR
	uniform sampler2D batchingColorTexture;
	vec4 getBatchingColor( const in float i ) {
		int size = textureSize( batchingColorTexture, 0 ).x;
		int j = int( i );
		int x = j % size;
		int y = j / size;
		return texelFetch( batchingColorTexture, ivec2( x, y ), 0 );
	}
#endif`,Uo=`#ifdef USE_BATCHING
	mat4 batchingMatrix = getBatchingMatrix( getIndirectIndex( gl_DrawID ) );
#endif`,Do=`vec3 transformed = vec3( position );
#ifdef USE_ALPHAHASH
	vPosition = vec3( position );
#endif`,wo=`vec3 objectNormal = vec3( normal );
#ifdef USE_TANGENT
	vec3 objectTangent = vec3( tangent.xyz );
#endif`,Io=`float G_BlinnPhong_Implicit( ) {
	return 0.25;
}
float D_BlinnPhong( const in float shininess, const in float dotNH ) {
	return RECIPROCAL_PI * ( shininess * 0.5 + 1.0 ) * pow( dotNH, shininess );
}
vec3 BRDF_BlinnPhong( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in vec3 specularColor, const in float shininess ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( specularColor, 1.0, dotVH );
	float G = G_BlinnPhong_Implicit( );
	float D = D_BlinnPhong( shininess, dotNH );
	return F * ( G * D );
} // validated`,No=`#ifdef USE_IRIDESCENCE
	const mat3 XYZ_TO_REC709 = mat3(
		 3.2404542, -0.9692660,  0.0556434,
		-1.5371385,  1.8760108, -0.2040259,
		-0.4985314,  0.0415560,  1.0572252
	);
	vec3 Fresnel0ToIor( vec3 fresnel0 ) {
		vec3 sqrtF0 = sqrt( fresnel0 );
		return ( vec3( 1.0 ) + sqrtF0 ) / ( vec3( 1.0 ) - sqrtF0 );
	}
	vec3 IorToFresnel0( vec3 transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - vec3( incidentIor ) ) / ( transmittedIor + vec3( incidentIor ) ) );
	}
	float IorToFresnel0( float transmittedIor, float incidentIor ) {
		return pow2( ( transmittedIor - incidentIor ) / ( transmittedIor + incidentIor ));
	}
	vec3 evalSensitivity( float OPD, vec3 shift ) {
		float phase = 2.0 * PI * OPD * 1.0e-9;
		vec3 val = vec3( 5.4856e-13, 4.4201e-13, 5.2481e-13 );
		vec3 pos = vec3( 1.6810e+06, 1.7953e+06, 2.2084e+06 );
		vec3 var = vec3( 4.3278e+09, 9.3046e+09, 6.6121e+09 );
		vec3 xyz = val * sqrt( 2.0 * PI * var ) * cos( pos * phase + shift ) * exp( - pow2( phase ) * var );
		xyz.x += 9.7470e-14 * sqrt( 2.0 * PI * 4.5282e+09 ) * cos( 2.2399e+06 * phase + shift[ 0 ] ) * exp( - 4.5282e+09 * pow2( phase ) );
		xyz /= 1.0685e-7;
		vec3 rgb = XYZ_TO_REC709 * xyz;
		return rgb;
	}
	vec3 evalIridescence( float outsideIOR, float eta2, float cosTheta1, float thinFilmThickness, vec3 baseF0 ) {
		vec3 I;
		float iridescenceIOR = mix( outsideIOR, eta2, smoothstep( 0.0, 0.03, thinFilmThickness ) );
		float sinTheta2Sq = pow2( outsideIOR / iridescenceIOR ) * ( 1.0 - pow2( cosTheta1 ) );
		float cosTheta2Sq = 1.0 - sinTheta2Sq;
		if ( cosTheta2Sq < 0.0 ) {
			return vec3( 1.0 );
		}
		float cosTheta2 = sqrt( cosTheta2Sq );
		float R0 = IorToFresnel0( iridescenceIOR, outsideIOR );
		float R12 = F_Schlick( R0, 1.0, cosTheta1 );
		float T121 = 1.0 - R12;
		float phi12 = 0.0;
		if ( iridescenceIOR < outsideIOR ) phi12 = PI;
		float phi21 = PI - phi12;
		vec3 baseIOR = Fresnel0ToIor( clamp( baseF0, 0.0, 0.9999 ) );		vec3 R1 = IorToFresnel0( baseIOR, iridescenceIOR );
		vec3 R23 = F_Schlick( R1, 1.0, cosTheta2 );
		vec3 phi23 = vec3( 0.0 );
		if ( baseIOR[ 0 ] < iridescenceIOR ) phi23[ 0 ] = PI;
		if ( baseIOR[ 1 ] < iridescenceIOR ) phi23[ 1 ] = PI;
		if ( baseIOR[ 2 ] < iridescenceIOR ) phi23[ 2 ] = PI;
		float OPD = 2.0 * iridescenceIOR * thinFilmThickness * cosTheta2;
		vec3 phi = vec3( phi21 ) + phi23;
		vec3 R123 = clamp( R12 * R23, 1e-5, 0.9999 );
		vec3 r123 = sqrt( R123 );
		vec3 Rs = pow2( T121 ) * R23 / ( vec3( 1.0 ) - R123 );
		vec3 C0 = R12 + Rs;
		I = C0;
		vec3 Cm = Rs - T121;
		for ( int m = 1; m <= 2; ++ m ) {
			Cm *= r123;
			vec3 Sm = 2.0 * evalSensitivity( float( m ) * OPD, float( m ) * phi );
			I += Cm * Sm;
		}
		return max( I, vec3( 0.0 ) );
	}
#endif`,yo=`#ifdef USE_BUMPMAP
	uniform sampler2D bumpMap;
	uniform float bumpScale;
	vec2 dHdxy_fwd() {
		vec2 dSTdx = dFdx( vBumpMapUv );
		vec2 dSTdy = dFdy( vBumpMapUv );
		float Hll = bumpScale * texture2D( bumpMap, vBumpMapUv ).x;
		float dBx = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdx ).x - Hll;
		float dBy = bumpScale * texture2D( bumpMap, vBumpMapUv + dSTdy ).x - Hll;
		return vec2( dBx, dBy );
	}
	vec3 perturbNormalArb( vec3 surf_pos, vec3 surf_norm, vec2 dHdxy, float faceDirection ) {
		vec3 vSigmaX = normalize( dFdx( surf_pos.xyz ) );
		vec3 vSigmaY = normalize( dFdy( surf_pos.xyz ) );
		vec3 vN = surf_norm;
		vec3 R1 = cross( vSigmaY, vN );
		vec3 R2 = cross( vN, vSigmaX );
		float fDet = dot( vSigmaX, R1 ) * faceDirection;
		vec3 vGrad = sign( fDet ) * ( dHdxy.x * R1 + dHdxy.y * R2 );
		return normalize( abs( fDet ) * surf_norm - vGrad );
	}
#endif`,Fo=`#if NUM_CLIPPING_PLANES > 0
	vec4 plane;
	#ifdef ALPHA_TO_COVERAGE
		float distanceToPlane, distanceGradient;
		float clipOpacity = 1.0;
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
			distanceGradient = fwidth( distanceToPlane ) / 2.0;
			clipOpacity *= smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			if ( clipOpacity == 0.0 ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			float unionClipOpacity = 1.0;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				distanceToPlane = - dot( vClipPosition, plane.xyz ) + plane.w;
				distanceGradient = fwidth( distanceToPlane ) / 2.0;
				unionClipOpacity *= 1.0 - smoothstep( - distanceGradient, distanceGradient, distanceToPlane );
			}
			#pragma unroll_loop_end
			clipOpacity *= 1.0 - unionClipOpacity;
		#endif
		diffuseColor.a *= clipOpacity;
		if ( diffuseColor.a == 0.0 ) discard;
	#else
		#pragma unroll_loop_start
		for ( int i = 0; i < UNION_CLIPPING_PLANES; i ++ ) {
			plane = clippingPlanes[ i ];
			if ( dot( vClipPosition, plane.xyz ) > plane.w ) discard;
		}
		#pragma unroll_loop_end
		#if UNION_CLIPPING_PLANES < NUM_CLIPPING_PLANES
			bool clipped = true;
			#pragma unroll_loop_start
			for ( int i = UNION_CLIPPING_PLANES; i < NUM_CLIPPING_PLANES; i ++ ) {
				plane = clippingPlanes[ i ];
				clipped = ( dot( vClipPosition, plane.xyz ) > plane.w ) && clipped;
			}
			#pragma unroll_loop_end
			if ( clipped ) discard;
		#endif
	#endif
#endif`,Oo=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
	uniform vec4 clippingPlanes[ NUM_CLIPPING_PLANES ];
#endif`,Bo=`#if NUM_CLIPPING_PLANES > 0
	varying vec3 vClipPosition;
#endif`,Go=`#if NUM_CLIPPING_PLANES > 0
	vClipPosition = - mvPosition.xyz;
#endif`,Ho=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	diffuseColor *= vColor;
#endif`,Vo=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA )
	varying vec4 vColor;
#endif`,Wo=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	varying vec4 vColor;
#endif`,ko=`#if defined( USE_COLOR ) || defined( USE_COLOR_ALPHA ) || defined( USE_INSTANCING_COLOR ) || defined( USE_BATCHING_COLOR )
	vColor = vec4( 1.0 );
#endif
#ifdef USE_COLOR_ALPHA
	vColor *= color;
#elif defined( USE_COLOR )
	vColor.rgb *= color;
#endif
#ifdef USE_INSTANCING_COLOR
	vColor.rgb *= instanceColor.rgb;
#endif
#ifdef USE_BATCHING_COLOR
	vColor *= getBatchingColor( getIndirectIndex( gl_DrawID ) );
#endif`,zo=`#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) { return x*x; }
vec3 pow2( const in vec3 x ) { return x*x; }
float pow3( const in float x ) { return x*x*x; }
float pow4( const in float x ) { float x2 = x*x; return x2*x2; }
float max3( const in vec3 v ) { return max( max( v.x, v.y ), v.z ); }
float average( const in vec3 v ) { return dot( v, vec3( 0.3333333 ) ); }
highp float rand( const in vec2 uv ) {
	const highp float a = 12.9898, b = 78.233, c = 43758.5453;
	highp float dt = dot( uv.xy, vec2( a,b ) ), sn = mod( dt, PI );
	return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
	float precisionSafeLength( vec3 v ) { return length( v ); }
#else
	float precisionSafeLength( vec3 v ) {
		float maxComponent = max3( abs( v ) );
		return length( v / maxComponent ) * maxComponent;
	}
#endif
struct IncidentLight {
	vec3 color;
	vec3 direction;
	bool visible;
};
struct ReflectedLight {
	vec3 directDiffuse;
	vec3 directSpecular;
	vec3 indirectDiffuse;
	vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
	varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
	return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
#define inverseTransformDirection transformDirectionByInverseViewMatrix
vec3 transformNormalByInverseViewMatrix( in vec3 normal, in mat4 viewMatrix ) {
	return normalize( ( vec4( normal, 0.0 ) * viewMatrix ).xyz );
}
vec3 transformDirectionByInverseViewMatrix( in vec3 dir, in mat4 viewMatrix ) {
	return normalize( ( vec4( dir, 0.0 ) * viewMatrix ).xyz );
}
bool isPerspectiveMatrix( mat4 m ) {
	return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
	float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
	float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
	return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
	return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
	float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
	return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
} // validated`,Xo=`#ifdef ENVMAP_TYPE_CUBE_UV
	#define cubeUV_minMipLevel 4.0
	#define cubeUV_minTileSize 16.0
	float getFace( vec3 direction ) {
		vec3 absDirection = abs( direction );
		float face = - 1.0;
		if ( absDirection.x > absDirection.z ) {
			if ( absDirection.x > absDirection.y )
				face = direction.x > 0.0 ? 0.0 : 3.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		} else {
			if ( absDirection.z > absDirection.y )
				face = direction.z > 0.0 ? 2.0 : 5.0;
			else
				face = direction.y > 0.0 ? 1.0 : 4.0;
		}
		return face;
	}
	vec2 getUV( vec3 direction, float face ) {
		vec2 uv;
		if ( face == 0.0 ) {
			uv = vec2( direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 1.0 ) {
			uv = vec2( - direction.x, - direction.z ) / abs( direction.y );
		} else if ( face == 2.0 ) {
			uv = vec2( - direction.x, direction.y ) / abs( direction.z );
		} else if ( face == 3.0 ) {
			uv = vec2( - direction.z, direction.y ) / abs( direction.x );
		} else if ( face == 4.0 ) {
			uv = vec2( - direction.x, direction.z ) / abs( direction.y );
		} else {
			uv = vec2( direction.x, direction.y ) / abs( direction.z );
		}
		return 0.5 * ( uv + 1.0 );
	}
	vec3 bilinearCubeUV( sampler2D envMap, vec3 direction, float mipInt ) {
		float face = getFace( direction );
		float filterInt = max( cubeUV_minMipLevel - mipInt, 0.0 );
		mipInt = max( mipInt, cubeUV_minMipLevel );
		float faceSize = exp2( mipInt );
		highp vec2 uv = getUV( direction, face ) * ( faceSize - 2.0 ) + 1.0;
		if ( face > 2.0 ) {
			uv.y += faceSize;
			face -= 3.0;
		}
		uv.x += face * faceSize;
		uv.x += filterInt * 3.0 * cubeUV_minTileSize;
		uv.y += 4.0 * ( exp2( CUBEUV_MAX_MIP ) - faceSize );
		uv.x *= CUBEUV_TEXEL_WIDTH;
		uv.y *= CUBEUV_TEXEL_HEIGHT;
		#ifdef texture2DGradEXT
			return texture2DGradEXT( envMap, uv, vec2( 0.0 ), vec2( 0.0 ) ).rgb;
		#else
			return texture2D( envMap, uv ).rgb;
		#endif
	}
	#define cubeUV_r0 1.0
	#define cubeUV_m0 - 2.0
	#define cubeUV_r1 0.8
	#define cubeUV_m1 - 1.0
	#define cubeUV_r4 0.4
	#define cubeUV_m4 2.0
	#define cubeUV_r5 0.305
	#define cubeUV_m5 3.0
	#define cubeUV_r6 0.21
	#define cubeUV_m6 4.0
	float roughnessToMip( float roughness ) {
		float mip = 0.0;
		if ( roughness >= cubeUV_r1 ) {
			mip = ( cubeUV_r0 - roughness ) * ( cubeUV_m1 - cubeUV_m0 ) / ( cubeUV_r0 - cubeUV_r1 ) + cubeUV_m0;
		} else if ( roughness >= cubeUV_r4 ) {
			mip = ( cubeUV_r1 - roughness ) * ( cubeUV_m4 - cubeUV_m1 ) / ( cubeUV_r1 - cubeUV_r4 ) + cubeUV_m1;
		} else if ( roughness >= cubeUV_r5 ) {
			mip = ( cubeUV_r4 - roughness ) * ( cubeUV_m5 - cubeUV_m4 ) / ( cubeUV_r4 - cubeUV_r5 ) + cubeUV_m4;
		} else if ( roughness >= cubeUV_r6 ) {
			mip = ( cubeUV_r5 - roughness ) * ( cubeUV_m6 - cubeUV_m5 ) / ( cubeUV_r5 - cubeUV_r6 ) + cubeUV_m5;
		} else {
			mip = - 2.0 * log2( 1.16 * roughness );		}
		return mip;
	}
	vec4 textureCubeUV( sampler2D envMap, vec3 sampleDir, float roughness ) {
		float mip = clamp( roughnessToMip( roughness ), cubeUV_m0, CUBEUV_MAX_MIP );
		float mipF = fract( mip );
		float mipInt = floor( mip );
		vec3 color0 = bilinearCubeUV( envMap, sampleDir, mipInt );
		if ( mipF == 0.0 ) {
			return vec4( color0, 1.0 );
		} else {
			vec3 color1 = bilinearCubeUV( envMap, sampleDir, mipInt + 1.0 );
			return vec4( mix( color0, color1, mipF ), 1.0 );
		}
	}
#endif`,Yo=`vec3 transformedNormal = objectNormal;
#ifdef USE_TANGENT
	vec3 transformedTangent = objectTangent;
#endif
#ifdef USE_BATCHING
	mat3 bm = mat3( batchingMatrix );
	transformedNormal /= vec3( dot( bm[ 0 ], bm[ 0 ] ), dot( bm[ 1 ], bm[ 1 ] ), dot( bm[ 2 ], bm[ 2 ] ) );
	transformedNormal = bm * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = bm * transformedTangent;
	#endif
#endif
#ifdef USE_INSTANCING
	mat3 im = mat3( instanceMatrix );
	transformedNormal /= vec3( dot( im[ 0 ], im[ 0 ] ), dot( im[ 1 ], im[ 1 ] ), dot( im[ 2 ], im[ 2 ] ) );
	transformedNormal = im * transformedNormal;
	#ifdef USE_TANGENT
		transformedTangent = im * transformedTangent;
	#endif
#endif
transformedNormal = normalMatrix * transformedNormal;
#ifdef FLIP_SIDED
	transformedNormal = - transformedNormal;
#endif
#ifdef USE_TANGENT
	transformedTangent = ( modelViewMatrix * vec4( transformedTangent, 0.0 ) ).xyz;
#endif`,Ko=`#ifdef USE_DISPLACEMENTMAP
	uniform sampler2D displacementMap;
	uniform float displacementScale;
	uniform float displacementBias;
#endif`,qo=`#ifdef USE_DISPLACEMENTMAP
	transformed += normalize( objectNormal ) * ( texture2D( displacementMap, vDisplacementMapUv ).x * displacementScale + displacementBias );
#endif`,Zo=`#ifdef USE_EMISSIVEMAP
	vec4 emissiveColor = texture2D( emissiveMap, vEmissiveMapUv );
	#ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
		emissiveColor = sRGBTransferEOTF( emissiveColor );
	#endif
	totalEmissiveRadiance *= emissiveColor.rgb;
#endif`,$o=`#ifdef USE_EMISSIVEMAP
	uniform sampler2D emissiveMap;
#endif`,Qo="gl_FragColor = linearToOutputTexel( gl_FragColor );",Jo=`vec4 LinearTransferOETF( in vec4 value ) {
	return value;
}
vec4 sRGBTransferEOTF( in vec4 value ) {
	return vec4( mix( pow( value.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), value.rgb * 0.0773993808, vec3( lessThanEqual( value.rgb, vec3( 0.04045 ) ) ) ), value.a );
}
vec4 sRGBTransferOETF( in vec4 value ) {
	return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}`,jo=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vec3 cameraToFrag;
		if ( isOrthographic ) {
			cameraToFrag = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToFrag = normalize( vWorldPosition - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vec3 reflectVec = reflect( cameraToFrag, worldNormal );
		#else
			vec3 reflectVec = refract( cameraToFrag, worldNormal, refractionRatio );
		#endif
	#else
		vec3 reflectVec = vReflect;
	#endif
	#ifdef ENVMAP_TYPE_CUBE
		vec4 envColor = textureCube( envMap, envMapRotation * reflectVec );
		#ifdef ENVMAP_BLENDING_MULTIPLY
			outgoingLight = mix( outgoingLight, outgoingLight * envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_MIX )
			outgoingLight = mix( outgoingLight, envColor.xyz, specularStrength * reflectivity );
		#elif defined( ENVMAP_BLENDING_ADD )
			outgoingLight += envColor.xyz * specularStrength * reflectivity;
		#endif
	#endif
#endif`,es=`#ifdef USE_ENVMAP
	uniform float envMapIntensity;
	uniform mat3 envMapRotation;
	#ifdef ENVMAP_TYPE_CUBE
		uniform samplerCube envMap;
	#else
		uniform sampler2D envMap;
	#endif
#endif`,ts=`#ifdef USE_ENVMAP
	uniform float reflectivity;
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		varying vec3 vWorldPosition;
		uniform float refractionRatio;
	#else
		varying vec3 vReflect;
	#endif
#endif`,ns=`#ifdef USE_ENVMAP
	#if defined( USE_BUMPMAP ) || defined( USE_NORMALMAP ) || defined( PHONG ) || defined( LAMBERT )
		#define ENV_WORLDPOS
	#endif
	#ifdef ENV_WORLDPOS
		
		varying vec3 vWorldPosition;
	#else
		varying vec3 vReflect;
		uniform float refractionRatio;
	#endif
#endif`,is=`#ifdef USE_ENVMAP
	#ifdef ENV_WORLDPOS
		vWorldPosition = worldPosition.xyz;
	#else
		vec3 cameraToVertex;
		if ( isOrthographic ) {
			cameraToVertex = normalize( vec3( - viewMatrix[ 0 ][ 2 ], - viewMatrix[ 1 ][ 2 ], - viewMatrix[ 2 ][ 2 ] ) );
		} else {
			cameraToVertex = normalize( worldPosition.xyz - cameraPosition );
		}
		vec3 worldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
		#ifdef ENVMAP_MODE_REFLECTION
			vReflect = reflect( cameraToVertex, worldNormal );
		#else
			vReflect = refract( cameraToVertex, worldNormal, refractionRatio );
		#endif
	#endif
#endif`,rs=`#ifdef USE_FOG
	vFogDepth = - mvPosition.z;
#endif`,as=`#ifdef USE_FOG
	varying float vFogDepth;
#endif`,os=`#ifdef USE_FOG
	#ifdef FOG_EXP2
		float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
	#else
		float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
	#endif
	gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
#endif`,ss=`#ifdef USE_FOG
	uniform vec3 fogColor;
	varying float vFogDepth;
	#ifdef FOG_EXP2
		uniform float fogDensity;
	#else
		uniform float fogNear;
		uniform float fogFar;
	#endif
#endif`,ls=`#ifdef USE_GRADIENTMAP
	uniform sampler2D gradientMap;
#endif
vec3 getGradientIrradiance( vec3 normal, vec3 lightDirection ) {
	float dotNL = dot( normal, lightDirection );
	vec2 coord = vec2( dotNL * 0.5 + 0.5, 0.0 );
	#ifdef USE_GRADIENTMAP
		return vec3( texture2D( gradientMap, coord ).r );
	#else
		vec2 fw = fwidth( coord ) * 0.5;
		return mix( vec3( 0.7 ), vec3( 1.0 ), smoothstep( 0.7 - fw.x, 0.7 + fw.x, coord.x ) );
	#endif
}`,cs=`#ifdef USE_LIGHTMAP
	uniform sampler2D lightMap;
	uniform float lightMapIntensity;
#endif`,fs=`LambertMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularStrength = specularStrength;`,ds=`varying vec3 vViewPosition;
struct LambertMaterial {
	vec3 diffuseColor;
	float specularStrength;
};
void RE_Direct_Lambert( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Lambert( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in LambertMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Lambert
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Lambert`,us=`uniform bool receiveShadow;
uniform vec3 ambientLightColor;
#if defined( USE_LIGHT_PROBES )
	uniform vec3 lightProbe[ 9 ];
#endif
vec3 shGetIrradianceAt( in vec3 normal, in vec3 shCoefficients[ 9 ] ) {
	float x = normal.x, y = normal.y, z = normal.z;
	vec3 result = shCoefficients[ 0 ] * 0.886227;
	result += shCoefficients[ 1 ] * 2.0 * 0.511664 * y;
	result += shCoefficients[ 2 ] * 2.0 * 0.511664 * z;
	result += shCoefficients[ 3 ] * 2.0 * 0.511664 * x;
	result += shCoefficients[ 4 ] * 2.0 * 0.429043 * x * y;
	result += shCoefficients[ 5 ] * 2.0 * 0.429043 * y * z;
	result += shCoefficients[ 6 ] * ( 0.743125 * z * z - 0.247708 );
	result += shCoefficients[ 7 ] * 2.0 * 0.429043 * x * z;
	result += shCoefficients[ 8 ] * 0.429043 * ( x * x - y * y );
	return result;
}
vec3 getLightProbeIrradiance( const in vec3 lightProbe[ 9 ], const in vec3 normal ) {
	vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec3 irradiance = shGetIrradianceAt( worldNormal, lightProbe );
	return irradiance;
}
vec3 getAmbientLightIrradiance( const in vec3 ambientLightColor ) {
	vec3 irradiance = ambientLightColor;
	return irradiance;
}
float getDistanceAttenuation( const in float lightDistance, const in float cutoffDistance, const in float decayExponent ) {
	float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
	if ( cutoffDistance > 0.0 ) {
		distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
	}
	return distanceFalloff;
}
float getSpotAttenuation( const in float coneCosine, const in float penumbraCosine, const in float angleCosine ) {
	return smoothstep( coneCosine, penumbraCosine, angleCosine );
}
#if NUM_DIR_LIGHTS > 0
	struct DirectionalLight {
		vec3 direction;
		vec3 color;
	};
	uniform DirectionalLight directionalLights[ NUM_DIR_LIGHTS ];
	void getDirectionalLightInfo( const in DirectionalLight directionalLight, out IncidentLight light ) {
		light.color = directionalLight.color;
		light.direction = directionalLight.direction;
		light.visible = true;
	}
#endif
#if NUM_POINT_LIGHTS > 0
	struct PointLight {
		vec3 position;
		vec3 color;
		float distance;
		float decay;
	};
	uniform PointLight pointLights[ NUM_POINT_LIGHTS ];
	void getPointLightInfo( const in PointLight pointLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = pointLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float lightDistance = length( lVector );
		light.color = pointLight.color;
		light.color *= getDistanceAttenuation( lightDistance, pointLight.distance, pointLight.decay );
		light.visible = ( light.color != vec3( 0.0 ) );
	}
#endif
#if NUM_SPOT_LIGHTS > 0
	struct SpotLight {
		vec3 position;
		vec3 direction;
		vec3 color;
		float distance;
		float decay;
		float coneCos;
		float penumbraCos;
	};
	uniform SpotLight spotLights[ NUM_SPOT_LIGHTS ];
	void getSpotLightInfo( const in SpotLight spotLight, const in vec3 geometryPosition, out IncidentLight light ) {
		vec3 lVector = spotLight.position - geometryPosition;
		light.direction = normalize( lVector );
		float angleCos = dot( light.direction, spotLight.direction );
		float spotAttenuation = getSpotAttenuation( spotLight.coneCos, spotLight.penumbraCos, angleCos );
		if ( spotAttenuation > 0.0 ) {
			float lightDistance = length( lVector );
			light.color = spotLight.color * spotAttenuation;
			light.color *= getDistanceAttenuation( lightDistance, spotLight.distance, spotLight.decay );
			light.visible = ( light.color != vec3( 0.0 ) );
		} else {
			light.color = vec3( 0.0 );
			light.visible = false;
		}
	}
#endif
#if NUM_RECT_AREA_LIGHTS > 0
	struct RectAreaLight {
		vec3 color;
		vec3 position;
		vec3 halfWidth;
		vec3 halfHeight;
	};
	uniform sampler2D ltc_1;	uniform sampler2D ltc_2;
	uniform RectAreaLight rectAreaLights[ NUM_RECT_AREA_LIGHTS ];
#endif
#if NUM_HEMI_LIGHTS > 0
	struct HemisphereLight {
		vec3 direction;
		vec3 skyColor;
		vec3 groundColor;
	};
	uniform HemisphereLight hemisphereLights[ NUM_HEMI_LIGHTS ];
	vec3 getHemisphereLightIrradiance( const in HemisphereLight hemiLight, const in vec3 normal ) {
		float dotNL = dot( normal, hemiLight.direction );
		float hemiDiffuseWeight = 0.5 * dotNL + 0.5;
		vec3 irradiance = mix( hemiLight.groundColor, hemiLight.skyColor, hemiDiffuseWeight );
		return irradiance;
	}
#endif
#include <lightprobes_pars_fragment>`,ps=`#ifdef USE_ENVMAP
	vec3 getIBLIrradiance( const in vec3 normal ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 worldNormal = transformNormalByInverseViewMatrix( normal, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * worldNormal, 1.0 );
			return PI * envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	vec3 getIBLRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness ) {
		#ifdef ENVMAP_TYPE_CUBE_UV
			vec3 reflectVec = reflect( - viewDir, normal );
			reflectVec = normalize( mix( reflectVec, normal, pow4( roughness ) ) );
			reflectVec = transformDirectionByInverseViewMatrix( reflectVec, viewMatrix );
			vec4 envMapColor = textureCubeUV( envMap, envMapRotation * reflectVec, roughness );
			return envMapColor.rgb * envMapIntensity;
		#else
			return vec3( 0.0 );
		#endif
	}
	#ifdef USE_ANISOTROPY
		vec3 getIBLAnisotropyRadiance( const in vec3 viewDir, const in vec3 normal, const in float roughness, const in vec3 bitangent, const in float anisotropy ) {
			#ifdef ENVMAP_TYPE_CUBE_UV
				vec3 bentNormal = cross( bitangent, viewDir );
				bentNormal = normalize( cross( bentNormal, bitangent ) );
				bentNormal = normalize( mix( bentNormal, normal, pow2( pow2( 1.0 - anisotropy * ( 1.0 - roughness ) ) ) ) );
				return getIBLRadiance( viewDir, bentNormal, roughness );
			#else
				return vec3( 0.0 );
			#endif
		}
	#endif
#endif`,hs=`ToonMaterial material;
material.diffuseColor = diffuseColor.rgb;`,ms=`varying vec3 vViewPosition;
struct ToonMaterial {
	vec3 diffuseColor;
};
void RE_Direct_Toon( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 irradiance = getGradientIrradiance( geometryNormal, directLight.direction ) * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
void RE_IndirectDiffuse_Toon( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in ToonMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_Toon
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Toon`,_s=`BlinnPhongMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.specularColor = specular;
material.specularShininess = shininess;
material.specularStrength = specularStrength;`,gs=`varying vec3 vViewPosition;
struct BlinnPhongMaterial {
	vec3 diffuseColor;
	vec3 specularColor;
	float specularShininess;
	float specularStrength;
};
void RE_Direct_BlinnPhong( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
	reflectedLight.directSpecular += irradiance * BRDF_BlinnPhong( directLight.direction, geometryViewDir, geometryNormal, material.specularColor, material.specularShininess ) * material.specularStrength;
}
void RE_IndirectDiffuse_BlinnPhong( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in BlinnPhongMaterial material, inout ReflectedLight reflectedLight ) {
	reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );
}
#define RE_Direct				RE_Direct_BlinnPhong
#define RE_IndirectDiffuse		RE_IndirectDiffuse_BlinnPhong`,vs=`PhysicalMaterial material;
material.diffuseColor = diffuseColor.rgb;
material.diffuseContribution = diffuseColor.rgb * ( 1.0 - metalnessFactor );
material.metalness = metalnessFactor;
vec3 dxy = max( abs( dFdx( nonPerturbedNormal ) ), abs( dFdy( nonPerturbedNormal ) ) );
float geometryRoughness = max( max( dxy.x, dxy.y ), dxy.z );
material.roughness = max( roughnessFactor, 0.0525 );material.roughness += geometryRoughness;
material.roughness = min( material.roughness, 1.0 );
#ifdef IOR
	material.ior = ior;
	#ifdef USE_SPECULAR
		float specularIntensityFactor = specularIntensity;
		vec3 specularColorFactor = specularColor;
		#ifdef USE_SPECULAR_COLORMAP
			specularColorFactor *= texture2D( specularColorMap, vSpecularColorMapUv ).rgb;
		#endif
		#ifdef USE_SPECULAR_INTENSITYMAP
			specularIntensityFactor *= texture2D( specularIntensityMap, vSpecularIntensityMapUv ).a;
		#endif
		material.specularF90 = mix( specularIntensityFactor, 1.0, metalnessFactor );
	#else
		float specularIntensityFactor = 1.0;
		vec3 specularColorFactor = vec3( 1.0 );
		material.specularF90 = 1.0;
	#endif
	material.specularColor = min( pow2( ( material.ior - 1.0 ) / ( material.ior + 1.0 ) ) * specularColorFactor, vec3( 1.0 ) ) * specularIntensityFactor;
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
#else
	material.specularColor = vec3( 0.04 );
	material.specularColorBlended = mix( material.specularColor, diffuseColor.rgb, metalnessFactor );
	material.specularF90 = 1.0;
#endif
#ifdef USE_CLEARCOAT
	material.clearcoat = clearcoat;
	material.clearcoatRoughness = clearcoatRoughness;
	material.clearcoatF0 = vec3( 0.04 );
	material.clearcoatF90 = 1.0;
	#ifdef USE_CLEARCOATMAP
		material.clearcoat *= texture2D( clearcoatMap, vClearcoatMapUv ).x;
	#endif
	#ifdef USE_CLEARCOAT_ROUGHNESSMAP
		material.clearcoatRoughness *= texture2D( clearcoatRoughnessMap, vClearcoatRoughnessMapUv ).y;
	#endif
	material.clearcoat = saturate( material.clearcoat );	material.clearcoatRoughness = max( material.clearcoatRoughness, 0.0525 );
	material.clearcoatRoughness += geometryRoughness;
	material.clearcoatRoughness = min( material.clearcoatRoughness, 1.0 );
#endif
#ifdef USE_DISPERSION
	material.dispersion = dispersion;
#endif
#ifdef USE_IRIDESCENCE
	material.iridescence = iridescence;
	material.iridescenceIOR = iridescenceIOR;
	#ifdef USE_IRIDESCENCEMAP
		material.iridescence *= texture2D( iridescenceMap, vIridescenceMapUv ).r;
	#endif
	#ifdef USE_IRIDESCENCE_THICKNESSMAP
		material.iridescenceThickness = (iridescenceThicknessMaximum - iridescenceThicknessMinimum) * texture2D( iridescenceThicknessMap, vIridescenceThicknessMapUv ).g + iridescenceThicknessMinimum;
	#else
		material.iridescenceThickness = iridescenceThicknessMaximum;
	#endif
#endif
#ifdef USE_SHEEN
	material.sheenColor = sheenColor;
	#ifdef USE_SHEEN_COLORMAP
		material.sheenColor *= texture2D( sheenColorMap, vSheenColorMapUv ).rgb;
	#endif
	material.sheenRoughness = clamp( sheenRoughness, 0.0001, 1.0 );
	#ifdef USE_SHEEN_ROUGHNESSMAP
		material.sheenRoughness *= texture2D( sheenRoughnessMap, vSheenRoughnessMapUv ).a;
	#endif
#endif
#ifdef USE_ANISOTROPY
	#ifdef USE_ANISOTROPYMAP
		mat2 anisotropyMat = mat2( anisotropyVector.x, anisotropyVector.y, - anisotropyVector.y, anisotropyVector.x );
		vec3 anisotropyPolar = texture2D( anisotropyMap, vAnisotropyMapUv ).rgb;
		vec2 anisotropyV = anisotropyMat * normalize( 2.0 * anisotropyPolar.rg - vec2( 1.0 ) ) * anisotropyPolar.b;
	#else
		vec2 anisotropyV = anisotropyVector;
	#endif
	material.anisotropy = length( anisotropyV );
	if( material.anisotropy == 0.0 ) {
		anisotropyV = vec2( 1.0, 0.0 );
	} else {
		anisotropyV /= material.anisotropy;
		material.anisotropy = saturate( material.anisotropy );
	}
	material.alphaT = mix( pow2( material.roughness ), 1.0, pow2( material.anisotropy ) );
	material.anisotropyT = tbn[ 0 ] * anisotropyV.x + tbn[ 1 ] * anisotropyV.y;
	material.anisotropyB = tbn[ 1 ] * anisotropyV.x - tbn[ 0 ] * anisotropyV.y;
#endif`,Ss=`uniform sampler2D dfgLUT;
struct PhysicalMaterial {
	vec3 diffuseColor;
	vec3 diffuseContribution;
	vec3 specularColor;
	vec3 specularColorBlended;
	float roughness;
	float metalness;
	float specularF90;
	float dispersion;
	#ifdef USE_CLEARCOAT
		float clearcoat;
		float clearcoatRoughness;
		vec3 clearcoatF0;
		float clearcoatF90;
	#endif
	#ifdef USE_IRIDESCENCE
		float iridescence;
		float iridescenceIOR;
		float iridescenceThickness;
		vec3 iridescenceFresnel;
		vec3 iridescenceF0;
		vec3 iridescenceFresnelDielectric;
		vec3 iridescenceFresnelMetallic;
	#endif
	#ifdef USE_SHEEN
		vec3 sheenColor;
		float sheenRoughness;
	#endif
	#ifdef IOR
		float ior;
	#endif
	#ifdef USE_TRANSMISSION
		float transmission;
		float transmissionAlpha;
		float thickness;
		float attenuationDistance;
		vec3 attenuationColor;
	#endif
	#ifdef USE_ANISOTROPY
		float anisotropy;
		float alphaT;
		vec3 anisotropyT;
		vec3 anisotropyB;
	#endif
};
vec3 clearcoatSpecularDirect = vec3( 0.0 );
vec3 clearcoatSpecularIndirect = vec3( 0.0 );
vec3 sheenSpecularDirect = vec3( 0.0 );
vec3 sheenSpecularIndirect = vec3(0.0 );
vec3 Schlick_to_F0( const in vec3 f, const in float f90, const in float dotVH ) {
    float x = clamp( 1.0 - dotVH, 0.0, 1.0 );
    float x2 = x * x;
    float x5 = clamp( x * x2 * x2, 0.0, 0.9999 );
    return ( f - vec3( f90 ) * x5 ) / ( 1.0 - x5 );
}
float V_GGX_SmithCorrelated( const in float alpha, const in float dotNL, const in float dotNV ) {
	float a2 = pow2( alpha );
	float gv = dotNL * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNV ) );
	float gl = dotNV * sqrt( a2 + ( 1.0 - a2 ) * pow2( dotNL ) );
	return 0.5 / max( gv + gl, EPSILON );
}
float D_GGX( const in float alpha, const in float dotNH ) {
	float a2 = pow2( alpha );
	float denom = pow2( dotNH ) * ( a2 - 1.0 ) + 1.0;
	return RECIPROCAL_PI * a2 / pow2( denom );
}
#ifdef USE_ANISOTROPY
	float V_GGX_SmithCorrelated_Anisotropic( const in float alphaT, const in float alphaB, const in float dotTV, const in float dotBV, const in float dotTL, const in float dotBL, const in float dotNV, const in float dotNL ) {
		float gv = dotNL * length( vec3( alphaT * dotTV, alphaB * dotBV, dotNV ) );
		float gl = dotNV * length( vec3( alphaT * dotTL, alphaB * dotBL, dotNL ) );
		return 0.5 / max( gv + gl, EPSILON );
	}
	float D_GGX_Anisotropic( const in float alphaT, const in float alphaB, const in float dotNH, const in float dotTH, const in float dotBH ) {
		float a2 = alphaT * alphaB;
		highp vec3 v = vec3( alphaB * dotTH, alphaT * dotBH, a2 * dotNH );
		highp float v2 = dot( v, v );
		float w2 = a2 / v2;
		return RECIPROCAL_PI * a2 * pow2 ( w2 );
	}
#endif
#ifdef USE_CLEARCOAT
	vec3 BRDF_GGX_Clearcoat( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material) {
		vec3 f0 = material.clearcoatF0;
		float f90 = material.clearcoatF90;
		float roughness = material.clearcoatRoughness;
		float alpha = pow2( roughness );
		vec3 halfDir = normalize( lightDir + viewDir );
		float dotNL = saturate( dot( normal, lightDir ) );
		float dotNV = saturate( dot( normal, viewDir ) );
		float dotNH = saturate( dot( normal, halfDir ) );
		float dotVH = saturate( dot( viewDir, halfDir ) );
		vec3 F = F_Schlick( f0, f90, dotVH );
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
		return F * ( V * D );
	}
#endif
vec3 BRDF_GGX( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 f0 = material.specularColorBlended;
	float f90 = material.specularF90;
	float roughness = material.roughness;
	float alpha = pow2( roughness );
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float dotVH = saturate( dot( viewDir, halfDir ) );
	vec3 F = F_Schlick( f0, f90, dotVH );
	#ifdef USE_IRIDESCENCE
		F = mix( F, material.iridescenceFresnel, material.iridescence );
	#endif
	#ifdef USE_ANISOTROPY
		float dotTL = dot( material.anisotropyT, lightDir );
		float dotTV = dot( material.anisotropyT, viewDir );
		float dotTH = dot( material.anisotropyT, halfDir );
		float dotBL = dot( material.anisotropyB, lightDir );
		float dotBV = dot( material.anisotropyB, viewDir );
		float dotBH = dot( material.anisotropyB, halfDir );
		float V = V_GGX_SmithCorrelated_Anisotropic( material.alphaT, alpha, dotTV, dotBV, dotTL, dotBL, dotNV, dotNL );
		float D = D_GGX_Anisotropic( material.alphaT, alpha, dotNH, dotTH, dotBH );
	#else
		float V = V_GGX_SmithCorrelated( alpha, dotNL, dotNV );
		float D = D_GGX( alpha, dotNH );
	#endif
	return F * ( V * D );
}
vec2 LTC_Uv( const in vec3 N, const in vec3 V, const in float roughness ) {
	const float LUT_SIZE = 64.0;
	const float LUT_SCALE = ( LUT_SIZE - 1.0 ) / LUT_SIZE;
	const float LUT_BIAS = 0.5 / LUT_SIZE;
	float dotNV = saturate( dot( N, V ) );
	vec2 uv = vec2( roughness, sqrt( 1.0 - dotNV ) );
	uv = uv * LUT_SCALE + LUT_BIAS;
	return uv;
}
float LTC_ClippedSphereFormFactor( const in vec3 f ) {
	float l = length( f );
	return max( ( l * l + f.z ) / ( l + 1.0 ), 0.0 );
}
vec3 LTC_EdgeVectorFormFactor( const in vec3 v1, const in vec3 v2 ) {
	float x = dot( v1, v2 );
	float y = abs( x );
	float a = 0.8543985 + ( 0.4965155 + 0.0145206 * y ) * y;
	float b = 3.4175940 + ( 4.1616724 + y ) * y;
	float v = a / b;
	float theta_sintheta = ( x > 0.0 ) ? v : 0.5 * inversesqrt( max( 1.0 - x * x, 1e-7 ) ) - v;
	return cross( v1, v2 ) * theta_sintheta;
}
vec3 LTC_Evaluate( const in vec3 N, const in vec3 V, const in vec3 P, const in mat3 mInv, const in vec3 rectCoords[ 4 ] ) {
	vec3 v1 = rectCoords[ 1 ] - rectCoords[ 0 ];
	vec3 v2 = rectCoords[ 3 ] - rectCoords[ 0 ];
	vec3 lightNormal = cross( v1, v2 );
	if( dot( lightNormal, P - rectCoords[ 0 ] ) < 0.0 ) return vec3( 0.0 );
	vec3 T1, T2;
	T1 = normalize( V - N * dot( V, N ) );
	T2 = - cross( N, T1 );
	mat3 mat = mInv * transpose( mat3( T1, T2, N ) );
	vec3 coords[ 4 ];
	coords[ 0 ] = mat * ( rectCoords[ 0 ] - P );
	coords[ 1 ] = mat * ( rectCoords[ 1 ] - P );
	coords[ 2 ] = mat * ( rectCoords[ 2 ] - P );
	coords[ 3 ] = mat * ( rectCoords[ 3 ] - P );
	coords[ 0 ] = normalize( coords[ 0 ] );
	coords[ 1 ] = normalize( coords[ 1 ] );
	coords[ 2 ] = normalize( coords[ 2 ] );
	coords[ 3 ] = normalize( coords[ 3 ] );
	vec3 vectorFormFactor = vec3( 0.0 );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 0 ], coords[ 1 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 1 ], coords[ 2 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 2 ], coords[ 3 ] );
	vectorFormFactor += LTC_EdgeVectorFormFactor( coords[ 3 ], coords[ 0 ] );
	float result = LTC_ClippedSphereFormFactor( vectorFormFactor );
	return vec3( result );
}
#if defined( USE_SHEEN )
float D_Charlie( float roughness, float dotNH ) {
	float alpha = pow2( roughness );
	float invAlpha = 1.0 / alpha;
	float cos2h = dotNH * dotNH;
	float sin2h = max( 1.0 - cos2h, 0.0078125 );
	return ( 2.0 + invAlpha ) * pow( sin2h, invAlpha * 0.5 ) / ( 2.0 * PI );
}
float V_Neubelt( float dotNV, float dotNL ) {
	return saturate( 1.0 / ( 4.0 * ( dotNL + dotNV - dotNL * dotNV ) ) );
}
vec3 BRDF_Sheen( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, vec3 sheenColor, const in float sheenRoughness ) {
	vec3 halfDir = normalize( lightDir + viewDir );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	float dotNH = saturate( dot( normal, halfDir ) );
	float D = D_Charlie( sheenRoughness, dotNH );
	float V = V_Neubelt( dotNV, dotNL );
	return sheenColor * ( D * V );
}
#endif
float IBLSheenBRDF( const in vec3 normal, const in vec3 viewDir, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	float r2 = roughness * roughness;
	float rInv = 1.0 / ( roughness + 0.1 );
	float a = -1.9362 + 1.0678 * roughness + 0.4573 * r2 - 0.8469 * rInv;
	float b = -0.6014 + 0.5538 * roughness - 0.4670 * r2 - 0.1255 * rInv;
	float DG = exp( a * dotNV + b );
	return saturate( DG );
}
vec3 EnvironmentBRDF( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness ) {
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	return specularColor * fab.x + specularF90 * fab.y;
}
#ifdef USE_IRIDESCENCE
void computeMultiscatteringIridescence( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float iridescence, const in vec3 iridescenceF0, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#else
void computeMultiscattering( const in vec3 normal, const in vec3 viewDir, const in vec3 specularColor, const in float specularF90, const in float roughness, inout vec3 singleScatter, inout vec3 multiScatter ) {
#endif
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 fab = texture2D( dfgLUT, vec2( roughness, dotNV ) ).rg;
	#ifdef USE_IRIDESCENCE
		vec3 Fr = mix( specularColor, iridescenceF0, iridescence );
	#else
		vec3 Fr = specularColor;
	#endif
	vec3 FssEss = Fr * fab.x + specularF90 * fab.y;
	float Ess = fab.x + fab.y;
	float Ems = 1.0 - Ess;
	vec3 Favg = Fr + ( 1.0 - Fr ) * 0.047619;	vec3 Fms = FssEss * Favg / ( 1.0 - Ems * Favg );
	singleScatter += FssEss;
	multiScatter += Fms * Ems;
}
vec3 BRDF_GGX_Multiscatter( const in vec3 lightDir, const in vec3 viewDir, const in vec3 normal, const in PhysicalMaterial material ) {
	vec3 singleScatter = BRDF_GGX( lightDir, viewDir, normal, material );
	float dotNL = saturate( dot( normal, lightDir ) );
	float dotNV = saturate( dot( normal, viewDir ) );
	vec2 dfgV = texture2D( dfgLUT, vec2( material.roughness, dotNV ) ).rg;
	vec2 dfgL = texture2D( dfgLUT, vec2( material.roughness, dotNL ) ).rg;
	vec3 FssEss_V = material.specularColorBlended * dfgV.x + material.specularF90 * dfgV.y;
	vec3 FssEss_L = material.specularColorBlended * dfgL.x + material.specularF90 * dfgL.y;
	float Ess_V = dfgV.x + dfgV.y;
	float Ess_L = dfgL.x + dfgL.y;
	float Ems_V = 1.0 - Ess_V;
	float Ems_L = 1.0 - Ess_L;
	vec3 Favg = material.specularColorBlended + ( 1.0 - material.specularColorBlended ) * 0.047619;
	vec3 Fms = FssEss_V * FssEss_L * Favg / ( 1.0 - Ems_V * Ems_L * Favg + EPSILON );
	float compensationFactor = Ems_V * Ems_L;
	vec3 multiScatter = Fms * compensationFactor;
	return singleScatter + multiScatter;
}
#if NUM_RECT_AREA_LIGHTS > 0
	void RE_Direct_RectArea_Physical( const in RectAreaLight rectAreaLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
		vec3 normal = geometryNormal;
		vec3 viewDir = geometryViewDir;
		vec3 position = geometryPosition;
		vec3 lightPos = rectAreaLight.position;
		vec3 halfWidth = rectAreaLight.halfWidth;
		vec3 halfHeight = rectAreaLight.halfHeight;
		vec3 lightColor = rectAreaLight.color;
		float roughness = material.roughness;
		vec3 rectCoords[ 4 ];
		rectCoords[ 0 ] = lightPos + halfWidth - halfHeight;		rectCoords[ 1 ] = lightPos - halfWidth - halfHeight;
		rectCoords[ 2 ] = lightPos - halfWidth + halfHeight;
		rectCoords[ 3 ] = lightPos + halfWidth + halfHeight;
		vec2 uv = LTC_Uv( normal, viewDir, roughness );
		vec4 t1 = texture2D( ltc_1, uv );
		vec4 t2 = texture2D( ltc_2, uv );
		mat3 mInv = mat3(
			vec3( t1.x, 0, t1.y ),
			vec3(    0, 1,    0 ),
			vec3( t1.z, 0, t1.w )
		);
		vec3 fresnel = ( material.specularColorBlended * t2.x + ( material.specularF90 - material.specularColorBlended ) * t2.y );
		reflectedLight.directSpecular += lightColor * fresnel * LTC_Evaluate( normal, viewDir, position, mInv, rectCoords );
		reflectedLight.directDiffuse += lightColor * material.diffuseContribution * LTC_Evaluate( normal, viewDir, position, mat3( 1.0 ), rectCoords );
		#ifdef USE_CLEARCOAT
			vec3 Ncc = geometryClearcoatNormal;
			vec2 uvClearcoat = LTC_Uv( Ncc, viewDir, material.clearcoatRoughness );
			vec4 t1Clearcoat = texture2D( ltc_1, uvClearcoat );
			vec4 t2Clearcoat = texture2D( ltc_2, uvClearcoat );
			mat3 mInvClearcoat = mat3(
				vec3( t1Clearcoat.x, 0, t1Clearcoat.y ),
				vec3(             0, 1,             0 ),
				vec3( t1Clearcoat.z, 0, t1Clearcoat.w )
			);
			vec3 fresnelClearcoat = material.clearcoatF0 * t2Clearcoat.x + ( material.clearcoatF90 - material.clearcoatF0 ) * t2Clearcoat.y;
			clearcoatSpecularDirect += lightColor * fresnelClearcoat * LTC_Evaluate( Ncc, viewDir, position, mInvClearcoat, rectCoords );
		#endif
	}
#endif
void RE_Direct_Physical( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	float dotNL = saturate( dot( geometryNormal, directLight.direction ) );
	vec3 irradiance = dotNL * directLight.color;
	#ifdef USE_CLEARCOAT
		float dotNLcc = saturate( dot( geometryClearcoatNormal, directLight.direction ) );
		vec3 ccIrradiance = dotNLcc * directLight.color;
		clearcoatSpecularDirect += ccIrradiance * BRDF_GGX_Clearcoat( directLight.direction, geometryViewDir, geometryClearcoatNormal, material );
	#endif
	#ifdef USE_SHEEN
 
 		sheenSpecularDirect += irradiance * BRDF_Sheen( directLight.direction, geometryViewDir, geometryNormal, material.sheenColor, material.sheenRoughness );
 
 		float sheenAlbedoV = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
 		float sheenAlbedoL = IBLSheenBRDF( geometryNormal, directLight.direction, material.sheenRoughness );
 
 		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * max( sheenAlbedoV, sheenAlbedoL );
 
 		irradiance *= sheenEnergyComp;
 
 	#endif
	reflectedLight.directSpecular += irradiance * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );
	reflectedLight.directDiffuse += irradiance * BRDF_Lambert( material.diffuseContribution );
}
void RE_IndirectDiffuse_Physical( const in vec3 irradiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
	vec3 diffuse = irradiance * BRDF_Lambert( material.diffuseContribution );
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		diffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectDiffuse += diffuse;
}
void RE_IndirectSpecular_Physical( const in vec3 radiance, const in vec3 irradiance, const in vec3 clearcoatRadiance, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight) {
	#ifdef USE_CLEARCOAT
		clearcoatSpecularIndirect += clearcoatRadiance * EnvironmentBRDF( geometryClearcoatNormal, geometryViewDir, material.clearcoatF0, material.clearcoatF90, material.clearcoatRoughness );
	#endif
	#ifdef USE_SHEEN
		sheenSpecularIndirect += irradiance * material.sheenColor * IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness ) * RECIPROCAL_PI;
 	#endif
	vec3 singleScatteringDielectric = vec3( 0.0 );
	vec3 multiScatteringDielectric = vec3( 0.0 );
	vec3 singleScatteringMetallic = vec3( 0.0 );
	vec3 multiScatteringMetallic = vec3( 0.0 );
	#ifdef USE_IRIDESCENCE
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.iridescence, material.iridescenceFresnelDielectric, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscatteringIridescence( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.iridescence, material.iridescenceFresnelMetallic, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#else
		computeMultiscattering( geometryNormal, geometryViewDir, material.specularColor, material.specularF90, material.roughness, singleScatteringDielectric, multiScatteringDielectric );
		computeMultiscattering( geometryNormal, geometryViewDir, material.diffuseColor, material.specularF90, material.roughness, singleScatteringMetallic, multiScatteringMetallic );
	#endif
	vec3 singleScattering = mix( singleScatteringDielectric, singleScatteringMetallic, material.metalness );
	vec3 multiScattering = mix( multiScatteringDielectric, multiScatteringMetallic, material.metalness );
	vec3 totalScatteringDielectric = singleScatteringDielectric + multiScatteringDielectric;
	vec3 diffuse = material.diffuseContribution * ( 1.0 - totalScatteringDielectric );
	vec3 cosineWeightedIrradiance = irradiance * RECIPROCAL_PI;
	vec3 indirectSpecular = radiance * singleScattering;
	indirectSpecular += multiScattering * cosineWeightedIrradiance;
	vec3 indirectDiffuse = diffuse * cosineWeightedIrradiance;
	#ifdef USE_SHEEN
		float sheenAlbedo = IBLSheenBRDF( geometryNormal, geometryViewDir, material.sheenRoughness );
		float sheenEnergyComp = 1.0 - max3( material.sheenColor ) * sheenAlbedo;
		indirectSpecular *= sheenEnergyComp;
		indirectDiffuse *= sheenEnergyComp;
	#endif
	reflectedLight.indirectSpecular += indirectSpecular;
	reflectedLight.indirectDiffuse += indirectDiffuse;
}
#define RE_Direct				RE_Direct_Physical
#define RE_Direct_RectArea		RE_Direct_RectArea_Physical
#define RE_IndirectDiffuse		RE_IndirectDiffuse_Physical
#define RE_IndirectSpecular		RE_IndirectSpecular_Physical
float computeSpecularOcclusion( const in float dotNV, const in float ambientOcclusion, const in float roughness ) {
	return saturate( pow( dotNV + ambientOcclusion, exp2( - 16.0 * roughness - 1.0 ) ) - 1.0 + ambientOcclusion );
}`,Es=`
vec3 geometryPosition = - vViewPosition;
vec3 geometryNormal = normal;
vec3 geometryViewDir = ( isOrthographic ) ? vec3( 0, 0, 1 ) : normalize( vViewPosition );
vec3 geometryClearcoatNormal = vec3( 0.0 );
#ifdef USE_CLEARCOAT
	geometryClearcoatNormal = clearcoatNormal;
#endif
#ifdef USE_IRIDESCENCE
	float dotNVi = saturate( dot( normal, geometryViewDir ) );
	if ( material.iridescenceThickness == 0.0 ) {
		material.iridescence = 0.0;
	} else {
		material.iridescence = saturate( material.iridescence );
	}
	if ( material.iridescence > 0.0 ) {
		material.iridescenceFresnelDielectric = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.specularColor );
		material.iridescenceFresnelMetallic = evalIridescence( 1.0, material.iridescenceIOR, dotNVi, material.iridescenceThickness, material.diffuseColor );
		material.iridescenceFresnel = mix( material.iridescenceFresnelDielectric, material.iridescenceFresnelMetallic, material.metalness );
		material.iridescenceF0 = Schlick_to_F0( material.iridescenceFresnel, 1.0, dotNVi );
	}
#endif
IncidentLight directLight;
#if ( NUM_POINT_LIGHTS > 0 ) && defined( RE_Direct )
	PointLight pointLight;
	#if defined( USE_SHADOWMAP ) && NUM_POINT_LIGHT_SHADOWS > 0
	PointLightShadow pointLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHTS; i ++ ) {
		pointLight = pointLights[ i ];
		getPointLightInfo( pointLight, geometryPosition, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_POINT_LIGHT_SHADOWS ) && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
		pointLightShadow = pointLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getPointShadow( pointShadowMap[ i ], pointLightShadow.shadowMapSize, pointLightShadow.shadowIntensity, pointLightShadow.shadowBias, pointLightShadow.shadowRadius, vPointShadowCoord[ i ], pointLightShadow.shadowCameraNear, pointLightShadow.shadowCameraFar ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_SPOT_LIGHTS > 0 ) && defined( RE_Direct )
	SpotLight spotLight;
	vec4 spotColor;
	vec3 spotLightCoord;
	bool inSpotLightMap;
	#if defined( USE_SHADOWMAP ) && NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHTS; i ++ ) {
		spotLight = spotLights[ i ];
		getSpotLightInfo( spotLight, geometryPosition, directLight );
		#if ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#define SPOT_LIGHT_MAP_INDEX UNROLLED_LOOP_INDEX
		#elif ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		#define SPOT_LIGHT_MAP_INDEX NUM_SPOT_LIGHT_MAPS
		#else
		#define SPOT_LIGHT_MAP_INDEX ( UNROLLED_LOOP_INDEX - NUM_SPOT_LIGHT_SHADOWS + NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS )
		#endif
		#if ( SPOT_LIGHT_MAP_INDEX < NUM_SPOT_LIGHT_MAPS )
			spotLightCoord = vSpotLightCoord[ i ].xyz / vSpotLightCoord[ i ].w;
			inSpotLightMap = all( lessThan( abs( spotLightCoord * 2. - 1. ), vec3( 1.0 ) ) );
			spotColor = texture2D( spotLightMap[ SPOT_LIGHT_MAP_INDEX ], spotLightCoord.xy );
			directLight.color = inSpotLightMap ? directLight.color * spotColor.rgb : directLight.color;
		#endif
		#undef SPOT_LIGHT_MAP_INDEX
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
		spotLightShadow = spotLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( spotShadowMap[ i ], spotLightShadow.shadowMapSize, spotLightShadow.shadowIntensity, spotLightShadow.shadowBias, spotLightShadow.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_DIR_LIGHTS > 0 ) && defined( RE_Direct )
	DirectionalLight directionalLight;
	#if defined( USE_SHADOWMAP ) && NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLightShadow;
	#endif
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHTS; i ++ ) {
		directionalLight = directionalLights[ i ];
		getDirectionalLightInfo( directionalLight, directLight );
		#if defined( USE_SHADOWMAP ) && ( UNROLLED_LOOP_INDEX < NUM_DIR_LIGHT_SHADOWS )
		directionalLightShadow = directionalLightShadows[ i ];
		directLight.color *= ( directLight.visible && receiveShadow ) ? getShadow( directionalShadowMap[ i ], directionalLightShadow.shadowMapSize, directionalLightShadow.shadowIntensity, directionalLightShadow.shadowBias, directionalLightShadow.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
		#endif
		RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if ( NUM_RECT_AREA_LIGHTS > 0 ) && defined( RE_Direct_RectArea )
	RectAreaLight rectAreaLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_RECT_AREA_LIGHTS; i ++ ) {
		rectAreaLight = rectAreaLights[ i ];
		RE_Direct_RectArea( rectAreaLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
	}
	#pragma unroll_loop_end
#endif
#if defined( RE_IndirectDiffuse )
	vec3 iblIrradiance = vec3( 0.0 );
	vec3 irradiance = getAmbientLightIrradiance( ambientLightColor );
	#if defined( USE_LIGHT_PROBES )
		irradiance += getLightProbeIrradiance( lightProbe, geometryNormal );
	#endif
	#if ( NUM_HEMI_LIGHTS > 0 )
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_HEMI_LIGHTS; i ++ ) {
			irradiance += getHemisphereLightIrradiance( hemisphereLights[ i ], geometryNormal );
		}
		#pragma unroll_loop_end
	#endif
	#ifdef USE_LIGHT_PROBES_GRID
		vec3 probeWorldPos = ( ( vec4( geometryPosition, 1.0 ) - viewMatrix[ 3 ] ) * viewMatrix ).xyz;
		vec3 probeWorldNormal = transformNormalByInverseViewMatrix( geometryNormal, viewMatrix );
		irradiance += getLightProbeGridIrradiance( probeWorldPos, probeWorldNormal );
	#endif
#endif
#if defined( RE_IndirectSpecular )
	vec3 radiance = vec3( 0.0 );
	vec3 clearcoatRadiance = vec3( 0.0 );
#endif`,xs=`#if defined( RE_IndirectDiffuse )
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		vec3 lightMapIrradiance = lightMapTexel.rgb * lightMapIntensity;
		irradiance += lightMapIrradiance;
	#endif
	#if defined( USE_ENVMAP ) && defined( ENVMAP_TYPE_CUBE_UV )
		#if defined( STANDARD ) || defined( LAMBERT ) || defined( PHONG )
			iblIrradiance += getIBLIrradiance( geometryNormal );
		#endif
	#endif
#endif
#if defined( USE_ENVMAP ) && defined( RE_IndirectSpecular )
	#ifdef USE_ANISOTROPY
		radiance += getIBLAnisotropyRadiance( geometryViewDir, geometryNormal, material.roughness, material.anisotropyB, material.anisotropy );
	#else
		radiance += getIBLRadiance( geometryViewDir, geometryNormal, material.roughness );
	#endif
	#ifdef USE_CLEARCOAT
		clearcoatRadiance += getIBLRadiance( geometryViewDir, geometryClearcoatNormal, material.clearcoatRoughness );
	#endif
#endif`,Ms=`#if defined( RE_IndirectDiffuse )
	#if defined( LAMBERT ) || defined( PHONG )
		irradiance += iblIrradiance;
	#endif
	RE_IndirectDiffuse( irradiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif
#if defined( RE_IndirectSpecular )
	RE_IndirectSpecular( radiance, iblIrradiance, clearcoatRadiance, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
#endif`,Ts=`#ifdef USE_LIGHT_PROBES_GRID
uniform highp sampler3D probesSH;
uniform vec3 probesMin;
uniform vec3 probesMax;
uniform vec3 probesResolution;
vec3 getLightProbeGridIrradiance( vec3 worldPos, vec3 worldNormal ) {
	vec3 res = probesResolution;
	vec3 gridRange = probesMax - probesMin;
	vec3 resMinusOne = res - 1.0;
	vec3 probeSpacing = gridRange / resMinusOne;
	vec3 samplePos = worldPos + worldNormal * probeSpacing * 0.5;
	vec3 uvw = clamp( ( samplePos - probesMin ) / gridRange, 0.0, 1.0 );
	uvw = uvw * resMinusOne / res + 0.5 / res;
	float nz          = res.z;
	float paddedSlices = nz + 2.0;
	float atlasDepth  = 7.0 * paddedSlices;
	float uvZBase     = uvw.z * nz + 1.0;
	vec4 s0 = texture( probesSH, vec3( uvw.xy, ( uvZBase                       ) / atlasDepth ) );
	vec4 s1 = texture( probesSH, vec3( uvw.xy, ( uvZBase +       paddedSlices   ) / atlasDepth ) );
	vec4 s2 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 2.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s3 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 3.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s4 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 4.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s5 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 5.0 * paddedSlices   ) / atlasDepth ) );
	vec4 s6 = texture( probesSH, vec3( uvw.xy, ( uvZBase + 6.0 * paddedSlices   ) / atlasDepth ) );
	vec3 c0 = s0.xyz;
	vec3 c1 = vec3( s0.w, s1.xy );
	vec3 c2 = vec3( s1.zw, s2.x );
	vec3 c3 = s2.yzw;
	vec3 c4 = s3.xyz;
	vec3 c5 = vec3( s3.w, s4.xy );
	vec3 c6 = vec3( s4.zw, s5.x );
	vec3 c7 = s5.yzw;
	vec3 c8 = s6.xyz;
	float x = worldNormal.x, y = worldNormal.y, z = worldNormal.z;
	vec3 result = c0 * 0.886227;
	result += c1 * 2.0 * 0.511664 * y;
	result += c2 * 2.0 * 0.511664 * z;
	result += c3 * 2.0 * 0.511664 * x;
	result += c4 * 2.0 * 0.429043 * x * y;
	result += c5 * 2.0 * 0.429043 * y * z;
	result += c6 * ( 0.743125 * z * z - 0.247708 );
	result += c7 * 2.0 * 0.429043 * x * z;
	result += c8 * 0.429043 * ( x * x - y * y );
	return max( result, vec3( 0.0 ) );
}
#endif`,As=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	gl_FragDepth = vIsPerspective == 0.0 ? gl_FragCoord.z : log2( vFragDepth ) * logDepthBufFC * 0.5;
#endif`,Rs=`#if defined( USE_LOGARITHMIC_DEPTH_BUFFER )
	uniform float logDepthBufFC;
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,bs=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	varying float vFragDepth;
	varying float vIsPerspective;
#endif`,Cs=`#ifdef USE_LOGARITHMIC_DEPTH_BUFFER
	vFragDepth = 1.0 + gl_Position.w;
	vIsPerspective = float( isPerspectiveMatrix( projectionMatrix ) );
#endif`,Ps=`#ifdef USE_MAP
	vec4 sampledDiffuseColor = texture2D( map, vMapUv );
	#ifdef DECODE_VIDEO_TEXTURE
		sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
	#endif
	diffuseColor *= sampledDiffuseColor;
#endif`,Ls=`#ifdef USE_MAP
	uniform sampler2D map;
#endif`,Us=`#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
	#if defined( USE_POINTS_UV )
		vec2 uv = vUv;
	#else
		vec2 uv = ( uvTransform * vec3( gl_PointCoord.x, 1.0 - gl_PointCoord.y, 1 ) ).xy;
	#endif
#endif
#ifdef USE_MAP
	diffuseColor *= texture2D( map, uv );
#endif
#ifdef USE_ALPHAMAP
	diffuseColor.a *= texture2D( alphaMap, uv ).g;
#endif`,Ds=`#if defined( USE_POINTS_UV )
	varying vec2 vUv;
#else
	#if defined( USE_MAP ) || defined( USE_ALPHAMAP )
		uniform mat3 uvTransform;
	#endif
#endif
#ifdef USE_MAP
	uniform sampler2D map;
#endif
#ifdef USE_ALPHAMAP
	uniform sampler2D alphaMap;
#endif`,ws=`float metalnessFactor = metalness;
#ifdef USE_METALNESSMAP
	vec4 texelMetalness = texture2D( metalnessMap, vMetalnessMapUv );
	metalnessFactor *= texelMetalness.b;
#endif`,Is=`#ifdef USE_METALNESSMAP
	uniform sampler2D metalnessMap;
#endif`,Ns=`#ifdef USE_INSTANCING_MORPH
	float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	float morphTargetBaseInfluence = texelFetch( morphTexture, ivec2( 0, gl_InstanceID ), 0 ).r;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		morphTargetInfluences[i] =  texelFetch( morphTexture, ivec2( i + 1, gl_InstanceID ), 0 ).r;
	}
#endif`,ys=`#if defined( USE_MORPHCOLORS )
	vColor *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		#if defined( USE_COLOR_ALPHA )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ) * morphTargetInfluences[ i ];
		#elif defined( USE_COLOR )
			if ( morphTargetInfluences[ i ] != 0.0 ) vColor += getMorph( gl_VertexID, i, 2 ).rgb * morphTargetInfluences[ i ];
		#endif
	}
#endif`,Fs=`#ifdef USE_MORPHNORMALS
	objectNormal *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) objectNormal += getMorph( gl_VertexID, i, 1 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Os=`#ifdef USE_MORPHTARGETS
	#ifndef USE_INSTANCING_MORPH
		uniform float morphTargetBaseInfluence;
		uniform float morphTargetInfluences[ MORPHTARGETS_COUNT ];
	#endif
	uniform sampler2DArray morphTargetsTexture;
	uniform ivec2 morphTargetsTextureSize;
	vec4 getMorph( const in int vertexIndex, const in int morphTargetIndex, const in int offset ) {
		int texelIndex = vertexIndex * MORPHTARGETS_TEXTURE_STRIDE + offset;
		int y = texelIndex / morphTargetsTextureSize.x;
		int x = texelIndex - y * morphTargetsTextureSize.x;
		ivec3 morphUV = ivec3( x, y, morphTargetIndex );
		return texelFetch( morphTargetsTexture, morphUV, 0 );
	}
#endif`,Bs=`#ifdef USE_MORPHTARGETS
	transformed *= morphTargetBaseInfluence;
	for ( int i = 0; i < MORPHTARGETS_COUNT; i ++ ) {
		if ( morphTargetInfluences[ i ] != 0.0 ) transformed += getMorph( gl_VertexID, i, 0 ).xyz * morphTargetInfluences[ i ];
	}
#endif`,Gs=`float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
#ifdef FLAT_SHADED
	vec3 fdx = dFdx( vViewPosition );
	vec3 fdy = dFdy( vViewPosition );
	vec3 normal = normalize( cross( fdx, fdy ) );
#else
	vec3 normal = normalize( vNormal );
	#ifdef DOUBLE_SIDED
		normal *= faceDirection;
	#endif
#endif
#if defined( USE_NORMALMAP_TANGENTSPACE ) || defined( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY )
	#ifdef USE_TANGENT
		mat3 tbn = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn = getTangentFrame( - vViewPosition, normal,
		#if defined( USE_NORMALMAP )
			vNormalMapUv
		#elif defined( USE_CLEARCOAT_NORMALMAP )
			vClearcoatNormalMapUv
		#else
			vUv
		#endif
		);
	#endif
	#ifdef DOUBLE_SIDED
		tbn[0] *= faceDirection;
		tbn[1] *= faceDirection;
	#endif
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	#ifdef USE_TANGENT
		mat3 tbn2 = mat3( normalize( vTangent ), normalize( vBitangent ), normal );
	#else
		mat3 tbn2 = getTangentFrame( - vViewPosition, normal, vClearcoatNormalMapUv );
	#endif
	#ifdef DOUBLE_SIDED
		tbn2[0] *= faceDirection;
		tbn2[1] *= faceDirection;
	#endif
#endif
vec3 nonPerturbedNormal = normal;`,Hs=`#ifdef USE_NORMALMAP_OBJECTSPACE
	normal = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#ifdef FLIP_SIDED
		normal = - normal;
	#endif
	#ifdef DOUBLE_SIDED
		normal = normal * faceDirection;
	#endif
	normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
	vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
	#if defined( USE_PACKED_NORMALMAP )
		mapN = vec3( mapN.xy, sqrt( saturate( 1.0 - dot( mapN.xy, mapN.xy ) ) ) );
	#endif
	mapN.xy *= normalScale;
	normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
	normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif`,Vs=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,Ws=`#ifndef FLAT_SHADED
	varying vec3 vNormal;
	#ifdef USE_TANGENT
		varying vec3 vTangent;
		varying vec3 vBitangent;
	#endif
#endif`,ks=`#ifndef FLAT_SHADED
	vNormal = normalize( transformedNormal );
	#ifdef USE_TANGENT
		vTangent = normalize( transformedTangent );
		vBitangent = normalize( cross( vNormal, vTangent ) * tangent.w );
		#ifdef FLIP_SIDED
			vBitangent = - vBitangent;
		#endif
	#endif
#endif`,zs=`#ifdef USE_NORMALMAP
	uniform sampler2D normalMap;
	uniform vec2 normalScale;
#endif
#ifdef USE_NORMALMAP_OBJECTSPACE
	uniform mat3 normalMatrix;
#endif
#if ! defined ( USE_TANGENT ) && ( defined ( USE_NORMALMAP_TANGENTSPACE ) || defined ( USE_CLEARCOAT_NORMALMAP ) || defined( USE_ANISOTROPY ) )
	mat3 getTangentFrame( vec3 eye_pos, vec3 surf_norm, vec2 uv ) {
		vec3 q0 = dFdx( eye_pos.xyz );
		vec3 q1 = dFdy( eye_pos.xyz );
		vec2 st0 = dFdx( uv.st );
		vec2 st1 = dFdy( uv.st );
		vec3 N = surf_norm;
		vec3 q1perp = cross( q1, N );
		vec3 q0perp = cross( N, q0 );
		vec3 T = q1perp * st0.x + q0perp * st1.x;
		vec3 B = q1perp * st0.y + q0perp * st1.y;
		float det = max( dot( T, T ), dot( B, B ) );
		float scale = ( det == 0.0 ) ? 0.0 : inversesqrt( det );
		return mat3( T * scale, B * scale, N );
	}
#endif`,Xs=`#ifdef USE_CLEARCOAT
	vec3 clearcoatNormal = nonPerturbedNormal;
#endif`,Ys=`#ifdef USE_CLEARCOAT_NORMALMAP
	vec3 clearcoatMapN = texture2D( clearcoatNormalMap, vClearcoatNormalMapUv ).xyz * 2.0 - 1.0;
	clearcoatMapN.xy *= clearcoatNormalScale;
	clearcoatNormal = normalize( tbn2 * clearcoatMapN );
#endif`,Ks=`#ifdef USE_CLEARCOATMAP
	uniform sampler2D clearcoatMap;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform sampler2D clearcoatNormalMap;
	uniform vec2 clearcoatNormalScale;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform sampler2D clearcoatRoughnessMap;
#endif`,qs=`#ifdef USE_IRIDESCENCEMAP
	uniform sampler2D iridescenceMap;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform sampler2D iridescenceThicknessMap;
#endif`,Zs=`#ifdef OPAQUE
diffuseColor.a = 1.0;
#endif
#ifdef USE_TRANSMISSION
diffuseColor.a *= material.transmissionAlpha;
#endif
gl_FragColor = vec4( outgoingLight, diffuseColor.a );`,$s=`vec3 packNormalToRGB( const in vec3 normal ) {
	return normalize( normal ) * 0.5 + 0.5;
}
vec3 unpackRGBToNormal( const in vec3 rgb ) {
	return 2.0 * rgb.xyz - 1.0;
}
const float PackUpscale = 256. / 255.;const float UnpackDownscale = 255. / 256.;const float ShiftRight8 = 1. / 256.;
const float Inv255 = 1. / 255.;
const vec4 PackFactors = vec4( 1.0, 256.0, 256.0 * 256.0, 256.0 * 256.0 * 256.0 );
const vec2 UnpackFactors2 = vec2( UnpackDownscale, 1.0 / PackFactors.g );
const vec3 UnpackFactors3 = vec3( UnpackDownscale / PackFactors.rg, 1.0 / PackFactors.b );
const vec4 UnpackFactors4 = vec4( UnpackDownscale / PackFactors.rgb, 1.0 / PackFactors.a );
vec4 packDepthToRGBA( const in float v ) {
	if( v <= 0.0 )
		return vec4( 0., 0., 0., 0. );
	if( v >= 1.0 )
		return vec4( 1., 1., 1., 1. );
	float vuf;
	float af = modf( v * PackFactors.a, vuf );
	float bf = modf( vuf * ShiftRight8, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec4( vuf * Inv255, gf * PackUpscale, bf * PackUpscale, af );
}
vec3 packDepthToRGB( const in float v ) {
	if( v <= 0.0 )
		return vec3( 0., 0., 0. );
	if( v >= 1.0 )
		return vec3( 1., 1., 1. );
	float vuf;
	float bf = modf( v * PackFactors.b, vuf );
	float gf = modf( vuf * ShiftRight8, vuf );
	return vec3( vuf * Inv255, gf * PackUpscale, bf );
}
vec2 packDepthToRG( const in float v ) {
	if( v <= 0.0 )
		return vec2( 0., 0. );
	if( v >= 1.0 )
		return vec2( 1., 1. );
	float vuf;
	float gf = modf( v * 256., vuf );
	return vec2( vuf * Inv255, gf );
}
float unpackRGBAToDepth( const in vec4 v ) {
	return dot( v, UnpackFactors4 );
}
float unpackRGBToDepth( const in vec3 v ) {
	return dot( v, UnpackFactors3 );
}
float unpackRGToDepth( const in vec2 v ) {
	return v.r * UnpackFactors2.r + v.g * UnpackFactors2.g;
}
vec4 pack2HalfToRGBA( const in vec2 v ) {
	vec4 r = vec4( v.x, fract( v.x * 255.0 ), v.y, fract( v.y * 255.0 ) );
	return vec4( r.x - r.y / 255.0, r.y, r.z - r.w / 255.0, r.w );
}
vec2 unpackRGBATo2Half( const in vec4 v ) {
	return vec2( v.x + ( v.y / 255.0 ), v.z + ( v.w / 255.0 ) );
}
float viewZToOrthographicDepth( const in float viewZ, const in float near, const in float far ) {
	return ( viewZ + near ) / ( near - far );
}
float orthographicDepthToViewZ( const in float depth, const in float near, const in float far ) {
	#ifdef USE_REVERSED_DEPTH_BUFFER
	
		return depth * ( far - near ) - far;
	#else
		return depth * ( near - far ) - near;
	#endif
}
float viewZToPerspectiveDepth( const in float viewZ, const in float near, const in float far ) {
	return ( ( near + viewZ ) * far ) / ( ( far - near ) * viewZ );
}
float perspectiveDepthToViewZ( const in float depth, const in float near, const in float far ) {
	
	#ifdef USE_REVERSED_DEPTH_BUFFER
		return ( near * far ) / ( ( near - far ) * depth - near );
	#else
		return ( near * far ) / ( ( far - near ) * depth - far );
	#endif
}`,Qs=`#ifdef PREMULTIPLIED_ALPHA
	gl_FragColor.rgb *= gl_FragColor.a;
#endif`,Js=`vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
	mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
	mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,js=`#ifdef DITHERING
	gl_FragColor.rgb = dithering( gl_FragColor.rgb );
#endif`,el=`#ifdef DITHERING
	vec3 dithering( vec3 color ) {
		float grid_position = rand( gl_FragCoord.xy );
		vec3 dither_shift_RGB = vec3( 0.25 / 255.0, -0.25 / 255.0, 0.25 / 255.0 );
		dither_shift_RGB = mix( 2.0 * dither_shift_RGB, -2.0 * dither_shift_RGB, grid_position );
		return color + dither_shift_RGB;
	}
#endif`,tl=`float roughnessFactor = roughness;
#ifdef USE_ROUGHNESSMAP
	vec4 texelRoughness = texture2D( roughnessMap, vRoughnessMapUv );
	roughnessFactor *= texelRoughness.g;
#endif`,nl=`#ifdef USE_ROUGHNESSMAP
	uniform sampler2D roughnessMap;
#endif`,il=`#if NUM_SPOT_LIGHT_COORDS > 0
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#if NUM_SPOT_LIGHT_MAPS > 0
	uniform sampler2D spotLightMap[ NUM_SPOT_LIGHT_MAPS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#else
			uniform sampler2D directionalShadowMap[ NUM_DIR_LIGHT_SHADOWS ];
		#endif
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform sampler2DShadow spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#else
			uniform sampler2D spotShadowMap[ NUM_SPOT_LIGHT_SHADOWS ];
		#endif
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#if defined( SHADOWMAP_TYPE_PCF )
			uniform samplerCubeShadow pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#elif defined( SHADOWMAP_TYPE_BASIC )
			uniform samplerCube pointShadowMap[ NUM_POINT_LIGHT_SHADOWS ];
		#endif
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float interleavedGradientNoise( vec2 position ) {
			return fract( 52.9829189 * fract( dot( position, vec2( 0.06711056, 0.00583715 ) ) ) );
		}
		vec2 vogelDiskSample( int sampleIndex, int samplesCount, float phi ) {
			const float goldenAngle = 2.399963229728653;
			float r = sqrt( ( float( sampleIndex ) + 0.5 ) / float( samplesCount ) );
			float theta = float( sampleIndex ) * goldenAngle + phi;
			return vec2( cos( theta ), sin( theta ) ) * r;
		}
	#endif
	#if defined( SHADOWMAP_TYPE_PCF )
		float getShadow( sampler2DShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			shadowCoord.z += shadowBias;
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 texelSize = vec2( 1.0 ) / shadowMapSize;
				float radius = shadowRadius * texelSize.x;
				float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
				shadow = (
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 0, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 1, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 2, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 3, 5, phi ) * radius, shadowCoord.z ) ) +
					texture( shadowMap, vec3( shadowCoord.xy + vogelDiskSample( 4, 5, phi ) * radius, shadowCoord.z ) )
				) * 0.2;
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#elif defined( SHADOWMAP_TYPE_VSM )
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				vec2 distribution = texture2D( shadowMap, shadowCoord.xy ).rg;
				float mean = distribution.x;
				float variance = distribution.y * distribution.y;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					float hard_shadow = step( mean, shadowCoord.z );
				#else
					float hard_shadow = step( shadowCoord.z, mean );
				#endif
				
				if ( hard_shadow == 1.0 ) {
					shadow = 1.0;
				} else {
					variance = max( variance, 0.0000001 );
					float d = shadowCoord.z - mean;
					float p_max = variance / ( variance + d * d );
					p_max = clamp( ( p_max - 0.3 ) / 0.65, 0.0, 1.0 );
					shadow = max( hard_shadow, p_max );
				}
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#else
		float getShadow( sampler2D shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord ) {
			float shadow = 1.0;
			shadowCoord.xyz /= shadowCoord.w;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				shadowCoord.z -= shadowBias;
			#else
				shadowCoord.z += shadowBias;
			#endif
			bool inFrustum = shadowCoord.x >= 0.0 && shadowCoord.x <= 1.0 && shadowCoord.y >= 0.0 && shadowCoord.y <= 1.0;
			bool frustumTest = inFrustum && shadowCoord.z <= 1.0;
			if ( frustumTest ) {
				float depth = texture2D( shadowMap, shadowCoord.xy ).r;
				#ifdef USE_REVERSED_DEPTH_BUFFER
					shadow = step( depth, shadowCoord.z );
				#else
					shadow = step( shadowCoord.z, depth );
				#endif
			}
			return mix( 1.0, shadow, shadowIntensity );
		}
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
	#if defined( SHADOWMAP_TYPE_PCF )
	float getPointShadow( samplerCubeShadow shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 bd3D = normalize( lightToPosition );
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			#ifdef USE_REVERSED_DEPTH_BUFFER
				float dp = ( shadowCameraNear * ( shadowCameraFar - viewSpaceZ ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp -= shadowBias;
			#else
				float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
				dp += shadowBias;
			#endif
			float texelSize = shadowRadius / shadowMapSize.x;
			vec3 absDir = abs( bd3D );
			vec3 tangent = absDir.x > absDir.z ? vec3( 0.0, 1.0, 0.0 ) : vec3( 1.0, 0.0, 0.0 );
			tangent = normalize( cross( bd3D, tangent ) );
			vec3 bitangent = cross( bd3D, tangent );
			float phi = interleavedGradientNoise( gl_FragCoord.xy ) * PI2;
			vec2 sample0 = vogelDiskSample( 0, 5, phi );
			vec2 sample1 = vogelDiskSample( 1, 5, phi );
			vec2 sample2 = vogelDiskSample( 2, 5, phi );
			vec2 sample3 = vogelDiskSample( 3, 5, phi );
			vec2 sample4 = vogelDiskSample( 4, 5, phi );
			shadow = (
				texture( shadowMap, vec4( bd3D + ( tangent * sample0.x + bitangent * sample0.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample1.x + bitangent * sample1.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample2.x + bitangent * sample2.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample3.x + bitangent * sample3.y ) * texelSize, dp ) ) +
				texture( shadowMap, vec4( bd3D + ( tangent * sample4.x + bitangent * sample4.y ) * texelSize, dp ) )
			) * 0.2;
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#elif defined( SHADOWMAP_TYPE_BASIC )
	float getPointShadow( samplerCube shadowMap, vec2 shadowMapSize, float shadowIntensity, float shadowBias, float shadowRadius, vec4 shadowCoord, float shadowCameraNear, float shadowCameraFar ) {
		float shadow = 1.0;
		vec3 lightToPosition = shadowCoord.xyz;
		vec3 absVec = abs( lightToPosition );
		float viewSpaceZ = max( max( absVec.x, absVec.y ), absVec.z );
		if ( viewSpaceZ - shadowCameraFar <= 0.0 && viewSpaceZ - shadowCameraNear >= 0.0 ) {
			float dp = ( shadowCameraFar * ( viewSpaceZ - shadowCameraNear ) ) / ( viewSpaceZ * ( shadowCameraFar - shadowCameraNear ) );
			dp += shadowBias;
			vec3 bd3D = normalize( lightToPosition );
			float depth = textureCube( shadowMap, bd3D ).r;
			#ifdef USE_REVERSED_DEPTH_BUFFER
				depth = 1.0 - depth;
			#endif
			shadow = step( dp, depth );
		}
		return mix( 1.0, shadow, shadowIntensity );
	}
	#endif
	#endif
#endif`,rl=`#if NUM_SPOT_LIGHT_COORDS > 0
	uniform mat4 spotLightMatrix[ NUM_SPOT_LIGHT_COORDS ];
	varying vec4 vSpotLightCoord[ NUM_SPOT_LIGHT_COORDS ];
#endif
#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
		uniform mat4 directionalShadowMatrix[ NUM_DIR_LIGHT_SHADOWS ];
		varying vec4 vDirectionalShadowCoord[ NUM_DIR_LIGHT_SHADOWS ];
		struct DirectionalLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform DirectionalLightShadow directionalLightShadows[ NUM_DIR_LIGHT_SHADOWS ];
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
		struct SpotLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
		};
		uniform SpotLightShadow spotLightShadows[ NUM_SPOT_LIGHT_SHADOWS ];
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		uniform mat4 pointShadowMatrix[ NUM_POINT_LIGHT_SHADOWS ];
		varying vec4 vPointShadowCoord[ NUM_POINT_LIGHT_SHADOWS ];
		struct PointLightShadow {
			float shadowIntensity;
			float shadowBias;
			float shadowNormalBias;
			float shadowRadius;
			vec2 shadowMapSize;
			float shadowCameraNear;
			float shadowCameraFar;
		};
		uniform PointLightShadow pointLightShadows[ NUM_POINT_LIGHT_SHADOWS ];
	#endif
#endif`,al=`#if ( defined( USE_SHADOWMAP ) && ( NUM_DIR_LIGHT_SHADOWS > 0 || NUM_POINT_LIGHT_SHADOWS > 0 ) ) || ( NUM_SPOT_LIGHT_COORDS > 0 )
	#ifdef HAS_NORMAL
		vec3 shadowWorldNormal = transformNormalByInverseViewMatrix( transformedNormal, viewMatrix );
	#else
		vec3 shadowWorldNormal = vec3( 0.0 );
	#endif
	vec4 shadowWorldPosition;
#endif
#if defined( USE_SHADOWMAP )
	#if NUM_DIR_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * directionalLightShadows[ i ].shadowNormalBias, 0 );
			vDirectionalShadowCoord[ i ] = directionalShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0
		#pragma unroll_loop_start
		for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
			shadowWorldPosition = worldPosition + vec4( shadowWorldNormal * pointLightShadows[ i ].shadowNormalBias, 0 );
			vPointShadowCoord[ i ] = pointShadowMatrix[ i ] * shadowWorldPosition;
		}
		#pragma unroll_loop_end
	#endif
#endif
#if NUM_SPOT_LIGHT_COORDS > 0
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_COORDS; i ++ ) {
		shadowWorldPosition = worldPosition;
		#if ( defined( USE_SHADOWMAP ) && UNROLLED_LOOP_INDEX < NUM_SPOT_LIGHT_SHADOWS )
			shadowWorldPosition.xyz += shadowWorldNormal * spotLightShadows[ i ].shadowNormalBias;
		#endif
		vSpotLightCoord[ i ] = spotLightMatrix[ i ] * shadowWorldPosition;
	}
	#pragma unroll_loop_end
#endif`,ol=`float getShadowMask() {
	float shadow = 1.0;
	#ifdef USE_SHADOWMAP
	#if NUM_DIR_LIGHT_SHADOWS > 0
	DirectionalLightShadow directionalLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_DIR_LIGHT_SHADOWS; i ++ ) {
		directionalLight = directionalLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( directionalShadowMap[ i ], directionalLight.shadowMapSize, directionalLight.shadowIntensity, directionalLight.shadowBias, directionalLight.shadowRadius, vDirectionalShadowCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_SPOT_LIGHT_SHADOWS > 0
	SpotLightShadow spotLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_SPOT_LIGHT_SHADOWS; i ++ ) {
		spotLight = spotLightShadows[ i ];
		shadow *= receiveShadow ? getShadow( spotShadowMap[ i ], spotLight.shadowMapSize, spotLight.shadowIntensity, spotLight.shadowBias, spotLight.shadowRadius, vSpotLightCoord[ i ] ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#if NUM_POINT_LIGHT_SHADOWS > 0 && ( defined( SHADOWMAP_TYPE_PCF ) || defined( SHADOWMAP_TYPE_BASIC ) )
	PointLightShadow pointLight;
	#pragma unroll_loop_start
	for ( int i = 0; i < NUM_POINT_LIGHT_SHADOWS; i ++ ) {
		pointLight = pointLightShadows[ i ];
		shadow *= receiveShadow ? getPointShadow( pointShadowMap[ i ], pointLight.shadowMapSize, pointLight.shadowIntensity, pointLight.shadowBias, pointLight.shadowRadius, vPointShadowCoord[ i ], pointLight.shadowCameraNear, pointLight.shadowCameraFar ) : 1.0;
	}
	#pragma unroll_loop_end
	#endif
	#endif
	return shadow;
}`,sl=`#ifdef USE_SKINNING
	mat4 boneMatX = getBoneMatrix( skinIndex.x );
	mat4 boneMatY = getBoneMatrix( skinIndex.y );
	mat4 boneMatZ = getBoneMatrix( skinIndex.z );
	mat4 boneMatW = getBoneMatrix( skinIndex.w );
#endif`,ll=`#ifdef USE_SKINNING
	uniform mat4 bindMatrix;
	uniform mat4 bindMatrixInverse;
	uniform highp sampler2D boneTexture;
	mat4 getBoneMatrix( const in float i ) {
		int size = textureSize( boneTexture, 0 ).x;
		int j = int( i ) * 4;
		int x = j % size;
		int y = j / size;
		vec4 v1 = texelFetch( boneTexture, ivec2( x, y ), 0 );
		vec4 v2 = texelFetch( boneTexture, ivec2( x + 1, y ), 0 );
		vec4 v3 = texelFetch( boneTexture, ivec2( x + 2, y ), 0 );
		vec4 v4 = texelFetch( boneTexture, ivec2( x + 3, y ), 0 );
		return mat4( v1, v2, v3, v4 );
	}
#endif`,cl=`#ifdef USE_SKINNING
	vec4 skinVertex = bindMatrix * vec4( transformed, 1.0 );
	vec4 skinned = vec4( 0.0 );
	skinned += boneMatX * skinVertex * skinWeight.x;
	skinned += boneMatY * skinVertex * skinWeight.y;
	skinned += boneMatZ * skinVertex * skinWeight.z;
	skinned += boneMatW * skinVertex * skinWeight.w;
	transformed = ( bindMatrixInverse * skinned ).xyz;
#endif`,fl=`#ifdef USE_SKINNING
	mat4 skinMatrix = mat4( 0.0 );
	skinMatrix += skinWeight.x * boneMatX;
	skinMatrix += skinWeight.y * boneMatY;
	skinMatrix += skinWeight.z * boneMatZ;
	skinMatrix += skinWeight.w * boneMatW;
	skinMatrix = bindMatrixInverse * skinMatrix * bindMatrix;
	objectNormal = vec4( skinMatrix * vec4( objectNormal, 0.0 ) ).xyz;
	#ifdef USE_TANGENT
		objectTangent = vec4( skinMatrix * vec4( objectTangent, 0.0 ) ).xyz;
	#endif
#endif`,dl=`float specularStrength;
#ifdef USE_SPECULARMAP
	vec4 texelSpecular = texture2D( specularMap, vSpecularMapUv );
	specularStrength = texelSpecular.r;
#else
	specularStrength = 1.0;
#endif`,ul=`#ifdef USE_SPECULARMAP
	uniform sampler2D specularMap;
#endif`,pl=`#if defined( TONE_MAPPING )
	gl_FragColor.rgb = toneMapping( gl_FragColor.rgb );
#endif`,hl=`#ifndef saturate
#define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
uniform float toneMappingExposure;
vec3 LinearToneMapping( vec3 color ) {
	return saturate( toneMappingExposure * color );
}
vec3 ReinhardToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	return saturate( color / ( vec3( 1.0 ) + color ) );
}
vec3 CineonToneMapping( vec3 color ) {
	color *= toneMappingExposure;
	color = max( vec3( 0.0 ), color - 0.004 );
	return pow( ( color * ( 6.2 * color + 0.5 ) ) / ( color * ( 6.2 * color + 1.7 ) + 0.06 ), vec3( 2.2 ) );
}
vec3 RRTAndODTFit( vec3 v ) {
	vec3 a = v * ( v + 0.0245786 ) - 0.000090537;
	vec3 b = v * ( 0.983729 * v + 0.4329510 ) + 0.238081;
	return a / b;
}
vec3 ACESFilmicToneMapping( vec3 color ) {
	const mat3 ACESInputMat = mat3(
		vec3( 0.59719, 0.07600, 0.02840 ),		vec3( 0.35458, 0.90834, 0.13383 ),
		vec3( 0.04823, 0.01566, 0.83777 )
	);
	const mat3 ACESOutputMat = mat3(
		vec3(  1.60475, -0.10208, -0.00327 ),		vec3( -0.53108,  1.10813, -0.07276 ),
		vec3( -0.07367, -0.00605,  1.07602 )
	);
	color *= toneMappingExposure / 0.6;
	color = ACESInputMat * color;
	color = RRTAndODTFit( color );
	color = ACESOutputMat * color;
	return saturate( color );
}
const mat3 LINEAR_REC2020_TO_LINEAR_SRGB = mat3(
	vec3( 1.6605, - 0.1246, - 0.0182 ),
	vec3( - 0.5876, 1.1329, - 0.1006 ),
	vec3( - 0.0728, - 0.0083, 1.1187 )
);
const mat3 LINEAR_SRGB_TO_LINEAR_REC2020 = mat3(
	vec3( 0.6274, 0.0691, 0.0164 ),
	vec3( 0.3293, 0.9195, 0.0880 ),
	vec3( 0.0433, 0.0113, 0.8956 )
);
vec3 agxDefaultContrastApprox( vec3 x ) {
	vec3 x2 = x * x;
	vec3 x4 = x2 * x2;
	return + 15.5 * x4 * x2
		- 40.14 * x4 * x
		+ 31.96 * x4
		- 6.868 * x2 * x
		+ 0.4298 * x2
		+ 0.1191 * x
		- 0.00232;
}
vec3 AgXToneMapping( vec3 color ) {
	const mat3 AgXInsetMatrix = mat3(
		vec3( 0.856627153315983, 0.137318972929847, 0.11189821299995 ),
		vec3( 0.0951212405381588, 0.761241990602591, 0.0767994186031903 ),
		vec3( 0.0482516061458583, 0.101439036467562, 0.811302368396859 )
	);
	const mat3 AgXOutsetMatrix = mat3(
		vec3( 1.1271005818144368, - 0.1413297634984383, - 0.14132976349843826 ),
		vec3( - 0.11060664309660323, 1.157823702216272, - 0.11060664309660294 ),
		vec3( - 0.016493938717834573, - 0.016493938717834257, 1.2519364065950405 )
	);
	const float AgxMinEv = - 12.47393;	const float AgxMaxEv = 4.026069;
	color *= toneMappingExposure;
	color = LINEAR_SRGB_TO_LINEAR_REC2020 * color;
	color = AgXInsetMatrix * color;
	color = max( color, 1e-10 );	color = log2( color );
	color = ( color - AgxMinEv ) / ( AgxMaxEv - AgxMinEv );
	color = clamp( color, 0.0, 1.0 );
	color = agxDefaultContrastApprox( color );
	color = AgXOutsetMatrix * color;
	color = pow( max( vec3( 0.0 ), color ), vec3( 2.2 ) );
	color = LINEAR_REC2020_TO_LINEAR_SRGB * color;
	color = clamp( color, 0.0, 1.0 );
	return color;
}
vec3 NeutralToneMapping( vec3 color ) {
	const float StartCompression = 0.8 - 0.04;
	const float Desaturation = 0.15;
	color *= toneMappingExposure;
	float x = min( color.r, min( color.g, color.b ) );
	float offset = x < 0.08 ? x - 6.25 * x * x : 0.04;
	color -= offset;
	float peak = max( color.r, max( color.g, color.b ) );
	if ( peak < StartCompression ) return color;
	float d = 1. - StartCompression;
	float newPeak = 1. - d * d / ( peak + d - StartCompression );
	color *= newPeak / peak;
	float g = 1. - 1. / ( Desaturation * ( peak - newPeak ) + 1. );
	return mix( color, vec3( newPeak ), g );
}
vec3 CustomToneMapping( vec3 color ) { return color; }`,ml=`#ifdef USE_TRANSMISSION
	material.transmission = transmission;
	material.transmissionAlpha = 1.0;
	material.thickness = thickness;
	material.attenuationDistance = attenuationDistance;
	material.attenuationColor = attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		material.transmission *= texture2D( transmissionMap, vTransmissionMapUv ).r;
	#endif
	#ifdef USE_THICKNESSMAP
		material.thickness *= texture2D( thicknessMap, vThicknessMapUv ).g;
	#endif
	vec3 pos = vWorldPosition;
	vec3 v = normalize( cameraPosition - pos );
	vec3 n = transformNormalByInverseViewMatrix( normal, viewMatrix );
	vec4 transmitted = getIBLVolumeRefraction(
		n, v, material.roughness, material.diffuseContribution, material.specularColorBlended, material.specularF90,
		pos, modelMatrix, viewMatrix, projectionMatrix, material.dispersion, material.ior, material.thickness,
		material.attenuationColor, material.attenuationDistance );
	material.transmissionAlpha = mix( material.transmissionAlpha, transmitted.a, material.transmission );
	totalDiffuse = mix( totalDiffuse, transmitted.rgb, material.transmission );
#endif`,_l=`#ifdef USE_TRANSMISSION
	uniform float transmission;
	uniform float thickness;
	uniform float attenuationDistance;
	uniform vec3 attenuationColor;
	#ifdef USE_TRANSMISSIONMAP
		uniform sampler2D transmissionMap;
	#endif
	#ifdef USE_THICKNESSMAP
		uniform sampler2D thicknessMap;
	#endif
	uniform vec2 transmissionSamplerSize;
	uniform sampler2D transmissionSamplerMap;
	uniform mat4 modelMatrix;
	uniform mat4 projectionMatrix;
	varying vec3 vWorldPosition;
	float w0( float a ) {
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - a + 3.0 ) - 3.0 ) + 1.0 );
	}
	float w1( float a ) {
		return ( 1.0 / 6.0 ) * ( a *  a * ( 3.0 * a - 6.0 ) + 4.0 );
	}
	float w2( float a ){
		return ( 1.0 / 6.0 ) * ( a * ( a * ( - 3.0 * a + 3.0 ) + 3.0 ) + 1.0 );
	}
	float w3( float a ) {
		return ( 1.0 / 6.0 ) * ( a * a * a );
	}
	float g0( float a ) {
		return w0( a ) + w1( a );
	}
	float g1( float a ) {
		return w2( a ) + w3( a );
	}
	float h0( float a ) {
		return - 1.0 + w1( a ) / ( w0( a ) + w1( a ) );
	}
	float h1( float a ) {
		return 1.0 + w3( a ) / ( w2( a ) + w3( a ) );
	}
	vec4 bicubic( sampler2D tex, vec2 uv, vec4 texelSize, float lod ) {
		uv = uv * texelSize.zw + 0.5;
		vec2 iuv = floor( uv );
		vec2 fuv = fract( uv );
		float g0x = g0( fuv.x );
		float g1x = g1( fuv.x );
		float h0x = h0( fuv.x );
		float h1x = h1( fuv.x );
		float h0y = h0( fuv.y );
		float h1y = h1( fuv.y );
		vec2 p0 = ( vec2( iuv.x + h0x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p1 = ( vec2( iuv.x + h1x, iuv.y + h0y ) - 0.5 ) * texelSize.xy;
		vec2 p2 = ( vec2( iuv.x + h0x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		vec2 p3 = ( vec2( iuv.x + h1x, iuv.y + h1y ) - 0.5 ) * texelSize.xy;
		return g0( fuv.y ) * ( g0x * textureLod( tex, p0, lod ) + g1x * textureLod( tex, p1, lod ) ) +
			g1( fuv.y ) * ( g0x * textureLod( tex, p2, lod ) + g1x * textureLod( tex, p3, lod ) );
	}
	vec4 textureBicubic( sampler2D sampler, vec2 uv, float lod ) {
		vec2 fLodSize = vec2( textureSize( sampler, int( lod ) ) );
		vec2 cLodSize = vec2( textureSize( sampler, int( lod + 1.0 ) ) );
		vec2 fLodSizeInv = 1.0 / fLodSize;
		vec2 cLodSizeInv = 1.0 / cLodSize;
		vec4 fSample = bicubic( sampler, uv, vec4( fLodSizeInv, fLodSize ), floor( lod ) );
		vec4 cSample = bicubic( sampler, uv, vec4( cLodSizeInv, cLodSize ), ceil( lod ) );
		return mix( fSample, cSample, fract( lod ) );
	}
	vec3 getVolumeTransmissionRay( const in vec3 n, const in vec3 v, const in float thickness, const in float ior, const in mat4 modelMatrix ) {
		vec3 refractionVector = refract( - v, normalize( n ), 1.0 / ior );
		vec3 modelScale;
		modelScale.x = length( vec3( modelMatrix[ 0 ].xyz ) );
		modelScale.y = length( vec3( modelMatrix[ 1 ].xyz ) );
		modelScale.z = length( vec3( modelMatrix[ 2 ].xyz ) );
		return normalize( refractionVector ) * thickness * modelScale;
	}
	float applyIorToRoughness( const in float roughness, const in float ior ) {
		return roughness * clamp( ior * 2.0 - 2.0, 0.0, 1.0 );
	}
	vec4 getTransmissionSample( const in vec2 fragCoord, const in float roughness, const in float ior ) {
		float lod = log2( transmissionSamplerSize.x ) * applyIorToRoughness( roughness, ior );
		return textureBicubic( transmissionSamplerMap, fragCoord.xy, lod );
	}
	vec3 volumeAttenuation( const in float transmissionDistance, const in vec3 attenuationColor, const in float attenuationDistance ) {
		if ( isinf( attenuationDistance ) ) {
			return vec3( 1.0 );
		} else {
			vec3 attenuationCoefficient = -log( attenuationColor ) / attenuationDistance;
			vec3 transmittance = exp( - attenuationCoefficient * transmissionDistance );			return transmittance;
		}
	}
	vec4 getIBLVolumeRefraction( const in vec3 n, const in vec3 v, const in float roughness, const in vec3 diffuseColor,
		const in vec3 specularColor, const in float specularF90, const in vec3 position, const in mat4 modelMatrix,
		const in mat4 viewMatrix, const in mat4 projMatrix, const in float dispersion, const in float ior, const in float thickness,
		const in vec3 attenuationColor, const in float attenuationDistance ) {
		vec4 transmittedLight;
		vec3 transmittance;
		#ifdef USE_DISPERSION
			float halfSpread = ( ior - 1.0 ) * 0.025 * dispersion;
			vec3 iors = vec3( ior - halfSpread, ior, ior + halfSpread );
			for ( int i = 0; i < 3; i ++ ) {
				vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, iors[ i ], modelMatrix );
				vec3 refractedRayExit = position + transmissionRay;
				vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
				vec2 refractionCoords = ndcPos.xy / ndcPos.w;
				refractionCoords += 1.0;
				refractionCoords /= 2.0;
				vec4 transmissionSample = getTransmissionSample( refractionCoords, roughness, iors[ i ] );
				transmittedLight[ i ] = transmissionSample[ i ];
				transmittedLight.a += transmissionSample.a;
				transmittance[ i ] = diffuseColor[ i ] * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance )[ i ];
			}
			transmittedLight.a /= 3.0;
		#else
			vec3 transmissionRay = getVolumeTransmissionRay( n, v, thickness, ior, modelMatrix );
			vec3 refractedRayExit = position + transmissionRay;
			vec4 ndcPos = projMatrix * viewMatrix * vec4( refractedRayExit, 1.0 );
			vec2 refractionCoords = ndcPos.xy / ndcPos.w;
			refractionCoords += 1.0;
			refractionCoords /= 2.0;
			transmittedLight = getTransmissionSample( refractionCoords, roughness, ior );
			transmittance = diffuseColor * volumeAttenuation( length( transmissionRay ), attenuationColor, attenuationDistance );
		#endif
		vec3 attenuatedColor = transmittance * transmittedLight.rgb;
		vec3 F = EnvironmentBRDF( n, v, specularColor, specularF90, roughness );
		float transmittanceFactor = ( transmittance.r + transmittance.g + transmittance.b ) / 3.0;
		return vec4( ( 1.0 - F ) * attenuatedColor, 1.0 - ( 1.0 - transmittedLight.a ) * transmittanceFactor );
	}
#endif`,gl=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_SPECULARMAP
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,vl=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	varying vec2 vUv;
#endif
#ifdef USE_MAP
	uniform mat3 mapTransform;
	varying vec2 vMapUv;
#endif
#ifdef USE_ALPHAMAP
	uniform mat3 alphaMapTransform;
	varying vec2 vAlphaMapUv;
#endif
#ifdef USE_LIGHTMAP
	uniform mat3 lightMapTransform;
	varying vec2 vLightMapUv;
#endif
#ifdef USE_AOMAP
	uniform mat3 aoMapTransform;
	varying vec2 vAoMapUv;
#endif
#ifdef USE_BUMPMAP
	uniform mat3 bumpMapTransform;
	varying vec2 vBumpMapUv;
#endif
#ifdef USE_NORMALMAP
	uniform mat3 normalMapTransform;
	varying vec2 vNormalMapUv;
#endif
#ifdef USE_DISPLACEMENTMAP
	uniform mat3 displacementMapTransform;
	varying vec2 vDisplacementMapUv;
#endif
#ifdef USE_EMISSIVEMAP
	uniform mat3 emissiveMapTransform;
	varying vec2 vEmissiveMapUv;
#endif
#ifdef USE_METALNESSMAP
	uniform mat3 metalnessMapTransform;
	varying vec2 vMetalnessMapUv;
#endif
#ifdef USE_ROUGHNESSMAP
	uniform mat3 roughnessMapTransform;
	varying vec2 vRoughnessMapUv;
#endif
#ifdef USE_ANISOTROPYMAP
	uniform mat3 anisotropyMapTransform;
	varying vec2 vAnisotropyMapUv;
#endif
#ifdef USE_CLEARCOATMAP
	uniform mat3 clearcoatMapTransform;
	varying vec2 vClearcoatMapUv;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	uniform mat3 clearcoatNormalMapTransform;
	varying vec2 vClearcoatNormalMapUv;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	uniform mat3 clearcoatRoughnessMapTransform;
	varying vec2 vClearcoatRoughnessMapUv;
#endif
#ifdef USE_SHEEN_COLORMAP
	uniform mat3 sheenColorMapTransform;
	varying vec2 vSheenColorMapUv;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	uniform mat3 sheenRoughnessMapTransform;
	varying vec2 vSheenRoughnessMapUv;
#endif
#ifdef USE_IRIDESCENCEMAP
	uniform mat3 iridescenceMapTransform;
	varying vec2 vIridescenceMapUv;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	uniform mat3 iridescenceThicknessMapTransform;
	varying vec2 vIridescenceThicknessMapUv;
#endif
#ifdef USE_SPECULARMAP
	uniform mat3 specularMapTransform;
	varying vec2 vSpecularMapUv;
#endif
#ifdef USE_SPECULAR_COLORMAP
	uniform mat3 specularColorMapTransform;
	varying vec2 vSpecularColorMapUv;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	uniform mat3 specularIntensityMapTransform;
	varying vec2 vSpecularIntensityMapUv;
#endif
#ifdef USE_TRANSMISSIONMAP
	uniform mat3 transmissionMapTransform;
	varying vec2 vTransmissionMapUv;
#endif
#ifdef USE_THICKNESSMAP
	uniform mat3 thicknessMapTransform;
	varying vec2 vThicknessMapUv;
#endif`,Sl=`#if defined( USE_UV ) || defined( USE_ANISOTROPY )
	vUv = vec3( uv, 1 ).xy;
#endif
#ifdef USE_MAP
	vMapUv = ( mapTransform * vec3( MAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ALPHAMAP
	vAlphaMapUv = ( alphaMapTransform * vec3( ALPHAMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_LIGHTMAP
	vLightMapUv = ( lightMapTransform * vec3( LIGHTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_AOMAP
	vAoMapUv = ( aoMapTransform * vec3( AOMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_BUMPMAP
	vBumpMapUv = ( bumpMapTransform * vec3( BUMPMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_NORMALMAP
	vNormalMapUv = ( normalMapTransform * vec3( NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_DISPLACEMENTMAP
	vDisplacementMapUv = ( displacementMapTransform * vec3( DISPLACEMENTMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_EMISSIVEMAP
	vEmissiveMapUv = ( emissiveMapTransform * vec3( EMISSIVEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_METALNESSMAP
	vMetalnessMapUv = ( metalnessMapTransform * vec3( METALNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ROUGHNESSMAP
	vRoughnessMapUv = ( roughnessMapTransform * vec3( ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_ANISOTROPYMAP
	vAnisotropyMapUv = ( anisotropyMapTransform * vec3( ANISOTROPYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOATMAP
	vClearcoatMapUv = ( clearcoatMapTransform * vec3( CLEARCOATMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_NORMALMAP
	vClearcoatNormalMapUv = ( clearcoatNormalMapTransform * vec3( CLEARCOAT_NORMALMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_CLEARCOAT_ROUGHNESSMAP
	vClearcoatRoughnessMapUv = ( clearcoatRoughnessMapTransform * vec3( CLEARCOAT_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCEMAP
	vIridescenceMapUv = ( iridescenceMapTransform * vec3( IRIDESCENCEMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_IRIDESCENCE_THICKNESSMAP
	vIridescenceThicknessMapUv = ( iridescenceThicknessMapTransform * vec3( IRIDESCENCE_THICKNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_COLORMAP
	vSheenColorMapUv = ( sheenColorMapTransform * vec3( SHEEN_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SHEEN_ROUGHNESSMAP
	vSheenRoughnessMapUv = ( sheenRoughnessMapTransform * vec3( SHEEN_ROUGHNESSMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULARMAP
	vSpecularMapUv = ( specularMapTransform * vec3( SPECULARMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_COLORMAP
	vSpecularColorMapUv = ( specularColorMapTransform * vec3( SPECULAR_COLORMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_SPECULAR_INTENSITYMAP
	vSpecularIntensityMapUv = ( specularIntensityMapTransform * vec3( SPECULAR_INTENSITYMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_TRANSMISSIONMAP
	vTransmissionMapUv = ( transmissionMapTransform * vec3( TRANSMISSIONMAP_UV, 1 ) ).xy;
#endif
#ifdef USE_THICKNESSMAP
	vThicknessMapUv = ( thicknessMapTransform * vec3( THICKNESSMAP_UV, 1 ) ).xy;
#endif`,El=`#if defined( USE_ENVMAP ) || defined( DISTANCE ) || defined ( USE_SHADOWMAP ) || defined ( USE_TRANSMISSION ) || NUM_SPOT_LIGHT_COORDS > 0
	vec4 worldPosition = vec4( transformed, 1.0 );
	#ifdef USE_BATCHING
		worldPosition = batchingMatrix * worldPosition;
	#endif
	#ifdef USE_INSTANCING
		worldPosition = instanceMatrix * worldPosition;
	#endif
	worldPosition = modelMatrix * worldPosition;
#endif`;const xl=`varying vec2 vUv;
uniform mat3 uvTransform;
void main() {
	vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	gl_Position = vec4( position.xy, 1.0, 1.0 );
}`,Ml=`uniform sampler2D t2D;
uniform float backgroundIntensity;
varying vec2 vUv;
void main() {
	vec4 texColor = texture2D( t2D, vUv );
	#ifdef DECODE_VIDEO_TEXTURE
		texColor = vec4( mix( pow( texColor.rgb * 0.9478672986 + vec3( 0.0521327014 ), vec3( 2.4 ) ), texColor.rgb * 0.0773993808, vec3( lessThanEqual( texColor.rgb, vec3( 0.04045 ) ) ) ), texColor.w );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Tl=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,Al=`#ifdef ENVMAP_TYPE_CUBE
	uniform samplerCube envMap;
#elif defined( ENVMAP_TYPE_CUBE_UV )
	uniform sampler2D envMap;
#endif
uniform float backgroundBlurriness;
uniform float backgroundIntensity;
uniform mat3 backgroundRotation;
varying vec3 vWorldDirection;
#include <cube_uv_reflection_fragment>
void main() {
	#ifdef ENVMAP_TYPE_CUBE
		vec4 texColor = textureCube( envMap, backgroundRotation * vWorldDirection );
	#elif defined( ENVMAP_TYPE_CUBE_UV )
		vec4 texColor = textureCubeUV( envMap, backgroundRotation * vWorldDirection, backgroundBlurriness );
	#else
		vec4 texColor = vec4( 0.0, 0.0, 0.0, 1.0 );
	#endif
	texColor.rgb *= backgroundIntensity;
	gl_FragColor = texColor;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Rl=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
	gl_Position.z = gl_Position.w;
}`,bl=`uniform samplerCube tCube;
uniform float tFlip;
uniform float opacity;
varying vec3 vWorldDirection;
void main() {
	vec4 texColor = textureCube( tCube, vec3( tFlip * vWorldDirection.x, vWorldDirection.yz ) );
	gl_FragColor = texColor;
	gl_FragColor.a *= opacity;
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Cl=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
varying vec2 vHighPrecisionZW;
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vHighPrecisionZW = gl_Position.zw;
}`,Pl=`#if DEPTH_PACKING == 3200
	uniform float opacity;
#endif
#include <common>
#include <packing>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
varying vec2 vHighPrecisionZW;
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#if DEPTH_PACKING == 3200
		diffuseColor.a = opacity;
	#endif
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <logdepthbuf_fragment>
	#ifdef USE_REVERSED_DEPTH_BUFFER
		float fragCoordZ = vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ];
	#else
		float fragCoordZ = 0.5 * vHighPrecisionZW[ 0 ] / vHighPrecisionZW[ 1 ] + 0.5;
	#endif
	#if DEPTH_PACKING == 3200
		gl_FragColor = vec4( vec3( 1.0 - fragCoordZ ), opacity );
	#elif DEPTH_PACKING == 3201
		gl_FragColor = packDepthToRGBA( fragCoordZ );
	#elif DEPTH_PACKING == 3202
		gl_FragColor = vec4( packDepthToRGB( fragCoordZ ), 1.0 );
	#elif DEPTH_PACKING == 3203
		gl_FragColor = vec4( packDepthToRG( fragCoordZ ), 0.0, 1.0 );
	#endif
}`,Ll=`#define DISTANCE
varying vec3 vWorldPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <skinbase_vertex>
	#include <morphinstance_vertex>
	#ifdef USE_DISPLACEMENTMAP
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <worldpos_vertex>
	#include <clipping_planes_vertex>
	vWorldPosition = worldPosition.xyz;
}`,Ul=`#define DISTANCE
uniform vec3 referencePosition;
uniform float nearDistance;
uniform float farDistance;
varying vec3 vWorldPosition;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 1.0 );
	#include <clipping_planes_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	float dist = length( vWorldPosition - referencePosition );
	dist = ( dist - nearDistance ) / ( farDistance - nearDistance );
	dist = saturate( dist );
	gl_FragColor = vec4( dist, 0.0, 0.0, 1.0 );
}`,Dl=`varying vec3 vWorldDirection;
#include <common>
void main() {
	vWorldDirection = transformDirection( position, modelMatrix );
	#include <begin_vertex>
	#include <project_vertex>
}`,wl=`uniform sampler2D tEquirect;
varying vec3 vWorldDirection;
#include <common>
void main() {
	vec3 direction = normalize( vWorldDirection );
	vec2 sampleUV = equirectUv( direction );
	gl_FragColor = texture2D( tEquirect, sampleUV );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
}`,Il=`uniform float scale;
attribute float lineDistance;
varying float vLineDistance;
#include <common>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	vLineDistance = scale * lineDistance;
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,Nl=`uniform vec3 diffuse;
uniform float opacity;
uniform float dashSize;
uniform float totalSize;
varying float vLineDistance;
#include <common>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	if ( mod( vLineDistance, totalSize ) > dashSize ) {
		discard;
	}
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,yl=`#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#if defined ( USE_ENVMAP ) || defined ( USE_SKINNING )
		#include <beginnormal_vertex>
		#include <morphnormal_vertex>
		#include <skinbase_vertex>
		#include <skinnormal_vertex>
		#include <defaultnormal_vertex>
	#endif
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <fog_vertex>
}`,Fl=`uniform vec3 diffuse;
uniform float opacity;
#ifndef FLAT_SHADED
	varying vec3 vNormal;
#endif
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <fog_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	#ifdef USE_LIGHTMAP
		vec4 lightMapTexel = texture2D( lightMap, vLightMapUv );
		reflectedLight.indirectDiffuse += lightMapTexel.rgb * lightMapIntensity * RECIPROCAL_PI;
	#else
		reflectedLight.indirectDiffuse += vec3( 1.0 );
	#endif
	#include <aomap_fragment>
	reflectedLight.indirectDiffuse *= diffuseColor.rgb;
	vec3 outgoingLight = reflectedLight.indirectDiffuse;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Ol=`#define LAMBERT
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Bl=`#define LAMBERT
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_lambert_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_lambert_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Gl=`#define MATCAP
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <color_pars_vertex>
#include <displacementmap_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
	vViewPosition = - mvPosition.xyz;
}`,Hl=`#define MATCAP
uniform vec3 diffuse;
uniform float opacity;
uniform sampler2D matcap;
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	vec3 viewDir = normalize( vViewPosition );
	vec3 x = normalize( vec3( viewDir.z, 0.0, - viewDir.x ) );
	vec3 y = cross( viewDir, x );
	vec2 uv = vec2( dot( x, normal ), dot( y, normal ) ) * 0.495 + 0.5;
	#ifdef USE_MATCAP
		vec4 matcapColor = texture2D( matcap, uv );
	#else
		vec4 matcapColor = vec4( vec3( mix( 0.2, 0.8, uv.y ) ), 1.0 );
	#endif
	vec3 outgoingLight = diffuseColor.rgb * matcapColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Vl=`#define NORMAL
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	vViewPosition = - mvPosition.xyz;
#endif
}`,Wl=`#define NORMAL
uniform float opacity;
#if defined( FLAT_SHADED ) || defined( USE_BUMPMAP ) || defined( USE_NORMALMAP_TANGENTSPACE )
	varying vec3 vViewPosition;
#endif
#include <uv_pars_fragment>
#include <normal_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( 0.0, 0.0, 0.0, opacity );
	#include <clipping_planes_fragment>
	#include <logdepthbuf_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	gl_FragColor = vec4( normalize( normal ) * 0.5 + 0.5, diffuseColor.a );
	#ifdef OPAQUE
		gl_FragColor.a = 1.0;
	#endif
}`,kl=`#define PHONG
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <envmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <envmap_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,zl=`#define PHONG
uniform vec3 diffuse;
uniform vec3 emissive;
uniform vec3 specular;
uniform float shininess;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_phong_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <specularmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <specularmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_phong_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + reflectedLight.directSpecular + reflectedLight.indirectSpecular + totalEmissiveRadiance;
	#include <envmap_fragment>
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Xl=`#define STANDARD
varying vec3 vViewPosition;
#ifdef USE_TRANSMISSION
	varying vec3 vWorldPosition;
#endif
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
#ifdef USE_TRANSMISSION
	vWorldPosition = worldPosition.xyz;
#endif
}`,Yl=`#define STANDARD
#ifdef PHYSICAL
	#define IOR
	#define USE_SPECULAR
#endif
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float roughness;
uniform float metalness;
uniform float opacity;
#ifdef IOR
	uniform float ior;
#endif
#ifdef USE_SPECULAR
	uniform float specularIntensity;
	uniform vec3 specularColor;
	#ifdef USE_SPECULAR_COLORMAP
		uniform sampler2D specularColorMap;
	#endif
	#ifdef USE_SPECULAR_INTENSITYMAP
		uniform sampler2D specularIntensityMap;
	#endif
#endif
#ifdef USE_CLEARCOAT
	uniform float clearcoat;
	uniform float clearcoatRoughness;
#endif
#ifdef USE_DISPERSION
	uniform float dispersion;
#endif
#ifdef USE_IRIDESCENCE
	uniform float iridescence;
	uniform float iridescenceIOR;
	uniform float iridescenceThicknessMinimum;
	uniform float iridescenceThicknessMaximum;
#endif
#ifdef USE_SHEEN
	uniform vec3 sheenColor;
	uniform float sheenRoughness;
	#ifdef USE_SHEEN_COLORMAP
		uniform sampler2D sheenColorMap;
	#endif
	#ifdef USE_SHEEN_ROUGHNESSMAP
		uniform sampler2D sheenRoughnessMap;
	#endif
#endif
#ifdef USE_ANISOTROPY
	uniform vec2 anisotropyVector;
	#ifdef USE_ANISOTROPYMAP
		uniform sampler2D anisotropyMap;
	#endif
#endif
varying vec3 vViewPosition;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <iridescence_fragment>
#include <cube_uv_reflection_fragment>
#include <envmap_common_pars_fragment>
#include <envmap_physical_pars_fragment>
#include <fog_pars_fragment>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_physical_pars_fragment>
#include <transmission_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <clearcoat_pars_fragment>
#include <iridescence_pars_fragment>
#include <roughnessmap_pars_fragment>
#include <metalnessmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <roughnessmap_fragment>
	#include <metalnessmap_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <clearcoat_normal_fragment_begin>
	#include <clearcoat_normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_physical_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 totalDiffuse = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse;
	vec3 totalSpecular = reflectedLight.directSpecular + reflectedLight.indirectSpecular;
	#include <transmission_fragment>
	vec3 outgoingLight = totalDiffuse + totalSpecular + totalEmissiveRadiance;
	#ifdef USE_SHEEN
 
		outgoingLight = outgoingLight + sheenSpecularDirect + sheenSpecularIndirect;
 
 	#endif
	#ifdef USE_CLEARCOAT
		float dotNVcc = saturate( dot( geometryClearcoatNormal, geometryViewDir ) );
		vec3 Fcc = F_Schlick( material.clearcoatF0, material.clearcoatF90, dotNVcc );
		outgoingLight = outgoingLight * ( 1.0 - material.clearcoat * Fcc ) + ( clearcoatSpecularDirect + clearcoatSpecularIndirect ) * material.clearcoat;
	#endif
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Kl=`#define TOON
varying vec3 vViewPosition;
#include <common>
#include <batching_pars_vertex>
#include <uv_pars_vertex>
#include <displacementmap_pars_vertex>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <normal_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <shadowmap_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <normal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <displacementmap_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	vViewPosition = - mvPosition.xyz;
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,ql=`#define TOON
uniform vec3 diffuse;
uniform vec3 emissive;
uniform float opacity;
#include <common>
#include <dithering_pars_fragment>
#include <color_pars_fragment>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <aomap_pars_fragment>
#include <lightmap_pars_fragment>
#include <emissivemap_pars_fragment>
#include <gradientmap_pars_fragment>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <normal_pars_fragment>
#include <lights_toon_pars_fragment>
#include <shadowmap_pars_fragment>
#include <bumpmap_pars_fragment>
#include <normalmap_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	ReflectedLight reflectedLight = ReflectedLight( vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ), vec3( 0.0 ) );
	vec3 totalEmissiveRadiance = emissive;
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <color_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	#include <normal_fragment_begin>
	#include <normal_fragment_maps>
	#include <emissivemap_fragment>
	#include <lights_toon_fragment>
	#include <lights_fragment_begin>
	#include <lights_fragment_maps>
	#include <lights_fragment_end>
	#include <aomap_fragment>
	vec3 outgoingLight = reflectedLight.directDiffuse + reflectedLight.indirectDiffuse + totalEmissiveRadiance;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
	#include <dithering_fragment>
}`,Zl=`uniform float size;
uniform float scale;
#include <common>
#include <color_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
#ifdef USE_POINTS_UV
	varying vec2 vUv;
	uniform mat3 uvTransform;
#endif
void main() {
	#ifdef USE_POINTS_UV
		vUv = ( uvTransform * vec3( uv, 1 ) ).xy;
	#endif
	#include <color_vertex>
	#include <morphinstance_vertex>
	#include <morphcolor_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <project_vertex>
	gl_PointSize = size;
	#ifdef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) gl_PointSize *= ( scale / - mvPosition.z );
	#endif
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <worldpos_vertex>
	#include <fog_vertex>
}`,$l=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <color_pars_fragment>
#include <map_particle_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_particle_fragment>
	#include <color_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,Ql=`#include <common>
#include <batching_pars_vertex>
#include <fog_pars_vertex>
#include <morphtarget_pars_vertex>
#include <skinning_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <shadowmap_pars_vertex>
void main() {
	#include <batching_vertex>
	#include <beginnormal_vertex>
	#include <morphinstance_vertex>
	#include <morphnormal_vertex>
	#include <skinbase_vertex>
	#include <skinnormal_vertex>
	#include <defaultnormal_vertex>
	#include <begin_vertex>
	#include <morphtarget_vertex>
	#include <skinning_vertex>
	#include <project_vertex>
	#include <logdepthbuf_vertex>
	#include <worldpos_vertex>
	#include <shadowmap_vertex>
	#include <fog_vertex>
}`,Jl=`uniform vec3 color;
uniform float opacity;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
#include <logdepthbuf_pars_fragment>
#include <shadowmap_pars_fragment>
#include <shadowmask_pars_fragment>
void main() {
	#include <logdepthbuf_fragment>
	gl_FragColor = vec4( color, opacity * ( 1.0 - getShadowMask() ) );
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
	#include <premultiplied_alpha_fragment>
}`,jl=`uniform float rotation;
uniform vec2 center;
#include <common>
#include <uv_pars_vertex>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
#include <clipping_planes_pars_vertex>
void main() {
	#include <uv_vertex>
	vec4 mvPosition = modelViewMatrix[ 3 ];
	vec2 scale = vec2( length( modelMatrix[ 0 ].xyz ), length( modelMatrix[ 1 ].xyz ) );
	#ifndef USE_SIZEATTENUATION
		bool isPerspective = isPerspectiveMatrix( projectionMatrix );
		if ( isPerspective ) scale *= - mvPosition.z;
	#endif
	vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;
	vec2 rotatedPosition;
	rotatedPosition.x = cos( rotation ) * alignedPosition.x - sin( rotation ) * alignedPosition.y;
	rotatedPosition.y = sin( rotation ) * alignedPosition.x + cos( rotation ) * alignedPosition.y;
	mvPosition.xy += rotatedPosition;
	gl_Position = projectionMatrix * mvPosition;
	#include <logdepthbuf_vertex>
	#include <clipping_planes_vertex>
	#include <fog_vertex>
}`,ec=`uniform vec3 diffuse;
uniform float opacity;
#include <common>
#include <uv_pars_fragment>
#include <map_pars_fragment>
#include <alphamap_pars_fragment>
#include <alphatest_pars_fragment>
#include <alphahash_pars_fragment>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>
#include <clipping_planes_pars_fragment>
void main() {
	vec4 diffuseColor = vec4( diffuse, opacity );
	#include <clipping_planes_fragment>
	vec3 outgoingLight = vec3( 0.0 );
	#include <logdepthbuf_fragment>
	#include <map_fragment>
	#include <alphamap_fragment>
	#include <alphatest_fragment>
	#include <alphahash_fragment>
	outgoingLight = diffuseColor.rgb;
	#include <opaque_fragment>
	#include <tonemapping_fragment>
	#include <colorspace_fragment>
	#include <fog_fragment>
}`,Ue={alphahash_fragment:xo,alphahash_pars_fragment:Mo,alphamap_fragment:To,alphamap_pars_fragment:Ao,alphatest_fragment:Ro,alphatest_pars_fragment:bo,aomap_fragment:Co,aomap_pars_fragment:Po,batching_pars_vertex:Lo,batching_vertex:Uo,begin_vertex:Do,beginnormal_vertex:wo,bsdfs:Io,iridescence_fragment:No,bumpmap_pars_fragment:yo,clipping_planes_fragment:Fo,clipping_planes_pars_fragment:Oo,clipping_planes_pars_vertex:Bo,clipping_planes_vertex:Go,color_fragment:Ho,color_pars_fragment:Vo,color_pars_vertex:Wo,color_vertex:ko,common:zo,cube_uv_reflection_fragment:Xo,defaultnormal_vertex:Yo,displacementmap_pars_vertex:Ko,displacementmap_vertex:qo,emissivemap_fragment:Zo,emissivemap_pars_fragment:$o,colorspace_fragment:Qo,colorspace_pars_fragment:Jo,envmap_fragment:jo,envmap_common_pars_fragment:es,envmap_pars_fragment:ts,envmap_pars_vertex:ns,envmap_physical_pars_fragment:ps,envmap_vertex:is,fog_vertex:rs,fog_pars_vertex:as,fog_fragment:os,fog_pars_fragment:ss,gradientmap_pars_fragment:ls,lightmap_pars_fragment:cs,lights_lambert_fragment:fs,lights_lambert_pars_fragment:ds,lights_pars_begin:us,lights_toon_fragment:hs,lights_toon_pars_fragment:ms,lights_phong_fragment:_s,lights_phong_pars_fragment:gs,lights_physical_fragment:vs,lights_physical_pars_fragment:Ss,lights_fragment_begin:Es,lights_fragment_maps:xs,lights_fragment_end:Ms,lightprobes_pars_fragment:Ts,logdepthbuf_fragment:As,logdepthbuf_pars_fragment:Rs,logdepthbuf_pars_vertex:bs,logdepthbuf_vertex:Cs,map_fragment:Ps,map_pars_fragment:Ls,map_particle_fragment:Us,map_particle_pars_fragment:Ds,metalnessmap_fragment:ws,metalnessmap_pars_fragment:Is,morphinstance_vertex:Ns,morphcolor_vertex:ys,morphnormal_vertex:Fs,morphtarget_pars_vertex:Os,morphtarget_vertex:Bs,normal_fragment_begin:Gs,normal_fragment_maps:Hs,normal_pars_fragment:Vs,normal_pars_vertex:Ws,normal_vertex:ks,normalmap_pars_fragment:zs,clearcoat_normal_fragment_begin:Xs,clearcoat_normal_fragment_maps:Ys,clearcoat_pars_fragment:Ks,iridescence_pars_fragment:qs,opaque_fragment:Zs,packing:$s,premultiplied_alpha_fragment:Qs,project_vertex:Js,dithering_fragment:js,dithering_pars_fragment:el,roughnessmap_fragment:tl,roughnessmap_pars_fragment:nl,shadowmap_pars_fragment:il,shadowmap_pars_vertex:rl,shadowmap_vertex:al,shadowmask_pars_fragment:ol,skinbase_vertex:sl,skinning_pars_vertex:ll,skinning_vertex:cl,skinnormal_vertex:fl,specularmap_fragment:dl,specularmap_pars_fragment:ul,tonemapping_fragment:pl,tonemapping_pars_fragment:hl,transmission_fragment:ml,transmission_pars_fragment:_l,uv_pars_fragment:gl,uv_pars_vertex:vl,uv_vertex:Sl,worldpos_vertex:El,background_vert:xl,background_frag:Ml,backgroundCube_vert:Tl,backgroundCube_frag:Al,cube_vert:Rl,cube_frag:bl,depth_vert:Cl,depth_frag:Pl,distance_vert:Ll,distance_frag:Ul,equirect_vert:Dl,equirect_frag:wl,linedashed_vert:Il,linedashed_frag:Nl,meshbasic_vert:yl,meshbasic_frag:Fl,meshlambert_vert:Ol,meshlambert_frag:Bl,meshmatcap_vert:Gl,meshmatcap_frag:Hl,meshnormal_vert:Vl,meshnormal_frag:Wl,meshphong_vert:kl,meshphong_frag:zl,meshphysical_vert:Xl,meshphysical_frag:Yl,meshtoon_vert:Kl,meshtoon_frag:ql,points_vert:Zl,points_frag:$l,shadow_vert:Ql,shadow_frag:Jl,sprite_vert:jl,sprite_frag:ec},se={common:{diffuse:{value:new $e(16777215)},opacity:{value:1},map:{value:null},mapTransform:{value:new Ne},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0}},specularmap:{specularMap:{value:null},specularMapTransform:{value:new Ne}},envmap:{envMap:{value:null},envMapRotation:{value:new Ne},reflectivity:{value:1},ior:{value:1.5},refractionRatio:{value:.98},dfgLUT:{value:null}},aomap:{aoMap:{value:null},aoMapIntensity:{value:1},aoMapTransform:{value:new Ne}},lightmap:{lightMap:{value:null},lightMapIntensity:{value:1},lightMapTransform:{value:new Ne}},bumpmap:{bumpMap:{value:null},bumpMapTransform:{value:new Ne},bumpScale:{value:1}},normalmap:{normalMap:{value:null},normalMapTransform:{value:new Ne},normalScale:{value:new _t(1,1)}},displacementmap:{displacementMap:{value:null},displacementMapTransform:{value:new Ne},displacementScale:{value:1},displacementBias:{value:0}},emissivemap:{emissiveMap:{value:null},emissiveMapTransform:{value:new Ne}},metalnessmap:{metalnessMap:{value:null},metalnessMapTransform:{value:new Ne}},roughnessmap:{roughnessMap:{value:null},roughnessMapTransform:{value:new Ne}},gradientmap:{gradientMap:{value:null}},fog:{fogDensity:{value:25e-5},fogNear:{value:1},fogFar:{value:2e3},fogColor:{value:new $e(16777215)}},lights:{ambientLightColor:{value:[]},lightProbe:{value:[]},directionalLights:{value:[],properties:{direction:{},color:{}}},directionalLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},directionalShadowMatrix:{value:[]},spotLights:{value:[],properties:{color:{},position:{},direction:{},distance:{},coneCos:{},penumbraCos:{},decay:{}}},spotLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{}}},spotLightMap:{value:[]},spotLightMatrix:{value:[]},pointLights:{value:[],properties:{color:{},position:{},decay:{},distance:{}}},pointLightShadows:{value:[],properties:{shadowIntensity:1,shadowBias:{},shadowNormalBias:{},shadowRadius:{},shadowMapSize:{},shadowCameraNear:{},shadowCameraFar:{}}},pointShadowMatrix:{value:[]},hemisphereLights:{value:[],properties:{direction:{},skyColor:{},groundColor:{}}},rectAreaLights:{value:[],properties:{color:{},position:{},width:{},height:{}}},ltc_1:{value:null},ltc_2:{value:null},probesSH:{value:null},probesMin:{value:new Ie},probesMax:{value:new Ie},probesResolution:{value:new Ie}},points:{diffuse:{value:new $e(16777215)},opacity:{value:1},size:{value:1},scale:{value:1},map:{value:null},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0},uvTransform:{value:new Ne}},sprite:{diffuse:{value:new $e(16777215)},opacity:{value:1},center:{value:new _t(.5,.5)},rotation:{value:0},map:{value:null},mapTransform:{value:new Ne},alphaMap:{value:null},alphaMapTransform:{value:new Ne},alphaTest:{value:0}}},Rt={basic:{uniforms:ht([se.common,se.specularmap,se.envmap,se.aomap,se.lightmap,se.fog]),vertexShader:Ue.meshbasic_vert,fragmentShader:Ue.meshbasic_frag},lambert:{uniforms:ht([se.common,se.specularmap,se.envmap,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.fog,se.lights,{emissive:{value:new $e(0)},envMapIntensity:{value:1}}]),vertexShader:Ue.meshlambert_vert,fragmentShader:Ue.meshlambert_frag},phong:{uniforms:ht([se.common,se.specularmap,se.envmap,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.fog,se.lights,{emissive:{value:new $e(0)},specular:{value:new $e(1118481)},shininess:{value:30},envMapIntensity:{value:1}}]),vertexShader:Ue.meshphong_vert,fragmentShader:Ue.meshphong_frag},standard:{uniforms:ht([se.common,se.envmap,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.roughnessmap,se.metalnessmap,se.fog,se.lights,{emissive:{value:new $e(0)},roughness:{value:1},metalness:{value:0},envMapIntensity:{value:1}}]),vertexShader:Ue.meshphysical_vert,fragmentShader:Ue.meshphysical_frag},toon:{uniforms:ht([se.common,se.aomap,se.lightmap,se.emissivemap,se.bumpmap,se.normalmap,se.displacementmap,se.gradientmap,se.fog,se.lights,{emissive:{value:new $e(0)}}]),vertexShader:Ue.meshtoon_vert,fragmentShader:Ue.meshtoon_frag},matcap:{uniforms:ht([se.common,se.bumpmap,se.normalmap,se.displacementmap,se.fog,{matcap:{value:null}}]),vertexShader:Ue.meshmatcap_vert,fragmentShader:Ue.meshmatcap_frag},points:{uniforms:ht([se.points,se.fog]),vertexShader:Ue.points_vert,fragmentShader:Ue.points_frag},dashed:{uniforms:ht([se.common,se.fog,{scale:{value:1},dashSize:{value:1},totalSize:{value:2}}]),vertexShader:Ue.linedashed_vert,fragmentShader:Ue.linedashed_frag},depth:{uniforms:ht([se.common,se.displacementmap]),vertexShader:Ue.depth_vert,fragmentShader:Ue.depth_frag},normal:{uniforms:ht([se.common,se.bumpmap,se.normalmap,se.displacementmap,{opacity:{value:1}}]),vertexShader:Ue.meshnormal_vert,fragmentShader:Ue.meshnormal_frag},sprite:{uniforms:ht([se.sprite,se.fog]),vertexShader:Ue.sprite_vert,fragmentShader:Ue.sprite_frag},background:{uniforms:{uvTransform:{value:new Ne},t2D:{value:null},backgroundIntensity:{value:1}},vertexShader:Ue.background_vert,fragmentShader:Ue.background_frag},backgroundCube:{uniforms:{envMap:{value:null},backgroundBlurriness:{value:0},backgroundIntensity:{value:1},backgroundRotation:{value:new Ne}},vertexShader:Ue.backgroundCube_vert,fragmentShader:Ue.backgroundCube_frag},cube:{uniforms:{tCube:{value:null},tFlip:{value:-1},opacity:{value:1}},vertexShader:Ue.cube_vert,fragmentShader:Ue.cube_frag},equirect:{uniforms:{tEquirect:{value:null}},vertexShader:Ue.equirect_vert,fragmentShader:Ue.equirect_frag},distance:{uniforms:ht([se.common,se.displacementmap,{referencePosition:{value:new Ie},nearDistance:{value:1},farDistance:{value:1e3}}]),vertexShader:Ue.distance_vert,fragmentShader:Ue.distance_frag},shadow:{uniforms:ht([se.lights,se.fog,{color:{value:new $e(0)},opacity:{value:1}}]),vertexShader:Ue.shadow_vert,fragmentShader:Ue.shadow_frag}};Rt.physical={uniforms:ht([Rt.standard.uniforms,{clearcoat:{value:0},clearcoatMap:{value:null},clearcoatMapTransform:{value:new Ne},clearcoatNormalMap:{value:null},clearcoatNormalMapTransform:{value:new Ne},clearcoatNormalScale:{value:new _t(1,1)},clearcoatRoughness:{value:0},clearcoatRoughnessMap:{value:null},clearcoatRoughnessMapTransform:{value:new Ne},dispersion:{value:0},iridescence:{value:0},iridescenceMap:{value:null},iridescenceMapTransform:{value:new Ne},iridescenceIOR:{value:1.3},iridescenceThicknessMinimum:{value:100},iridescenceThicknessMaximum:{value:400},iridescenceThicknessMap:{value:null},iridescenceThicknessMapTransform:{value:new Ne},sheen:{value:0},sheenColor:{value:new $e(0)},sheenColorMap:{value:null},sheenColorMapTransform:{value:new Ne},sheenRoughness:{value:1},sheenRoughnessMap:{value:null},sheenRoughnessMapTransform:{value:new Ne},transmission:{value:0},transmissionMap:{value:null},transmissionMapTransform:{value:new Ne},transmissionSamplerSize:{value:new _t},transmissionSamplerMap:{value:null},thickness:{value:0},thicknessMap:{value:null},thicknessMapTransform:{value:new Ne},attenuationDistance:{value:0},attenuationColor:{value:new $e(0)},specularColor:{value:new $e(1,1,1)},specularColorMap:{value:null},specularColorMapTransform:{value:new Ne},specularIntensity:{value:1},specularIntensityMap:{value:null},specularIntensityMapTransform:{value:new Ne},anisotropyVector:{value:new _t},anisotropyMap:{value:null},anisotropyMapTransform:{value:new Ne}}]),vertexShader:Ue.meshphysical_vert,fragmentShader:Ue.meshphysical_frag};const hn={r:0,b:0,g:0},tc=new $t,Gr=new Ne;Gr.set(-1,0,0,0,1,0,0,0,1);function nc(e,n,t,i,c,o){const d=new $e(0);let _=c===!0?0:1,C,M,W=null,D=0,p=null;function S(F){let y=F.isScene===!0?F.background:null;if(y&&y.isTexture){const h=F.backgroundBlurriness>0;y=n.get(y,h)}return y}function b(F){let y=!1;const h=S(F);h===null?f(d,_):h&&h.isColor&&(f(h,1),y=!0);const A=e.xr.getEnvironmentBlendMode();A==="additive"?t.buffers.color.setClear(0,0,0,1,o):A==="alpha-blend"&&t.buffers.color.setClear(0,0,0,0,o),(e.autoClear||y)&&(t.buffers.depth.setTest(!0),t.buffers.depth.setMask(!0),t.buffers.color.setMask(!0),e.clear(e.autoClearColor,e.autoClearDepth,e.autoClearStencil))}function G(F,y){const h=S(y);h&&(h.isCubeTexture||h.mapping===Tn)?(M===void 0&&(M=new wt(new $n(1,1,1),new It({name:"BackgroundCubeMaterial",uniforms:Xn(Rt.backgroundCube.uniforms),vertexShader:Rt.backgroundCube.vertexShader,fragmentShader:Rt.backgroundCube.fragmentShader,side:St,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),M.geometry.deleteAttribute("normal"),M.geometry.deleteAttribute("uv"),M.onBeforeRender=function(A,g,P){this.matrixWorld.copyPosition(P.matrixWorld)},Object.defineProperty(M.material,"envMap",{get:function(){return this.uniforms.envMap.value}}),i.update(M)),M.material.uniforms.envMap.value=h,M.material.uniforms.backgroundBlurriness.value=y.backgroundBlurriness,M.material.uniforms.backgroundIntensity.value=y.backgroundIntensity,M.material.uniforms.backgroundRotation.value.setFromMatrix4(tc.makeRotationFromEuler(y.backgroundRotation)).transpose(),h.isCubeTexture&&h.isRenderTargetTexture===!1&&M.material.uniforms.backgroundRotation.value.premultiply(Gr),M.material.toneMapped=Qe.getTransfer(h.colorSpace)!==qe,(W!==h||D!==h.version||p!==e.toneMapping)&&(M.material.needsUpdate=!0,W=h,D=h.version,p=e.toneMapping),M.layers.enableAll(),F.unshift(M,M.geometry,M.material,0,0,null)):h&&h.isTexture&&(C===void 0&&(C=new wt(new Ar(2,2),new It({name:"BackgroundMaterial",uniforms:Xn(Rt.background.uniforms),vertexShader:Rt.background.vertexShader,fragmentShader:Rt.background.fragmentShader,side:sn,depthTest:!1,depthWrite:!1,fog:!1,allowOverride:!1})),C.geometry.deleteAttribute("normal"),Object.defineProperty(C.material,"map",{get:function(){return this.uniforms.t2D.value}}),i.update(C)),C.material.uniforms.t2D.value=h,C.material.uniforms.backgroundIntensity.value=y.backgroundIntensity,C.material.toneMapped=Qe.getTransfer(h.colorSpace)!==qe,h.matrixAutoUpdate===!0&&h.updateMatrix(),C.material.uniforms.uvTransform.value.copy(h.matrix),(W!==h||D!==h.version||p!==e.toneMapping)&&(C.material.needsUpdate=!0,W=h,D=h.version,p=e.toneMapping),C.layers.enableAll(),F.unshift(C,C.geometry,C.material,0,0,null))}function f(F,y){F.getRGB(hn,Cr(e)),t.buffers.color.setClear(hn.r,hn.g,hn.b,y,o)}function s(){M!==void 0&&(M.geometry.dispose(),M.material.dispose(),M=void 0),C!==void 0&&(C.geometry.dispose(),C.material.dispose(),C=void 0)}return{getClearColor:function(){return d},setClearColor:function(F,y=1){d.set(F),_=y,f(d,_)},getClearAlpha:function(){return _},setClearAlpha:function(F){_=F,f(d,_)},render:b,addToRenderList:G,dispose:s}}function ic(e,n){const t=e.getParameter(e.MAX_VERTEX_ATTRIBS),i={},c=p(null);let o=c,d=!1;function _(R,O,Q,Z,k){let Y=!1;const V=D(R,Z,Q,O);o!==V&&(o=V,M(o.object)),Y=S(R,Z,Q,k),Y&&b(R,Z,Q,k),k!==null&&n.update(k,e.ELEMENT_ARRAY_BUFFER),(Y||d)&&(d=!1,h(R,O,Q,Z),k!==null&&e.bindBuffer(e.ELEMENT_ARRAY_BUFFER,n.get(k).buffer))}function C(){return e.createVertexArray()}function M(R){return e.bindVertexArray(R)}function W(R){return e.deleteVertexArray(R)}function D(R,O,Q,Z){const k=Z.wireframe===!0;let Y=i[O.id];Y===void 0&&(Y={},i[O.id]=Y);const V=R.isInstancedMesh===!0?R.id:0;let $=Y[V];$===void 0&&($={},Y[V]=$);let ce=$[Q.id];ce===void 0&&(ce={},$[Q.id]=ce);let ge=ce[k];return ge===void 0&&(ge=p(C()),ce[k]=ge),ge}function p(R){const O=[],Q=[],Z=[];for(let k=0;k<t;k++)O[k]=0,Q[k]=0,Z[k]=0;return{geometry:null,program:null,wireframe:!1,newAttributes:O,enabledAttributes:Q,attributeDivisors:Z,object:R,attributes:{},index:null}}function S(R,O,Q,Z){const k=o.attributes,Y=O.attributes;let V=0;const $=Q.getAttributes();for(const ce in $)if($[ce].location>=0){const ve=k[ce];let xe=Y[ce];if(xe===void 0&&(ce==="instanceMatrix"&&R.instanceMatrix&&(xe=R.instanceMatrix),ce==="instanceColor"&&R.instanceColor&&(xe=R.instanceColor)),ve===void 0||ve.attribute!==xe||xe&&ve.data!==xe.data)return!0;V++}return o.attributesNum!==V||o.index!==Z}function b(R,O,Q,Z){const k={},Y=O.attributes;let V=0;const $=Q.getAttributes();for(const ce in $)if($[ce].location>=0){let ve=Y[ce];ve===void 0&&(ce==="instanceMatrix"&&R.instanceMatrix&&(ve=R.instanceMatrix),ce==="instanceColor"&&R.instanceColor&&(ve=R.instanceColor));const xe={};xe.attribute=ve,ve&&ve.data&&(xe.data=ve.data),k[ce]=xe,V++}o.attributes=k,o.attributesNum=V,o.index=Z}function G(){const R=o.newAttributes;for(let O=0,Q=R.length;O<Q;O++)R[O]=0}function f(R){s(R,0)}function s(R,O){const Q=o.newAttributes,Z=o.enabledAttributes,k=o.attributeDivisors;Q[R]=1,Z[R]===0&&(e.enableVertexAttribArray(R),Z[R]=1),k[R]!==O&&(e.vertexAttribDivisor(R,O),k[R]=O)}function F(){const R=o.newAttributes,O=o.enabledAttributes;for(let Q=0,Z=O.length;Q<Z;Q++)O[Q]!==R[Q]&&(e.disableVertexAttribArray(Q),O[Q]=0)}function y(R,O,Q,Z,k,Y,V){V===!0?e.vertexAttribIPointer(R,O,Q,k,Y):e.vertexAttribPointer(R,O,Q,Z,k,Y)}function h(R,O,Q,Z){G();const k=Z.attributes,Y=Q.getAttributes(),V=O.defaultAttributeValues;for(const $ in Y){const ce=Y[$];if(ce.location>=0){let ge=k[$];if(ge===void 0&&($==="instanceMatrix"&&R.instanceMatrix&&(ge=R.instanceMatrix),$==="instanceColor"&&R.instanceColor&&(ge=R.instanceColor)),ge!==void 0){const ve=ge.normalized,xe=ge.itemSize,Xe=n.get(ge);if(Xe===void 0)continue;const rt=Xe.buffer,He=Xe.type,K=Xe.bytesPerElement,te=He===e.INT||He===e.UNSIGNED_INT||ge.gpuType===Rr;if(ge.isInterleavedBufferAttribute){const J=ge.data,be=J.stride,Ce=ge.offset;if(J.isInstancedInterleavedBuffer){for(let Ae=0;Ae<ce.locationSize;Ae++)s(ce.location+Ae,J.meshPerAttribute);R.isInstancedMesh!==!0&&Z._maxInstanceCount===void 0&&(Z._maxInstanceCount=J.meshPerAttribute*J.count)}else for(let Ae=0;Ae<ce.locationSize;Ae++)f(ce.location+Ae);e.bindBuffer(e.ARRAY_BUFFER,rt);for(let Ae=0;Ae<ce.locationSize;Ae++)y(ce.location+Ae,xe/ce.locationSize,He,ve,be*K,(Ce+xe/ce.locationSize*Ae)*K,te)}else{if(ge.isInstancedBufferAttribute){for(let J=0;J<ce.locationSize;J++)s(ce.location+J,ge.meshPerAttribute);R.isInstancedMesh!==!0&&Z._maxInstanceCount===void 0&&(Z._maxInstanceCount=ge.meshPerAttribute*ge.count)}else for(let J=0;J<ce.locationSize;J++)f(ce.location+J);e.bindBuffer(e.ARRAY_BUFFER,rt);for(let J=0;J<ce.locationSize;J++)y(ce.location+J,xe/ce.locationSize,He,ve,xe*K,xe/ce.locationSize*J*K,te)}}else if(V!==void 0){const ve=V[$];if(ve!==void 0)switch(ve.length){case 2:e.vertexAttrib2fv(ce.location,ve);break;case 3:e.vertexAttrib3fv(ce.location,ve);break;case 4:e.vertexAttrib4fv(ce.location,ve);break;default:e.vertexAttrib1fv(ce.location,ve)}}}}F()}function A(){m();for(const R in i){const O=i[R];for(const Q in O){const Z=O[Q];for(const k in Z){const Y=Z[k];for(const V in Y)W(Y[V].object),delete Y[V];delete Z[k]}}delete i[R]}}function g(R){if(i[R.id]===void 0)return;const O=i[R.id];for(const Q in O){const Z=O[Q];for(const k in Z){const Y=Z[k];for(const V in Y)W(Y[V].object),delete Y[V];delete Z[k]}}delete i[R.id]}function P(R){for(const O in i){const Q=i[O];for(const Z in Q){const k=Q[Z];if(k[R.id]===void 0)continue;const Y=k[R.id];for(const V in Y)W(Y[V].object),delete Y[V];delete k[R.id]}}}function l(R){for(const O in i){const Q=i[O],Z=R.isInstancedMesh===!0?R.id:0,k=Q[Z];if(k!==void 0){for(const Y in k){const V=k[Y];for(const $ in V)W(V[$].object),delete V[$];delete k[Y]}delete Q[Z],Object.keys(Q).length===0&&delete i[O]}}}function m(){I(),d=!0,o!==c&&(o=c,M(o.object))}function I(){c.geometry=null,c.program=null,c.wireframe=!1}return{setup:_,reset:m,resetDefaultState:I,dispose:A,releaseStatesOfGeometry:g,releaseStatesOfObject:l,releaseStatesOfProgram:P,initAttributes:G,enableAttribute:f,disableUnusedAttributes:F}}function rc(e,n,t){let i;function c(C){i=C}function o(C,M){e.drawArrays(i,C,M),t.update(M,i,1)}function d(C,M,W){W!==0&&(e.drawArraysInstanced(i,C,M,W),t.update(M,i,W))}function _(C,M,W){if(W===0)return;n.get("WEBGL_multi_draw").multiDrawArraysWEBGL(i,C,0,M,0,W);let p=0;for(let S=0;S<W;S++)p+=M[S];t.update(p,i,1)}this.setMode=c,this.render=o,this.renderInstances=d,this.renderMultiDraw=_}function ac(e,n,t,i){let c;function o(){if(c!==void 0)return c;if(n.has("EXT_texture_filter_anisotropic")===!0){const P=n.get("EXT_texture_filter_anisotropic");c=e.getParameter(P.MAX_TEXTURE_MAX_ANISOTROPY_EXT)}else c=0;return c}function d(P){return!(P!==Ut&&i.convert(P)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_FORMAT))}function _(P){const l=P===Gt&&(n.has("EXT_color_buffer_half_float")||n.has("EXT_color_buffer_float"));return!(P!==bt&&i.convert(P)!==e.getParameter(e.IMPLEMENTATION_COLOR_READ_TYPE)&&P!==Ot&&!l)}function C(P){if(P==="highp"){if(e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.HIGH_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.HIGH_FLOAT).precision>0)return"highp";P="mediump"}return P==="mediump"&&e.getShaderPrecisionFormat(e.VERTEX_SHADER,e.MEDIUM_FLOAT).precision>0&&e.getShaderPrecisionFormat(e.FRAGMENT_SHADER,e.MEDIUM_FLOAT).precision>0?"mediump":"lowp"}let M=t.precision!==void 0?t.precision:"highp";const W=C(M);W!==M&&(Be("WebGLRenderer:",M,"not supported, using",W,"instead."),M=W);const D=t.logarithmicDepthBuffer===!0,p=t.reversedDepthBuffer===!0&&n.has("EXT_clip_control");t.reversedDepthBuffer===!0&&p===!1&&Be("WebGLRenderer: Unable to use reversed depth buffer due to missing EXT_clip_control extension. Fallback to default depth buffer.");const S=e.getParameter(e.MAX_TEXTURE_IMAGE_UNITS),b=e.getParameter(e.MAX_VERTEX_TEXTURE_IMAGE_UNITS),G=e.getParameter(e.MAX_TEXTURE_SIZE),f=e.getParameter(e.MAX_CUBE_MAP_TEXTURE_SIZE),s=e.getParameter(e.MAX_VERTEX_ATTRIBS),F=e.getParameter(e.MAX_VERTEX_UNIFORM_VECTORS),y=e.getParameter(e.MAX_VARYING_VECTORS),h=e.getParameter(e.MAX_FRAGMENT_UNIFORM_VECTORS),A=e.getParameter(e.MAX_SAMPLES),g=e.getParameter(e.SAMPLES);return{isWebGL2:!0,getMaxAnisotropy:o,getMaxPrecision:C,textureFormatReadable:d,textureTypeReadable:_,precision:M,logarithmicDepthBuffer:D,reversedDepthBuffer:p,maxTextures:S,maxVertexTextures:b,maxTextureSize:G,maxCubemapSize:f,maxAttributes:s,maxVertexUniforms:F,maxVaryings:y,maxFragmentUniforms:h,maxSamples:A,samples:g}}function oc(e){const n=this;let t=null,i=0,c=!1,o=!1;const d=new ya,_=new Ne,C={value:null,needsUpdate:!1};this.uniform=C,this.numPlanes=0,this.numIntersection=0,this.init=function(D,p){const S=D.length!==0||p||i!==0||c;return c=p,i=D.length,S},this.beginShadows=function(){o=!0,W(null)},this.endShadows=function(){o=!1},this.setGlobalState=function(D,p){t=W(D,p,0)},this.setState=function(D,p,S){const b=D.clippingPlanes,G=D.clipIntersection,f=D.clipShadows,s=e.get(D);if(!c||b===null||b.length===0||o&&!f)o?W(null):M();else{const F=o?0:i,y=F*4;let h=s.clippingState||null;C.value=h,h=W(b,p,y,S);for(let A=0;A!==y;++A)h[A]=t[A];s.clippingState=h,this.numIntersection=G?this.numPlanes:0,this.numPlanes+=F}};function M(){C.value!==t&&(C.value=t,C.needsUpdate=i>0),n.numPlanes=i,n.numIntersection=0}function W(D,p,S,b){const G=D!==null?D.length:0;let f=null;if(G!==0){if(f=C.value,b!==!0||f===null){const s=S+G*4,F=p.matrixWorldInverse;_.getNormalMatrix(F),(f===null||f.length<s)&&(f=new Float32Array(s));for(let y=0,h=S;y!==G;++y,h+=4)d.copy(D[y]).applyMatrix4(F,_),d.normal.toArray(f,h),f[h+3]=d.constant}C.value=f,C.needsUpdate=!0}return n.numPlanes=G,n.numIntersection=0,f}}const Bt=4,Ki=[.125,.215,.35,.446,.526,.582],Vt=20,sc=256,nn=new gr,qi=new $e;let Fn=null,On=0,Bn=0,Gn=!1;const lc=new Ie;class Zi{constructor(n){this._renderer=n,this._pingPongRenderTarget=null,this._lodMax=0,this._cubeSize=0,this._sizeLods=[],this._sigmas=[],this._lodMeshes=[],this._backgroundBox=null,this._cubemapMaterial=null,this._equirectMaterial=null,this._blurMaterial=null,this._ggxMaterial=null}fromScene(n,t=0,i=.1,c=100,o={}){const{size:d=256,position:_=lc}=o;Fn=this._renderer.getRenderTarget(),On=this._renderer.getActiveCubeFace(),Bn=this._renderer.getActiveMipmapLevel(),Gn=this._renderer.xr.enabled,this._renderer.xr.enabled=!1,this._setSize(d);const C=this._allocateTargets();return C.depthBuffer=!0,this._sceneToCubeUV(n,i,c,C,_),t>0&&this._blur(C,0,0,t),this._applyPMREM(C),this._cleanup(C),C}fromEquirectangular(n,t=null){return this._fromTexture(n,t)}fromCubemap(n,t=null){return this._fromTexture(n,t)}compileCubemapShader(){this._cubemapMaterial===null&&(this._cubemapMaterial=Ji(),this._compileMaterial(this._cubemapMaterial))}compileEquirectangularShader(){this._equirectMaterial===null&&(this._equirectMaterial=Qi(),this._compileMaterial(this._equirectMaterial))}dispose(){this._dispose(),this._cubemapMaterial!==null&&this._cubemapMaterial.dispose(),this._equirectMaterial!==null&&this._equirectMaterial.dispose(),this._backgroundBox!==null&&(this._backgroundBox.geometry.dispose(),this._backgroundBox.material.dispose())}_setSize(n){this._lodMax=Math.floor(Math.log2(n)),this._cubeSize=Math.pow(2,this._lodMax)}_dispose(){this._blurMaterial!==null&&this._blurMaterial.dispose(),this._ggxMaterial!==null&&this._ggxMaterial.dispose(),this._pingPongRenderTarget!==null&&this._pingPongRenderTarget.dispose();for(let n=0;n<this._lodMeshes.length;n++)this._lodMeshes[n].geometry.dispose()}_cleanup(n){this._renderer.setRenderTarget(Fn,On,Bn),this._renderer.xr.enabled=Gn,n.scissorTest=!1,Yt(n,0,0,n.width,n.height)}_fromTexture(n,t){n.mapping===fn||n.mapping===jt?this._setSize(n.image.length===0?16:n.image[0].width||n.image[0].image.width):this._setSize(n.image.width/4),Fn=this._renderer.getRenderTarget(),On=this._renderer.getActiveCubeFace(),Bn=this._renderer.getActiveMipmapLevel(),Gn=this._renderer.xr.enabled,this._renderer.xr.enabled=!1;const i=t||this._allocateTargets();return this._textureToCubeUV(n,i),this._applyPMREM(i),this._cleanup(i),i}_allocateTargets(){const n=3*Math.max(this._cubeSize,112),t=4*this._cubeSize,i={magFilter:vt,minFilter:vt,generateMipmaps:!1,type:Gt,format:Ut,colorSpace:Fr,depthBuffer:!1},c=$i(n,t,i);if(this._pingPongRenderTarget===null||this._pingPongRenderTarget.width!==n||this._pingPongRenderTarget.height!==t){this._pingPongRenderTarget!==null&&this._dispose(),this._pingPongRenderTarget=$i(n,t,i);const{_lodMax:o}=this;({lodMeshes:this._lodMeshes,sizeLods:this._sizeLods,sigmas:this._sigmas}=cc(o)),this._blurMaterial=dc(o,n,t),this._ggxMaterial=fc(o,n,t)}return c}_compileMaterial(n){const t=new wt(new Mn,n);this._renderer.compile(t,nn)}_sceneToCubeUV(n,t,i,c,o){const C=new _n(90,1,t,i),M=[1,-1,1,1,1,1],W=[1,1,1,-1,-1,-1],D=this._renderer,p=D.autoClear,S=D.toneMapping;D.getClearColor(qi),D.toneMapping=Ct,D.autoClear=!1,D.state.buffers.depth.getReversed()&&(D.setRenderTarget(c),D.clearDepth(),D.setRenderTarget(null)),this._backgroundBox===null&&(this._backgroundBox=new wt(new $n,new Ha({name:"PMREM.Background",side:St,depthWrite:!1,depthTest:!1})));const G=this._backgroundBox,f=G.material;let s=!1;const F=n.background;F?F.isColor&&(f.color.copy(F),n.background=null,s=!0):(f.color.copy(qi),s=!0);for(let y=0;y<6;y++){const h=y%3;h===0?(C.up.set(0,M[y],0),C.position.set(o.x,o.y,o.z),C.lookAt(o.x+W[y],o.y,o.z)):h===1?(C.up.set(0,0,M[y]),C.position.set(o.x,o.y,o.z),C.lookAt(o.x,o.y+W[y],o.z)):(C.up.set(0,M[y],0),C.position.set(o.x,o.y,o.z),C.lookAt(o.x,o.y,o.z+W[y]));const A=this._cubeSize;Yt(c,h*A,y>2?A:0,A,A),D.setRenderTarget(c),s&&D.render(G,C),D.render(n,C)}D.toneMapping=S,D.autoClear=p,n.background=F}_textureToCubeUV(n,t){const i=this._renderer,c=n.mapping===fn||n.mapping===jt;c?(this._cubemapMaterial===null&&(this._cubemapMaterial=Ji()),this._cubemapMaterial.uniforms.flipEnvMap.value=n.isRenderTargetTexture===!1?-1:1):this._equirectMaterial===null&&(this._equirectMaterial=Qi());const o=c?this._cubemapMaterial:this._equirectMaterial,d=this._lodMeshes[0];d.material=o;const _=o.uniforms;_.envMap.value=n;const C=this._cubeSize;Yt(t,0,0,3*C,2*C),i.setRenderTarget(t),i.render(d,nn)}_applyPMREM(n){const t=this._renderer,i=t.autoClear;t.autoClear=!1;const c=this._lodMeshes.length;for(let o=1;o<c;o++)this._applyGGXFilter(n,o-1,o);t.autoClear=i}_applyGGXFilter(n,t,i){const c=this._renderer,o=this._pingPongRenderTarget,d=this._ggxMaterial,_=this._lodMeshes[i];_.material=d;const C=d.uniforms,M=i/(this._lodMeshes.length-1),W=t/(this._lodMeshes.length-1),D=Math.sqrt(M*M-W*W),p=0+M*1.25,S=D*p,{_lodMax:b}=this,G=this._sizeLods[i],f=3*G*(i>b-Bt?i-b+Bt:0),s=4*(this._cubeSize-G);C.envMap.value=n.texture,C.roughness.value=S,C.mipInt.value=b-t,Yt(o,f,s,3*G,2*G),c.setRenderTarget(o),c.render(_,nn),C.envMap.value=o.texture,C.roughness.value=0,C.mipInt.value=b-i,Yt(n,f,s,3*G,2*G),c.setRenderTarget(n),c.render(_,nn)}_blur(n,t,i,c,o){const d=this._pingPongRenderTarget;this._halfBlur(n,d,t,i,c,"latitudinal",o),this._halfBlur(d,n,i,i,c,"longitudinal",o)}_halfBlur(n,t,i,c,o,d,_){const C=this._renderer,M=this._blurMaterial;d!=="latitudinal"&&d!=="longitudinal"&&Ze("blur direction must be either latitudinal or longitudinal!");const W=3,D=this._lodMeshes[c];D.material=M;const p=M.uniforms,S=this._sizeLods[i]-1,b=isFinite(o)?Math.PI/(2*S):2*Math.PI/(2*Vt-1),G=o/b,f=isFinite(o)?1+Math.floor(W*G):Vt;f>Vt&&Be(`sigmaRadians, ${o}, is too large and will clip, as it requested ${f} samples when the maximum is set to ${Vt}`);const s=[];let F=0;for(let P=0;P<Vt;++P){const l=P/G,m=Math.exp(-l*l/2);s.push(m),P===0?F+=m:P<f&&(F+=2*m)}for(let P=0;P<s.length;P++)s[P]=s[P]/F;p.envMap.value=n.texture,p.samples.value=f,p.weights.value=s,p.latitudinal.value=d==="latitudinal",_&&(p.poleAxis.value=_);const{_lodMax:y}=this;p.dTheta.value=b,p.mipInt.value=y-i;const h=this._sizeLods[c],A=3*h*(c>y-Bt?c-y+Bt:0),g=4*(this._cubeSize-h);Yt(t,A,g,3*h,2*h),C.setRenderTarget(t),C.render(D,nn)}}function cc(e){const n=[],t=[],i=[];let c=e;const o=e-Bt+1+Ki.length;for(let d=0;d<o;d++){const _=Math.pow(2,c);n.push(_);let C=1/_;d>e-Bt?C=Ki[d-e+Bt-1]:d===0&&(C=0),t.push(C);const M=1/(_-2),W=-M,D=1+M,p=[W,W,D,W,D,D,W,W,D,D,W,D],S=6,b=6,G=3,f=2,s=1,F=new Float32Array(G*b*S),y=new Float32Array(f*b*S),h=new Float32Array(s*b*S);for(let g=0;g<S;g++){const P=g%3*2/3-1,l=g>2?0:-1,m=[P,l,0,P+2/3,l,0,P+2/3,l+1,0,P,l,0,P+2/3,l+1,0,P,l+1,0];F.set(m,G*b*g),y.set(p,f*b*g);const I=[g,g,g,g,g,g];h.set(I,s*b*g)}const A=new Mn;A.setAttribute("position",new gn(F,G)),A.setAttribute("uv",new gn(y,f)),A.setAttribute("faceIndex",new gn(h,s)),i.push(new wt(A,null)),c>Bt&&c--}return{lodMeshes:i,sizeLods:n,sigmas:t}}function $i(e,n,t){const i=new Pt(e,n,t);return i.texture.mapping=Tn,i.texture.name="PMREM.cubeUv",i.scissorTest=!0,i}function Yt(e,n,t,i,c){e.viewport.set(n,t,i,c),e.scissor.set(n,t,i,c)}function fc(e,n,t){return new It({name:"PMREMGGXConvolution",defines:{GGX_SAMPLES:sc,CUBEUV_TEXEL_WIDTH:1/n,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},roughness:{value:0},mipInt:{value:0}},vertexShader:An(),fragmentShader:`

			precision highp float;
			precision highp int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform float roughness;
			uniform float mipInt;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			#define PI 3.14159265359

			// Van der Corput radical inverse
			float radicalInverse_VdC(uint bits) {
				bits = (bits << 16u) | (bits >> 16u);
				bits = ((bits & 0x55555555u) << 1u) | ((bits & 0xAAAAAAAAu) >> 1u);
				bits = ((bits & 0x33333333u) << 2u) | ((bits & 0xCCCCCCCCu) >> 2u);
				bits = ((bits & 0x0F0F0F0Fu) << 4u) | ((bits & 0xF0F0F0F0u) >> 4u);
				bits = ((bits & 0x00FF00FFu) << 8u) | ((bits & 0xFF00FF00u) >> 8u);
				return float(bits) * 2.3283064365386963e-10; // / 0x100000000
			}

			// Hammersley sequence
			vec2 hammersley(uint i, uint N) {
				return vec2(float(i) / float(N), radicalInverse_VdC(i));
			}

			// GGX VNDF importance sampling (Eric Heitz 2018)
			// "Sampling the GGX Distribution of Visible Normals"
			// https://jcgt.org/published/0007/04/01/
			vec3 importanceSampleGGX_VNDF(vec2 Xi, vec3 V, float roughness) {
				float alpha = roughness * roughness;

				// Section 4.1: Orthonormal basis
				vec3 T1 = vec3(1.0, 0.0, 0.0);
				vec3 T2 = cross(V, T1);

				// Section 4.2: Parameterization of projected area
				float r = sqrt(Xi.x);
				float phi = 2.0 * PI * Xi.y;
				float t1 = r * cos(phi);
				float t2 = r * sin(phi);
				float s = 0.5 * (1.0 + V.z);
				t2 = (1.0 - s) * sqrt(1.0 - t1 * t1) + s * t2;

				// Section 4.3: Reprojection onto hemisphere
				vec3 Nh = t1 * T1 + t2 * T2 + sqrt(max(0.0, 1.0 - t1 * t1 - t2 * t2)) * V;

				// Section 3.4: Transform back to ellipsoid configuration
				return normalize(vec3(alpha * Nh.x, alpha * Nh.y, max(0.0, Nh.z)));
			}

			void main() {
				vec3 N = normalize(vOutputDirection);
				vec3 V = N; // Assume view direction equals normal for pre-filtering

				vec3 prefilteredColor = vec3(0.0);
				float totalWeight = 0.0;

				// For very low roughness, just sample the environment directly
				if (roughness < 0.001) {
					gl_FragColor = vec4(bilinearCubeUV(envMap, N, mipInt), 1.0);
					return;
				}

				// Tangent space basis for VNDF sampling
				vec3 up = abs(N.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
				vec3 tangent = normalize(cross(up, N));
				vec3 bitangent = cross(N, tangent);

				for(uint i = 0u; i < uint(GGX_SAMPLES); i++) {
					vec2 Xi = hammersley(i, uint(GGX_SAMPLES));

					// For PMREM, V = N, so in tangent space V is always (0, 0, 1)
					vec3 H_tangent = importanceSampleGGX_VNDF(Xi, vec3(0.0, 0.0, 1.0), roughness);

					// Transform H back to world space
					vec3 H = normalize(tangent * H_tangent.x + bitangent * H_tangent.y + N * H_tangent.z);
					vec3 L = normalize(2.0 * dot(V, H) * H - V);

					float NdotL = max(dot(N, L), 0.0);

					if(NdotL > 0.0) {
						// Sample environment at fixed mip level
						// VNDF importance sampling handles the distribution filtering
						vec3 sampleColor = bilinearCubeUV(envMap, L, mipInt);

						// Weight by NdotL for the split-sum approximation
						// VNDF PDF naturally accounts for the visible microfacet distribution
						prefilteredColor += sampleColor * NdotL;
						totalWeight += NdotL;
					}
				}

				if (totalWeight > 0.0) {
					prefilteredColor = prefilteredColor / totalWeight;
				}

				gl_FragColor = vec4(prefilteredColor, 1.0);
			}
		`,blending:Dt,depthTest:!1,depthWrite:!1})}function dc(e,n,t){const i=new Float32Array(Vt),c=new Ie(0,1,0);return new It({name:"SphericalGaussianBlur",defines:{n:Vt,CUBEUV_TEXEL_WIDTH:1/n,CUBEUV_TEXEL_HEIGHT:1/t,CUBEUV_MAX_MIP:`${e}.0`},uniforms:{envMap:{value:null},samples:{value:1},weights:{value:i},latitudinal:{value:!1},dTheta:{value:0},mipInt:{value:0},poleAxis:{value:c}},vertexShader:An(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;
			uniform int samples;
			uniform float weights[ n ];
			uniform bool latitudinal;
			uniform float dTheta;
			uniform float mipInt;
			uniform vec3 poleAxis;

			#define ENVMAP_TYPE_CUBE_UV
			#include <cube_uv_reflection_fragment>

			vec3 getSample( float theta, vec3 axis ) {

				float cosTheta = cos( theta );
				// Rodrigues' axis-angle rotation
				vec3 sampleDirection = vOutputDirection * cosTheta
					+ cross( axis, vOutputDirection ) * sin( theta )
					+ axis * dot( axis, vOutputDirection ) * ( 1.0 - cosTheta );

				return bilinearCubeUV( envMap, sampleDirection, mipInt );

			}

			void main() {

				vec3 axis = latitudinal ? poleAxis : cross( poleAxis, vOutputDirection );

				if ( all( equal( axis, vec3( 0.0 ) ) ) ) {

					axis = vec3( vOutputDirection.z, 0.0, - vOutputDirection.x );

				}

				axis = normalize( axis );

				gl_FragColor = vec4( 0.0, 0.0, 0.0, 1.0 );
				gl_FragColor.rgb += weights[ 0 ] * getSample( 0.0, axis );

				for ( int i = 1; i < n; i++ ) {

					if ( i >= samples ) {

						break;

					}

					float theta = dTheta * float( i );
					gl_FragColor.rgb += weights[ i ] * getSample( -1.0 * theta, axis );
					gl_FragColor.rgb += weights[ i ] * getSample( theta, axis );

				}

			}
		`,blending:Dt,depthTest:!1,depthWrite:!1})}function Qi(){return new It({name:"EquirectangularToCubeUV",uniforms:{envMap:{value:null}},vertexShader:An(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			varying vec3 vOutputDirection;

			uniform sampler2D envMap;

			#include <common>

			void main() {

				vec3 outputDirection = normalize( vOutputDirection );
				vec2 uv = equirectUv( outputDirection );

				gl_FragColor = vec4( texture2D ( envMap, uv ).rgb, 1.0 );

			}
		`,blending:Dt,depthTest:!1,depthWrite:!1})}function Ji(){return new It({name:"CubemapToCubeUV",uniforms:{envMap:{value:null},flipEnvMap:{value:-1}},vertexShader:An(),fragmentShader:`

			precision mediump float;
			precision mediump int;

			uniform float flipEnvMap;

			varying vec3 vOutputDirection;

			uniform samplerCube envMap;

			void main() {

				gl_FragColor = textureCube( envMap, vec3( flipEnvMap * vOutputDirection.x, vOutputDirection.yz ) );

			}
		`,blending:Dt,depthTest:!1,depthWrite:!1})}function An(){return`

		precision mediump float;
		precision mediump int;

		attribute float faceIndex;

		varying vec3 vOutputDirection;

		// RH coordinate system; PMREM face-indexing convention
		vec3 getDirection( vec2 uv, float face ) {

			uv = 2.0 * uv - 1.0;

			vec3 direction = vec3( uv, 1.0 );

			if ( face == 0.0 ) {

				direction = direction.zyx; // ( 1, v, u ) pos x

			} else if ( face == 1.0 ) {

				direction = direction.xzy;
				direction.xz *= -1.0; // ( -u, 1, -v ) pos y

			} else if ( face == 2.0 ) {

				direction.x *= -1.0; // ( -u, v, 1 ) pos z

			} else if ( face == 3.0 ) {

				direction = direction.zyx;
				direction.xz *= -1.0; // ( -1, v, -u ) neg x

			} else if ( face == 4.0 ) {

				direction = direction.xzy;
				direction.xy *= -1.0; // ( -u, -1, v ) neg y

			} else if ( face == 5.0 ) {

				direction.z *= -1.0; // ( u, v, -1 ) neg z

			}

			return direction;

		}

		void main() {

			vOutputDirection = getDirection( uv, faceIndex );
			gl_Position = vec4( position, 1.0 );

		}
	`}class Hr extends Pt{constructor(n=1,t={}){super(n,n,t),this.isWebGLCubeRenderTarget=!0;const i={width:n,height:n,depth:1},c=[i,i,i,i,i,i];this.texture=new Pr(c),this._setTextureOptions(t),this.texture.isRenderTargetTexture=!0}fromEquirectangularTexture(n,t){this.texture.type=t.type,this.texture.colorSpace=t.colorSpace,this.texture.generateMipmaps=t.generateMipmaps,this.texture.minFilter=t.minFilter,this.texture.magFilter=t.magFilter;const i={uniforms:{tEquirect:{value:null}},vertexShader:`

				varying vec3 vWorldDirection;

				vec3 transformDirection( in vec3 dir, in mat4 matrix ) {

					return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );

				}

				void main() {

					vWorldDirection = transformDirection( position, modelMatrix );

					#include <begin_vertex>
					#include <project_vertex>

				}
			`,fragmentShader:`

				uniform sampler2D tEquirect;

				varying vec3 vWorldDirection;

				#include <common>

				void main() {

					vec3 direction = normalize( vWorldDirection );

					vec2 sampleUV = equirectUv( direction );

					gl_FragColor = texture2D( tEquirect, sampleUV );

				}
			`},c=new $n(5,5,5),o=new It({name:"CubemapFromEquirect",uniforms:Xn(i.uniforms),vertexShader:i.vertexShader,fragmentShader:i.fragmentShader,side:St,blending:Dt});o.uniforms.tEquirect.value=t;const d=new wt(c,o),_=t.minFilter;return t.minFilter===qt&&(t.minFilter=vt),new oo(1,10,this).update(n,d),t.minFilter=_,d.geometry.dispose(),d.material.dispose(),this}clear(n,t=!0,i=!0,c=!0){const o=n.getRenderTarget();for(let d=0;d<6;d++)n.setRenderTarget(this,d),n.clear(t,i,c);n.setRenderTarget(o)}}function uc(e){let n=new WeakMap,t=new WeakMap,i=null;function c(p,S=!1){return p==null?null:S?d(p):o(p)}function o(p){if(p&&p.isTexture){const S=p.mapping;if(S===Nn||S===yn)if(n.has(p)){const b=n.get(p).texture;return _(b,p.mapping)}else{const b=p.image;if(b&&b.height>0){const G=new Hr(b.height);return G.fromEquirectangularTexture(e,p),n.set(p,G),p.addEventListener("dispose",M),_(G.texture,p.mapping)}else return null}}return p}function d(p){if(p&&p.isTexture){const S=p.mapping,b=S===Nn||S===yn,G=S===fn||S===jt;if(b||G){let f=t.get(p);const s=f!==void 0?f.texture.pmremVersion:0;if(p.isRenderTargetTexture&&p.pmremVersion!==s)return i===null&&(i=new Zi(e)),f=b?i.fromEquirectangular(p,f):i.fromCubemap(p,f),f.texture.pmremVersion=p.pmremVersion,t.set(p,f),f.texture;if(f!==void 0)return f.texture;{const F=p.image;return b&&F&&F.height>0||G&&F&&C(F)?(i===null&&(i=new Zi(e)),f=b?i.fromEquirectangular(p):i.fromCubemap(p),f.texture.pmremVersion=p.pmremVersion,t.set(p,f),p.addEventListener("dispose",W),f.texture):null}}}return p}function _(p,S){return S===Nn?p.mapping=fn:S===yn&&(p.mapping=jt),p}function C(p){let S=0;const b=6;for(let G=0;G<b;G++)p[G]!==void 0&&S++;return S===b}function M(p){const S=p.target;S.removeEventListener("dispose",M);const b=n.get(S);b!==void 0&&(n.delete(S),b.dispose())}function W(p){const S=p.target;S.removeEventListener("dispose",W);const b=t.get(S);b!==void 0&&(t.delete(S),b.dispose())}function D(){n=new WeakMap,t=new WeakMap,i!==null&&(i.dispose(),i=null)}return{get:c,dispose:D}}function pc(e){const n={};function t(i){if(n[i]!==void 0)return n[i];const c=e.getExtension(i);return n[i]=c,c}return{has:function(i){return t(i)!==null},init:function(){t("EXT_color_buffer_float"),t("WEBGL_clip_cull_distance"),t("OES_texture_float_linear"),t("EXT_color_buffer_half_float"),t("WEBGL_multisampled_render_to_texture"),t("WEBGL_render_shared_exponent")},get:function(i){const c=t(i);return c===null&&la("WebGLRenderer: "+i+" extension not supported."),c}}}function hc(e,n,t,i){const c={},o=new WeakMap;function d(D){const p=D.target;p.index!==null&&n.remove(p.index);for(const b in p.attributes)n.remove(p.attributes[b]);p.removeEventListener("dispose",d),delete c[p.id];const S=o.get(p);S&&(n.remove(S),o.delete(p)),i.releaseStatesOfGeometry(p),p.isInstancedBufferGeometry===!0&&delete p._maxInstanceCount,t.memory.geometries--}function _(D,p){return c[p.id]===!0||(p.addEventListener("dispose",d),c[p.id]=!0,t.memory.geometries++),p}function C(D){const p=D.attributes;for(const S in p)n.update(p[S],e.ARRAY_BUFFER)}function M(D){const p=[],S=D.index,b=D.attributes.position;let G=0;if(b===void 0)return;if(S!==null){const F=S.array;G=S.version;for(let y=0,h=F.length;y<h;y+=3){const A=F[y+0],g=F[y+1],P=F[y+2];p.push(A,g,g,P,P,A)}}else{const F=b.array;G=b.version;for(let y=0,h=F.length/3-1;y<h;y+=3){const A=y+0,g=y+1,P=y+2;p.push(A,g,g,P,P,A)}}const f=new(b.count>=65535?so:lo)(p,1);f.version=G;const s=o.get(D);s&&n.remove(s),o.set(D,f)}function W(D){const p=o.get(D);if(p){const S=D.index;S!==null&&p.version<S.version&&M(D)}else M(D);return o.get(D)}return{get:_,update:C,getWireframeAttribute:W}}function mc(e,n,t){let i;function c(D){i=D}let o,d;function _(D){o=D.type,d=D.bytesPerElement}function C(D,p){e.drawElements(i,p,o,D*d),t.update(p,i,1)}function M(D,p,S){S!==0&&(e.drawElementsInstanced(i,p,o,D*d,S),t.update(p,i,S))}function W(D,p,S){if(S===0)return;n.get("WEBGL_multi_draw").multiDrawElementsWEBGL(i,p,0,o,D,0,S);let G=0;for(let f=0;f<S;f++)G+=p[f];t.update(G,i,1)}this.setMode=c,this.setIndex=_,this.render=C,this.renderInstances=M,this.renderMultiDraw=W}function _c(e){const n={geometries:0,textures:0},t={frame:0,calls:0,triangles:0,points:0,lines:0};function i(o,d,_){switch(t.calls++,d){case e.TRIANGLES:t.triangles+=_*(o/3);break;case e.LINES:t.lines+=_*(o/2);break;case e.LINE_STRIP:t.lines+=_*(o-1);break;case e.LINE_LOOP:t.lines+=_*o;break;case e.POINTS:t.points+=_*o;break;default:Ze("WebGLInfo: Unknown draw mode:",d);break}}function c(){t.calls=0,t.triangles=0,t.points=0,t.lines=0}return{memory:n,render:t,programs:null,autoReset:!0,reset:c,update:i}}function gc(e,n,t){const i=new WeakMap,c=new mt;function o(d,_,C){const M=d.morphTargetInfluences,W=_.morphAttributes.position||_.morphAttributes.normal||_.morphAttributes.color,D=W!==void 0?W.length:0;let p=i.get(_);if(p===void 0||p.count!==D){let m=function(){P.dispose(),i.delete(_),_.removeEventListener("dispose",m)};p!==void 0&&p.texture.dispose();const S=_.morphAttributes.position!==void 0,b=_.morphAttributes.normal!==void 0,G=_.morphAttributes.color!==void 0,f=_.morphAttributes.position||[],s=_.morphAttributes.normal||[],F=_.morphAttributes.color||[];let y=0;S===!0&&(y=1),b===!0&&(y=2),G===!0&&(y=3);let h=_.attributes.position.count*y,A=1;h>n.maxTextureSize&&(A=Math.ceil(h/n.maxTextureSize),h=n.maxTextureSize);const g=new Float32Array(h*A*4*D),P=new br(g,h,A,D);P.type=Ot,P.needsUpdate=!0;const l=y*4;for(let I=0;I<D;I++){const R=f[I],O=s[I],Q=F[I],Z=h*A*4*I;for(let k=0;k<R.count;k++){const Y=k*l;S===!0&&(c.fromBufferAttribute(R,k),g[Z+Y+0]=c.x,g[Z+Y+1]=c.y,g[Z+Y+2]=c.z,g[Z+Y+3]=0),b===!0&&(c.fromBufferAttribute(O,k),g[Z+Y+4]=c.x,g[Z+Y+5]=c.y,g[Z+Y+6]=c.z,g[Z+Y+7]=0),G===!0&&(c.fromBufferAttribute(Q,k),g[Z+Y+8]=c.x,g[Z+Y+9]=c.y,g[Z+Y+10]=c.z,g[Z+Y+11]=Q.itemSize===4?c.w:1)}}p={count:D,texture:P,size:new _t(h,A)},i.set(_,p),_.addEventListener("dispose",m)}if(d.isInstancedMesh===!0&&d.morphTexture!==null)C.getUniforms().setValue(e,"morphTexture",d.morphTexture,t);else{let S=0;for(let G=0;G<M.length;G++)S+=M[G];const b=_.morphTargetsRelative?1:1-S;C.getUniforms().setValue(e,"morphTargetBaseInfluence",b),C.getUniforms().setValue(e,"morphTargetInfluences",M)}C.getUniforms().setValue(e,"morphTargetsTexture",p.texture,t),C.getUniforms().setValue(e,"morphTargetsTextureSize",p.size)}return{update:o}}function vc(e,n,t,i,c){let o=new WeakMap;function d(M){const W=c.render.frame,D=M.geometry,p=n.get(M,D);if(o.get(p)!==W&&(n.update(p),o.set(p,W)),M.isInstancedMesh&&(M.hasEventListener("dispose",C)===!1&&M.addEventListener("dispose",C),o.get(M)!==W&&(t.update(M.instanceMatrix,e.ARRAY_BUFFER),M.instanceColor!==null&&t.update(M.instanceColor,e.ARRAY_BUFFER),o.set(M,W))),M.isSkinnedMesh){const S=M.skeleton;o.get(S)!==W&&(S.update(),o.set(S,W))}return p}function _(){o=new WeakMap}function C(M){const W=M.target;W.removeEventListener("dispose",C),i.releaseStatesOfObject(W),t.remove(W.instanceMatrix),W.instanceColor!==null&&t.remove(W.instanceColor)}return{update:d,dispose:_}}const Sc={[yr]:"LINEAR_TONE_MAPPING",[Nr]:"REINHARD_TONE_MAPPING",[Ir]:"CINEON_TONE_MAPPING",[wr]:"ACES_FILMIC_TONE_MAPPING",[Dr]:"AGX_TONE_MAPPING",[Ur]:"NEUTRAL_TONE_MAPPING",[Lr]:"CUSTOM_TONE_MAPPING"};function Ec(e,n,t,i,c,o){const d=new Pt(n,t,{type:e,depthBuffer:c,stencilBuffer:o,samples:i?4:0,depthTexture:c?new ln(n,t):void 0}),_=new Pt(n,t,{type:Gt,depthBuffer:!1,stencilBuffer:!1}),C=new Mn;C.setAttribute("position",new li([-1,3,0,-1,-1,0,3,-1,0],3)),C.setAttribute("uv",new li([0,2,0,0,2,0],2));const M=new ia({uniforms:{tDiffuse:{value:null}},vertexShader:`
			precision highp float;

			uniform mat4 modelViewMatrix;
			uniform mat4 projectionMatrix;

			attribute vec3 position;
			attribute vec2 uv;

			varying vec2 vUv;

			void main() {
				vUv = uv;
				gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
			}`,fragmentShader:`
			precision highp float;

			uniform sampler2D tDiffuse;

			varying vec2 vUv;

			#include <tonemapping_pars_fragment>
			#include <colorspace_pars_fragment>

			void main() {
				gl_FragColor = texture2D( tDiffuse, vUv );

				#ifdef LINEAR_TONE_MAPPING
					gl_FragColor.rgb = LinearToneMapping( gl_FragColor.rgb );
				#elif defined( REINHARD_TONE_MAPPING )
					gl_FragColor.rgb = ReinhardToneMapping( gl_FragColor.rgb );
				#elif defined( CINEON_TONE_MAPPING )
					gl_FragColor.rgb = CineonToneMapping( gl_FragColor.rgb );
				#elif defined( ACES_FILMIC_TONE_MAPPING )
					gl_FragColor.rgb = ACESFilmicToneMapping( gl_FragColor.rgb );
				#elif defined( AGX_TONE_MAPPING )
					gl_FragColor.rgb = AgXToneMapping( gl_FragColor.rgb );
				#elif defined( NEUTRAL_TONE_MAPPING )
					gl_FragColor.rgb = NeutralToneMapping( gl_FragColor.rgb );
				#elif defined( CUSTOM_TONE_MAPPING )
					gl_FragColor.rgb = CustomToneMapping( gl_FragColor.rgb );
				#endif

				#ifdef SRGB_TRANSFER
					gl_FragColor = sRGBTransferOETF( gl_FragColor );
				#endif
			}`,depthTest:!1,depthWrite:!1}),W=new wt(C,M),D=new gr(-1,1,1,-1,0,1);let p=null,S=null,b=!1,G,f=null,s=[],F=!1;this.setSize=function(y,h){d.setSize(y,h),_.setSize(y,h);for(let A=0;A<s.length;A++){const g=s[A];g.setSize&&g.setSize(y,h)}},this.setEffects=function(y){s=y,F=s.length>0&&s[0].isRenderPass===!0;const h=d.width,A=d.height;for(let g=0;g<s.length;g++){const P=s[g];P.setSize&&P.setSize(h,A)}},this.begin=function(y,h){if(b||y.toneMapping===Ct&&s.length===0)return!1;if(f=h,h!==null){const A=h.width,g=h.height;(d.width!==A||d.height!==g)&&this.setSize(A,g)}return F===!1&&y.setRenderTarget(d),G=y.toneMapping,y.toneMapping=Ct,!0},this.hasRenderPass=function(){return F},this.end=function(y,h){y.toneMapping=G,b=!0;let A=d,g=_;for(let P=0;P<s.length;P++){const l=s[P];if(l.enabled!==!1&&(l.render(y,g,A,h),l.needsSwap!==!1)){const m=A;A=g,g=m}}if(p!==y.outputColorSpace||S!==y.toneMapping){p=y.outputColorSpace,S=y.toneMapping,M.defines={},Qe.getTransfer(p)===qe&&(M.defines.SRGB_TRANSFER="");const P=Sc[S];P&&(M.defines[P]=""),M.needsUpdate=!0}M.uniforms.tDiffuse.value=A.texture,y.setRenderTarget(f),y.render(W,D),f=null,b=!1},this.isCompositing=function(){return b},this.dispose=function(){d.depthTexture&&d.depthTexture.dispose(),d.dispose(),_.dispose(),C.dispose(),M.dispose()}}const Vr=new _o,Yn=new ln(1,1),Wr=new br,kr=new fo,zr=new Pr,ji=[],er=[],tr=new Float32Array(16),nr=new Float32Array(9),ir=new Float32Array(4);function en(e,n,t){const i=e[0];if(i<=0||i>0)return e;const c=n*t;let o=ji[c];if(o===void 0&&(o=new Float32Array(c),ji[c]=o),n!==0){i.toArray(o,0);for(let d=1,_=0;d!==n;++d)_+=t,e[d].toArray(o,_)}return o}function lt(e,n){if(e.length!==n.length)return!1;for(let t=0,i=e.length;t<i;t++)if(e[t]!==n[t])return!1;return!0}function ct(e,n){for(let t=0,i=n.length;t<i;t++)e[t]=n[t]}function Rn(e,n){let t=er[n];t===void 0&&(t=new Int32Array(n),er[n]=t);for(let i=0;i!==n;++i)t[i]=e.allocateTextureUnit();return t}function xc(e,n){const t=this.cache;t[0]!==n&&(e.uniform1f(this.addr,n),t[0]=n)}function Mc(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y)&&(e.uniform2f(this.addr,n.x,n.y),t[0]=n.x,t[1]=n.y);else{if(lt(t,n))return;e.uniform2fv(this.addr,n),ct(t,n)}}function Tc(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z)&&(e.uniform3f(this.addr,n.x,n.y,n.z),t[0]=n.x,t[1]=n.y,t[2]=n.z);else if(n.r!==void 0)(t[0]!==n.r||t[1]!==n.g||t[2]!==n.b)&&(e.uniform3f(this.addr,n.r,n.g,n.b),t[0]=n.r,t[1]=n.g,t[2]=n.b);else{if(lt(t,n))return;e.uniform3fv(this.addr,n),ct(t,n)}}function Ac(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z||t[3]!==n.w)&&(e.uniform4f(this.addr,n.x,n.y,n.z,n.w),t[0]=n.x,t[1]=n.y,t[2]=n.z,t[3]=n.w);else{if(lt(t,n))return;e.uniform4fv(this.addr,n),ct(t,n)}}function Rc(e,n){const t=this.cache,i=n.elements;if(i===void 0){if(lt(t,n))return;e.uniformMatrix2fv(this.addr,!1,n),ct(t,n)}else{if(lt(t,i))return;ir.set(i),e.uniformMatrix2fv(this.addr,!1,ir),ct(t,i)}}function bc(e,n){const t=this.cache,i=n.elements;if(i===void 0){if(lt(t,n))return;e.uniformMatrix3fv(this.addr,!1,n),ct(t,n)}else{if(lt(t,i))return;nr.set(i),e.uniformMatrix3fv(this.addr,!1,nr),ct(t,i)}}function Cc(e,n){const t=this.cache,i=n.elements;if(i===void 0){if(lt(t,n))return;e.uniformMatrix4fv(this.addr,!1,n),ct(t,n)}else{if(lt(t,i))return;tr.set(i),e.uniformMatrix4fv(this.addr,!1,tr),ct(t,i)}}function Pc(e,n){const t=this.cache;t[0]!==n&&(e.uniform1i(this.addr,n),t[0]=n)}function Lc(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y)&&(e.uniform2i(this.addr,n.x,n.y),t[0]=n.x,t[1]=n.y);else{if(lt(t,n))return;e.uniform2iv(this.addr,n),ct(t,n)}}function Uc(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z)&&(e.uniform3i(this.addr,n.x,n.y,n.z),t[0]=n.x,t[1]=n.y,t[2]=n.z);else{if(lt(t,n))return;e.uniform3iv(this.addr,n),ct(t,n)}}function Dc(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z||t[3]!==n.w)&&(e.uniform4i(this.addr,n.x,n.y,n.z,n.w),t[0]=n.x,t[1]=n.y,t[2]=n.z,t[3]=n.w);else{if(lt(t,n))return;e.uniform4iv(this.addr,n),ct(t,n)}}function wc(e,n){const t=this.cache;t[0]!==n&&(e.uniform1ui(this.addr,n),t[0]=n)}function Ic(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y)&&(e.uniform2ui(this.addr,n.x,n.y),t[0]=n.x,t[1]=n.y);else{if(lt(t,n))return;e.uniform2uiv(this.addr,n),ct(t,n)}}function Nc(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z)&&(e.uniform3ui(this.addr,n.x,n.y,n.z),t[0]=n.x,t[1]=n.y,t[2]=n.z);else{if(lt(t,n))return;e.uniform3uiv(this.addr,n),ct(t,n)}}function yc(e,n){const t=this.cache;if(n.x!==void 0)(t[0]!==n.x||t[1]!==n.y||t[2]!==n.z||t[3]!==n.w)&&(e.uniform4ui(this.addr,n.x,n.y,n.z,n.w),t[0]=n.x,t[1]=n.y,t[2]=n.z,t[3]=n.w);else{if(lt(t,n))return;e.uniform4uiv(this.addr,n),ct(t,n)}}function Fc(e,n,t){const i=this.cache,c=t.allocateTextureUnit();i[0]!==c&&(e.uniform1i(this.addr,c),i[0]=c);let o;this.type===e.SAMPLER_2D_SHADOW?(Yn.compareFunction=t.isReversedDepthBuffer()?qn:Zn,o=Yn):o=Vr,t.setTexture2D(n||o,c)}function Oc(e,n,t){const i=this.cache,c=t.allocateTextureUnit();i[0]!==c&&(e.uniform1i(this.addr,c),i[0]=c),t.setTexture3D(n||kr,c)}function Bc(e,n,t){const i=this.cache,c=t.allocateTextureUnit();i[0]!==c&&(e.uniform1i(this.addr,c),i[0]=c),t.setTextureCube(n||zr,c)}function Gc(e,n,t){const i=this.cache,c=t.allocateTextureUnit();i[0]!==c&&(e.uniform1i(this.addr,c),i[0]=c),t.setTexture2DArray(n||Wr,c)}function Hc(e){switch(e){case 5126:return xc;case 35664:return Mc;case 35665:return Tc;case 35666:return Ac;case 35674:return Rc;case 35675:return bc;case 35676:return Cc;case 5124:case 35670:return Pc;case 35667:case 35671:return Lc;case 35668:case 35672:return Uc;case 35669:case 35673:return Dc;case 5125:return wc;case 36294:return Ic;case 36295:return Nc;case 36296:return yc;case 35678:case 36198:case 36298:case 36306:case 35682:return Fc;case 35679:case 36299:case 36307:return Oc;case 35680:case 36300:case 36308:case 36293:return Bc;case 36289:case 36303:case 36311:case 36292:return Gc}}function Vc(e,n){e.uniform1fv(this.addr,n)}function Wc(e,n){const t=en(n,this.size,2);e.uniform2fv(this.addr,t)}function kc(e,n){const t=en(n,this.size,3);e.uniform3fv(this.addr,t)}function zc(e,n){const t=en(n,this.size,4);e.uniform4fv(this.addr,t)}function Xc(e,n){const t=en(n,this.size,4);e.uniformMatrix2fv(this.addr,!1,t)}function Yc(e,n){const t=en(n,this.size,9);e.uniformMatrix3fv(this.addr,!1,t)}function Kc(e,n){const t=en(n,this.size,16);e.uniformMatrix4fv(this.addr,!1,t)}function qc(e,n){e.uniform1iv(this.addr,n)}function Zc(e,n){e.uniform2iv(this.addr,n)}function $c(e,n){e.uniform3iv(this.addr,n)}function Qc(e,n){e.uniform4iv(this.addr,n)}function Jc(e,n){e.uniform1uiv(this.addr,n)}function jc(e,n){e.uniform2uiv(this.addr,n)}function ef(e,n){e.uniform3uiv(this.addr,n)}function tf(e,n){e.uniform4uiv(this.addr,n)}function nf(e,n,t){const i=this.cache,c=n.length,o=Rn(t,c);lt(i,o)||(e.uniform1iv(this.addr,o),ct(i,o));let d;this.type===e.SAMPLER_2D_SHADOW?d=Yn:d=Vr;for(let _=0;_!==c;++_)t.setTexture2D(n[_]||d,o[_])}function rf(e,n,t){const i=this.cache,c=n.length,o=Rn(t,c);lt(i,o)||(e.uniform1iv(this.addr,o),ct(i,o));for(let d=0;d!==c;++d)t.setTexture3D(n[d]||kr,o[d])}function af(e,n,t){const i=this.cache,c=n.length,o=Rn(t,c);lt(i,o)||(e.uniform1iv(this.addr,o),ct(i,o));for(let d=0;d!==c;++d)t.setTextureCube(n[d]||zr,o[d])}function of(e,n,t){const i=this.cache,c=n.length,o=Rn(t,c);lt(i,o)||(e.uniform1iv(this.addr,o),ct(i,o));for(let d=0;d!==c;++d)t.setTexture2DArray(n[d]||Wr,o[d])}function sf(e){switch(e){case 5126:return Vc;case 35664:return Wc;case 35665:return kc;case 35666:return zc;case 35674:return Xc;case 35675:return Yc;case 35676:return Kc;case 5124:case 35670:return qc;case 35667:case 35671:return Zc;case 35668:case 35672:return $c;case 35669:case 35673:return Qc;case 5125:return Jc;case 36294:return jc;case 36295:return ef;case 36296:return tf;case 35678:case 36198:case 36298:case 36306:case 35682:return nf;case 35679:case 36299:case 36307:return rf;case 35680:case 36300:case 36308:case 36293:return af;case 36289:case 36303:case 36311:case 36292:return of}}class lf{constructor(n,t,i){this.id=n,this.addr=i,this.cache=[],this.type=t.type,this.setValue=Hc(t.type)}}class cf{constructor(n,t,i){this.id=n,this.addr=i,this.cache=[],this.type=t.type,this.size=t.size,this.setValue=sf(t.type)}}class ff{constructor(n){this.id=n,this.seq=[],this.map={}}setValue(n,t,i){const c=this.seq;for(let o=0,d=c.length;o!==d;++o){const _=c[o];_.setValue(n,t[_.id],i)}}}const Hn=/(\w+)(\])?(\[|\.)?/g;function rr(e,n){e.seq.push(n),e.map[n.id]=n}function df(e,n,t){const i=e.name,c=i.length;for(Hn.lastIndex=0;;){const o=Hn.exec(i),d=Hn.lastIndex;let _=o[1];const C=o[2]==="]",M=o[3];if(C&&(_=_|0),M===void 0||M==="["&&d+2===c){rr(t,M===void 0?new lf(_,e,n):new cf(_,e,n));break}else{let D=t.map[_];D===void 0&&(D=new ff(_),rr(t,D)),t=D}}}class En{constructor(n,t){this.seq=[],this.map={};const i=n.getProgramParameter(t,n.ACTIVE_UNIFORMS);for(let d=0;d<i;++d){const _=n.getActiveUniform(t,d),C=n.getUniformLocation(t,_.name);df(_,C,this)}const c=[],o=[];for(const d of this.seq)d.type===n.SAMPLER_2D_SHADOW||d.type===n.SAMPLER_CUBE_SHADOW||d.type===n.SAMPLER_2D_ARRAY_SHADOW?c.push(d):o.push(d);c.length>0&&(this.seq=c.concat(o))}setValue(n,t,i,c){const o=this.map[t];o!==void 0&&o.setValue(n,i,c)}setOptional(n,t,i){const c=t[i];c!==void 0&&this.setValue(n,i,c)}static upload(n,t,i,c){for(let o=0,d=t.length;o!==d;++o){const _=t[o],C=i[_.id];C.needsUpdate!==!1&&_.setValue(n,C.value,c)}}static seqWithValue(n,t){const i=[];for(let c=0,o=n.length;c!==o;++c){const d=n[c];d.id in t&&i.push(d)}return i}}function ar(e,n,t){const i=e.createShader(n);return e.shaderSource(i,t),e.compileShader(i),i}const uf=37297;let pf=0;function hf(e,n){const t=e.split(`
`),i=[],c=Math.max(n-6,0),o=Math.min(n+6,t.length);for(let d=c;d<o;d++){const _=d+1;i.push(`${_===n?">":" "} ${_}: ${t[d]}`)}return i.join(`
`)}const or=new Ne;function mf(e){Qe._getMatrix(or,Qe.workingColorSpace,e);const n=`mat3( ${or.elements.map(t=>t.toFixed(4))} )`;switch(Qe.getTransfer(e)){case Or:return[n,"LinearTransferOETF"];case qe:return[n,"sRGBTransferOETF"];default:return Be("WebGLProgram: Unsupported color space: ",e),[n,"LinearTransferOETF"]}}function sr(e,n,t){const i=e.getShaderParameter(n,e.COMPILE_STATUS),o=(e.getShaderInfoLog(n)||"").trim();if(i&&o==="")return"";const d=/ERROR: 0:(\d+)/.exec(o);if(d){const _=parseInt(d[1]);return t.toUpperCase()+`

`+o+`

`+hf(e.getShaderSource(n),_)}else return o}function _f(e,n){const t=mf(n);return[`vec4 ${e}( vec4 value ) {`,`	return ${t[1]}( vec4( value.rgb * ${t[0]}, value.a ) );`,"}"].join(`
`)}const gf={[yr]:"Linear",[Nr]:"Reinhard",[Ir]:"Cineon",[wr]:"ACESFilmic",[Dr]:"AgX",[Ur]:"Neutral",[Lr]:"Custom"};function vf(e,n){const t=gf[n];return t===void 0?(Be("WebGLProgram: Unsupported toneMapping:",n),"vec3 "+e+"( vec3 color ) { return LinearToneMapping( color ); }"):"vec3 "+e+"( vec3 color ) { return "+t+"ToneMapping( color ); }"}const mn=new Ie;function Sf(){Qe.getLuminanceCoefficients(mn);const e=mn.x.toFixed(4),n=mn.y.toFixed(4),t=mn.z.toFixed(4);return["float luminance( const in vec3 rgb ) {",`	const vec3 weights = vec3( ${e}, ${n}, ${t} );`,"	return dot( weights, rgb );","}"].join(`
`)}function Ef(e){return[e.extensionClipCullDistance?"#extension GL_ANGLE_clip_cull_distance : require":"",e.extensionMultiDraw?"#extension GL_ANGLE_multi_draw : require":""].filter(on).join(`
`)}function xf(e){const n=[];for(const t in e){const i=e[t];i!==!1&&n.push("#define "+t+" "+i)}return n.join(`
`)}function Mf(e,n){const t={},i=e.getProgramParameter(n,e.ACTIVE_ATTRIBUTES);for(let c=0;c<i;c++){const o=e.getActiveAttrib(n,c),d=o.name;let _=1;o.type===e.FLOAT_MAT2&&(_=2),o.type===e.FLOAT_MAT3&&(_=3),o.type===e.FLOAT_MAT4&&(_=4),t[d]={type:o.type,location:e.getAttribLocation(n,d),locationSize:_}}return t}function on(e){return e!==""}function lr(e,n){const t=n.numSpotLightShadows+n.numSpotLightMaps-n.numSpotLightShadowsWithMaps;return e.replace(/NUM_DIR_LIGHTS/g,n.numDirLights).replace(/NUM_SPOT_LIGHTS/g,n.numSpotLights).replace(/NUM_SPOT_LIGHT_MAPS/g,n.numSpotLightMaps).replace(/NUM_SPOT_LIGHT_COORDS/g,t).replace(/NUM_RECT_AREA_LIGHTS/g,n.numRectAreaLights).replace(/NUM_POINT_LIGHTS/g,n.numPointLights).replace(/NUM_HEMI_LIGHTS/g,n.numHemiLights).replace(/NUM_DIR_LIGHT_SHADOWS/g,n.numDirLightShadows).replace(/NUM_SPOT_LIGHT_SHADOWS_WITH_MAPS/g,n.numSpotLightShadowsWithMaps).replace(/NUM_SPOT_LIGHT_SHADOWS/g,n.numSpotLightShadows).replace(/NUM_POINT_LIGHT_SHADOWS/g,n.numPointLightShadows)}function cr(e,n){return e.replace(/NUM_CLIPPING_PLANES/g,n.numClippingPlanes).replace(/UNION_CLIPPING_PLANES/g,n.numClippingPlanes-n.numClipIntersection)}const Tf=/^[ \t]*#include +<([\w\d./]+)>/gm;function Kn(e){return e.replace(Tf,Rf)}const Af=new Map;function Rf(e,n){let t=Ue[n];if(t===void 0){const i=Af.get(n);if(i!==void 0)t=Ue[i],Be('WebGLRenderer: Shader chunk "%s" has been deprecated. Use "%s" instead.',n,i);else throw new Error("THREE.WebGLProgram: Can not resolve #include <"+n+">")}return Kn(t)}const bf=/#pragma unroll_loop_start\s+for\s*\(\s*int\s+i\s*=\s*(\d+)\s*;\s*i\s*<\s*(\d+)\s*;\s*i\s*\+\+\s*\)\s*{([\s\S]+?)}\s+#pragma unroll_loop_end/g;function fr(e){return e.replace(bf,Cf)}function Cf(e,n,t,i){let c="";for(let o=parseInt(n);o<parseInt(t);o++)c+=i.replace(/\[\s*i\s*\]/g,"[ "+o+" ]").replace(/UNROLLED_LOOP_INDEX/g,o);return c}function dr(e){let n=`precision ${e.precision} float;
	precision ${e.precision} int;
	precision ${e.precision} sampler2D;
	precision ${e.precision} samplerCube;
	precision ${e.precision} sampler3D;
	precision ${e.precision} sampler2DArray;
	precision ${e.precision} sampler2DShadow;
	precision ${e.precision} samplerCubeShadow;
	precision ${e.precision} sampler2DArrayShadow;
	precision ${e.precision} isampler2D;
	precision ${e.precision} isampler3D;
	precision ${e.precision} isamplerCube;
	precision ${e.precision} isampler2DArray;
	precision ${e.precision} usampler2D;
	precision ${e.precision} usampler3D;
	precision ${e.precision} usamplerCube;
	precision ${e.precision} usampler2DArray;
	`;return e.precision==="highp"?n+=`
#define HIGH_PRECISION`:e.precision==="mediump"?n+=`
#define MEDIUM_PRECISION`:e.precision==="lowp"&&(n+=`
#define LOW_PRECISION`),n}const Pf={[vn]:"SHADOWMAP_TYPE_PCF",[an]:"SHADOWMAP_TYPE_VSM"};function Lf(e){return Pf[e.shadowMapType]||"SHADOWMAP_TYPE_BASIC"}const Uf={[fn]:"ENVMAP_TYPE_CUBE",[jt]:"ENVMAP_TYPE_CUBE",[Tn]:"ENVMAP_TYPE_CUBE_UV"};function Df(e){return e.envMap===!1?"ENVMAP_TYPE_CUBE":Uf[e.envMapMode]||"ENVMAP_TYPE_CUBE"}const wf={[jt]:"ENVMAP_MODE_REFRACTION"};function If(e){return e.envMap===!1?"ENVMAP_MODE_REFLECTION":wf[e.envMapMode]||"ENVMAP_MODE_REFLECTION"}const Nf={[mo]:"ENVMAP_BLENDING_MULTIPLY",[ho]:"ENVMAP_BLENDING_MIX",[po]:"ENVMAP_BLENDING_ADD"};function yf(e){return e.envMap===!1?"ENVMAP_BLENDING_NONE":Nf[e.combine]||"ENVMAP_BLENDING_NONE"}function Ff(e){const n=e.envMapCubeUVHeight;if(n===null)return null;const t=Math.log2(n)-2,i=1/n;return{texelWidth:1/(3*Math.max(Math.pow(2,t),112)),texelHeight:i,maxMip:t}}function Of(e,n,t,i){const c=e.getContext(),o=t.defines;let d=t.vertexShader,_=t.fragmentShader;const C=Lf(t),M=Df(t),W=If(t),D=yf(t),p=Ff(t),S=Ef(t),b=xf(o),G=c.createProgram();let f,s,F=t.glslVersion?"#version "+t.glslVersion+`
`:"";t.isRawShaderMaterial?(f=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,b].filter(on).join(`
`),f.length>0&&(f+=`
`),s=["#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,b].filter(on).join(`
`),s.length>0&&(s+=`
`)):(f=[dr(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,b,t.extensionClipCullDistance?"#define USE_CLIP_DISTANCE":"",t.batching?"#define USE_BATCHING":"",t.batchingColor?"#define USE_BATCHING_COLOR":"",t.instancing?"#define USE_INSTANCING":"",t.instancingColor?"#define USE_INSTANCING_COLOR":"",t.instancingMorph?"#define USE_INSTANCING_MORPH":"",t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.map?"#define USE_MAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+W:"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.displacementMap?"#define USE_DISPLACEMENTMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.mapUv?"#define MAP_UV "+t.mapUv:"",t.alphaMapUv?"#define ALPHAMAP_UV "+t.alphaMapUv:"",t.lightMapUv?"#define LIGHTMAP_UV "+t.lightMapUv:"",t.aoMapUv?"#define AOMAP_UV "+t.aoMapUv:"",t.emissiveMapUv?"#define EMISSIVEMAP_UV "+t.emissiveMapUv:"",t.bumpMapUv?"#define BUMPMAP_UV "+t.bumpMapUv:"",t.normalMapUv?"#define NORMALMAP_UV "+t.normalMapUv:"",t.displacementMapUv?"#define DISPLACEMENTMAP_UV "+t.displacementMapUv:"",t.metalnessMapUv?"#define METALNESSMAP_UV "+t.metalnessMapUv:"",t.roughnessMapUv?"#define ROUGHNESSMAP_UV "+t.roughnessMapUv:"",t.anisotropyMapUv?"#define ANISOTROPYMAP_UV "+t.anisotropyMapUv:"",t.clearcoatMapUv?"#define CLEARCOATMAP_UV "+t.clearcoatMapUv:"",t.clearcoatNormalMapUv?"#define CLEARCOAT_NORMALMAP_UV "+t.clearcoatNormalMapUv:"",t.clearcoatRoughnessMapUv?"#define CLEARCOAT_ROUGHNESSMAP_UV "+t.clearcoatRoughnessMapUv:"",t.iridescenceMapUv?"#define IRIDESCENCEMAP_UV "+t.iridescenceMapUv:"",t.iridescenceThicknessMapUv?"#define IRIDESCENCE_THICKNESSMAP_UV "+t.iridescenceThicknessMapUv:"",t.sheenColorMapUv?"#define SHEEN_COLORMAP_UV "+t.sheenColorMapUv:"",t.sheenRoughnessMapUv?"#define SHEEN_ROUGHNESSMAP_UV "+t.sheenRoughnessMapUv:"",t.specularMapUv?"#define SPECULARMAP_UV "+t.specularMapUv:"",t.specularColorMapUv?"#define SPECULAR_COLORMAP_UV "+t.specularColorMapUv:"",t.specularIntensityMapUv?"#define SPECULAR_INTENSITYMAP_UV "+t.specularIntensityMapUv:"",t.transmissionMapUv?"#define TRANSMISSIONMAP_UV "+t.transmissionMapUv:"",t.thicknessMapUv?"#define THICKNESSMAP_UV "+t.thicknessMapUv:"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexNormals?"#define HAS_NORMAL":"",t.vertexColors?"#define USE_COLOR":"",t.vertexAlphas?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.flatShading?"#define FLAT_SHADED":"",t.skinning?"#define USE_SKINNING":"",t.morphTargets?"#define USE_MORPHTARGETS":"",t.morphNormals&&t.flatShading===!1?"#define USE_MORPHNORMALS":"",t.morphColors?"#define USE_MORPHCOLORS":"",t.morphTargetsCount>0?"#define MORPHTARGETS_TEXTURE_STRIDE "+t.morphTextureStride:"",t.morphTargetsCount>0?"#define MORPHTARGETS_COUNT "+t.morphTargetsCount:"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+C:"",t.sizeAttenuation?"#define USE_SIZEATTENUATION":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 modelMatrix;","uniform mat4 modelViewMatrix;","uniform mat4 projectionMatrix;","uniform mat4 viewMatrix;","uniform mat3 normalMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;","#ifdef USE_INSTANCING","	attribute mat4 instanceMatrix;","#endif","#ifdef USE_INSTANCING_COLOR","	attribute vec3 instanceColor;","#endif","#ifdef USE_INSTANCING_MORPH","	uniform sampler2D morphTexture;","#endif","attribute vec3 position;","attribute vec3 normal;","attribute vec2 uv;","#ifdef USE_UV1","	attribute vec2 uv1;","#endif","#ifdef USE_UV2","	attribute vec2 uv2;","#endif","#ifdef USE_UV3","	attribute vec2 uv3;","#endif","#ifdef USE_TANGENT","	attribute vec4 tangent;","#endif","#if defined( USE_COLOR_ALPHA )","	attribute vec4 color;","#elif defined( USE_COLOR )","	attribute vec3 color;","#endif","#ifdef USE_SKINNING","	attribute vec4 skinIndex;","	attribute vec4 skinWeight;","#endif",`
`].filter(on).join(`
`),s=[dr(t),"#define SHADER_TYPE "+t.shaderType,"#define SHADER_NAME "+t.shaderName,b,t.useFog&&t.fog?"#define USE_FOG":"",t.useFog&&t.fogExp2?"#define FOG_EXP2":"",t.alphaToCoverage?"#define ALPHA_TO_COVERAGE":"",t.map?"#define USE_MAP":"",t.matcap?"#define USE_MATCAP":"",t.envMap?"#define USE_ENVMAP":"",t.envMap?"#define "+M:"",t.envMap?"#define "+W:"",t.envMap?"#define "+D:"",p?"#define CUBEUV_TEXEL_WIDTH "+p.texelWidth:"",p?"#define CUBEUV_TEXEL_HEIGHT "+p.texelHeight:"",p?"#define CUBEUV_MAX_MIP "+p.maxMip+".0":"",t.lightMap?"#define USE_LIGHTMAP":"",t.aoMap?"#define USE_AOMAP":"",t.bumpMap?"#define USE_BUMPMAP":"",t.normalMap?"#define USE_NORMALMAP":"",t.normalMapObjectSpace?"#define USE_NORMALMAP_OBJECTSPACE":"",t.normalMapTangentSpace?"#define USE_NORMALMAP_TANGENTSPACE":"",t.packedNormalMap?"#define USE_PACKED_NORMALMAP":"",t.emissiveMap?"#define USE_EMISSIVEMAP":"",t.anisotropy?"#define USE_ANISOTROPY":"",t.anisotropyMap?"#define USE_ANISOTROPYMAP":"",t.clearcoat?"#define USE_CLEARCOAT":"",t.clearcoatMap?"#define USE_CLEARCOATMAP":"",t.clearcoatRoughnessMap?"#define USE_CLEARCOAT_ROUGHNESSMAP":"",t.clearcoatNormalMap?"#define USE_CLEARCOAT_NORMALMAP":"",t.dispersion?"#define USE_DISPERSION":"",t.iridescence?"#define USE_IRIDESCENCE":"",t.iridescenceMap?"#define USE_IRIDESCENCEMAP":"",t.iridescenceThicknessMap?"#define USE_IRIDESCENCE_THICKNESSMAP":"",t.specularMap?"#define USE_SPECULARMAP":"",t.specularColorMap?"#define USE_SPECULAR_COLORMAP":"",t.specularIntensityMap?"#define USE_SPECULAR_INTENSITYMAP":"",t.roughnessMap?"#define USE_ROUGHNESSMAP":"",t.metalnessMap?"#define USE_METALNESSMAP":"",t.alphaMap?"#define USE_ALPHAMAP":"",t.alphaTest?"#define USE_ALPHATEST":"",t.alphaHash?"#define USE_ALPHAHASH":"",t.sheen?"#define USE_SHEEN":"",t.sheenColorMap?"#define USE_SHEEN_COLORMAP":"",t.sheenRoughnessMap?"#define USE_SHEEN_ROUGHNESSMAP":"",t.transmission?"#define USE_TRANSMISSION":"",t.transmissionMap?"#define USE_TRANSMISSIONMAP":"",t.thicknessMap?"#define USE_THICKNESSMAP":"",t.vertexTangents&&t.flatShading===!1?"#define USE_TANGENT":"",t.vertexColors||t.instancingColor?"#define USE_COLOR":"",t.vertexAlphas||t.batchingColor?"#define USE_COLOR_ALPHA":"",t.vertexUv1s?"#define USE_UV1":"",t.vertexUv2s?"#define USE_UV2":"",t.vertexUv3s?"#define USE_UV3":"",t.pointsUvs?"#define USE_POINTS_UV":"",t.gradientMap?"#define USE_GRADIENTMAP":"",t.flatShading?"#define FLAT_SHADED":"",t.doubleSided?"#define DOUBLE_SIDED":"",t.flipSided?"#define FLIP_SIDED":"",t.shadowMapEnabled?"#define USE_SHADOWMAP":"",t.shadowMapEnabled?"#define "+C:"",t.premultipliedAlpha?"#define PREMULTIPLIED_ALPHA":"",t.numLightProbes>0?"#define USE_LIGHT_PROBES":"",t.numLightProbeGrids>0?"#define USE_LIGHT_PROBES_GRID":"",t.decodeVideoTexture?"#define DECODE_VIDEO_TEXTURE":"",t.decodeVideoTextureEmissive?"#define DECODE_VIDEO_TEXTURE_EMISSIVE":"",t.logarithmicDepthBuffer?"#define USE_LOGARITHMIC_DEPTH_BUFFER":"",t.reversedDepthBuffer?"#define USE_REVERSED_DEPTH_BUFFER":"","uniform mat4 viewMatrix;","uniform vec3 cameraPosition;","uniform bool isOrthographic;",t.toneMapping!==Ct?"#define TONE_MAPPING":"",t.toneMapping!==Ct?Ue.tonemapping_pars_fragment:"",t.toneMapping!==Ct?vf("toneMapping",t.toneMapping):"",t.dithering?"#define DITHERING":"",t.opaque?"#define OPAQUE":"",Ue.colorspace_pars_fragment,_f("linearToOutputTexel",t.outputColorSpace),Sf(),t.useDepthPacking?"#define DEPTH_PACKING "+t.depthPacking:"",`
`].filter(on).join(`
`)),d=Kn(d),d=lr(d,t),d=cr(d,t),_=Kn(_),_=lr(_,t),_=cr(_,t),d=fr(d),_=fr(_),t.isRawShaderMaterial!==!0&&(F=`#version 300 es
`,f=[S,"#define attribute in","#define varying out","#define texture2D texture"].join(`
`)+`
`+f,s=["#define varying in",t.glslVersion===Yi?"":"layout(location = 0) out highp vec4 pc_fragColor;",t.glslVersion===Yi?"":"#define gl_FragColor pc_fragColor","#define gl_FragDepthEXT gl_FragDepth","#define texture2D texture","#define textureCube texture","#define texture2DProj textureProj","#define texture2DLodEXT textureLod","#define texture2DProjLodEXT textureProjLod","#define textureCubeLodEXT textureLod","#define texture2DGradEXT textureGrad","#define texture2DProjGradEXT textureProjGrad","#define textureCubeGradEXT textureGrad"].join(`
`)+`
`+s);const y=F+f+d,h=F+s+_,A=ar(c,c.VERTEX_SHADER,y),g=ar(c,c.FRAGMENT_SHADER,h);c.attachShader(G,A),c.attachShader(G,g),t.index0AttributeName!==void 0?c.bindAttribLocation(G,0,t.index0AttributeName):t.hasPositionAttribute===!0&&c.bindAttribLocation(G,0,"position"),c.linkProgram(G);function P(R){if(e.debug.checkShaderErrors){const O=c.getProgramInfoLog(G)||"",Q=c.getShaderInfoLog(A)||"",Z=c.getShaderInfoLog(g)||"",k=O.trim(),Y=Q.trim(),V=Z.trim();let $=!0,ce=!0;if(c.getProgramParameter(G,c.LINK_STATUS)===!1)if($=!1,typeof e.debug.onShaderError=="function")e.debug.onShaderError(c,G,A,g);else{const ge=sr(c,A,"vertex"),ve=sr(c,g,"fragment");Ze("WebGLProgram: Shader Error "+c.getError()+" - VALIDATE_STATUS "+c.getProgramParameter(G,c.VALIDATE_STATUS)+`

Material Name: `+R.name+`
Material Type: `+R.type+`

Program Info Log: `+k+`
`+ge+`
`+ve)}else k!==""?Be("WebGLProgram: Program Info Log:",k):(Y===""||V==="")&&(ce=!1);ce&&(R.diagnostics={runnable:$,programLog:k,vertexShader:{log:Y,prefix:f},fragmentShader:{log:V,prefix:s}})}c.deleteShader(A),c.deleteShader(g),l=new En(c,G),m=Mf(c,G)}let l;this.getUniforms=function(){return l===void 0&&P(this),l};let m;this.getAttributes=function(){return m===void 0&&P(this),m};let I=t.rendererExtensionParallelShaderCompile===!1;return this.isReady=function(){return I===!1&&(I=c.getProgramParameter(G,uf)),I},this.destroy=function(){i.releaseStatesOfProgram(this),c.deleteProgram(G),this.program=void 0},this.type=t.shaderType,this.name=t.shaderName,this.id=pf++,this.cacheKey=n,this.usedTimes=1,this.program=G,this.vertexShader=A,this.fragmentShader=g,this}let Bf=0;class Gf{constructor(){this.shaderCache=new Map,this.materialCache=new Map}update(n,t,i){const c=this._getShaderCacheForMaterial(n);return c.has(t)===!1&&(c.add(t),t.usedTimes++),c.has(i)===!1&&(c.add(i),i.usedTimes++),this}remove(n){const t=this.materialCache.get(n);for(const i of t)i.usedTimes--,i.usedTimes===0&&this.shaderCache.delete(i.code);return this.materialCache.delete(n),this}getVertexShaderStage(n){return this._getShaderStage(n.vertexShader)}getFragmentShaderStage(n){return this._getShaderStage(n.fragmentShader)}dispose(){this.shaderCache.clear(),this.materialCache.clear()}_getShaderCacheForMaterial(n){const t=this.materialCache;let i=t.get(n);return i===void 0&&(i=new Set,t.set(n,i)),i}_getShaderStage(n){const t=this.shaderCache;let i=t.get(n);return i===void 0&&(i=new Hf(n),t.set(n,i)),i}}class Hf{constructor(n){this.id=Bf++,this.code=n,this.usedTimes=0}}function Vf(e){return e===Jt||e===kn||e===zn}function Wf(e,n,t,i,c,o){const d=new co,_=new Gf,C=new Set,M=[],W=new Map,D=i.logarithmicDepthBuffer;let p=i.precision;const S={MeshDepthMaterial:"depth",MeshDistanceMaterial:"distance",MeshNormalMaterial:"normal",MeshBasicMaterial:"basic",MeshLambertMaterial:"lambert",MeshPhongMaterial:"phong",MeshToonMaterial:"toon",MeshStandardMaterial:"physical",MeshPhysicalMaterial:"physical",MeshMatcapMaterial:"matcap",LineBasicMaterial:"basic",LineDashedMaterial:"dashed",PointsMaterial:"points",ShadowMaterial:"shadow",SpriteMaterial:"sprite"};function b(l){return C.add(l),l===0?"uv":`uv${l}`}function G(l,m,I,R,O,Q){const Z=R.fog,k=O.geometry,Y=l.isMeshStandardMaterial||l.isMeshLambertMaterial||l.isMeshPhongMaterial?R.environment:null,V=l.isMeshStandardMaterial||l.isMeshLambertMaterial&&!l.envMap||l.isMeshPhongMaterial&&!l.envMap,$=n.get(l.envMap||Y,V),ce=$&&$.mapping===Tn?$.image.height:null,ge=S[l.type];l.precision!==null&&(p=i.getMaxPrecision(l.precision),p!==l.precision&&Be("WebGLProgram.getParameters:",l.precision,"not supported, using",p,"instead."));const ve=k.morphAttributes.position||k.morphAttributes.normal||k.morphAttributes.color,xe=ve!==void 0?ve.length:0;let Xe=0;k.morphAttributes.position!==void 0&&(Xe=1),k.morphAttributes.normal!==void 0&&(Xe=2),k.morphAttributes.color!==void 0&&(Xe=3);let rt,He,K,te;if(ge){const he=Rt[ge];rt=he.vertexShader,He=he.fragmentShader}else{rt=l.vertexShader,He=l.fragmentShader;const he=_.getVertexShaderStage(l),je=_.getFragmentShaderStage(l);_.update(l,he,je),K=he.id,te=je.id}const J=e.getRenderTarget(),be=e.state.buffers.depth.getReversed(),Ce=O.isInstancedMesh===!0,Ae=O.isBatchedMesh===!0,tt=!!l.map,we=!!l.matcap,We=!!$,Oe=!!l.aoMap,ye=!!l.lightMap,at=!!l.bumpMap&&l.wireframe===!1,st=!!l.normalMap,ft=!!l.displacementMap,dt=!!l.emissiveMap,Je=!!l.metalnessMap,ot=!!l.roughnessMap,E=l.anisotropy>0,pt=l.clearcoat>0,Ge=l.dispersion>0,u=l.iridescence>0,r=l.sheen>0,T=l.transmission>0,w=E&&!!l.anisotropyMap,B=pt&&!!l.clearcoatMap,j=pt&&!!l.clearcoatNormalMap,ne=pt&&!!l.clearcoatRoughnessMap,H=u&&!!l.iridescenceMap,X=u&&!!l.iridescenceThicknessMap,ie=r&&!!l.sheenColorMap,Se=r&&!!l.sheenRoughnessMap,oe=!!l.specularMap,re=!!l.specularColorMap,Te=!!l.specularIntensityMap,Re=T&&!!l.transmissionMap,Pe=T&&!!l.thicknessMap,v=!!l.gradientMap,ee=!!l.alphaMap,z=l.alphaTest>0,ae=!!l.alphaHash,de=!!l.extensions;let q=Ct;l.toneMapped&&(J===null||J.isXRRenderTarget===!0)&&(q=e.toneMapping);const _e={shaderID:ge,shaderType:l.type,shaderName:l.name,vertexShader:rt,fragmentShader:He,defines:l.defines,customVertexShaderID:K,customFragmentShaderID:te,isRawShaderMaterial:l.isRawShaderMaterial===!0,glslVersion:l.glslVersion,precision:p,batching:Ae,batchingColor:Ae&&O._colorsTexture!==null,instancing:Ce,instancingColor:Ce&&O.instanceColor!==null,instancingMorph:Ce&&O.morphTexture!==null,outputColorSpace:J===null?e.outputColorSpace:J.isXRRenderTarget===!0?J.texture.colorSpace:Qe.workingColorSpace,alphaToCoverage:!!l.alphaToCoverage,map:tt,matcap:we,envMap:We,envMapMode:We&&$.mapping,envMapCubeUVHeight:ce,aoMap:Oe,lightMap:ye,bumpMap:at,normalMap:st,displacementMap:ft,emissiveMap:dt,normalMapObjectSpace:st&&l.normalMapType===ao,normalMapTangentSpace:st&&l.normalMapType===zi,packedNormalMap:st&&l.normalMapType===zi&&Vf(l.normalMap.format),metalnessMap:Je,roughnessMap:ot,anisotropy:E,anisotropyMap:w,clearcoat:pt,clearcoatMap:B,clearcoatNormalMap:j,clearcoatRoughnessMap:ne,dispersion:Ge,iridescence:u,iridescenceMap:H,iridescenceThicknessMap:X,sheen:r,sheenColorMap:ie,sheenRoughnessMap:Se,specularMap:oe,specularColorMap:re,specularIntensityMap:Te,transmission:T,transmissionMap:Re,thicknessMap:Pe,gradientMap:v,opaque:l.transparent===!1&&l.blending===Sn&&l.alphaToCoverage===!1,alphaMap:ee,alphaTest:z,alphaHash:ae,combine:l.combine,mapUv:tt&&b(l.map.channel),aoMapUv:Oe&&b(l.aoMap.channel),lightMapUv:ye&&b(l.lightMap.channel),bumpMapUv:at&&b(l.bumpMap.channel),normalMapUv:st&&b(l.normalMap.channel),displacementMapUv:ft&&b(l.displacementMap.channel),emissiveMapUv:dt&&b(l.emissiveMap.channel),metalnessMapUv:Je&&b(l.metalnessMap.channel),roughnessMapUv:ot&&b(l.roughnessMap.channel),anisotropyMapUv:w&&b(l.anisotropyMap.channel),clearcoatMapUv:B&&b(l.clearcoatMap.channel),clearcoatNormalMapUv:j&&b(l.clearcoatNormalMap.channel),clearcoatRoughnessMapUv:ne&&b(l.clearcoatRoughnessMap.channel),iridescenceMapUv:H&&b(l.iridescenceMap.channel),iridescenceThicknessMapUv:X&&b(l.iridescenceThicknessMap.channel),sheenColorMapUv:ie&&b(l.sheenColorMap.channel),sheenRoughnessMapUv:Se&&b(l.sheenRoughnessMap.channel),specularMapUv:oe&&b(l.specularMap.channel),specularColorMapUv:re&&b(l.specularColorMap.channel),specularIntensityMapUv:Te&&b(l.specularIntensityMap.channel),transmissionMapUv:Re&&b(l.transmissionMap.channel),thicknessMapUv:Pe&&b(l.thicknessMap.channel),alphaMapUv:ee&&b(l.alphaMap.channel),vertexTangents:!!k.attributes.tangent&&(st||E),vertexNormals:!!k.attributes.normal,vertexColors:l.vertexColors,vertexAlphas:l.vertexColors===!0&&!!k.attributes.color&&k.attributes.color.itemSize===4,pointsUvs:O.isPoints===!0&&!!k.attributes.uv&&(tt||ee),fog:!!Z,useFog:l.fog===!0,fogExp2:!!Z&&Z.isFogExp2,flatShading:l.wireframe===!1&&(l.flatShading===!0||k.attributes.normal===void 0&&st===!1&&(l.isMeshLambertMaterial||l.isMeshPhongMaterial||l.isMeshStandardMaterial||l.isMeshPhysicalMaterial)),sizeAttenuation:l.sizeAttenuation===!0,logarithmicDepthBuffer:D,reversedDepthBuffer:be,skinning:O.isSkinnedMesh===!0,hasPositionAttribute:k.attributes.position!==void 0,morphTargets:k.morphAttributes.position!==void 0,morphNormals:k.morphAttributes.normal!==void 0,morphColors:k.morphAttributes.color!==void 0,morphTargetsCount:xe,morphTextureStride:Xe,numDirLights:m.directional.length,numPointLights:m.point.length,numSpotLights:m.spot.length,numSpotLightMaps:m.spotLightMap.length,numRectAreaLights:m.rectArea.length,numHemiLights:m.hemi.length,numDirLightShadows:m.directionalShadowMap.length,numPointLightShadows:m.pointShadowMap.length,numSpotLightShadows:m.spotShadowMap.length,numSpotLightShadowsWithMaps:m.numSpotLightShadowsWithMaps,numLightProbes:m.numLightProbes,numLightProbeGrids:Q.length,numClippingPlanes:o.numPlanes,numClipIntersection:o.numIntersection,dithering:l.dithering,shadowMapEnabled:e.shadowMap.enabled&&I.length>0,shadowMapType:e.shadowMap.type,toneMapping:q,decodeVideoTexture:tt&&l.map.isVideoTexture===!0&&Qe.getTransfer(l.map.colorSpace)===qe,decodeVideoTextureEmissive:dt&&l.emissiveMap.isVideoTexture===!0&&Qe.getTransfer(l.emissiveMap.colorSpace)===qe,premultipliedAlpha:l.premultipliedAlpha,doubleSided:l.side===Lt,flipSided:l.side===St,useDepthPacking:l.depthPacking>=0,depthPacking:l.depthPacking||0,index0AttributeName:l.index0AttributeName,extensionClipCullDistance:de&&l.extensions.clipCullDistance===!0&&t.has("WEBGL_clip_cull_distance"),extensionMultiDraw:(de&&l.extensions.multiDraw===!0||Ae)&&t.has("WEBGL_multi_draw"),rendererExtensionParallelShaderCompile:t.has("KHR_parallel_shader_compile"),customProgramCacheKey:l.customProgramCacheKey()};return _e.vertexUv1s=C.has(1),_e.vertexUv2s=C.has(2),_e.vertexUv3s=C.has(3),C.clear(),_e}function f(l){const m=[];if(l.shaderID?m.push(l.shaderID):(m.push(l.customVertexShaderID),m.push(l.customFragmentShaderID)),l.defines!==void 0)for(const I in l.defines)m.push(I),m.push(l.defines[I]);return l.isRawShaderMaterial===!1&&(s(m,l),F(m,l),m.push(e.outputColorSpace)),m.push(l.customProgramCacheKey),m.join()}function s(l,m){l.push(m.precision),l.push(m.outputColorSpace),l.push(m.envMapMode),l.push(m.envMapCubeUVHeight),l.push(m.mapUv),l.push(m.alphaMapUv),l.push(m.lightMapUv),l.push(m.aoMapUv),l.push(m.bumpMapUv),l.push(m.normalMapUv),l.push(m.displacementMapUv),l.push(m.emissiveMapUv),l.push(m.metalnessMapUv),l.push(m.roughnessMapUv),l.push(m.anisotropyMapUv),l.push(m.clearcoatMapUv),l.push(m.clearcoatNormalMapUv),l.push(m.clearcoatRoughnessMapUv),l.push(m.iridescenceMapUv),l.push(m.iridescenceThicknessMapUv),l.push(m.sheenColorMapUv),l.push(m.sheenRoughnessMapUv),l.push(m.specularMapUv),l.push(m.specularColorMapUv),l.push(m.specularIntensityMapUv),l.push(m.transmissionMapUv),l.push(m.thicknessMapUv),l.push(m.combine),l.push(m.fogExp2),l.push(m.sizeAttenuation),l.push(m.morphTargetsCount),l.push(m.morphAttributeCount),l.push(m.numDirLights),l.push(m.numPointLights),l.push(m.numSpotLights),l.push(m.numSpotLightMaps),l.push(m.numHemiLights),l.push(m.numRectAreaLights),l.push(m.numDirLightShadows),l.push(m.numPointLightShadows),l.push(m.numSpotLightShadows),l.push(m.numSpotLightShadowsWithMaps),l.push(m.numLightProbes),l.push(m.shadowMapType),l.push(m.toneMapping),l.push(m.numClippingPlanes),l.push(m.numClipIntersection),l.push(m.depthPacking)}function F(l,m){d.disableAll(),m.instancing&&d.enable(0),m.instancingColor&&d.enable(1),m.instancingMorph&&d.enable(2),m.matcap&&d.enable(3),m.envMap&&d.enable(4),m.normalMapObjectSpace&&d.enable(5),m.normalMapTangentSpace&&d.enable(6),m.clearcoat&&d.enable(7),m.iridescence&&d.enable(8),m.alphaTest&&d.enable(9),m.vertexColors&&d.enable(10),m.vertexAlphas&&d.enable(11),m.vertexUv1s&&d.enable(12),m.vertexUv2s&&d.enable(13),m.vertexUv3s&&d.enable(14),m.vertexTangents&&d.enable(15),m.anisotropy&&d.enable(16),m.alphaHash&&d.enable(17),m.batching&&d.enable(18),m.dispersion&&d.enable(19),m.batchingColor&&d.enable(20),m.gradientMap&&d.enable(21),m.packedNormalMap&&d.enable(22),m.vertexNormals&&d.enable(23),l.push(d.mask),d.disableAll(),m.fog&&d.enable(0),m.useFog&&d.enable(1),m.flatShading&&d.enable(2),m.logarithmicDepthBuffer&&d.enable(3),m.reversedDepthBuffer&&d.enable(4),m.skinning&&d.enable(5),m.morphTargets&&d.enable(6),m.morphNormals&&d.enable(7),m.morphColors&&d.enable(8),m.premultipliedAlpha&&d.enable(9),m.shadowMapEnabled&&d.enable(10),m.doubleSided&&d.enable(11),m.flipSided&&d.enable(12),m.useDepthPacking&&d.enable(13),m.dithering&&d.enable(14),m.transmission&&d.enable(15),m.sheen&&d.enable(16),m.opaque&&d.enable(17),m.pointsUvs&&d.enable(18),m.decodeVideoTexture&&d.enable(19),m.decodeVideoTextureEmissive&&d.enable(20),m.alphaToCoverage&&d.enable(21),m.numLightProbeGrids>0&&d.enable(22),m.hasPositionAttribute&&d.enable(23),l.push(d.mask)}function y(l){const m=S[l.type];let I;if(m){const R=Rt[m];I=ro.clone(R.uniforms)}else I=l.uniforms;return I}function h(l,m){let I=W.get(m);return I!==void 0?++I.usedTimes:(I=new Of(e,m,l,c),M.push(I),W.set(m,I)),I}function A(l){if(--l.usedTimes===0){const m=M.indexOf(l);M[m]=M[M.length-1],M.pop(),W.delete(l.cacheKey),l.destroy()}}function g(l){_.remove(l)}function P(){_.dispose()}return{getParameters:G,getProgramCacheKey:f,getUniforms:y,acquireProgram:h,releaseProgram:A,releaseShaderCache:g,programs:M,dispose:P}}function kf(){let e=new WeakMap;function n(d){return e.has(d)}function t(d){let _=e.get(d);return _===void 0&&(_={},e.set(d,_)),_}function i(d){e.delete(d)}function c(d,_,C){e.get(d)[_]=C}function o(){e=new WeakMap}return{has:n,get:t,remove:i,update:c,dispose:o}}function zf(e,n){return e.groupOrder!==n.groupOrder?e.groupOrder-n.groupOrder:e.renderOrder!==n.renderOrder?e.renderOrder-n.renderOrder:e.material.id!==n.material.id?e.material.id-n.material.id:e.materialVariant!==n.materialVariant?e.materialVariant-n.materialVariant:e.z!==n.z?e.z-n.z:e.id-n.id}function ur(e,n){return e.groupOrder!==n.groupOrder?e.groupOrder-n.groupOrder:e.renderOrder!==n.renderOrder?e.renderOrder-n.renderOrder:e.z!==n.z?n.z-e.z:e.id-n.id}function pr(){const e=[];let n=0;const t=[],i=[],c=[];function o(){n=0,t.length=0,i.length=0,c.length=0}function d(p){let S=0;return p.isInstancedMesh&&(S+=2),p.isSkinnedMesh&&(S+=1),S}function _(p,S,b,G,f,s){let F=e[n];return F===void 0?(F={id:p.id,object:p,geometry:S,material:b,materialVariant:d(p),groupOrder:G,renderOrder:p.renderOrder,z:f,group:s},e[n]=F):(F.id=p.id,F.object=p,F.geometry=S,F.material=b,F.materialVariant=d(p),F.groupOrder=G,F.renderOrder=p.renderOrder,F.z=f,F.group=s),n++,F}function C(p,S,b,G,f,s){const F=_(p,S,b,G,f,s);b.transmission>0?i.push(F):b.transparent===!0?c.push(F):t.push(F)}function M(p,S,b,G,f,s){const F=_(p,S,b,G,f,s);b.transmission>0?i.unshift(F):b.transparent===!0?c.unshift(F):t.unshift(F)}function W(p,S,b){t.length>1&&t.sort(p||zf),i.length>1&&i.sort(S||ur),c.length>1&&c.sort(S||ur),b&&(t.reverse(),i.reverse(),c.reverse())}function D(){for(let p=n,S=e.length;p<S;p++){const b=e[p];if(b.id===null)break;b.id=null,b.object=null,b.geometry=null,b.material=null,b.group=null}}return{opaque:t,transmissive:i,transparent:c,init:o,push:C,unshift:M,finish:D,sort:W}}function Xf(){let e=new WeakMap;function n(i,c){const o=e.get(i);let d;return o===void 0?(d=new pr,e.set(i,[d])):c>=o.length?(d=new pr,o.push(d)):d=o[c],d}function t(){e=new WeakMap}return{get:n,dispose:t}}function Yf(){const e={};return{get:function(n){if(e[n.id]!==void 0)return e[n.id];let t;switch(n.type){case"DirectionalLight":t={direction:new Ie,color:new $e};break;case"SpotLight":t={position:new Ie,direction:new Ie,color:new $e,distance:0,coneCos:0,penumbraCos:0,decay:0};break;case"PointLight":t={position:new Ie,color:new $e,distance:0,decay:0};break;case"HemisphereLight":t={direction:new Ie,skyColor:new $e,groundColor:new $e};break;case"RectAreaLight":t={color:new $e,position:new Ie,halfWidth:new Ie,halfHeight:new Ie};break}return e[n.id]=t,t}}}function Kf(){const e={};return{get:function(n){if(e[n.id]!==void 0)return e[n.id];let t;switch(n.type){case"DirectionalLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _t};break;case"SpotLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _t};break;case"PointLight":t={shadowIntensity:1,shadowBias:0,shadowNormalBias:0,shadowRadius:1,shadowMapSize:new _t,shadowCameraNear:1,shadowCameraFar:1e3};break}return e[n.id]=t,t}}}let qf=0;function Zf(e,n){return(n.castShadow?2:0)-(e.castShadow?2:0)+(n.map?1:0)-(e.map?1:0)}function $f(e){const n=new Yf,t=Kf(),i={version:0,hash:{directionalLength:-1,pointLength:-1,spotLength:-1,rectAreaLength:-1,hemiLength:-1,numDirectionalShadows:-1,numPointShadows:-1,numSpotShadows:-1,numSpotMaps:-1,numLightProbes:-1},ambient:[0,0,0],probe:[],directional:[],directionalShadow:[],directionalShadowMap:[],directionalShadowMatrix:[],spot:[],spotLightMap:[],spotShadow:[],spotShadowMap:[],spotLightMatrix:[],rectArea:[],rectAreaLTC1:null,rectAreaLTC2:null,point:[],pointShadow:[],pointShadowMap:[],pointShadowMatrix:[],hemi:[],numSpotLightShadowsWithMaps:0,numLightProbes:0};for(let M=0;M<9;M++)i.probe.push(new Ie);const c=new Ie,o=new $t,d=new $t;function _(M){let W=0,D=0,p=0;for(let m=0;m<9;m++)i.probe[m].set(0,0,0);let S=0,b=0,G=0,f=0,s=0,F=0,y=0,h=0,A=0,g=0,P=0;M.sort(Zf);for(let m=0,I=M.length;m<I;m++){const R=M[m],O=R.color,Q=R.intensity,Z=R.distance;let k=null;if(R.shadow&&R.shadow.map&&(R.shadow.map.texture.format===Jt?k=R.shadow.map.texture:k=R.shadow.map.depthTexture||R.shadow.map.texture),R.isAmbientLight)W+=O.r*Q,D+=O.g*Q,p+=O.b*Q;else if(R.isLightProbe){for(let Y=0;Y<9;Y++)i.probe[Y].addScaledVector(R.sh.coefficients[Y],Q);P++}else if(R.isDirectionalLight){const Y=n.get(R);if(Y.color.copy(R.color).multiplyScalar(R.intensity),R.castShadow){const V=R.shadow,$=t.get(R);$.shadowIntensity=V.intensity,$.shadowBias=V.bias,$.shadowNormalBias=V.normalBias,$.shadowRadius=V.radius,$.shadowMapSize=V.mapSize,i.directionalShadow[S]=$,i.directionalShadowMap[S]=k,i.directionalShadowMatrix[S]=R.shadow.matrix,F++}i.directional[S]=Y,S++}else if(R.isSpotLight){const Y=n.get(R);Y.position.setFromMatrixPosition(R.matrixWorld),Y.color.copy(O).multiplyScalar(Q),Y.distance=Z,Y.coneCos=Math.cos(R.angle),Y.penumbraCos=Math.cos(R.angle*(1-R.penumbra)),Y.decay=R.decay,i.spot[G]=Y;const V=R.shadow;if(R.map&&(i.spotLightMap[A]=R.map,A++,V.updateMatrices(R),R.castShadow&&g++),i.spotLightMatrix[G]=V.matrix,R.castShadow){const $=t.get(R);$.shadowIntensity=V.intensity,$.shadowBias=V.bias,$.shadowNormalBias=V.normalBias,$.shadowRadius=V.radius,$.shadowMapSize=V.mapSize,i.spotShadow[G]=$,i.spotShadowMap[G]=k,h++}G++}else if(R.isRectAreaLight){const Y=n.get(R);Y.color.copy(O).multiplyScalar(Q),Y.halfWidth.set(R.width*.5,0,0),Y.halfHeight.set(0,R.height*.5,0),i.rectArea[f]=Y,f++}else if(R.isPointLight){const Y=n.get(R);if(Y.color.copy(R.color).multiplyScalar(R.intensity),Y.distance=R.distance,Y.decay=R.decay,R.castShadow){const V=R.shadow,$=t.get(R);$.shadowIntensity=V.intensity,$.shadowBias=V.bias,$.shadowNormalBias=V.normalBias,$.shadowRadius=V.radius,$.shadowMapSize=V.mapSize,$.shadowCameraNear=V.camera.near,$.shadowCameraFar=V.camera.far,i.pointShadow[b]=$,i.pointShadowMap[b]=k,i.pointShadowMatrix[b]=R.shadow.matrix,y++}i.point[b]=Y,b++}else if(R.isHemisphereLight){const Y=n.get(R);Y.skyColor.copy(R.color).multiplyScalar(Q),Y.groundColor.copy(R.groundColor).multiplyScalar(Q),i.hemi[s]=Y,s++}}f>0&&(e.has("OES_texture_float_linear")===!0?(i.rectAreaLTC1=se.LTC_FLOAT_1,i.rectAreaLTC2=se.LTC_FLOAT_2):(i.rectAreaLTC1=se.LTC_HALF_1,i.rectAreaLTC2=se.LTC_HALF_2)),i.ambient[0]=W,i.ambient[1]=D,i.ambient[2]=p;const l=i.hash;(l.directionalLength!==S||l.pointLength!==b||l.spotLength!==G||l.rectAreaLength!==f||l.hemiLength!==s||l.numDirectionalShadows!==F||l.numPointShadows!==y||l.numSpotShadows!==h||l.numSpotMaps!==A||l.numLightProbes!==P)&&(i.directional.length=S,i.spot.length=G,i.rectArea.length=f,i.point.length=b,i.hemi.length=s,i.directionalShadow.length=F,i.directionalShadowMap.length=F,i.pointShadow.length=y,i.pointShadowMap.length=y,i.spotShadow.length=h,i.spotShadowMap.length=h,i.directionalShadowMatrix.length=F,i.pointShadowMatrix.length=y,i.spotLightMatrix.length=h+A-g,i.spotLightMap.length=A,i.numSpotLightShadowsWithMaps=g,i.numLightProbes=P,l.directionalLength=S,l.pointLength=b,l.spotLength=G,l.rectAreaLength=f,l.hemiLength=s,l.numDirectionalShadows=F,l.numPointShadows=y,l.numSpotShadows=h,l.numSpotMaps=A,l.numLightProbes=P,i.version=qf++)}function C(M,W){let D=0,p=0,S=0,b=0,G=0;const f=W.matrixWorldInverse;for(let s=0,F=M.length;s<F;s++){const y=M[s];if(y.isDirectionalLight){const h=i.directional[D];h.direction.setFromMatrixPosition(y.matrixWorld),c.setFromMatrixPosition(y.target.matrixWorld),h.direction.sub(c),h.direction.transformDirection(f),D++}else if(y.isSpotLight){const h=i.spot[S];h.position.setFromMatrixPosition(y.matrixWorld),h.position.applyMatrix4(f),h.direction.setFromMatrixPosition(y.matrixWorld),c.setFromMatrixPosition(y.target.matrixWorld),h.direction.sub(c),h.direction.transformDirection(f),S++}else if(y.isRectAreaLight){const h=i.rectArea[b];h.position.setFromMatrixPosition(y.matrixWorld),h.position.applyMatrix4(f),d.identity(),o.copy(y.matrixWorld),o.premultiply(f),d.extractRotation(o),h.halfWidth.set(y.width*.5,0,0),h.halfHeight.set(0,y.height*.5,0),h.halfWidth.applyMatrix4(d),h.halfHeight.applyMatrix4(d),b++}else if(y.isPointLight){const h=i.point[p];h.position.setFromMatrixPosition(y.matrixWorld),h.position.applyMatrix4(f),p++}else if(y.isHemisphereLight){const h=i.hemi[G];h.direction.setFromMatrixPosition(y.matrixWorld),h.direction.transformDirection(f),G++}}}return{setup:_,setupView:C,state:i}}function hr(e){const n=new $f(e),t=[],i=[],c=[];function o(p){D.camera=p,t.length=0,i.length=0,c.length=0}function d(p){t.push(p)}function _(p){i.push(p)}function C(p){c.push(p)}function M(){n.setup(t)}function W(p){n.setupView(t,p)}const D={lightsArray:t,shadowsArray:i,lightProbeGridArray:c,camera:null,lights:n,transmissionRenderTarget:{},textureUnits:0};return{init:o,state:D,setupLights:M,setupLightsView:W,pushLight:d,pushShadow:_,pushLightProbeGrid:C}}function Qf(e){let n=new WeakMap;function t(c,o=0){const d=n.get(c);let _;return d===void 0?(_=new hr(e),n.set(c,[_])):o>=d.length?(_=new hr(e),d.push(_)):_=d[o],_}function i(){n=new WeakMap}return{get:t,dispose:i}}const Jf=`void main() {
	gl_Position = vec4( position, 1.0 );
}`,jf=`uniform sampler2D shadow_pass;
uniform vec2 resolution;
uniform float radius;
void main() {
	const float samples = float( VSM_SAMPLES );
	float mean = 0.0;
	float squared_mean = 0.0;
	float uvStride = samples <= 1.0 ? 0.0 : 2.0 / ( samples - 1.0 );
	float uvStart = samples <= 1.0 ? 0.0 : - 1.0;
	for ( float i = 0.0; i < samples; i ++ ) {
		float uvOffset = uvStart + i * uvStride;
		#ifdef HORIZONTAL_PASS
			vec2 distribution = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( uvOffset, 0.0 ) * radius ) / resolution ).rg;
			mean += distribution.x;
			squared_mean += distribution.y * distribution.y + distribution.x * distribution.x;
		#else
			float depth = texture2D( shadow_pass, ( gl_FragCoord.xy + vec2( 0.0, uvOffset ) * radius ) / resolution ).r;
			mean += depth;
			squared_mean += depth * depth;
		#endif
	}
	mean = mean / samples;
	squared_mean = squared_mean / samples;
	float std_dev = sqrt( max( 0.0, squared_mean - mean * mean ) );
	gl_FragColor = vec4( mean, std_dev, 0.0, 1.0 );
}`,ed=[new Ie(1,0,0),new Ie(-1,0,0),new Ie(0,1,0),new Ie(0,-1,0),new Ie(0,0,1),new Ie(0,0,-1)],td=[new Ie(0,-1,0),new Ie(0,-1,0),new Ie(0,0,1),new Ie(0,0,-1),new Ie(0,-1,0),new Ie(0,-1,0)],mr=new $t,rn=new Ie,Vn=new Ie;function nd(e,n,t){let i=new _r;const c=new _t,o=new _t,d=new mt,_=new Fa,C=new Oa,M={},W=t.maxTextureSize,D={[sn]:St,[St]:sn,[Lt]:Lt},p=new It({defines:{VSM_SAMPLES:8},uniforms:{shadow_pass:{value:null},resolution:{value:new _t},radius:{value:4}},vertexShader:Jf,fragmentShader:jf}),S=p.clone();S.defines.HORIZONTAL_PASS=1;const b=new Mn;b.setAttribute("position",new gn(new Float32Array([-1,-1,.5,3,-1,.5,-1,3,.5]),3));const G=new wt(b,p),f=this;this.enabled=!1,this.autoUpdate=!0,this.needsUpdate=!1,this.type=vn;let s=this.type;this.render=function(g,P,l){if(f.enabled===!1||f.autoUpdate===!1&&f.needsUpdate===!1||g.length===0)return;this.type===Ba&&(Be("WebGLShadowMap: PCFSoftShadowMap has been deprecated. Using PCFShadowMap instead."),this.type=vn);const m=e.getRenderTarget(),I=e.getActiveCubeFace(),R=e.getActiveMipmapLevel(),O=e.state;O.setBlending(Dt),O.buffers.depth.getReversed()===!0?O.buffers.color.setClear(0,0,0,0):O.buffers.color.setClear(1,1,1,1),O.buffers.depth.setTest(!0),O.setScissorTest(!1);const Q=s!==this.type;Q&&P.traverse(function(Z){Z.material&&(Array.isArray(Z.material)?Z.material.forEach(k=>k.needsUpdate=!0):Z.material.needsUpdate=!0)});for(let Z=0,k=g.length;Z<k;Z++){const Y=g[Z],V=Y.shadow;if(V===void 0){Be("WebGLShadowMap:",Y,"has no shadow.");continue}if(V.autoUpdate===!1&&V.needsUpdate===!1)continue;c.copy(V.mapSize);const $=V.getFrameExtents();c.multiply($),o.copy(V.mapSize),(c.x>W||c.y>W)&&(c.x>W&&(o.x=Math.floor(W/$.x),c.x=o.x*$.x,V.mapSize.x=o.x),c.y>W&&(o.y=Math.floor(W/$.y),c.y=o.y*$.y,V.mapSize.y=o.y));const ce=e.state.buffers.depth.getReversed();if(V.camera._reversedDepth=ce,V.map===null||Q===!0){if(V.map!==null&&(V.map.depthTexture!==null&&(V.map.depthTexture.dispose(),V.map.depthTexture=null),V.map.dispose()),this.type===an){if(Y.isPointLight){Be("WebGLShadowMap: VSM shadow maps are not supported for PointLights. Use PCF or BasicShadowMap instead.");continue}V.map=new Pt(c.x,c.y,{format:Jt,type:Gt,minFilter:vt,magFilter:vt,generateMipmaps:!1}),V.map.texture.name=Y.name+".shadowMap",V.map.depthTexture=new ln(c.x,c.y,Ot),V.map.depthTexture.name=Y.name+".shadowMapDepth",V.map.depthTexture.format=Qt,V.map.depthTexture.compareFunction=null,V.map.depthTexture.minFilter=Wt,V.map.depthTexture.magFilter=Wt}else Y.isPointLight?(V.map=new Hr(c.x),V.map.depthTexture=new Ga(c.x,kt)):(V.map=new Pt(c.x,c.y),V.map.depthTexture=new ln(c.x,c.y,kt)),V.map.depthTexture.name=Y.name+".shadowMap",V.map.depthTexture.format=Qt,this.type===vn?(V.map.depthTexture.compareFunction=ce?qn:Zn,V.map.depthTexture.minFilter=vt,V.map.depthTexture.magFilter=vt):(V.map.depthTexture.compareFunction=null,V.map.depthTexture.minFilter=Wt,V.map.depthTexture.magFilter=Wt);V.camera.updateProjectionMatrix()}const ge=V.map.isWebGLCubeRenderTarget?6:1;for(let ve=0;ve<ge;ve++){if(V.map.isWebGLCubeRenderTarget)e.setRenderTarget(V.map,ve),e.clear();else{ve===0&&(e.setRenderTarget(V.map),e.clear());const xe=V.getViewport(ve);d.set(o.x*xe.x,o.y*xe.y,o.x*xe.z,o.y*xe.w),O.viewport(d)}if(Y.isPointLight){const xe=V.camera,Xe=V.matrix,rt=Y.distance||xe.far;rt!==xe.far&&(xe.far=rt,xe.updateProjectionMatrix()),rn.setFromMatrixPosition(Y.matrixWorld),xe.position.copy(rn),Vn.copy(xe.position),Vn.add(ed[ve]),xe.up.copy(td[ve]),xe.lookAt(Vn),xe.updateMatrixWorld(),Xe.makeTranslation(-rn.x,-rn.y,-rn.z),mr.multiplyMatrices(xe.projectionMatrix,xe.matrixWorldInverse),V._frustum.setFromProjectionMatrix(mr,xe.coordinateSystem,xe.reversedDepth)}else V.updateMatrices(Y);i=V.getFrustum(),h(P,l,V.camera,Y,this.type)}V.isPointLightShadow!==!0&&this.type===an&&F(V,l),V.needsUpdate=!1}s=this.type,f.needsUpdate=!1,e.setRenderTarget(m,I,R)};function F(g,P){const l=n.update(G);p.defines.VSM_SAMPLES!==g.blurSamples&&(p.defines.VSM_SAMPLES=g.blurSamples,S.defines.VSM_SAMPLES=g.blurSamples,p.needsUpdate=!0,S.needsUpdate=!0),g.mapPass===null&&(g.mapPass=new Pt(c.x,c.y,{format:Jt,type:Gt})),p.uniforms.shadow_pass.value=g.map.depthTexture,p.uniforms.resolution.value=g.mapSize,p.uniforms.radius.value=g.radius,e.setRenderTarget(g.mapPass),e.clear(),e.renderBufferDirect(P,null,l,p,G,null),S.uniforms.shadow_pass.value=g.mapPass.texture,S.uniforms.resolution.value=g.mapSize,S.uniforms.radius.value=g.radius,e.setRenderTarget(g.map),e.clear(),e.renderBufferDirect(P,null,l,S,G,null)}function y(g,P,l,m){let I=null;const R=l.isPointLight===!0?g.customDistanceMaterial:g.customDepthMaterial;if(R!==void 0)I=R;else if(I=l.isPointLight===!0?C:_,e.localClippingEnabled&&P.clipShadows===!0&&Array.isArray(P.clippingPlanes)&&P.clippingPlanes.length!==0||P.displacementMap&&P.displacementScale!==0||P.alphaMap&&P.alphaTest>0||P.map&&P.alphaTest>0||P.alphaToCoverage===!0){const O=I.uuid,Q=P.uuid;let Z=M[O];Z===void 0&&(Z={},M[O]=Z);let k=Z[Q];k===void 0&&(k=I.clone(),Z[Q]=k,P.addEventListener("dispose",A)),I=k}if(I.visible=P.visible,I.wireframe=P.wireframe,m===an?I.side=P.shadowSide!==null?P.shadowSide:P.side:I.side=P.shadowSide!==null?P.shadowSide:D[P.side],I.alphaMap=P.alphaMap,I.alphaTest=P.alphaToCoverage===!0?.5:P.alphaTest,I.map=P.map,I.clipShadows=P.clipShadows,I.clippingPlanes=P.clippingPlanes,I.clipIntersection=P.clipIntersection,I.displacementMap=P.displacementMap,I.displacementScale=P.displacementScale,I.displacementBias=P.displacementBias,I.wireframeLinewidth=P.wireframeLinewidth,I.linewidth=P.linewidth,l.isPointLight===!0&&I.isMeshDistanceMaterial===!0){const O=e.properties.get(I);O.light=l}return I}function h(g,P,l,m,I){if(g.visible===!1)return;if(g.layers.test(P.layers)&&(g.isMesh||g.isLine||g.isPoints)&&(g.castShadow||g.receiveShadow&&I===an)&&(!g.frustumCulled||i.intersectsObject(g))){g.modelViewMatrix.multiplyMatrices(l.matrixWorldInverse,g.matrixWorld);const Q=n.update(g),Z=g.material;if(Array.isArray(Z)){const k=Q.groups;for(let Y=0,V=k.length;Y<V;Y++){const $=k[Y],ce=Z[$.materialIndex];if(ce&&ce.visible){const ge=y(g,ce,m,I);g.onBeforeShadow(e,g,P,l,Q,ge,$),e.renderBufferDirect(l,null,Q,ge,g,$),g.onAfterShadow(e,g,P,l,Q,ge,$)}}}else if(Z.visible){const k=y(g,Z,m,I);g.onBeforeShadow(e,g,P,l,Q,k,null),e.renderBufferDirect(l,null,Q,k,g,null),g.onAfterShadow(e,g,P,l,Q,k,null)}}const O=g.children;for(let Q=0,Z=O.length;Q<Z;Q++)h(O[Q],P,l,m,I)}function A(g){g.target.removeEventListener("dispose",A);for(const l in M){const m=M[l],I=g.target.uuid;I in m&&(m[I].dispose(),delete m[I])}}}function id(e,n){function t(){let v=!1;const ee=new mt;let z=null;const ae=new mt(0,0,0,0);return{setMask:function(de){z!==de&&!v&&(e.colorMask(de,de,de,de),z=de)},setLocked:function(de){v=de},setClear:function(de,q,_e,he,je){je===!0&&(de*=he,q*=he,_e*=he),ee.set(de,q,_e,he),ae.equals(ee)===!1&&(e.clearColor(de,q,_e,he),ae.copy(ee))},reset:function(){v=!1,z=null,ae.set(-1,0,0,0)}}}function i(){let v=!1,ee=!1,z=null,ae=null,de=null;return{setReversed:function(q){if(ee!==q){const _e=n.get("EXT_clip_control");q?_e.clipControlEXT(_e.LOWER_LEFT_EXT,_e.ZERO_TO_ONE_EXT):_e.clipControlEXT(_e.LOWER_LEFT_EXT,_e.NEGATIVE_ONE_TO_ONE_EXT),ee=q;const he=de;de=null,this.setClear(he)}},getReversed:function(){return ee},setTest:function(q){q?J(e.DEPTH_TEST):be(e.DEPTH_TEST)},setMask:function(q){z!==q&&!v&&(e.depthMask(q),z=q)},setFunc:function(q){if(ee&&(q=go[q]),ae!==q){switch(q){case eo:e.depthFunc(e.NEVER);break;case ja:e.depthFunc(e.ALWAYS);break;case Ja:e.depthFunc(e.LESS);break;case ci:e.depthFunc(e.LEQUAL);break;case Qa:e.depthFunc(e.EQUAL);break;case $a:e.depthFunc(e.GEQUAL);break;case Za:e.depthFunc(e.GREATER);break;case qa:e.depthFunc(e.NOTEQUAL);break;default:e.depthFunc(e.LEQUAL)}ae=q}},setLocked:function(q){v=q},setClear:function(q){de!==q&&(de=q,ee&&(q=1-q),e.clearDepth(q))},reset:function(){v=!1,z=null,ae=null,de=null,ee=!1}}}function c(){let v=!1,ee=null,z=null,ae=null,de=null,q=null,_e=null,he=null,je=null;return{setTest:function(Ye){v||(Ye?J(e.STENCIL_TEST):be(e.STENCIL_TEST))},setMask:function(Ye){ee!==Ye&&!v&&(e.stencilMask(Ye),ee=Ye)},setFunc:function(Ye,xt,Mt){(z!==Ye||ae!==xt||de!==Mt)&&(e.stencilFunc(Ye,xt,Mt),z=Ye,ae=xt,de=Mt)},setOp:function(Ye,xt,Mt){(q!==Ye||_e!==xt||he!==Mt)&&(e.stencilOp(Ye,xt,Mt),q=Ye,_e=xt,he=Mt)},setLocked:function(Ye){v=Ye},setClear:function(Ye){je!==Ye&&(e.clearStencil(Ye),je=Ye)},reset:function(){v=!1,ee=null,z=null,ae=null,de=null,q=null,_e=null,he=null,je=null}}}const o=new t,d=new i,_=new c,C=new WeakMap,M=new WeakMap;let W={},D={},p={},S=new WeakMap,b=[],G=null,f=!1,s=null,F=null,y=null,h=null,A=null,g=null,P=null,l=new $e(0,0,0),m=0,I=!1,R=null,O=null,Q=null,Z=null,k=null;const Y=e.getParameter(e.MAX_COMBINED_TEXTURE_IMAGE_UNITS);let V=!1,$=0;const ce=e.getParameter(e.VERSION);ce.indexOf("WebGL")!==-1?($=parseFloat(/^WebGL (\d)/.exec(ce)[1]),V=$>=1):ce.indexOf("OpenGL ES")!==-1&&($=parseFloat(/^OpenGL ES (\d)/.exec(ce)[1]),V=$>=2);let ge=null,ve={};const xe=e.getParameter(e.SCISSOR_BOX),Xe=e.getParameter(e.VIEWPORT),rt=new mt().fromArray(xe),He=new mt().fromArray(Xe);function K(v,ee,z,ae){const de=new Uint8Array(4),q=e.createTexture();e.bindTexture(v,q),e.texParameteri(v,e.TEXTURE_MIN_FILTER,e.NEAREST),e.texParameteri(v,e.TEXTURE_MAG_FILTER,e.NEAREST);for(let _e=0;_e<z;_e++)v===e.TEXTURE_3D||v===e.TEXTURE_2D_ARRAY?e.texImage3D(ee,0,e.RGBA,1,1,ae,0,e.RGBA,e.UNSIGNED_BYTE,de):e.texImage2D(ee+_e,0,e.RGBA,1,1,0,e.RGBA,e.UNSIGNED_BYTE,de);return q}const te={};te[e.TEXTURE_2D]=K(e.TEXTURE_2D,e.TEXTURE_2D,1),te[e.TEXTURE_CUBE_MAP]=K(e.TEXTURE_CUBE_MAP,e.TEXTURE_CUBE_MAP_POSITIVE_X,6),te[e.TEXTURE_2D_ARRAY]=K(e.TEXTURE_2D_ARRAY,e.TEXTURE_2D_ARRAY,1,1),te[e.TEXTURE_3D]=K(e.TEXTURE_3D,e.TEXTURE_3D,1,1),o.setClear(0,0,0,1),d.setClear(1),_.setClear(0),J(e.DEPTH_TEST),d.setFunc(ci),at(!1),st(Hi),J(e.CULL_FACE),Oe(Dt);function J(v){W[v]!==!0&&(e.enable(v),W[v]=!0)}function be(v){W[v]!==!1&&(e.disable(v),W[v]=!1)}function Ce(v,ee){return p[v]!==ee?(e.bindFramebuffer(v,ee),p[v]=ee,v===e.DRAW_FRAMEBUFFER&&(p[e.FRAMEBUFFER]=ee),v===e.FRAMEBUFFER&&(p[e.DRAW_FRAMEBUFFER]=ee),!0):!1}function Ae(v,ee){let z=b,ae=!1;if(v){z=S.get(ee),z===void 0&&(z=[],S.set(ee,z));const de=v.textures;if(z.length!==de.length||z[0]!==e.COLOR_ATTACHMENT0){for(let q=0,_e=de.length;q<_e;q++)z[q]=e.COLOR_ATTACHMENT0+q;z.length=de.length,ae=!0}}else z[0]!==e.BACK&&(z[0]=e.BACK,ae=!0);ae&&e.drawBuffers(z)}function tt(v){return G!==v?(e.useProgram(v),G=v,!0):!1}const we={[tn]:e.FUNC_ADD,[fa]:e.FUNC_SUBTRACT,[ca]:e.FUNC_REVERSE_SUBTRACT};we[vo]=e.MIN,we[So]=e.MAX;const We={[Ra]:e.ZERO,[Aa]:e.ONE,[Ta]:e.SRC_COLOR,[Ma]:e.SRC_ALPHA,[xa]:e.SRC_ALPHA_SATURATE,[Ea]:e.DST_COLOR,[Sa]:e.DST_ALPHA,[va]:e.ONE_MINUS_SRC_COLOR,[ga]:e.ONE_MINUS_SRC_ALPHA,[_a]:e.ONE_MINUS_DST_COLOR,[ma]:e.ONE_MINUS_DST_ALPHA,[ha]:e.CONSTANT_COLOR,[pa]:e.ONE_MINUS_CONSTANT_COLOR,[ua]:e.CONSTANT_ALPHA,[da]:e.ONE_MINUS_CONSTANT_ALPHA};function Oe(v,ee,z,ae,de,q,_e,he,je,Ye){if(v===Dt){f===!0&&(be(e.BLEND),f=!1);return}if(f===!1&&(J(e.BLEND),f=!0),v!==io){if(v!==s||Ye!==I){if((F!==tn||A!==tn)&&(e.blendEquation(e.FUNC_ADD),F=tn,A=tn),Ye)switch(v){case Sn:e.blendFuncSeparate(e.ONE,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case ki:e.blendFunc(e.ONE,e.ONE);break;case Wi:e.blendFuncSeparate(e.ZERO,e.ONE_MINUS_SRC_COLOR,e.ZERO,e.ONE);break;case Vi:e.blendFuncSeparate(e.DST_COLOR,e.ONE_MINUS_SRC_ALPHA,e.ZERO,e.ONE);break;default:Ze("WebGLState: Invalid blending: ",v);break}else switch(v){case Sn:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE_MINUS_SRC_ALPHA,e.ONE,e.ONE_MINUS_SRC_ALPHA);break;case ki:e.blendFuncSeparate(e.SRC_ALPHA,e.ONE,e.ONE,e.ONE);break;case Wi:Ze("WebGLState: SubtractiveBlending requires material.premultipliedAlpha = true");break;case Vi:Ze("WebGLState: MultiplyBlending requires material.premultipliedAlpha = true");break;default:Ze("WebGLState: Invalid blending: ",v);break}y=null,h=null,g=null,P=null,l.set(0,0,0),m=0,s=v,I=Ye}return}de=de||ee,q=q||z,_e=_e||ae,(ee!==F||de!==A)&&(e.blendEquationSeparate(we[ee],we[de]),F=ee,A=de),(z!==y||ae!==h||q!==g||_e!==P)&&(e.blendFuncSeparate(We[z],We[ae],We[q],We[_e]),y=z,h=ae,g=q,P=_e),(he.equals(l)===!1||je!==m)&&(e.blendColor(he.r,he.g,he.b,je),l.copy(he),m=je),s=v,I=!1}function ye(v,ee){v.side===Lt?be(e.CULL_FACE):J(e.CULL_FACE);let z=v.side===St;ee&&(z=!z),at(z),v.blending===Sn&&v.transparent===!1?Oe(Dt):Oe(v.blending,v.blendEquation,v.blendSrc,v.blendDst,v.blendEquationAlpha,v.blendSrcAlpha,v.blendDstAlpha,v.blendColor,v.blendAlpha,v.premultipliedAlpha),d.setFunc(v.depthFunc),d.setTest(v.depthTest),d.setMask(v.depthWrite),o.setMask(v.colorWrite);const ae=v.stencilWrite;_.setTest(ae),ae&&(_.setMask(v.stencilWriteMask),_.setFunc(v.stencilFunc,v.stencilRef,v.stencilFuncMask),_.setOp(v.stencilFail,v.stencilZFail,v.stencilZPass)),dt(v.polygonOffset,v.polygonOffsetFactor,v.polygonOffsetUnits),v.alphaToCoverage===!0?J(e.SAMPLE_ALPHA_TO_COVERAGE):be(e.SAMPLE_ALPHA_TO_COVERAGE)}function at(v){R!==v&&(v?e.frontFace(e.CW):e.frontFace(e.CCW),R=v)}function st(v){v!==to?(J(e.CULL_FACE),v!==O&&(v===Hi?e.cullFace(e.BACK):v===no?e.cullFace(e.FRONT):e.cullFace(e.FRONT_AND_BACK))):be(e.CULL_FACE),O=v}function ft(v){v!==Q&&(V&&e.lineWidth(v),Q=v)}function dt(v,ee,z){v?(J(e.POLYGON_OFFSET_FILL),(Z!==ee||k!==z)&&(Z=ee,k=z,d.getReversed()&&(ee=-ee),e.polygonOffset(ee,z))):be(e.POLYGON_OFFSET_FILL)}function Je(v){v?J(e.SCISSOR_TEST):be(e.SCISSOR_TEST)}function ot(v){v===void 0&&(v=e.TEXTURE0+Y-1),ge!==v&&(e.activeTexture(v),ge=v)}function E(v,ee,z){z===void 0&&(ge===null?z=e.TEXTURE0+Y-1:z=ge);let ae=ve[z];ae===void 0&&(ae={type:void 0,texture:void 0},ve[z]=ae),(ae.type!==v||ae.texture!==ee)&&(ge!==z&&(e.activeTexture(z),ge=z),e.bindTexture(v,ee||te[v]),ae.type=v,ae.texture=ee)}function pt(){const v=ve[ge];v!==void 0&&v.type!==void 0&&(e.bindTexture(v.type,null),v.type=void 0,v.texture=void 0)}function Ge(){try{e.compressedTexImage2D(...arguments)}catch(v){Ze("WebGLState:",v)}}function u(){try{e.compressedTexImage3D(...arguments)}catch(v){Ze("WebGLState:",v)}}function r(){try{e.texSubImage2D(...arguments)}catch(v){Ze("WebGLState:",v)}}function T(){try{e.texSubImage3D(...arguments)}catch(v){Ze("WebGLState:",v)}}function w(){try{e.compressedTexSubImage2D(...arguments)}catch(v){Ze("WebGLState:",v)}}function B(){try{e.compressedTexSubImage3D(...arguments)}catch(v){Ze("WebGLState:",v)}}function j(){try{e.texStorage2D(...arguments)}catch(v){Ze("WebGLState:",v)}}function ne(){try{e.texStorage3D(...arguments)}catch(v){Ze("WebGLState:",v)}}function H(){try{e.texImage2D(...arguments)}catch(v){Ze("WebGLState:",v)}}function X(){try{e.texImage3D(...arguments)}catch(v){Ze("WebGLState:",v)}}function ie(v){return D[v]!==void 0?D[v]:e.getParameter(v)}function Se(v,ee){D[v]!==ee&&(e.pixelStorei(v,ee),D[v]=ee)}function oe(v){rt.equals(v)===!1&&(e.scissor(v.x,v.y,v.z,v.w),rt.copy(v))}function re(v){He.equals(v)===!1&&(e.viewport(v.x,v.y,v.z,v.w),He.copy(v))}function Te(v,ee){let z=M.get(ee);z===void 0&&(z=new WeakMap,M.set(ee,z));let ae=z.get(v);ae===void 0&&(ae=e.getUniformBlockIndex(ee,v.name),z.set(v,ae))}function Re(v,ee){const ae=M.get(ee).get(v);C.get(ee)!==ae&&(e.uniformBlockBinding(ee,ae,v.__bindingPointIndex),C.set(ee,ae))}function Pe(){e.disable(e.BLEND),e.disable(e.CULL_FACE),e.disable(e.DEPTH_TEST),e.disable(e.POLYGON_OFFSET_FILL),e.disable(e.SCISSOR_TEST),e.disable(e.STENCIL_TEST),e.disable(e.SAMPLE_ALPHA_TO_COVERAGE),e.blendEquation(e.FUNC_ADD),e.blendFunc(e.ONE,e.ZERO),e.blendFuncSeparate(e.ONE,e.ZERO,e.ONE,e.ZERO),e.blendColor(0,0,0,0),e.colorMask(!0,!0,!0,!0),e.clearColor(0,0,0,0),e.depthMask(!0),e.depthFunc(e.LESS),d.setReversed(!1),e.clearDepth(1),e.stencilMask(4294967295),e.stencilFunc(e.ALWAYS,0,4294967295),e.stencilOp(e.KEEP,e.KEEP,e.KEEP),e.clearStencil(0),e.cullFace(e.BACK),e.frontFace(e.CCW),e.polygonOffset(0,0),e.activeTexture(e.TEXTURE0),e.bindFramebuffer(e.FRAMEBUFFER,null),e.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),e.bindFramebuffer(e.READ_FRAMEBUFFER,null),e.useProgram(null),e.lineWidth(1),e.scissor(0,0,e.canvas.width,e.canvas.height),e.viewport(0,0,e.canvas.width,e.canvas.height),e.pixelStorei(e.PACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_ALIGNMENT,4),e.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,!1),e.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,!1),e.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,e.BROWSER_DEFAULT_WEBGL),e.pixelStorei(e.PACK_ROW_LENGTH,0),e.pixelStorei(e.PACK_SKIP_PIXELS,0),e.pixelStorei(e.PACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_ROW_LENGTH,0),e.pixelStorei(e.UNPACK_IMAGE_HEIGHT,0),e.pixelStorei(e.UNPACK_SKIP_PIXELS,0),e.pixelStorei(e.UNPACK_SKIP_ROWS,0),e.pixelStorei(e.UNPACK_SKIP_IMAGES,0),W={},D={},ge=null,ve={},p={},S=new WeakMap,b=[],G=null,f=!1,s=null,F=null,y=null,h=null,A=null,g=null,P=null,l=new $e(0,0,0),m=0,I=!1,R=null,O=null,Q=null,Z=null,k=null,rt.set(0,0,e.canvas.width,e.canvas.height),He.set(0,0,e.canvas.width,e.canvas.height),o.reset(),d.reset(),_.reset()}return{buffers:{color:o,depth:d,stencil:_},enable:J,disable:be,bindFramebuffer:Ce,drawBuffers:Ae,useProgram:tt,setBlending:Oe,setMaterial:ye,setFlipSided:at,setCullFace:st,setLineWidth:ft,setPolygonOffset:dt,setScissorTest:Je,activeTexture:ot,bindTexture:E,unbindTexture:pt,compressedTexImage2D:Ge,compressedTexImage3D:u,texImage2D:H,texImage3D:X,pixelStorei:Se,getParameter:ie,updateUBOMapping:Te,uniformBlockBinding:Re,texStorage2D:j,texStorage3D:ne,texSubImage2D:r,texSubImage3D:T,compressedTexSubImage2D:w,compressedTexSubImage3D:B,scissor:oe,viewport:re,reset:Pe}}function rd(e,n,t,i,c,o,d){const _=n.has("WEBGL_multisampled_render_to_texture")?n.get("WEBGL_multisampled_render_to_texture"):null,C=typeof navigator>"u"?!1:/OculusBrowser/g.test(navigator.userAgent),M=new _t,W=new WeakMap,D=new Set;let p;const S=new WeakMap;let b=!1;try{b=typeof OffscreenCanvas<"u"&&new OffscreenCanvas(1,1).getContext("2d")!==null}catch{}function G(u,r){return b?new OffscreenCanvas(u,r):uo("canvas")}function f(u,r,T){let w=1;const B=Ge(u);if((B.width>T||B.height>T)&&(w=T/Math.max(B.width,B.height)),w<1)if(typeof HTMLImageElement<"u"&&u instanceof HTMLImageElement||typeof HTMLCanvasElement<"u"&&u instanceof HTMLCanvasElement||typeof ImageBitmap<"u"&&u instanceof ImageBitmap||typeof VideoFrame<"u"&&u instanceof VideoFrame){const j=Math.floor(w*B.width),ne=Math.floor(w*B.height);p===void 0&&(p=G(j,ne));const H=r?G(j,ne):p;return H.width=j,H.height=ne,H.getContext("2d").drawImage(u,0,0,j,ne),Be("WebGLRenderer: Texture has been resized from ("+B.width+"x"+B.height+") to ("+j+"x"+ne+")."),H}else return"data"in u&&Be("WebGLRenderer: Image in DataTexture is too big ("+B.width+"x"+B.height+")."),u;return u}function s(u){return u.generateMipmaps}function F(u){e.generateMipmap(u)}function y(u){return u.isWebGLCubeRenderTarget?e.TEXTURE_CUBE_MAP:u.isWebGL3DRenderTarget?e.TEXTURE_3D:u.isWebGLArrayRenderTarget||u.isCompressedArrayTexture?e.TEXTURE_2D_ARRAY:e.TEXTURE_2D}function h(u,r,T,w,B,j=!1){if(u!==null){if(e[u]!==void 0)return e[u];Be("WebGLRenderer: Attempt to use non-existing WebGL internal format '"+u+"'")}let ne;w&&(ne=n.get("EXT_texture_norm16"),ne||Be("WebGLRenderer: Unable to use normalized textures without EXT_texture_norm16 extension"));let H=r;if(r===e.RED&&(T===e.FLOAT&&(H=e.R32F),T===e.HALF_FLOAT&&(H=e.R16F),T===e.UNSIGNED_BYTE&&(H=e.R8),T===e.UNSIGNED_SHORT&&ne&&(H=ne.R16_EXT),T===e.SHORT&&ne&&(H=ne.R16_SNORM_EXT)),r===e.RED_INTEGER&&(T===e.UNSIGNED_BYTE&&(H=e.R8UI),T===e.UNSIGNED_SHORT&&(H=e.R16UI),T===e.UNSIGNED_INT&&(H=e.R32UI),T===e.BYTE&&(H=e.R8I),T===e.SHORT&&(H=e.R16I),T===e.INT&&(H=e.R32I)),r===e.RG&&(T===e.FLOAT&&(H=e.RG32F),T===e.HALF_FLOAT&&(H=e.RG16F),T===e.UNSIGNED_BYTE&&(H=e.RG8),T===e.UNSIGNED_SHORT&&ne&&(H=ne.RG16_EXT),T===e.SHORT&&ne&&(H=ne.RG16_SNORM_EXT)),r===e.RG_INTEGER&&(T===e.UNSIGNED_BYTE&&(H=e.RG8UI),T===e.UNSIGNED_SHORT&&(H=e.RG16UI),T===e.UNSIGNED_INT&&(H=e.RG32UI),T===e.BYTE&&(H=e.RG8I),T===e.SHORT&&(H=e.RG16I),T===e.INT&&(H=e.RG32I)),r===e.RGB_INTEGER&&(T===e.UNSIGNED_BYTE&&(H=e.RGB8UI),T===e.UNSIGNED_SHORT&&(H=e.RGB16UI),T===e.UNSIGNED_INT&&(H=e.RGB32UI),T===e.BYTE&&(H=e.RGB8I),T===e.SHORT&&(H=e.RGB16I),T===e.INT&&(H=e.RGB32I)),r===e.RGBA_INTEGER&&(T===e.UNSIGNED_BYTE&&(H=e.RGBA8UI),T===e.UNSIGNED_SHORT&&(H=e.RGBA16UI),T===e.UNSIGNED_INT&&(H=e.RGBA32UI),T===e.BYTE&&(H=e.RGBA8I),T===e.SHORT&&(H=e.RGBA16I),T===e.INT&&(H=e.RGBA32I)),r===e.RGB&&(T===e.UNSIGNED_SHORT&&ne&&(H=ne.RGB16_EXT),T===e.SHORT&&ne&&(H=ne.RGB16_SNORM_EXT),T===e.UNSIGNED_INT_5_9_9_9_REV&&(H=e.RGB9_E5),T===e.UNSIGNED_INT_10F_11F_11F_REV&&(H=e.R11F_G11F_B10F)),r===e.RGBA){const X=j?Or:Qe.getTransfer(B);T===e.FLOAT&&(H=e.RGBA32F),T===e.HALF_FLOAT&&(H=e.RGBA16F),T===e.UNSIGNED_BYTE&&(H=X===qe?e.SRGB8_ALPHA8:e.RGBA8),T===e.UNSIGNED_SHORT&&ne&&(H=ne.RGBA16_EXT),T===e.SHORT&&ne&&(H=ne.RGBA16_SNORM_EXT),T===e.UNSIGNED_SHORT_4_4_4_4&&(H=e.RGBA4),T===e.UNSIGNED_SHORT_5_5_5_1&&(H=e.RGB5_A1)}return(H===e.R16F||H===e.R32F||H===e.RG16F||H===e.RG32F||H===e.RGBA16F||H===e.RGBA32F)&&n.get("EXT_color_buffer_float"),H}function A(u,r){let T;return u?r===null||r===kt||r===cn?T=e.DEPTH24_STENCIL8:r===Ot?T=e.DEPTH32F_STENCIL8:r===xn&&(T=e.DEPTH24_STENCIL8,Be("DepthTexture: 16 bit depth attachment is not supported with stencil. Using 24-bit attachment.")):r===null||r===kt||r===cn?T=e.DEPTH_COMPONENT24:r===Ot?T=e.DEPTH_COMPONENT32F:r===xn&&(T=e.DEPTH_COMPONENT16),T}function g(u,r){return s(u)===!0||u.isFramebufferTexture&&u.minFilter!==Wt&&u.minFilter!==vt?Math.log2(Math.max(r.width,r.height))+1:u.mipmaps!==void 0&&u.mipmaps.length>0?u.mipmaps.length:u.isCompressedTexture&&Array.isArray(u.image)?r.mipmaps.length:1}function P(u){const r=u.target;r.removeEventListener("dispose",P),m(r),r.isVideoTexture&&W.delete(r),r.isHTMLTexture&&D.delete(r)}function l(u){const r=u.target;r.removeEventListener("dispose",l),R(r)}function m(u){const r=i.get(u);if(r.__webglInit===void 0)return;const T=u.source,w=S.get(T);if(w){const B=w[r.__cacheKey];B.usedTimes--,B.usedTimes===0&&I(u),Object.keys(w).length===0&&S.delete(T)}i.remove(u)}function I(u){const r=i.get(u);e.deleteTexture(r.__webglTexture);const T=u.source,w=S.get(T);delete w[r.__cacheKey],d.memory.textures--}function R(u){const r=i.get(u);if(u.depthTexture&&(u.depthTexture.dispose(),i.remove(u.depthTexture)),u.isWebGLCubeRenderTarget)for(let w=0;w<6;w++){if(Array.isArray(r.__webglFramebuffer[w]))for(let B=0;B<r.__webglFramebuffer[w].length;B++)e.deleteFramebuffer(r.__webglFramebuffer[w][B]);else e.deleteFramebuffer(r.__webglFramebuffer[w]);r.__webglDepthbuffer&&e.deleteRenderbuffer(r.__webglDepthbuffer[w])}else{if(Array.isArray(r.__webglFramebuffer))for(let w=0;w<r.__webglFramebuffer.length;w++)e.deleteFramebuffer(r.__webglFramebuffer[w]);else e.deleteFramebuffer(r.__webglFramebuffer);if(r.__webglDepthbuffer&&e.deleteRenderbuffer(r.__webglDepthbuffer),r.__webglMultisampledFramebuffer&&e.deleteFramebuffer(r.__webglMultisampledFramebuffer),r.__webglColorRenderbuffer)for(let w=0;w<r.__webglColorRenderbuffer.length;w++)r.__webglColorRenderbuffer[w]&&e.deleteRenderbuffer(r.__webglColorRenderbuffer[w]);r.__webglDepthRenderbuffer&&e.deleteRenderbuffer(r.__webglDepthRenderbuffer)}const T=u.textures;for(let w=0,B=T.length;w<B;w++){const j=i.get(T[w]);j.__webglTexture&&(e.deleteTexture(j.__webglTexture),d.memory.textures--),i.remove(T[w])}i.remove(u)}let O=0;function Q(){O=0}function Z(){return O}function k(u){O=u}function Y(){const u=O;return u>=c.maxTextures&&Be("WebGLTextures: Trying to use "+u+" texture units while this GPU supports only "+c.maxTextures),O+=1,u}function V(u){const r=[];return r.push(u.wrapS),r.push(u.wrapT),r.push(u.wrapR||0),r.push(u.magFilter),r.push(u.minFilter),r.push(u.anisotropy),r.push(u.internalFormat),r.push(u.format),r.push(u.type),r.push(u.generateMipmaps),r.push(u.premultiplyAlpha),r.push(u.flipY),r.push(u.unpackAlignment),r.push(u.colorSpace),r.join()}function $(u,r){const T=i.get(u);if(u.isVideoTexture&&E(u),u.isRenderTargetTexture===!1&&u.isExternalTexture!==!0&&u.version>0&&T.__version!==u.version){const w=u.image;if(w===null)Be("WebGLRenderer: Texture marked for update but no image data found.");else if(w.complete===!1)Be("WebGLRenderer: Texture marked for update but image is incomplete");else{be(T,u,r);return}}else u.isExternalTexture&&(T.__webglTexture=u.sourceTexture?u.sourceTexture:null);t.bindTexture(e.TEXTURE_2D,T.__webglTexture,e.TEXTURE0+r)}function ce(u,r){const T=i.get(u);if(u.isRenderTargetTexture===!1&&u.version>0&&T.__version!==u.version){be(T,u,r);return}else u.isExternalTexture&&(T.__webglTexture=u.sourceTexture?u.sourceTexture:null);t.bindTexture(e.TEXTURE_2D_ARRAY,T.__webglTexture,e.TEXTURE0+r)}function ge(u,r){const T=i.get(u);if(u.isRenderTargetTexture===!1&&u.version>0&&T.__version!==u.version){be(T,u,r);return}t.bindTexture(e.TEXTURE_3D,T.__webglTexture,e.TEXTURE0+r)}function ve(u,r){const T=i.get(u);if(u.isCubeDepthTexture!==!0&&u.version>0&&T.__version!==u.version){Ce(T,u,r);return}t.bindTexture(e.TEXTURE_CUBE_MAP,T.__webglTexture,e.TEXTURE0+r)}const xe={[Ca]:e.REPEAT,[Wn]:e.CLAMP_TO_EDGE,[ba]:e.MIRRORED_REPEAT},Xe={[Wt]:e.NEAREST,[Pa]:e.NEAREST_MIPMAP_NEAREST,[pn]:e.NEAREST_MIPMAP_LINEAR,[vt]:e.LINEAR,[Ln]:e.LINEAR_MIPMAP_NEAREST,[qt]:e.LINEAR_MIPMAP_LINEAR},rt={[Na]:e.NEVER,[Ia]:e.ALWAYS,[wa]:e.LESS,[Zn]:e.LEQUAL,[Da]:e.EQUAL,[qn]:e.GEQUAL,[Ua]:e.GREATER,[La]:e.NOTEQUAL};function He(u,r){if(r.type===Ot&&n.has("OES_texture_float_linear")===!1&&(r.magFilter===vt||r.magFilter===Ln||r.magFilter===pn||r.magFilter===qt||r.minFilter===vt||r.minFilter===Ln||r.minFilter===pn||r.minFilter===qt)&&Be("WebGLRenderer: Unable to use linear filtering with floating point textures. OES_texture_float_linear not supported on this device."),e.texParameteri(u,e.TEXTURE_WRAP_S,xe[r.wrapS]),e.texParameteri(u,e.TEXTURE_WRAP_T,xe[r.wrapT]),(u===e.TEXTURE_3D||u===e.TEXTURE_2D_ARRAY)&&e.texParameteri(u,e.TEXTURE_WRAP_R,xe[r.wrapR]),e.texParameteri(u,e.TEXTURE_MAG_FILTER,Xe[r.magFilter]),e.texParameteri(u,e.TEXTURE_MIN_FILTER,Xe[r.minFilter]),r.compareFunction&&(e.texParameteri(u,e.TEXTURE_COMPARE_MODE,e.COMPARE_REF_TO_TEXTURE),e.texParameteri(u,e.TEXTURE_COMPARE_FUNC,rt[r.compareFunction])),n.has("EXT_texture_filter_anisotropic")===!0){if(r.magFilter===Wt||r.minFilter!==pn&&r.minFilter!==qt||r.type===Ot&&n.has("OES_texture_float_linear")===!1)return;if(r.anisotropy>1||i.get(r).__currentAnisotropy){const T=n.get("EXT_texture_filter_anisotropic");e.texParameterf(u,T.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(r.anisotropy,c.getMaxAnisotropy())),i.get(r).__currentAnisotropy=r.anisotropy}}}function K(u,r){let T=!1;u.__webglInit===void 0&&(u.__webglInit=!0,r.addEventListener("dispose",P));const w=r.source;let B=S.get(w);B===void 0&&(B={},S.set(w,B));const j=V(r);if(j!==u.__cacheKey){B[j]===void 0&&(B[j]={texture:e.createTexture(),usedTimes:0},d.memory.textures++,T=!0),B[j].usedTimes++;const ne=B[u.__cacheKey];ne!==void 0&&(B[u.__cacheKey].usedTimes--,ne.usedTimes===0&&I(r)),u.__cacheKey=j,u.__webglTexture=B[j].texture}return T}function te(u,r,T){return Math.floor(Math.floor(u/T)/r)}function J(u,r,T,w){const j=u.updateRanges;if(j.length===0)t.texSubImage2D(e.TEXTURE_2D,0,0,0,r.width,r.height,T,w,r.data);else{j.sort((Se,oe)=>Se.start-oe.start);let ne=0;for(let Se=1;Se<j.length;Se++){const oe=j[ne],re=j[Se],Te=oe.start+oe.count,Re=te(re.start,r.width,4),Pe=te(oe.start,r.width,4);re.start<=Te+1&&Re===Pe&&te(re.start+re.count-1,r.width,4)===Re?oe.count=Math.max(oe.count,re.start+re.count-oe.start):(++ne,j[ne]=re)}j.length=ne+1;const H=t.getParameter(e.UNPACK_ROW_LENGTH),X=t.getParameter(e.UNPACK_SKIP_PIXELS),ie=t.getParameter(e.UNPACK_SKIP_ROWS);t.pixelStorei(e.UNPACK_ROW_LENGTH,r.width);for(let Se=0,oe=j.length;Se<oe;Se++){const re=j[Se],Te=Math.floor(re.start/4),Re=Math.ceil(re.count/4),Pe=Te%r.width,v=Math.floor(Te/r.width),ee=Re,z=1;t.pixelStorei(e.UNPACK_SKIP_PIXELS,Pe),t.pixelStorei(e.UNPACK_SKIP_ROWS,v),t.texSubImage2D(e.TEXTURE_2D,0,Pe,v,ee,z,T,w,r.data)}u.clearUpdateRanges(),t.pixelStorei(e.UNPACK_ROW_LENGTH,H),t.pixelStorei(e.UNPACK_SKIP_PIXELS,X),t.pixelStorei(e.UNPACK_SKIP_ROWS,ie)}}function be(u,r,T){let w=e.TEXTURE_2D;(r.isDataArrayTexture||r.isCompressedArrayTexture)&&(w=e.TEXTURE_2D_ARRAY),r.isData3DTexture&&(w=e.TEXTURE_3D);const B=K(u,r),j=r.source;t.bindTexture(w,u.__webglTexture,e.TEXTURE0+T);const ne=i.get(j);if(j.version!==ne.__version||B===!0){if(t.activeTexture(e.TEXTURE0+T),(typeof ImageBitmap<"u"&&r.image instanceof ImageBitmap)===!1){const z=Qe.getPrimaries(Qe.workingColorSpace),ae=r.colorSpace===Kt?null:Qe.getPrimaries(r.colorSpace),de=r.colorSpace===Kt||z===ae?e.NONE:e.BROWSER_DEFAULT_WEBGL;t.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,r.flipY),t.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,r.premultiplyAlpha),t.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,de)}t.pixelStorei(e.UNPACK_ALIGNMENT,r.unpackAlignment);let X=f(r.image,!1,c.maxTextureSize);X=pt(r,X);const ie=o.convert(r.format,r.colorSpace),Se=o.convert(r.type);let oe=h(r.internalFormat,ie,Se,r.normalized,r.colorSpace,r.isVideoTexture);He(w,r);let re;const Te=r.mipmaps,Re=r.isVideoTexture!==!0,Pe=ne.__version===void 0||B===!0,v=j.dataReady,ee=g(r,X);if(r.isDepthTexture)oe=A(r.format===Zt,r.type),Pe&&(Re?t.texStorage2D(e.TEXTURE_2D,1,oe,X.width,X.height):t.texImage2D(e.TEXTURE_2D,0,oe,X.width,X.height,0,ie,Se,null));else if(r.isDataTexture)if(Te.length>0){Re&&Pe&&t.texStorage2D(e.TEXTURE_2D,ee,oe,Te[0].width,Te[0].height);for(let z=0,ae=Te.length;z<ae;z++)re=Te[z],Re?v&&t.texSubImage2D(e.TEXTURE_2D,z,0,0,re.width,re.height,ie,Se,re.data):t.texImage2D(e.TEXTURE_2D,z,oe,re.width,re.height,0,ie,Se,re.data);r.generateMipmaps=!1}else Re?(Pe&&t.texStorage2D(e.TEXTURE_2D,ee,oe,X.width,X.height),v&&J(r,X,ie,Se)):t.texImage2D(e.TEXTURE_2D,0,oe,X.width,X.height,0,ie,Se,X.data);else if(r.isCompressedTexture)if(r.isCompressedArrayTexture){Re&&Pe&&t.texStorage3D(e.TEXTURE_2D_ARRAY,ee,oe,Te[0].width,Te[0].height,X.depth);for(let z=0,ae=Te.length;z<ae;z++)if(re=Te[z],r.format!==Ut)if(ie!==null)if(Re){if(v)if(r.layerUpdates.size>0){const de=Xi(re.width,re.height,r.format,r.type);for(const q of r.layerUpdates){const _e=re.data.subarray(q*de/re.data.BYTES_PER_ELEMENT,(q+1)*de/re.data.BYTES_PER_ELEMENT);t.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,z,0,0,q,re.width,re.height,1,ie,_e)}r.clearLayerUpdates()}else t.compressedTexSubImage3D(e.TEXTURE_2D_ARRAY,z,0,0,0,re.width,re.height,X.depth,ie,re.data)}else t.compressedTexImage3D(e.TEXTURE_2D_ARRAY,z,oe,re.width,re.height,X.depth,0,re.data,0,0);else Be("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()");else Re?v&&t.texSubImage3D(e.TEXTURE_2D_ARRAY,z,0,0,0,re.width,re.height,X.depth,ie,Se,re.data):t.texImage3D(e.TEXTURE_2D_ARRAY,z,oe,re.width,re.height,X.depth,0,ie,Se,re.data)}else{Re&&Pe&&t.texStorage2D(e.TEXTURE_2D,ee,oe,Te[0].width,Te[0].height);for(let z=0,ae=Te.length;z<ae;z++)re=Te[z],r.format!==Ut?ie!==null?Re?v&&t.compressedTexSubImage2D(e.TEXTURE_2D,z,0,0,re.width,re.height,ie,re.data):t.compressedTexImage2D(e.TEXTURE_2D,z,oe,re.width,re.height,0,re.data):Be("WebGLRenderer: Attempt to load unsupported compressed texture format in .uploadTexture()"):Re?v&&t.texSubImage2D(e.TEXTURE_2D,z,0,0,re.width,re.height,ie,Se,re.data):t.texImage2D(e.TEXTURE_2D,z,oe,re.width,re.height,0,ie,Se,re.data)}else if(r.isDataArrayTexture)if(Re){if(Pe&&t.texStorage3D(e.TEXTURE_2D_ARRAY,ee,oe,X.width,X.height,X.depth),v)if(r.layerUpdates.size>0){const z=Xi(X.width,X.height,r.format,r.type);for(const ae of r.layerUpdates){const de=X.data.subarray(ae*z/X.data.BYTES_PER_ELEMENT,(ae+1)*z/X.data.BYTES_PER_ELEMENT);t.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,ae,X.width,X.height,1,ie,Se,de)}r.clearLayerUpdates()}else t.texSubImage3D(e.TEXTURE_2D_ARRAY,0,0,0,0,X.width,X.height,X.depth,ie,Se,X.data)}else t.texImage3D(e.TEXTURE_2D_ARRAY,0,oe,X.width,X.height,X.depth,0,ie,Se,X.data);else if(r.isData3DTexture)Re?(Pe&&t.texStorage3D(e.TEXTURE_3D,ee,oe,X.width,X.height,X.depth),v&&t.texSubImage3D(e.TEXTURE_3D,0,0,0,0,X.width,X.height,X.depth,ie,Se,X.data)):t.texImage3D(e.TEXTURE_3D,0,oe,X.width,X.height,X.depth,0,ie,Se,X.data);else if(r.isFramebufferTexture){if(Pe)if(Re)t.texStorage2D(e.TEXTURE_2D,ee,oe,X.width,X.height);else{let z=X.width,ae=X.height;for(let de=0;de<ee;de++)t.texImage2D(e.TEXTURE_2D,de,oe,z,ae,0,ie,Se,null),z>>=1,ae>>=1}}else if(r.isHTMLTexture){if("texElementImage2D"in e){const z=e.canvas;if(z.hasAttribute("layoutsubtree")||z.setAttribute("layoutsubtree","true"),X.parentNode!==z){z.appendChild(X),D.add(r),z.onpaint=ae=>{const de=ae.changedElements;for(const q of D)de.includes(q.image)&&(q.needsUpdate=!0)},z.requestPaint();return}if(e.texElementImage2D.length===3)e.texElementImage2D(e.TEXTURE_2D,e.RGBA8,X);else{const de=e.RGBA,q=e.RGBA,_e=e.UNSIGNED_BYTE;e.texElementImage2D(e.TEXTURE_2D,0,de,q,_e,X)}e.texParameteri(e.TEXTURE_2D,e.TEXTURE_MIN_FILTER,e.LINEAR),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_S,e.CLAMP_TO_EDGE),e.texParameteri(e.TEXTURE_2D,e.TEXTURE_WRAP_T,e.CLAMP_TO_EDGE)}}else if(Te.length>0){if(Re&&Pe){const z=Ge(Te[0]);t.texStorage2D(e.TEXTURE_2D,ee,oe,z.width,z.height)}for(let z=0,ae=Te.length;z<ae;z++)re=Te[z],Re?v&&t.texSubImage2D(e.TEXTURE_2D,z,0,0,ie,Se,re):t.texImage2D(e.TEXTURE_2D,z,oe,ie,Se,re);r.generateMipmaps=!1}else if(Re){if(Pe){const z=Ge(X);t.texStorage2D(e.TEXTURE_2D,ee,oe,z.width,z.height)}v&&t.texSubImage2D(e.TEXTURE_2D,0,0,0,ie,Se,X)}else t.texImage2D(e.TEXTURE_2D,0,oe,ie,Se,X);s(r)&&F(w),ne.__version=j.version,r.onUpdate&&r.onUpdate(r)}u.__version=r.version}function Ce(u,r,T){if(r.image.length!==6)return;const w=K(u,r),B=r.source;t.bindTexture(e.TEXTURE_CUBE_MAP,u.__webglTexture,e.TEXTURE0+T);const j=i.get(B);if(B.version!==j.__version||w===!0){t.activeTexture(e.TEXTURE0+T);const ne=Qe.getPrimaries(Qe.workingColorSpace),H=r.colorSpace===Kt?null:Qe.getPrimaries(r.colorSpace),X=r.colorSpace===Kt||ne===H?e.NONE:e.BROWSER_DEFAULT_WEBGL;t.pixelStorei(e.UNPACK_FLIP_Y_WEBGL,r.flipY),t.pixelStorei(e.UNPACK_PREMULTIPLY_ALPHA_WEBGL,r.premultiplyAlpha),t.pixelStorei(e.UNPACK_ALIGNMENT,r.unpackAlignment),t.pixelStorei(e.UNPACK_COLORSPACE_CONVERSION_WEBGL,X);const ie=r.isCompressedTexture||r.image[0].isCompressedTexture,Se=r.image[0]&&r.image[0].isDataTexture,oe=[];for(let q=0;q<6;q++)!ie&&!Se?oe[q]=f(r.image[q],!0,c.maxCubemapSize):oe[q]=Se?r.image[q].image:r.image[q],oe[q]=pt(r,oe[q]);const re=oe[0],Te=o.convert(r.format,r.colorSpace),Re=o.convert(r.type),Pe=h(r.internalFormat,Te,Re,r.normalized,r.colorSpace),v=r.isVideoTexture!==!0,ee=j.__version===void 0||w===!0,z=B.dataReady;let ae=g(r,re);He(e.TEXTURE_CUBE_MAP,r);let de;if(ie){v&&ee&&t.texStorage2D(e.TEXTURE_CUBE_MAP,ae,Pe,re.width,re.height);for(let q=0;q<6;q++){de=oe[q].mipmaps;for(let _e=0;_e<de.length;_e++){const he=de[_e];r.format!==Ut?Te!==null?v?z&&t.compressedTexSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e,0,0,he.width,he.height,Te,he.data):t.compressedTexImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e,Pe,he.width,he.height,0,he.data):Be("WebGLRenderer: Attempt to load unsupported compressed texture format in .setTextureCube()"):v?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e,0,0,he.width,he.height,Te,Re,he.data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e,Pe,he.width,he.height,0,Te,Re,he.data)}}}else{if(de=r.mipmaps,v&&ee){de.length>0&&ae++;const q=Ge(oe[0]);t.texStorage2D(e.TEXTURE_CUBE_MAP,ae,Pe,q.width,q.height)}for(let q=0;q<6;q++)if(Se){v?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,0,0,0,oe[q].width,oe[q].height,Te,Re,oe[q].data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,0,Pe,oe[q].width,oe[q].height,0,Te,Re,oe[q].data);for(let _e=0;_e<de.length;_e++){const je=de[_e].image[q].image;v?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e+1,0,0,je.width,je.height,Te,Re,je.data):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e+1,Pe,je.width,je.height,0,Te,Re,je.data)}}else{v?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,0,0,0,Te,Re,oe[q]):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,0,Pe,Te,Re,oe[q]);for(let _e=0;_e<de.length;_e++){const he=de[_e];v?z&&t.texSubImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e+1,0,0,Te,Re,he.image[q]):t.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+q,_e+1,Pe,Te,Re,he.image[q])}}}s(r)&&F(e.TEXTURE_CUBE_MAP),j.__version=B.version,r.onUpdate&&r.onUpdate(r)}u.__version=r.version}function Ae(u,r,T,w,B,j){const ne=o.convert(T.format,T.colorSpace),H=o.convert(T.type),X=h(T.internalFormat,ne,H,T.normalized,T.colorSpace),ie=i.get(r),Se=i.get(T);if(Se.__renderTarget=r,!ie.__hasExternalTextures){const oe=Math.max(1,r.width>>j),re=Math.max(1,r.height>>j);B===e.TEXTURE_3D||B===e.TEXTURE_2D_ARRAY?t.texImage3D(B,j,X,oe,re,r.depth,0,ne,H,null):t.texImage2D(B,j,X,oe,re,0,ne,H,null)}t.bindFramebuffer(e.FRAMEBUFFER,u),ot(r)?_.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,w,B,Se.__webglTexture,0,Je(r)):(B===e.TEXTURE_2D||B>=e.TEXTURE_CUBE_MAP_POSITIVE_X&&B<=e.TEXTURE_CUBE_MAP_NEGATIVE_Z)&&e.framebufferTexture2D(e.FRAMEBUFFER,w,B,Se.__webglTexture,j),t.bindFramebuffer(e.FRAMEBUFFER,null)}function tt(u,r,T){if(e.bindRenderbuffer(e.RENDERBUFFER,u),r.depthBuffer){const w=r.depthTexture,B=w&&w.isDepthTexture?w.type:null,j=A(r.stencilBuffer,B),ne=r.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;ot(r)?_.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Je(r),j,r.width,r.height):T?e.renderbufferStorageMultisample(e.RENDERBUFFER,Je(r),j,r.width,r.height):e.renderbufferStorage(e.RENDERBUFFER,j,r.width,r.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,ne,e.RENDERBUFFER,u)}else{const w=r.textures;for(let B=0;B<w.length;B++){const j=w[B],ne=o.convert(j.format,j.colorSpace),H=o.convert(j.type),X=h(j.internalFormat,ne,H,j.normalized,j.colorSpace);ot(r)?_.renderbufferStorageMultisampleEXT(e.RENDERBUFFER,Je(r),X,r.width,r.height):T?e.renderbufferStorageMultisample(e.RENDERBUFFER,Je(r),X,r.width,r.height):e.renderbufferStorage(e.RENDERBUFFER,X,r.width,r.height)}}e.bindRenderbuffer(e.RENDERBUFFER,null)}function we(u,r,T){const w=r.isWebGLCubeRenderTarget===!0;if(t.bindFramebuffer(e.FRAMEBUFFER,u),!(r.depthTexture&&r.depthTexture.isDepthTexture))throw new Error("THREE.WebGLTextures: renderTarget.depthTexture must be an instance of THREE.DepthTexture.");const B=i.get(r.depthTexture);if(B.__renderTarget=r,(!B.__webglTexture||r.depthTexture.image.width!==r.width||r.depthTexture.image.height!==r.height)&&(r.depthTexture.image.width=r.width,r.depthTexture.image.height=r.height,r.depthTexture.needsUpdate=!0),w){if(B.__webglInit===void 0&&(B.__webglInit=!0,r.depthTexture.addEventListener("dispose",P)),B.__webglTexture===void 0){B.__webglTexture=e.createTexture(),t.bindTexture(e.TEXTURE_CUBE_MAP,B.__webglTexture),He(e.TEXTURE_CUBE_MAP,r.depthTexture);const ie=o.convert(r.depthTexture.format),Se=o.convert(r.depthTexture.type);let oe;r.depthTexture.format===Qt?oe=e.DEPTH_COMPONENT24:r.depthTexture.format===Zt&&(oe=e.DEPTH24_STENCIL8);for(let re=0;re<6;re++)e.texImage2D(e.TEXTURE_CUBE_MAP_POSITIVE_X+re,0,oe,r.width,r.height,0,ie,Se,null)}}else $(r.depthTexture,0);const j=B.__webglTexture,ne=Je(r),H=w?e.TEXTURE_CUBE_MAP_POSITIVE_X+T:e.TEXTURE_2D,X=r.depthTexture.format===Zt?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;if(r.depthTexture.format===Qt)ot(r)?_.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,X,H,j,0,ne):e.framebufferTexture2D(e.FRAMEBUFFER,X,H,j,0);else if(r.depthTexture.format===Zt)ot(r)?_.framebufferTexture2DMultisampleEXT(e.FRAMEBUFFER,X,H,j,0,ne):e.framebufferTexture2D(e.FRAMEBUFFER,X,H,j,0);else throw new Error("THREE.WebGLTextures: Unknown depthTexture format.")}function We(u){const r=i.get(u),T=u.isWebGLCubeRenderTarget===!0;if(r.__boundDepthTexture!==u.depthTexture){const w=u.depthTexture;if(r.__depthDisposeCallback&&r.__depthDisposeCallback(),w){const B=()=>{delete r.__boundDepthTexture,delete r.__depthDisposeCallback,w.removeEventListener("dispose",B)};w.addEventListener("dispose",B),r.__depthDisposeCallback=B}r.__boundDepthTexture=w}if(u.depthTexture&&!r.__autoAllocateDepthBuffer)if(T)for(let w=0;w<6;w++)we(r.__webglFramebuffer[w],u,w);else{const w=u.texture.mipmaps;w&&w.length>0?we(r.__webglFramebuffer[0],u,0):we(r.__webglFramebuffer,u,0)}else if(T){r.__webglDepthbuffer=[];for(let w=0;w<6;w++)if(t.bindFramebuffer(e.FRAMEBUFFER,r.__webglFramebuffer[w]),r.__webglDepthbuffer[w]===void 0)r.__webglDepthbuffer[w]=e.createRenderbuffer(),tt(r.__webglDepthbuffer[w],u,!1);else{const B=u.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,j=r.__webglDepthbuffer[w];e.bindRenderbuffer(e.RENDERBUFFER,j),e.framebufferRenderbuffer(e.FRAMEBUFFER,B,e.RENDERBUFFER,j)}}else{const w=u.texture.mipmaps;if(w&&w.length>0?t.bindFramebuffer(e.FRAMEBUFFER,r.__webglFramebuffer[0]):t.bindFramebuffer(e.FRAMEBUFFER,r.__webglFramebuffer),r.__webglDepthbuffer===void 0)r.__webglDepthbuffer=e.createRenderbuffer(),tt(r.__webglDepthbuffer,u,!1);else{const B=u.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,j=r.__webglDepthbuffer;e.bindRenderbuffer(e.RENDERBUFFER,j),e.framebufferRenderbuffer(e.FRAMEBUFFER,B,e.RENDERBUFFER,j)}}t.bindFramebuffer(e.FRAMEBUFFER,null)}function Oe(u,r,T){const w=i.get(u);r!==void 0&&Ae(w.__webglFramebuffer,u,u.texture,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,0),T!==void 0&&We(u)}function ye(u){const r=u.texture,T=i.get(u),w=i.get(r);u.addEventListener("dispose",l);const B=u.textures,j=u.isWebGLCubeRenderTarget===!0,ne=B.length>1;if(ne||(w.__webglTexture===void 0&&(w.__webglTexture=e.createTexture()),w.__version=r.version,d.memory.textures++),j){T.__webglFramebuffer=[];for(let H=0;H<6;H++)if(r.mipmaps&&r.mipmaps.length>0){T.__webglFramebuffer[H]=[];for(let X=0;X<r.mipmaps.length;X++)T.__webglFramebuffer[H][X]=e.createFramebuffer()}else T.__webglFramebuffer[H]=e.createFramebuffer()}else{if(r.mipmaps&&r.mipmaps.length>0){T.__webglFramebuffer=[];for(let H=0;H<r.mipmaps.length;H++)T.__webglFramebuffer[H]=e.createFramebuffer()}else T.__webglFramebuffer=e.createFramebuffer();if(ne)for(let H=0,X=B.length;H<X;H++){const ie=i.get(B[H]);ie.__webglTexture===void 0&&(ie.__webglTexture=e.createTexture(),d.memory.textures++)}if(u.samples>0&&ot(u)===!1){T.__webglMultisampledFramebuffer=e.createFramebuffer(),T.__webglColorRenderbuffer=[],t.bindFramebuffer(e.FRAMEBUFFER,T.__webglMultisampledFramebuffer);for(let H=0;H<B.length;H++){const X=B[H];T.__webglColorRenderbuffer[H]=e.createRenderbuffer(),e.bindRenderbuffer(e.RENDERBUFFER,T.__webglColorRenderbuffer[H]);const ie=o.convert(X.format,X.colorSpace),Se=o.convert(X.type),oe=h(X.internalFormat,ie,Se,X.normalized,X.colorSpace,u.isXRRenderTarget===!0),re=Je(u);e.renderbufferStorageMultisample(e.RENDERBUFFER,re,oe,u.width,u.height),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+H,e.RENDERBUFFER,T.__webglColorRenderbuffer[H])}e.bindRenderbuffer(e.RENDERBUFFER,null),u.depthBuffer&&(T.__webglDepthRenderbuffer=e.createRenderbuffer(),tt(T.__webglDepthRenderbuffer,u,!0)),t.bindFramebuffer(e.FRAMEBUFFER,null)}}if(j){t.bindTexture(e.TEXTURE_CUBE_MAP,w.__webglTexture),He(e.TEXTURE_CUBE_MAP,r);for(let H=0;H<6;H++)if(r.mipmaps&&r.mipmaps.length>0)for(let X=0;X<r.mipmaps.length;X++)Ae(T.__webglFramebuffer[H][X],u,r,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+H,X);else Ae(T.__webglFramebuffer[H],u,r,e.COLOR_ATTACHMENT0,e.TEXTURE_CUBE_MAP_POSITIVE_X+H,0);s(r)&&F(e.TEXTURE_CUBE_MAP),t.unbindTexture()}else if(ne){for(let H=0,X=B.length;H<X;H++){const ie=B[H],Se=i.get(ie);let oe=e.TEXTURE_2D;(u.isWebGL3DRenderTarget||u.isWebGLArrayRenderTarget)&&(oe=u.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),t.bindTexture(oe,Se.__webglTexture),He(oe,ie),Ae(T.__webglFramebuffer,u,ie,e.COLOR_ATTACHMENT0+H,oe,0),s(ie)&&F(oe)}t.unbindTexture()}else{let H=e.TEXTURE_2D;if((u.isWebGL3DRenderTarget||u.isWebGLArrayRenderTarget)&&(H=u.isWebGL3DRenderTarget?e.TEXTURE_3D:e.TEXTURE_2D_ARRAY),t.bindTexture(H,w.__webglTexture),He(H,r),r.mipmaps&&r.mipmaps.length>0)for(let X=0;X<r.mipmaps.length;X++)Ae(T.__webglFramebuffer[X],u,r,e.COLOR_ATTACHMENT0,H,X);else Ae(T.__webglFramebuffer,u,r,e.COLOR_ATTACHMENT0,H,0);s(r)&&F(H),t.unbindTexture()}u.depthBuffer&&We(u)}function at(u){const r=u.textures;for(let T=0,w=r.length;T<w;T++){const B=r[T];if(s(B)){const j=y(u),ne=i.get(B).__webglTexture;t.bindTexture(j,ne),F(j),t.unbindTexture()}}}const st=[],ft=[];function dt(u){if(u.samples>0){if(ot(u)===!1){const r=u.textures,T=u.width,w=u.height;let B=e.COLOR_BUFFER_BIT;const j=u.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT,ne=i.get(u),H=r.length>1;if(H)for(let ie=0;ie<r.length;ie++)t.bindFramebuffer(e.FRAMEBUFFER,ne.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ie,e.RENDERBUFFER,null),t.bindFramebuffer(e.FRAMEBUFFER,ne.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+ie,e.TEXTURE_2D,null,0);t.bindFramebuffer(e.READ_FRAMEBUFFER,ne.__webglMultisampledFramebuffer);const X=u.texture.mipmaps;X&&X.length>0?t.bindFramebuffer(e.DRAW_FRAMEBUFFER,ne.__webglFramebuffer[0]):t.bindFramebuffer(e.DRAW_FRAMEBUFFER,ne.__webglFramebuffer);for(let ie=0;ie<r.length;ie++){if(u.resolveDepthBuffer&&(u.depthBuffer&&(B|=e.DEPTH_BUFFER_BIT),u.stencilBuffer&&u.resolveStencilBuffer&&(B|=e.STENCIL_BUFFER_BIT)),H){e.framebufferRenderbuffer(e.READ_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.RENDERBUFFER,ne.__webglColorRenderbuffer[ie]);const Se=i.get(r[ie]).__webglTexture;e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0,e.TEXTURE_2D,Se,0)}e.blitFramebuffer(0,0,T,w,0,0,T,w,B,e.NEAREST),C===!0&&(st.length=0,ft.length=0,st.push(e.COLOR_ATTACHMENT0+ie),u.depthBuffer&&u.resolveDepthBuffer===!1&&(st.push(j),ft.push(j),e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,ft)),e.invalidateFramebuffer(e.READ_FRAMEBUFFER,st))}if(t.bindFramebuffer(e.READ_FRAMEBUFFER,null),t.bindFramebuffer(e.DRAW_FRAMEBUFFER,null),H)for(let ie=0;ie<r.length;ie++){t.bindFramebuffer(e.FRAMEBUFFER,ne.__webglMultisampledFramebuffer),e.framebufferRenderbuffer(e.FRAMEBUFFER,e.COLOR_ATTACHMENT0+ie,e.RENDERBUFFER,ne.__webglColorRenderbuffer[ie]);const Se=i.get(r[ie]).__webglTexture;t.bindFramebuffer(e.FRAMEBUFFER,ne.__webglFramebuffer),e.framebufferTexture2D(e.DRAW_FRAMEBUFFER,e.COLOR_ATTACHMENT0+ie,e.TEXTURE_2D,Se,0)}t.bindFramebuffer(e.DRAW_FRAMEBUFFER,ne.__webglMultisampledFramebuffer)}else if(u.depthBuffer&&u.resolveDepthBuffer===!1&&C){const r=u.stencilBuffer?e.DEPTH_STENCIL_ATTACHMENT:e.DEPTH_ATTACHMENT;e.invalidateFramebuffer(e.DRAW_FRAMEBUFFER,[r])}}}function Je(u){return Math.min(c.maxSamples,u.samples)}function ot(u){const r=i.get(u);return u.samples>0&&n.has("WEBGL_multisampled_render_to_texture")===!0&&r.__useRenderToTexture!==!1}function E(u){const r=d.render.frame;W.get(u)!==r&&(W.set(u,r),u.update())}function pt(u,r){const T=u.colorSpace,w=u.format,B=u.type;return u.isCompressedTexture===!0||u.isVideoTexture===!0||T!==Fr&&T!==Kt&&(Qe.getTransfer(T)===qe?(w!==Ut||B!==bt)&&Be("WebGLTextures: sRGB encoded textures have to use RGBAFormat and UnsignedByteType."):Ze("WebGLTextures: Unsupported texture color space:",T)),r}function Ge(u){return typeof HTMLImageElement<"u"&&u instanceof HTMLImageElement?(M.width=u.naturalWidth||u.width,M.height=u.naturalHeight||u.height):typeof VideoFrame<"u"&&u instanceof VideoFrame?(M.width=u.displayWidth,M.height=u.displayHeight):(M.width=u.width,M.height=u.height),M}this.allocateTextureUnit=Y,this.resetTextureUnits=Q,this.getTextureUnits=Z,this.setTextureUnits=k,this.setTexture2D=$,this.setTexture2DArray=ce,this.setTexture3D=ge,this.setTextureCube=ve,this.rebindTextures=Oe,this.setupRenderTarget=ye,this.updateRenderTargetMipmap=at,this.updateMultisampleRenderTarget=dt,this.setupDepthRenderbuffer=We,this.setupFrameBufferTexture=Ae,this.useMultisampledRTT=ot,this.isReversedDepthBuffer=function(){return t.buffers.depth.getReversed()}}function ad(e,n){function t(i,c=Kt){let o;const d=Qe.getTransfer(c);if(i===bt)return e.UNSIGNED_BYTE;if(i===xr)return e.UNSIGNED_SHORT_4_4_4_4;if(i===Mr)return e.UNSIGNED_SHORT_5_5_5_1;if(i===Va)return e.UNSIGNED_INT_5_9_9_9_REV;if(i===Wa)return e.UNSIGNED_INT_10F_11F_11F_REV;if(i===ka)return e.BYTE;if(i===za)return e.SHORT;if(i===xn)return e.UNSIGNED_SHORT;if(i===Rr)return e.INT;if(i===kt)return e.UNSIGNED_INT;if(i===Ot)return e.FLOAT;if(i===Gt)return e.HALF_FLOAT;if(i===Xa)return e.ALPHA;if(i===Ya)return e.RGB;if(i===Ut)return e.RGBA;if(i===Qt)return e.DEPTH_COMPONENT;if(i===Zt)return e.DEPTH_STENCIL;if(i===Ka)return e.RED;if(i===Er)return e.RED_INTEGER;if(i===Jt)return e.RG;if(i===Sr)return e.RG_INTEGER;if(i===vr)return e.RGBA_INTEGER;if(i===Un||i===Dn||i===wn||i===In)if(d===qe)if(o=n.get("WEBGL_compressed_texture_s3tc_srgb"),o!==null){if(i===Un)return o.COMPRESSED_SRGB_S3TC_DXT1_EXT;if(i===Dn)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT1_EXT;if(i===wn)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT3_EXT;if(i===In)return o.COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT}else return null;else if(o=n.get("WEBGL_compressed_texture_s3tc"),o!==null){if(i===Un)return o.COMPRESSED_RGB_S3TC_DXT1_EXT;if(i===Dn)return o.COMPRESSED_RGBA_S3TC_DXT1_EXT;if(i===wn)return o.COMPRESSED_RGBA_S3TC_DXT3_EXT;if(i===In)return o.COMPRESSED_RGBA_S3TC_DXT5_EXT}else return null;if(i===fi||i===di||i===ui||i===pi)if(o=n.get("WEBGL_compressed_texture_pvrtc"),o!==null){if(i===fi)return o.COMPRESSED_RGB_PVRTC_4BPPV1_IMG;if(i===di)return o.COMPRESSED_RGB_PVRTC_2BPPV1_IMG;if(i===ui)return o.COMPRESSED_RGBA_PVRTC_4BPPV1_IMG;if(i===pi)return o.COMPRESSED_RGBA_PVRTC_2BPPV1_IMG}else return null;if(i===hi||i===mi||i===_i||i===gi||i===vi||i===kn||i===Si)if(o=n.get("WEBGL_compressed_texture_etc"),o!==null){if(i===hi||i===mi)return d===qe?o.COMPRESSED_SRGB8_ETC2:o.COMPRESSED_RGB8_ETC2;if(i===_i)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ETC2_EAC:o.COMPRESSED_RGBA8_ETC2_EAC;if(i===gi)return o.COMPRESSED_R11_EAC;if(i===vi)return o.COMPRESSED_SIGNED_R11_EAC;if(i===kn)return o.COMPRESSED_RG11_EAC;if(i===Si)return o.COMPRESSED_SIGNED_RG11_EAC}else return null;if(i===Ei||i===xi||i===Mi||i===Ti||i===Ai||i===Ri||i===bi||i===Ci||i===Pi||i===Li||i===Ui||i===Di||i===wi||i===Ii)if(o=n.get("WEBGL_compressed_texture_astc"),o!==null){if(i===Ei)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR:o.COMPRESSED_RGBA_ASTC_4x4_KHR;if(i===xi)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x4_KHR:o.COMPRESSED_RGBA_ASTC_5x4_KHR;if(i===Mi)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_5x5_KHR:o.COMPRESSED_RGBA_ASTC_5x5_KHR;if(i===Ti)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x5_KHR:o.COMPRESSED_RGBA_ASTC_6x5_KHR;if(i===Ai)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_6x6_KHR:o.COMPRESSED_RGBA_ASTC_6x6_KHR;if(i===Ri)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x5_KHR:o.COMPRESSED_RGBA_ASTC_8x5_KHR;if(i===bi)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x6_KHR:o.COMPRESSED_RGBA_ASTC_8x6_KHR;if(i===Ci)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_8x8_KHR:o.COMPRESSED_RGBA_ASTC_8x8_KHR;if(i===Pi)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x5_KHR:o.COMPRESSED_RGBA_ASTC_10x5_KHR;if(i===Li)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x6_KHR:o.COMPRESSED_RGBA_ASTC_10x6_KHR;if(i===Ui)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x8_KHR:o.COMPRESSED_RGBA_ASTC_10x8_KHR;if(i===Di)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_10x10_KHR:o.COMPRESSED_RGBA_ASTC_10x10_KHR;if(i===wi)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x10_KHR:o.COMPRESSED_RGBA_ASTC_12x10_KHR;if(i===Ii)return d===qe?o.COMPRESSED_SRGB8_ALPHA8_ASTC_12x12_KHR:o.COMPRESSED_RGBA_ASTC_12x12_KHR}else return null;if(i===Ni||i===yi||i===Fi)if(o=n.get("EXT_texture_compression_bptc"),o!==null){if(i===Ni)return d===qe?o.COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT:o.COMPRESSED_RGBA_BPTC_UNORM_EXT;if(i===yi)return o.COMPRESSED_RGB_BPTC_SIGNED_FLOAT_EXT;if(i===Fi)return o.COMPRESSED_RGB_BPTC_UNSIGNED_FLOAT_EXT}else return null;if(i===Oi||i===Bi||i===zn||i===Gi)if(o=n.get("EXT_texture_compression_rgtc"),o!==null){if(i===Oi)return o.COMPRESSED_RED_RGTC1_EXT;if(i===Bi)return o.COMPRESSED_SIGNED_RED_RGTC1_EXT;if(i===zn)return o.COMPRESSED_RED_GREEN_RGTC2_EXT;if(i===Gi)return o.COMPRESSED_SIGNED_RED_GREEN_RGTC2_EXT}else return null;return i===cn?e.UNSIGNED_INT_24_8:e[i]!==void 0?e[i]:null}return{convert:t}}const od=`
void main() {

	gl_Position = vec4( position, 1.0 );

}`,sd=`
uniform sampler2DArray depthColor;
uniform float depthWidth;
uniform float depthHeight;

void main() {

	vec2 coord = vec2( gl_FragCoord.x / depthWidth, gl_FragCoord.y / depthHeight );

	if ( coord.x >= 1.0 ) {

		gl_FragDepth = texture( depthColor, vec3( coord.x - 1.0, coord.y, 1 ) ).r;

	} else {

		gl_FragDepth = texture( depthColor, vec3( coord.x, coord.y, 0 ) ).r;

	}

}`;class ld{constructor(){this.texture=null,this.mesh=null,this.depthNear=0,this.depthFar=0}init(n,t){if(this.texture===null){const i=new Tr(n.texture);(n.depthNear!==t.depthNear||n.depthFar!==t.depthFar)&&(this.depthNear=n.depthNear,this.depthFar=n.depthFar),this.texture=i}}getMesh(n){if(this.texture!==null&&this.mesh===null){const t=n.cameras[0].viewport,i=new It({vertexShader:od,fragmentShader:sd,uniforms:{depthColor:{value:this.texture},depthWidth:{value:t.z},depthHeight:{value:t.w}}});this.mesh=new wt(new Ar(20,20),i)}return this.mesh}reset(){this.texture=null,this.mesh=null}getDepthTexture(){return this.texture}}class cd extends ra{constructor(n,t){super();const i=this;let c=null,o=1,d=null,_="local-floor",C=1,M=null,W=null,D=null,p=null,S=null,b=null;const G=typeof XRWebGLBinding<"u",f=new ld,s={},F=t.getContextAttributes();let y=null,h=null;const A=[],g=[],P=new _t;let l=null;const m=new _n;m.viewport=new mt;const I=new _n;I.viewport=new mt;const R=[m,I],O=new aa;let Q=null,Z=null;this.cameraAutoUpdate=!0,this.enabled=!1,this.isPresenting=!1,this.getController=function(K){let te=A[K];return te===void 0&&(te=new Pn,A[K]=te),te.getTargetRaySpace()},this.getControllerGrip=function(K){let te=A[K];return te===void 0&&(te=new Pn,A[K]=te),te.getGripSpace()},this.getHand=function(K){let te=A[K];return te===void 0&&(te=new Pn,A[K]=te),te.getHandSpace()};function k(K){const te=g.indexOf(K.inputSource);if(te===-1)return;const J=A[te];J!==void 0&&(J.update(K.inputSource,K.frame,M||d),J.dispatchEvent({type:K.type,data:K.inputSource}))}function Y(){c.removeEventListener("select",k),c.removeEventListener("selectstart",k),c.removeEventListener("selectend",k),c.removeEventListener("squeeze",k),c.removeEventListener("squeezestart",k),c.removeEventListener("squeezeend",k),c.removeEventListener("end",Y),c.removeEventListener("inputsourceschange",V);for(let K=0;K<A.length;K++){const te=g[K];te!==null&&(g[K]=null,A[K].disconnect(te))}Q=null,Z=null,f.reset();for(const K in s)delete s[K];n.setRenderTarget(y),S=null,p=null,D=null,c=null,h=null,He.stop(),i.isPresenting=!1,n.setPixelRatio(l),n.setSize(P.width,P.height,!1),i.dispatchEvent({type:"sessionend"})}this.setFramebufferScaleFactor=function(K){o=K,i.isPresenting===!0&&Be("WebXRManager: Cannot change framebuffer scale while presenting.")},this.setReferenceSpaceType=function(K){_=K,i.isPresenting===!0&&Be("WebXRManager: Cannot change reference space type while presenting.")},this.getReferenceSpace=function(){return M||d},this.setReferenceSpace=function(K){M=K},this.getBaseLayer=function(){return p!==null?p:S},this.getBinding=function(){return D===null&&G&&(D=new XRWebGLBinding(c,t)),D},this.getFrame=function(){return b},this.getSession=function(){return c},this.setSession=async function(K){if(c=K,c!==null){if(y=n.getRenderTarget(),c.addEventListener("select",k),c.addEventListener("selectstart",k),c.addEventListener("selectend",k),c.addEventListener("squeeze",k),c.addEventListener("squeezestart",k),c.addEventListener("squeezeend",k),c.addEventListener("end",Y),c.addEventListener("inputsourceschange",V),F.xrCompatible!==!0&&await t.makeXRCompatible(),l=n.getPixelRatio(),n.getSize(P),G&&"createProjectionLayer"in XRWebGLBinding.prototype){let J=null,be=null,Ce=null;F.depth&&(Ce=F.stencil?t.DEPTH24_STENCIL8:t.DEPTH_COMPONENT24,J=F.stencil?Zt:Qt,be=F.stencil?cn:kt);const Ae={colorFormat:t.RGBA8,depthFormat:Ce,scaleFactor:o};D=this.getBinding(),p=D.createProjectionLayer(Ae),c.updateRenderState({layers:[p]}),n.setPixelRatio(1),n.setSize(p.textureWidth,p.textureHeight,!1),h=new Pt(p.textureWidth,p.textureHeight,{format:Ut,type:bt,depthTexture:new ln(p.textureWidth,p.textureHeight,be,void 0,void 0,void 0,void 0,void 0,void 0,J),stencilBuffer:F.stencil,colorSpace:n.outputColorSpace,samples:F.antialias?4:0,resolveDepthBuffer:p.ignoreDepthValues===!1,resolveStencilBuffer:p.ignoreDepthValues===!1})}else{const J={antialias:F.antialias,alpha:!0,depth:F.depth,stencil:F.stencil,framebufferScaleFactor:o};S=new XRWebGLLayer(c,t,J),c.updateRenderState({baseLayer:S}),n.setPixelRatio(1),n.setSize(S.framebufferWidth,S.framebufferHeight,!1),h=new Pt(S.framebufferWidth,S.framebufferHeight,{format:Ut,type:bt,colorSpace:n.outputColorSpace,stencilBuffer:F.stencil,resolveDepthBuffer:S.ignoreDepthValues===!1,resolveStencilBuffer:S.ignoreDepthValues===!1})}h.isXRRenderTarget=!0,this.setFoveation(C),M=null,d=await c.requestReferenceSpace(_),He.setContext(c),He.start(),i.isPresenting=!0,i.dispatchEvent({type:"sessionstart"})}},this.getEnvironmentBlendMode=function(){if(c!==null)return c.environmentBlendMode},this.getDepthTexture=function(){return f.getDepthTexture()};function V(K){for(let te=0;te<K.removed.length;te++){const J=K.removed[te],be=g.indexOf(J);be>=0&&(g[be]=null,A[be].disconnect(J))}for(let te=0;te<K.added.length;te++){const J=K.added[te];let be=g.indexOf(J);if(be===-1){for(let Ae=0;Ae<A.length;Ae++)if(Ae>=g.length){g.push(J),be=Ae;break}else if(g[Ae]===null){g[Ae]=J,be=Ae;break}if(be===-1)break}const Ce=A[be];Ce&&Ce.connect(J)}}const $=new Ie,ce=new Ie;function ge(K,te,J){$.setFromMatrixPosition(te.matrixWorld),ce.setFromMatrixPosition(J.matrixWorld);const be=$.distanceTo(ce),Ce=te.projectionMatrix.elements,Ae=J.projectionMatrix.elements,tt=Ce[14]/(Ce[10]-1),we=Ce[14]/(Ce[10]+1),We=(Ce[9]+1)/Ce[5],Oe=(Ce[9]-1)/Ce[5],ye=(Ce[8]-1)/Ce[0],at=(Ae[8]+1)/Ae[0],st=tt*ye,ft=tt*at,dt=be/(-ye+at),Je=dt*-ye;if(te.matrixWorld.decompose(K.position,K.quaternion,K.scale),K.translateX(Je),K.translateZ(dt),K.matrixWorld.compose(K.position,K.quaternion,K.scale),K.matrixWorldInverse.copy(K.matrixWorld).invert(),Ce[10]===-1)K.projectionMatrix.copy(te.projectionMatrix),K.projectionMatrixInverse.copy(te.projectionMatrixInverse);else{const ot=tt+dt,E=we+dt,pt=st-Je,Ge=ft+(be-Je),u=We*we/E*ot,r=Oe*we/E*ot;K.projectionMatrix.makePerspective(pt,Ge,u,r,ot,E),K.projectionMatrixInverse.copy(K.projectionMatrix).invert()}}function ve(K,te){te===null?K.matrixWorld.copy(K.matrix):K.matrixWorld.multiplyMatrices(te.matrixWorld,K.matrix),K.matrixWorldInverse.copy(K.matrixWorld).invert()}this.updateCamera=function(K){if(c===null)return;let te=K.near,J=K.far;f.texture!==null&&(f.depthNear>0&&(te=f.depthNear),f.depthFar>0&&(J=f.depthFar)),O.near=I.near=m.near=te,O.far=I.far=m.far=J,(Q!==O.near||Z!==O.far)&&(c.updateRenderState({depthNear:O.near,depthFar:O.far}),Q=O.near,Z=O.far),O.layers.mask=K.layers.mask|6,m.layers.mask=O.layers.mask&-5,I.layers.mask=O.layers.mask&-3;const be=K.parent,Ce=O.cameras;ve(O,be);for(let Ae=0;Ae<Ce.length;Ae++)ve(Ce[Ae],be);Ce.length===2?ge(O,m,I):O.projectionMatrix.copy(m.projectionMatrix),xe(K,O,be)};function xe(K,te,J){J===null?K.matrix.copy(te.matrixWorld):(K.matrix.copy(J.matrixWorld),K.matrix.invert(),K.matrix.multiply(te.matrixWorld)),K.matrix.decompose(K.position,K.quaternion,K.scale),K.updateMatrixWorld(!0),K.projectionMatrix.copy(te.projectionMatrix),K.projectionMatrixInverse.copy(te.projectionMatrixInverse),K.isPerspectiveCamera&&(K.fov=oa*2*Math.atan(1/K.projectionMatrix.elements[5]),K.zoom=1)}this.getCamera=function(){return O},this.getFoveation=function(){if(!(p===null&&S===null))return C},this.setFoveation=function(K){C=K,p!==null&&(p.fixedFoveation=K),S!==null&&S.fixedFoveation!==void 0&&(S.fixedFoveation=K)},this.hasDepthSensing=function(){return f.texture!==null},this.getDepthSensingMesh=function(){return f.getMesh(O)},this.getCameraTexture=function(K){return s[K]};let Xe=null;function rt(K,te){if(W=te.getViewerPose(M||d),b=te,W!==null){const J=W.views;S!==null&&(n.setRenderTargetFramebuffer(h,S.framebuffer),n.setRenderTarget(h));let be=!1;J.length!==O.cameras.length&&(O.cameras.length=0,be=!0);for(let we=0;we<J.length;we++){const We=J[we];let Oe=null;if(S!==null)Oe=S.getViewport(We);else{const at=D.getViewSubImage(p,We);Oe=at.viewport,we===0&&(n.setRenderTargetTextures(h,at.colorTexture,at.depthStencilTexture),n.setRenderTarget(h))}let ye=R[we];ye===void 0&&(ye=new _n,ye.layers.enable(we),ye.viewport=new mt,R[we]=ye),ye.matrix.fromArray(We.transform.matrix),ye.matrix.decompose(ye.position,ye.quaternion,ye.scale),ye.projectionMatrix.fromArray(We.projectionMatrix),ye.projectionMatrixInverse.copy(ye.projectionMatrix).invert(),ye.viewport.set(Oe.x,Oe.y,Oe.width,Oe.height),we===0&&(O.matrix.copy(ye.matrix),O.matrix.decompose(O.position,O.quaternion,O.scale)),be===!0&&O.cameras.push(ye)}const Ce=c.enabledFeatures;if(Ce&&Ce.includes("depth-sensing")&&c.depthUsage=="gpu-optimized"&&G){D=i.getBinding();const we=D.getDepthInformation(J[0]);we&&we.isValid&&we.texture&&f.init(we,c.renderState)}if(Ce&&Ce.includes("camera-access")&&G){n.state.unbindTexture(),D=i.getBinding();for(let we=0;we<J.length;we++){const We=J[we].camera;if(We){let Oe=s[We];Oe||(Oe=new Tr,s[We]=Oe);const ye=D.getCameraImage(We);Oe.sourceTexture=ye}}}}for(let J=0;J<A.length;J++){const be=g[J],Ce=A[J];be!==null&&Ce!==void 0&&Ce.update(be,te,M||d)}Xe&&Xe(K,te),te.detectedPlanes&&i.dispatchEvent({type:"planesdetected",data:te}),b=null}const He=new Br;He.setAnimationLoop(rt),this.setAnimationLoop=function(K){Xe=K},this.dispose=function(){}}}const fd=new $t,Xr=new Ne;Xr.set(-1,0,0,0,1,0,0,0,1);function dd(e,n){function t(f,s){f.matrixAutoUpdate===!0&&f.updateMatrix(),s.value.copy(f.matrix)}function i(f,s){s.color.getRGB(f.fogColor.value,Cr(e)),s.isFog?(f.fogNear.value=s.near,f.fogFar.value=s.far):s.isFogExp2&&(f.fogDensity.value=s.density)}function c(f,s,F,y,h){s.isNodeMaterial?s.uniformsNeedUpdate=!1:s.isMeshBasicMaterial?o(f,s):s.isMeshLambertMaterial?(o(f,s),s.envMap&&(f.envMapIntensity.value=s.envMapIntensity)):s.isMeshToonMaterial?(o(f,s),D(f,s)):s.isMeshPhongMaterial?(o(f,s),W(f,s),s.envMap&&(f.envMapIntensity.value=s.envMapIntensity)):s.isMeshStandardMaterial?(o(f,s),p(f,s),s.isMeshPhysicalMaterial&&S(f,s,h)):s.isMeshMatcapMaterial?(o(f,s),b(f,s)):s.isMeshDepthMaterial?o(f,s):s.isMeshDistanceMaterial?(o(f,s),G(f,s)):s.isMeshNormalMaterial?o(f,s):s.isLineBasicMaterial?(d(f,s),s.isLineDashedMaterial&&_(f,s)):s.isPointsMaterial?C(f,s,F,y):s.isSpriteMaterial?M(f,s):s.isShadowMaterial?(f.color.value.copy(s.color),f.opacity.value=s.opacity):s.isShaderMaterial&&(s.uniformsNeedUpdate=!1)}function o(f,s){f.opacity.value=s.opacity,s.color&&f.diffuse.value.copy(s.color),s.emissive&&f.emissive.value.copy(s.emissive).multiplyScalar(s.emissiveIntensity),s.map&&(f.map.value=s.map,t(s.map,f.mapTransform)),s.alphaMap&&(f.alphaMap.value=s.alphaMap,t(s.alphaMap,f.alphaMapTransform)),s.bumpMap&&(f.bumpMap.value=s.bumpMap,t(s.bumpMap,f.bumpMapTransform),f.bumpScale.value=s.bumpScale,s.side===St&&(f.bumpScale.value*=-1)),s.normalMap&&(f.normalMap.value=s.normalMap,t(s.normalMap,f.normalMapTransform),f.normalScale.value.copy(s.normalScale),s.side===St&&f.normalScale.value.negate()),s.displacementMap&&(f.displacementMap.value=s.displacementMap,t(s.displacementMap,f.displacementMapTransform),f.displacementScale.value=s.displacementScale,f.displacementBias.value=s.displacementBias),s.emissiveMap&&(f.emissiveMap.value=s.emissiveMap,t(s.emissiveMap,f.emissiveMapTransform)),s.specularMap&&(f.specularMap.value=s.specularMap,t(s.specularMap,f.specularMapTransform)),s.alphaTest>0&&(f.alphaTest.value=s.alphaTest);const F=n.get(s),y=F.envMap,h=F.envMapRotation;y&&(f.envMap.value=y,f.envMapRotation.value.setFromMatrix4(fd.makeRotationFromEuler(h)).transpose(),y.isCubeTexture&&y.isRenderTargetTexture===!1&&f.envMapRotation.value.premultiply(Xr),f.reflectivity.value=s.reflectivity,f.ior.value=s.ior,f.refractionRatio.value=s.refractionRatio),s.lightMap&&(f.lightMap.value=s.lightMap,f.lightMapIntensity.value=s.lightMapIntensity,t(s.lightMap,f.lightMapTransform)),s.aoMap&&(f.aoMap.value=s.aoMap,f.aoMapIntensity.value=s.aoMapIntensity,t(s.aoMap,f.aoMapTransform))}function d(f,s){f.diffuse.value.copy(s.color),f.opacity.value=s.opacity,s.map&&(f.map.value=s.map,t(s.map,f.mapTransform))}function _(f,s){f.dashSize.value=s.dashSize,f.totalSize.value=s.dashSize+s.gapSize,f.scale.value=s.scale}function C(f,s,F,y){f.diffuse.value.copy(s.color),f.opacity.value=s.opacity,f.size.value=s.size*F,f.scale.value=y*.5,s.map&&(f.map.value=s.map,t(s.map,f.uvTransform)),s.alphaMap&&(f.alphaMap.value=s.alphaMap,t(s.alphaMap,f.alphaMapTransform)),s.alphaTest>0&&(f.alphaTest.value=s.alphaTest)}function M(f,s){f.diffuse.value.copy(s.color),f.opacity.value=s.opacity,f.rotation.value=s.rotation,s.map&&(f.map.value=s.map,t(s.map,f.mapTransform)),s.alphaMap&&(f.alphaMap.value=s.alphaMap,t(s.alphaMap,f.alphaMapTransform)),s.alphaTest>0&&(f.alphaTest.value=s.alphaTest)}function W(f,s){f.specular.value.copy(s.specular),f.shininess.value=Math.max(s.shininess,1e-4)}function D(f,s){s.gradientMap&&(f.gradientMap.value=s.gradientMap)}function p(f,s){f.metalness.value=s.metalness,s.metalnessMap&&(f.metalnessMap.value=s.metalnessMap,t(s.metalnessMap,f.metalnessMapTransform)),f.roughness.value=s.roughness,s.roughnessMap&&(f.roughnessMap.value=s.roughnessMap,t(s.roughnessMap,f.roughnessMapTransform)),s.envMap&&(f.envMapIntensity.value=s.envMapIntensity)}function S(f,s,F){f.ior.value=s.ior,s.sheen>0&&(f.sheenColor.value.copy(s.sheenColor).multiplyScalar(s.sheen),f.sheenRoughness.value=s.sheenRoughness,s.sheenColorMap&&(f.sheenColorMap.value=s.sheenColorMap,t(s.sheenColorMap,f.sheenColorMapTransform)),s.sheenRoughnessMap&&(f.sheenRoughnessMap.value=s.sheenRoughnessMap,t(s.sheenRoughnessMap,f.sheenRoughnessMapTransform))),s.clearcoat>0&&(f.clearcoat.value=s.clearcoat,f.clearcoatRoughness.value=s.clearcoatRoughness,s.clearcoatMap&&(f.clearcoatMap.value=s.clearcoatMap,t(s.clearcoatMap,f.clearcoatMapTransform)),s.clearcoatRoughnessMap&&(f.clearcoatRoughnessMap.value=s.clearcoatRoughnessMap,t(s.clearcoatRoughnessMap,f.clearcoatRoughnessMapTransform)),s.clearcoatNormalMap&&(f.clearcoatNormalMap.value=s.clearcoatNormalMap,t(s.clearcoatNormalMap,f.clearcoatNormalMapTransform),f.clearcoatNormalScale.value.copy(s.clearcoatNormalScale),s.side===St&&f.clearcoatNormalScale.value.negate())),s.dispersion>0&&(f.dispersion.value=s.dispersion),s.iridescence>0&&(f.iridescence.value=s.iridescence,f.iridescenceIOR.value=s.iridescenceIOR,f.iridescenceThicknessMinimum.value=s.iridescenceThicknessRange[0],f.iridescenceThicknessMaximum.value=s.iridescenceThicknessRange[1],s.iridescenceMap&&(f.iridescenceMap.value=s.iridescenceMap,t(s.iridescenceMap,f.iridescenceMapTransform)),s.iridescenceThicknessMap&&(f.iridescenceThicknessMap.value=s.iridescenceThicknessMap,t(s.iridescenceThicknessMap,f.iridescenceThicknessMapTransform))),s.transmission>0&&(f.transmission.value=s.transmission,f.transmissionSamplerMap.value=F.texture,f.transmissionSamplerSize.value.set(F.width,F.height),s.transmissionMap&&(f.transmissionMap.value=s.transmissionMap,t(s.transmissionMap,f.transmissionMapTransform)),f.thickness.value=s.thickness,s.thicknessMap&&(f.thicknessMap.value=s.thicknessMap,t(s.thicknessMap,f.thicknessMapTransform)),f.attenuationDistance.value=s.attenuationDistance,f.attenuationColor.value.copy(s.attenuationColor)),s.anisotropy>0&&(f.anisotropyVector.value.set(s.anisotropy*Math.cos(s.anisotropyRotation),s.anisotropy*Math.sin(s.anisotropyRotation)),s.anisotropyMap&&(f.anisotropyMap.value=s.anisotropyMap,t(s.anisotropyMap,f.anisotropyMapTransform))),f.specularIntensity.value=s.specularIntensity,f.specularColor.value.copy(s.specularColor),s.specularColorMap&&(f.specularColorMap.value=s.specularColorMap,t(s.specularColorMap,f.specularColorMapTransform)),s.specularIntensityMap&&(f.specularIntensityMap.value=s.specularIntensityMap,t(s.specularIntensityMap,f.specularIntensityMapTransform))}function b(f,s){s.matcap&&(f.matcap.value=s.matcap)}function G(f,s){const F=n.get(s).light;f.referencePosition.value.setFromMatrixPosition(F.matrixWorld),f.nearDistance.value=F.shadow.camera.near,f.farDistance.value=F.shadow.camera.far}return{refreshFogUniforms:i,refreshMaterialUniforms:c}}function ud(e,n,t,i){let c={},o={},d=[];const _=e.getParameter(e.MAX_UNIFORM_BUFFER_BINDINGS);function C(h,A){const g=A.program;i.uniformBlockBinding(h,g)}function M(h,A){let g=c[h.id];g===void 0&&(f(h),g=W(h),c[h.id]=g,h.addEventListener("dispose",F));const P=A.program;i.updateUBOMapping(h,P);const l=n.render.frame;o[h.id]!==l&&(p(h),o[h.id]=l)}function W(h){const A=D();h.__bindingPointIndex=A;const g=e.createBuffer(),P=h.__size,l=h.usage;return e.bindBuffer(e.UNIFORM_BUFFER,g),e.bufferData(e.UNIFORM_BUFFER,P,l),e.bindBuffer(e.UNIFORM_BUFFER,null),e.bindBufferBase(e.UNIFORM_BUFFER,A,g),g}function D(){for(let h=0;h<_;h++)if(d.indexOf(h)===-1)return d.push(h),h;return Ze("WebGLRenderer: Maximum number of simultaneously usable uniforms groups reached."),0}function p(h){const A=c[h.id],g=h.uniforms,P=h.__cache;e.bindBuffer(e.UNIFORM_BUFFER,A);for(let l=0,m=g.length;l<m;l++){const I=g[l];if(Array.isArray(I))for(let R=0,O=I.length;R<O;R++)S(I[R],l,R,P);else S(I,l,0,P)}e.bindBuffer(e.UNIFORM_BUFFER,null)}function S(h,A,g,P){if(G(h,A,g,P)===!0){const l=h.__offset,m=h.value;if(Array.isArray(m)){let I=0;for(let R=0;R<m.length;R++){const O=m[R],Q=s(O);b(O,h.__data,I),typeof O!="number"&&typeof O!="boolean"&&!O.isMatrix3&&!ArrayBuffer.isView(O)&&(I+=Q.storage/Float32Array.BYTES_PER_ELEMENT)}}else b(m,h.__data,0);e.bufferSubData(e.UNIFORM_BUFFER,l,h.__data)}}function b(h,A,g){typeof h=="number"||typeof h=="boolean"?A[0]=h:h.isMatrix3?(A[0]=h.elements[0],A[1]=h.elements[1],A[2]=h.elements[2],A[3]=0,A[4]=h.elements[3],A[5]=h.elements[4],A[6]=h.elements[5],A[7]=0,A[8]=h.elements[6],A[9]=h.elements[7],A[10]=h.elements[8],A[11]=0):ArrayBuffer.isView(h)?A.set(new h.constructor(h.buffer,h.byteOffset,A.length)):h.toArray(A,g)}function G(h,A,g,P){const l=h.value,m=A+"_"+g;if(P[m]===void 0)return typeof l=="number"||typeof l=="boolean"?P[m]=l:ArrayBuffer.isView(l)?P[m]=l.slice():P[m]=l.clone(),!0;{const I=P[m];if(typeof l=="number"||typeof l=="boolean"){if(I!==l)return P[m]=l,!0}else{if(ArrayBuffer.isView(l))return!0;if(I.equals(l)===!1)return I.copy(l),!0}}return!1}function f(h){const A=h.uniforms;let g=0;const P=16;for(let m=0,I=A.length;m<I;m++){const R=Array.isArray(A[m])?A[m]:[A[m]];for(let O=0,Q=R.length;O<Q;O++){const Z=R[O],k=Array.isArray(Z.value)?Z.value:[Z.value];for(let Y=0,V=k.length;Y<V;Y++){const $=k[Y],ce=s($),ge=g%P,ve=ge%ce.boundary,xe=ge+ve;g+=ve,xe!==0&&P-xe<ce.storage&&(g+=P-xe),Z.__data=new Float32Array(ce.storage/Float32Array.BYTES_PER_ELEMENT),Z.__offset=g,g+=ce.storage}}}const l=g%P;return l>0&&(g+=P-l),h.__size=g,h.__cache={},this}function s(h){const A={boundary:0,storage:0};return typeof h=="number"||typeof h=="boolean"?(A.boundary=4,A.storage=4):h.isVector2?(A.boundary=8,A.storage=8):h.isVector3||h.isColor?(A.boundary=16,A.storage=12):h.isVector4?(A.boundary=16,A.storage=16):h.isMatrix3?(A.boundary=48,A.storage=48):h.isMatrix4?(A.boundary=64,A.storage=64):h.isTexture?Be("WebGLRenderer: Texture samplers can not be part of an uniforms group."):ArrayBuffer.isView(h)?(A.boundary=16,A.storage=h.byteLength):Be("WebGLRenderer: Unsupported uniform value type.",h),A}function F(h){const A=h.target;A.removeEventListener("dispose",F);const g=d.indexOf(A.__bindingPointIndex);d.splice(g,1),e.deleteBuffer(c[A.id]),delete c[A.id],delete o[A.id]}function y(){for(const h in c)e.deleteBuffer(c[h]);d=[],c={},o={}}return{bind:C,update:M,dispose:y}}const pd=new Uint16Array([12469,15057,12620,14925,13266,14620,13807,14376,14323,13990,14545,13625,14713,13328,14840,12882,14931,12528,14996,12233,15039,11829,15066,11525,15080,11295,15085,10976,15082,10705,15073,10495,13880,14564,13898,14542,13977,14430,14158,14124,14393,13732,14556,13410,14702,12996,14814,12596,14891,12291,14937,11834,14957,11489,14958,11194,14943,10803,14921,10506,14893,10278,14858,9960,14484,14039,14487,14025,14499,13941,14524,13740,14574,13468,14654,13106,14743,12678,14818,12344,14867,11893,14889,11509,14893,11180,14881,10751,14852,10428,14812,10128,14765,9754,14712,9466,14764,13480,14764,13475,14766,13440,14766,13347,14769,13070,14786,12713,14816,12387,14844,11957,14860,11549,14868,11215,14855,10751,14825,10403,14782,10044,14729,9651,14666,9352,14599,9029,14967,12835,14966,12831,14963,12804,14954,12723,14936,12564,14917,12347,14900,11958,14886,11569,14878,11247,14859,10765,14828,10401,14784,10011,14727,9600,14660,9289,14586,8893,14508,8533,15111,12234,15110,12234,15104,12216,15092,12156,15067,12010,15028,11776,14981,11500,14942,11205,14902,10752,14861,10393,14812,9991,14752,9570,14682,9252,14603,8808,14519,8445,14431,8145,15209,11449,15208,11451,15202,11451,15190,11438,15163,11384,15117,11274,15055,10979,14994,10648,14932,10343,14871,9936,14803,9532,14729,9218,14645,8742,14556,8381,14461,8020,14365,7603,15273,10603,15272,10607,15267,10619,15256,10631,15231,10614,15182,10535,15118,10389,15042,10167,14963,9787,14883,9447,14800,9115,14710,8665,14615,8318,14514,7911,14411,7507,14279,7198,15314,9675,15313,9683,15309,9712,15298,9759,15277,9797,15229,9773,15166,9668,15084,9487,14995,9274,14898,8910,14800,8539,14697,8234,14590,7790,14479,7409,14367,7067,14178,6621,15337,8619,15337,8631,15333,8677,15325,8769,15305,8871,15264,8940,15202,8909,15119,8775,15022,8565,14916,8328,14804,8009,14688,7614,14569,7287,14448,6888,14321,6483,14088,6171,15350,7402,15350,7419,15347,7480,15340,7613,15322,7804,15287,7973,15229,8057,15148,8012,15046,7846,14933,7611,14810,7357,14682,7069,14552,6656,14421,6316,14251,5948,14007,5528,15356,5942,15356,5977,15353,6119,15348,6294,15332,6551,15302,6824,15249,7044,15171,7122,15070,7050,14949,6861,14818,6611,14679,6349,14538,6067,14398,5651,14189,5311,13935,4958,15359,4123,15359,4153,15356,4296,15353,4646,15338,5160,15311,5508,15263,5829,15188,6042,15088,6094,14966,6001,14826,5796,14678,5543,14527,5287,14377,4985,14133,4586,13869,4257,15360,1563,15360,1642,15358,2076,15354,2636,15341,3350,15317,4019,15273,4429,15203,4732,15105,4911,14981,4932,14836,4818,14679,4621,14517,4386,14359,4156,14083,3795,13808,3437,15360,122,15360,137,15358,285,15355,636,15344,1274,15322,2177,15281,2765,15215,3223,15120,3451,14995,3569,14846,3567,14681,3466,14511,3305,14344,3121,14037,2800,13753,2467,15360,0,15360,1,15359,21,15355,89,15346,253,15325,479,15287,796,15225,1148,15133,1492,15008,1749,14856,1882,14685,1886,14506,1783,14324,1608,13996,1398,13702,1183]);let At=null;function hd(){return At===null&&(At=new sa(pd,16,16,Jt,Gt),At.name="DFG_LUT",At.minFilter=vt,At.magFilter=vt,At.wrapS=Wn,At.wrapT=Wn,At.generateMipmaps=!1,At.needsUpdate=!0),At}class _d{constructor(n={}){const{canvas:t=jr(),context:i=null,depth:c=!0,stencil:o=!1,alpha:d=!1,antialias:_=!1,premultipliedAlpha:C=!0,preserveDrawingBuffer:M=!1,powerPreference:W="default",failIfMajorPerformanceCaveat:D=!1,reversedDepthBuffer:p=!1,outputBufferType:S=bt}=n;this.isWebGLRenderer=!0;let b;if(i!==null){if(typeof WebGLRenderingContext<"u"&&i instanceof WebGLRenderingContext)throw new Error("THREE.WebGLRenderer: WebGL 1 is not supported since r163.");b=i.getContextAttributes().alpha}else b=d;const G=S,f=new Set([vr,Sr,Er]),s=new Set([bt,kt,xn,cn,xr,Mr]),F=new Uint32Array(4),y=new Int32Array(4),h=new Ie;let A=null,g=null;const P=[],l=[];let m=null;this.domElement=t,this.debug={checkShaderErrors:!0,onShaderError:null},this.autoClear=!0,this.autoClearColor=!0,this.autoClearDepth=!0,this.autoClearStencil=!0,this.sortObjects=!0,this.clippingPlanes=[],this.localClippingEnabled=!1,this.toneMapping=Ct,this.toneMappingExposure=1,this.transmissionResolutionScale=1;const I=this;let R=!1,O=null,Q=null,Z=null,k=null;this._outputColorSpace=ea;let Y=0,V=0,$=null,ce=-1,ge=null;const ve=new mt,xe=new mt;let Xe=null;const rt=new $e(0);let He=0,K=t.width,te=t.height,J=1,be=null,Ce=null;const Ae=new mt(0,0,K,te),tt=new mt(0,0,K,te);let we=!1;const We=new _r;let Oe=!1,ye=!1;const at=new $t,st=new Ie,ft=new mt,dt={background:null,fog:null,environment:null,overrideMaterial:null,isScene:!0};let Je=!1;function ot(){return $===null?J:1}let E=i;function pt(a,x){return t.getContext(a,x)}try{const a={alpha:!0,depth:c,stencil:o,antialias:_,premultipliedAlpha:C,preserveDrawingBuffer:M,powerPreference:W,failIfMajorPerformanceCaveat:D};if("setAttribute"in t&&t.setAttribute("data-engine",`three.js r${ta}`),t.addEventListener("webglcontextlost",je,!1),t.addEventListener("webglcontextrestored",Ye,!1),t.addEventListener("webglcontextcreationerror",xt,!1),E===null){const x="webgl2";if(E=pt(x,a),E===null)throw pt(x)?new Error("THREE.WebGLRenderer: Error creating WebGL context with your selected attributes."):new Error("THREE.WebGLRenderer: Error creating WebGL context.")}}catch(a){throw Ze("WebGLRenderer: "+a.message),a}let Ge,u,r,T,w,B,j,ne,H,X,ie,Se,oe,re,Te,Re,Pe,v,ee,z,ae,de,q;function _e(){Ge=new pc(E),Ge.init(),ae=new ad(E,Ge),u=new ac(E,Ge,n,ae),r=new id(E,Ge),u.reversedDepthBuffer&&p&&r.buffers.depth.setReversed(!0),Q=E.createFramebuffer(),Z=E.createFramebuffer(),k=E.createFramebuffer(),T=new _c(E),w=new kf,B=new rd(E,Ge,r,w,u,ae,T),j=new uc(I),ne=new Eo(E),de=new ic(E,ne),H=new hc(E,ne,T,de),X=new vc(E,H,ne,de,T),v=new gc(E,u,B),Te=new oc(w),ie=new Wf(I,j,Ge,u,de,Te),Se=new dd(I,w),oe=new Xf,re=new Qf(Ge),Pe=new nc(I,j,r,X,b,C),Re=new nd(I,X,u),q=new ud(E,T,u,r),ee=new rc(E,Ge,T),z=new mc(E,Ge,T),T.programs=ie.programs,I.capabilities=u,I.extensions=Ge,I.properties=w,I.renderLists=oe,I.shadowMap=Re,I.state=r,I.info=T}_e(),G!==bt&&(m=new Ec(G,t.width,t.height,_,c,o));const he=new cd(I,E);this.xr=he,this.getContext=function(){return E},this.getContextAttributes=function(){return E.getContextAttributes()},this.forceContextLoss=function(){const a=Ge.get("WEBGL_lose_context");a&&a.loseContext()},this.forceContextRestore=function(){const a=Ge.get("WEBGL_lose_context");a&&a.restoreContext()},this.getPixelRatio=function(){return J},this.setPixelRatio=function(a){a!==void 0&&(J=a,this.setSize(K,te,!1))},this.getSize=function(a){return a.set(K,te)},this.setSize=function(a,x,N=!0){if(he.isPresenting){Be("WebGLRenderer: Can't change size while VR device is presenting.");return}K=a,te=x,t.width=Math.floor(a*J),t.height=Math.floor(x*J),N===!0&&(t.style.width=a+"px",t.style.height=x+"px"),m!==null&&m.setSize(t.width,t.height),this.setViewport(0,0,a,x)},this.getDrawingBufferSize=function(a){return a.set(K*J,te*J).floor()},this.setDrawingBufferSize=function(a,x,N){K=a,te=x,J=N,t.width=Math.floor(a*N),t.height=Math.floor(x*N),this.setViewport(0,0,a,x)},this.setEffects=function(a){if(G===bt){Ze("WebGLRenderer: setEffects() requires outputBufferType set to HalfFloatType or FloatType.");return}if(a){for(let x=0;x<a.length;x++)if(a[x].isOutputPass===!0){Be("WebGLRenderer: OutputPass is not needed in setEffects(). Tone mapping and color space conversion are applied automatically.");break}}m.setEffects(a||[])},this.getCurrentViewport=function(a){return a.copy(ve)},this.getViewport=function(a){return a.copy(Ae)},this.setViewport=function(a,x,N,L){a.isVector4?Ae.set(a.x,a.y,a.z,a.w):Ae.set(a,x,N,L),r.viewport(ve.copy(Ae).multiplyScalar(J).round())},this.getScissor=function(a){return a.copy(tt)},this.setScissor=function(a,x,N,L){a.isVector4?tt.set(a.x,a.y,a.z,a.w):tt.set(a,x,N,L),r.scissor(xe.copy(tt).multiplyScalar(J).round())},this.getScissorTest=function(){return we},this.setScissorTest=function(a){r.setScissorTest(we=a)},this.setOpaqueSort=function(a){be=a},this.setTransparentSort=function(a){Ce=a},this.getClearColor=function(a){return a.copy(Pe.getClearColor())},this.setClearColor=function(){Pe.setClearColor(...arguments)},this.getClearAlpha=function(){return Pe.getClearAlpha()},this.setClearAlpha=function(){Pe.setClearAlpha(...arguments)},this.clear=function(a=!0,x=!0,N=!0){let L=0;if(a){let U=!1;if($!==null){const fe=$.texture.format;U=f.has(fe)}if(U){const fe=$.texture.type,pe=s.has(fe),le=Pe.getClearColor(),me=Pe.getClearAlpha(),Ee=le.r,Le=le.g,De=le.b;pe?(F[0]=Ee,F[1]=Le,F[2]=De,F[3]=me,E.clearBufferuiv(E.COLOR,0,F)):(y[0]=Ee,y[1]=Le,y[2]=De,y[3]=me,E.clearBufferiv(E.COLOR,0,y))}else L|=E.COLOR_BUFFER_BIT}x&&(L|=E.DEPTH_BUFFER_BIT,this.state.buffers.depth.setMask(!0)),N&&(L|=E.STENCIL_BUFFER_BIT,this.state.buffers.stencil.setMask(4294967295)),L!==0&&E.clear(L)},this.clearColor=function(){this.clear(!0,!1,!1)},this.clearDepth=function(){this.clear(!1,!0,!1)},this.clearStencil=function(){this.clear(!1,!1,!0)},this.setNodesHandler=function(a){a.setRenderer(this),O=a},this.dispose=function(){t.removeEventListener("webglcontextlost",je,!1),t.removeEventListener("webglcontextrestored",Ye,!1),t.removeEventListener("webglcontextcreationerror",xt,!1),Pe.dispose(),oe.dispose(),re.dispose(),w.dispose(),j.dispose(),X.dispose(),de.dispose(),q.dispose(),ie.dispose(),he.dispose(),he.removeEventListener("sessionstart",Jn),he.removeEventListener("sessionend",jn),Ht.stop()};function je(a){a.preventDefault(),oi("WebGLRenderer: Context Lost."),R=!0}function Ye(){oi("WebGLRenderer: Context Restored."),R=!1;const a=T.autoReset,x=Re.enabled,N=Re.autoUpdate,L=Re.needsUpdate,U=Re.type;_e(),T.autoReset=a,Re.enabled=x,Re.autoUpdate=N,Re.needsUpdate=L,Re.type=U}function xt(a){Ze("WebGLRenderer: A WebGL context could not be created. Reason: ",a.statusMessage)}function Mt(a){const x=a.target;x.removeEventListener("dispose",Mt),Yr(x)}function Yr(a){Kr(a),w.remove(a)}function Kr(a){const x=w.get(a).programs;x!==void 0&&(x.forEach(function(N){ie.releaseProgram(N)}),a.isShaderMaterial&&ie.releaseShaderCache(a))}this.renderBufferDirect=function(a,x,N,L,U,fe){x===null&&(x=dt);const pe=U.isMesh&&U.matrixWorld.determinantAffine()<0,le=$r(a,x,N,L,U);r.setMaterial(L,pe);let me=N.index,Ee=1;if(L.wireframe===!0){if(me=H.getWireframeAttribute(N),me===void 0)return;Ee=2}const Le=N.drawRange,De=N.attributes.position;let Me=Le.start*Ee,Ve=(Le.start+Le.count)*Ee;fe!==null&&(Me=Math.max(Me,fe.start*Ee),Ve=Math.min(Ve,(fe.start+fe.count)*Ee)),me!==null?(Me=Math.max(Me,0),Ve=Math.min(Ve,me.count)):De!=null&&(Me=Math.max(Me,0),Ve=Math.min(Ve,De.count));const nt=Ve-Me;if(nt<0||nt===1/0)return;de.setup(U,L,le,N,me);let et,ke=ee;if(me!==null&&(et=ne.get(me),ke=z,ke.setIndex(et)),U.isMesh)L.wireframe===!0?(r.setLineWidth(L.wireframeLinewidth*ot()),ke.setMode(E.LINES)):ke.setMode(E.TRIANGLES);else if(U.isLine){let ut=L.linewidth;ut===void 0&&(ut=1),r.setLineWidth(ut*ot()),U.isLineSegments?ke.setMode(E.LINES):U.isLineLoop?ke.setMode(E.LINE_LOOP):ke.setMode(E.LINE_STRIP)}else U.isPoints?ke.setMode(E.POINTS):U.isSprite&&ke.setMode(E.TRIANGLES);if(U.isBatchedMesh)if(Ge.get("WEBGL_multi_draw"))ke.renderMultiDraw(U._multiDrawStarts,U._multiDrawCounts,U._multiDrawCount);else{const ut=U._multiDrawStarts,ue=U._multiDrawCounts,gt=U._multiDrawCount,Fe=me?ne.get(me).bytesPerElement:1,Et=w.get(L).currentProgram.getUniforms();for(let Tt=0;Tt<gt;Tt++)Et.setValue(E,"_gl_DrawID",Tt),ke.render(ut[Tt]/Fe,ue[Tt])}else if(U.isInstancedMesh)ke.renderInstances(Me,nt,U.count);else if(N.isInstancedBufferGeometry){const ut=N._maxInstanceCount!==void 0?N._maxInstanceCount:1/0,ue=Math.min(N.instanceCount,ut);ke.renderInstances(Me,nt,ue)}else ke.render(Me,nt)};function Qn(a,x,N){a.transparent===!0&&a.side===Lt&&a.forceSinglePass===!1?(a.side=St,a.needsUpdate=!0,un(a,x,N),a.side=sn,a.needsUpdate=!0,un(a,x,N),a.side=Lt):un(a,x,N)}this.compile=function(a,x,N=null){N===null&&(N=a),g=re.get(N),g.init(x),l.push(g),N.traverseVisible(function(U){U.isLight&&U.layers.test(x.layers)&&(g.pushLight(U),U.castShadow&&g.pushShadow(U))}),a!==N&&a.traverseVisible(function(U){U.isLight&&U.layers.test(x.layers)&&(g.pushLight(U),U.castShadow&&g.pushShadow(U))}),g.setupLights();const L=new Set;return a.traverse(function(U){if(!(U.isMesh||U.isPoints||U.isLine||U.isSprite))return;const fe=U.material;if(fe)if(Array.isArray(fe))for(let pe=0;pe<fe.length;pe++){const le=fe[pe];Qn(le,N,U),L.add(le)}else Qn(fe,N,U),L.add(fe)}),g=l.pop(),L},this.compileAsync=function(a,x,N=null){const L=this.compile(a,x,N);return new Promise(U=>{function fe(){if(L.forEach(function(pe){w.get(pe).currentProgram.isReady()&&L.delete(pe)}),L.size===0){U(a);return}setTimeout(fe,10)}Ge.get("KHR_parallel_shader_compile")!==null?fe():setTimeout(fe,10)})};let bn=null;function qr(a){bn&&bn(a)}function Jn(){Ht.stop()}function jn(){Ht.start()}const Ht=new Br;Ht.setAnimationLoop(qr),typeof self<"u"&&Ht.setContext(self),this.setAnimationLoop=function(a){bn=a,he.setAnimationLoop(a),a===null?Ht.stop():Ht.start()},he.addEventListener("sessionstart",Jn),he.addEventListener("sessionend",jn),this.render=function(a,x){if(x!==void 0&&x.isCamera!==!0){Ze("WebGLRenderer.render: camera is not an instance of THREE.Camera.");return}if(R===!0)return;O!==null&&O.renderStart(a,x);const N=he.enabled===!0&&he.isPresenting===!0,L=m!==null&&($===null||N)&&m.begin(I,$);if(a.matrixWorldAutoUpdate===!0&&a.updateMatrixWorld(),x.parent===null&&x.matrixWorldAutoUpdate===!0&&x.updateMatrixWorld(),he.enabled===!0&&he.isPresenting===!0&&(m===null||m.isCompositing()===!1)&&(he.cameraAutoUpdate===!0&&he.updateCamera(x),x=he.getCamera()),a.isScene===!0&&a.onBeforeRender(I,a,x,$),g=re.get(a,l.length),g.init(x),g.state.textureUnits=B.getTextureUnits(),l.push(g),at.multiplyMatrices(x.projectionMatrix,x.matrixWorldInverse),We.setFromProjectionMatrix(at,si,x.reversedDepth),ye=this.localClippingEnabled,Oe=Te.init(this.clippingPlanes,ye),A=oe.get(a,P.length),A.init(),P.push(A),he.enabled===!0&&he.isPresenting===!0){const pe=I.xr.getDepthSensingMesh();pe!==null&&Cn(pe,x,-1/0,I.sortObjects)}Cn(a,x,0,I.sortObjects),A.finish(),I.sortObjects===!0&&A.sort(be,Ce,x.reversedDepth),Je=he.enabled===!1||he.isPresenting===!1||he.hasDepthSensing()===!1,Je&&Pe.addToRenderList(A,a),this.info.render.frame++,this.info.autoReset===!0&&this.info.reset(),Oe===!0&&Te.beginShadows();const U=g.state.shadowsArray;if(Re.render(U,a,x),Oe===!0&&Te.endShadows(),(L&&m.hasRenderPass())===!1){const pe=A.opaque,le=A.transmissive;if(g.setupLights(),x.isArrayCamera){const me=x.cameras;if(le.length>0)for(let Ee=0,Le=me.length;Ee<Le;Ee++){const De=me[Ee];ti(pe,le,a,De)}Je&&Pe.render(a);for(let Ee=0,Le=me.length;Ee<Le;Ee++){const De=me[Ee];ei(A,a,De,De.viewport)}}else le.length>0&&ti(pe,le,a,x),Je&&Pe.render(a),ei(A,a,x)}$!==null&&V===0&&(B.updateMultisampleRenderTarget($),B.updateRenderTargetMipmap($)),L&&m.end(I),a.isScene===!0&&a.onAfterRender(I,a,x),de.resetDefaultState(),ce=-1,ge=null,l.pop(),l.length>0?(g=l[l.length-1],B.setTextureUnits(g.state.textureUnits),Oe===!0&&Te.setGlobalState(I.clippingPlanes,g.state.camera)):g=null,P.pop(),P.length>0?A=P[P.length-1]:A=null,O!==null&&O.renderEnd()};function Cn(a,x,N,L){if(a.visible===!1)return;if(a.layers.test(x.layers)){if(a.isGroup)N=a.renderOrder;else if(a.isLOD)a.autoUpdate===!0&&a.update(x);else if(a.isLightProbeGrid)g.pushLightProbeGrid(a);else if(a.isLight)g.pushLight(a),a.castShadow&&g.pushShadow(a);else if(a.isSprite){if(!a.frustumCulled||We.intersectsSprite(a)){L&&ft.setFromMatrixPosition(a.matrixWorld).applyMatrix4(at);const pe=X.update(a),le=a.material;le.visible&&A.push(a,pe,le,N,ft.z,null)}}else if((a.isMesh||a.isLine||a.isPoints)&&(!a.frustumCulled||We.intersectsObject(a))){const pe=X.update(a),le=a.material;if(L&&(a.boundingSphere!==void 0?(a.boundingSphere===null&&a.computeBoundingSphere(),ft.copy(a.boundingSphere.center)):(pe.boundingSphere===null&&pe.computeBoundingSphere(),ft.copy(pe.boundingSphere.center)),ft.applyMatrix4(a.matrixWorld).applyMatrix4(at)),Array.isArray(le)){const me=pe.groups;for(let Ee=0,Le=me.length;Ee<Le;Ee++){const De=me[Ee],Me=le[De.materialIndex];Me&&Me.visible&&A.push(a,pe,Me,N,ft.z,De)}}else le.visible&&A.push(a,pe,le,N,ft.z,null)}}const fe=a.children;for(let pe=0,le=fe.length;pe<le;pe++)Cn(fe[pe],x,N,L)}function ei(a,x,N,L){const{opaque:U,transmissive:fe,transparent:pe}=a;g.setupLightsView(N),Oe===!0&&Te.setGlobalState(I.clippingPlanes,N),L&&r.viewport(ve.copy(L)),U.length>0&&dn(U,x,N),fe.length>0&&dn(fe,x,N),pe.length>0&&dn(pe,x,N),r.buffers.depth.setTest(!0),r.buffers.depth.setMask(!0),r.buffers.color.setMask(!0),r.setPolygonOffset(!1)}function ti(a,x,N,L){if((N.isScene===!0?N.overrideMaterial:null)!==null)return;if(g.state.transmissionRenderTarget[L.id]===void 0){const Me=Ge.has("EXT_color_buffer_half_float")||Ge.has("EXT_color_buffer_float");g.state.transmissionRenderTarget[L.id]=new Pt(1,1,{generateMipmaps:!0,type:Me?Gt:bt,minFilter:qt,samples:Math.max(4,u.samples),stencilBuffer:o,resolveDepthBuffer:!1,resolveStencilBuffer:!1,colorSpace:Qe.workingColorSpace})}const fe=g.state.transmissionRenderTarget[L.id],pe=L.viewport||ve;fe.setSize(pe.z*I.transmissionResolutionScale,pe.w*I.transmissionResolutionScale);const le=I.getRenderTarget(),me=I.getActiveCubeFace(),Ee=I.getActiveMipmapLevel();I.setRenderTarget(fe),I.getClearColor(rt),He=I.getClearAlpha(),He<1&&I.setClearColor(16777215,.5),I.clear(),Je&&Pe.render(N);const Le=I.toneMapping;I.toneMapping=Ct;const De=L.viewport;if(L.viewport!==void 0&&(L.viewport=void 0),g.setupLightsView(L),Oe===!0&&Te.setGlobalState(I.clippingPlanes,L),dn(a,N,L),B.updateMultisampleRenderTarget(fe),B.updateRenderTargetMipmap(fe),Ge.has("WEBGL_multisampled_render_to_texture")===!1){let Me=!1;for(let Ve=0,nt=x.length;Ve<nt;Ve++){const et=x[Ve],{object:ke,geometry:ut,material:ue,group:gt}=et;if(ue.side===Lt&&ke.layers.test(L.layers)){const Fe=ue.side;ue.side=St,ue.needsUpdate=!0,ni(ke,N,L,ut,ue,gt),ue.side=Fe,ue.needsUpdate=!0,Me=!0}}Me===!0&&(B.updateMultisampleRenderTarget(fe),B.updateRenderTargetMipmap(fe))}I.setRenderTarget(le,me,Ee),I.setClearColor(rt,He),De!==void 0&&(L.viewport=De),I.toneMapping=Le}function dn(a,x,N){const L=x.isScene===!0?x.overrideMaterial:null;for(let U=0,fe=a.length;U<fe;U++){const pe=a[U],{object:le,geometry:me,group:Ee}=pe;let Le=pe.material;Le.allowOverride===!0&&L!==null&&(Le=L),le.layers.test(N.layers)&&ni(le,x,N,me,Le,Ee)}}function ni(a,x,N,L,U,fe){a.onBeforeRender(I,x,N,L,U,fe),a.modelViewMatrix.multiplyMatrices(N.matrixWorldInverse,a.matrixWorld),a.normalMatrix.getNormalMatrix(a.modelViewMatrix),U.onBeforeRender(I,x,N,L,a,fe),U.transparent===!0&&U.side===Lt&&U.forceSinglePass===!1?(U.side=St,U.needsUpdate=!0,I.renderBufferDirect(N,x,L,U,a,fe),U.side=sn,U.needsUpdate=!0,I.renderBufferDirect(N,x,L,U,a,fe),U.side=Lt):I.renderBufferDirect(N,x,L,U,a,fe),a.onAfterRender(I,x,N,L,U,fe)}function un(a,x,N){x.isScene!==!0&&(x=dt);const L=w.get(a),U=g.state.lights,fe=g.state.shadowsArray,pe=U.state.version,le=ie.getParameters(a,U.state,fe,x,N,g.state.lightProbeGridArray),me=ie.getProgramCacheKey(le);let Ee=L.programs;L.environment=a.isMeshStandardMaterial||a.isMeshLambertMaterial||a.isMeshPhongMaterial?x.environment:null,L.fog=x.fog;const Le=a.isMeshStandardMaterial||a.isMeshLambertMaterial&&!a.envMap||a.isMeshPhongMaterial&&!a.envMap;L.envMap=j.get(a.envMap||L.environment,Le),L.envMapRotation=L.environment!==null&&a.envMap===null?x.environmentRotation:a.envMapRotation,Ee===void 0&&(a.addEventListener("dispose",Mt),Ee=new Map,L.programs=Ee);let De=Ee.get(me);if(De!==void 0){if(L.currentProgram===De&&L.lightsStateVersion===pe)return ri(a,le),De}else le.uniforms=ie.getUniforms(a),O!==null&&a.isNodeMaterial&&O.build(a,N,le),a.onBeforeCompile(le,I),De=ie.acquireProgram(le,me),Ee.set(me,De),L.uniforms=le.uniforms;const Me=L.uniforms;return(!a.isShaderMaterial&&!a.isRawShaderMaterial||a.clipping===!0)&&(Me.clippingPlanes=Te.uniform),ri(a,le),L.needsLights=Jr(a),L.lightsStateVersion=pe,L.needsLights&&(Me.ambientLightColor.value=U.state.ambient,Me.lightProbe.value=U.state.probe,Me.directionalLights.value=U.state.directional,Me.directionalLightShadows.value=U.state.directionalShadow,Me.spotLights.value=U.state.spot,Me.spotLightShadows.value=U.state.spotShadow,Me.rectAreaLights.value=U.state.rectArea,Me.ltc_1.value=U.state.rectAreaLTC1,Me.ltc_2.value=U.state.rectAreaLTC2,Me.pointLights.value=U.state.point,Me.pointLightShadows.value=U.state.pointShadow,Me.hemisphereLights.value=U.state.hemi,Me.directionalShadowMatrix.value=U.state.directionalShadowMatrix,Me.spotLightMatrix.value=U.state.spotLightMatrix,Me.spotLightMap.value=U.state.spotLightMap,Me.pointShadowMatrix.value=U.state.pointShadowMatrix),L.lightProbeGrid=g.state.lightProbeGridArray.length>0,L.currentProgram=De,L.uniformsList=null,De}function ii(a){if(a.uniformsList===null){const x=a.currentProgram.getUniforms();a.uniformsList=En.seqWithValue(x.seq,a.uniforms)}return a.uniformsList}function ri(a,x){const N=w.get(a);N.outputColorSpace=x.outputColorSpace,N.batching=x.batching,N.batchingColor=x.batchingColor,N.instancing=x.instancing,N.instancingColor=x.instancingColor,N.instancingMorph=x.instancingMorph,N.skinning=x.skinning,N.morphTargets=x.morphTargets,N.morphNormals=x.morphNormals,N.morphColors=x.morphColors,N.morphTargetsCount=x.morphTargetsCount,N.numClippingPlanes=x.numClippingPlanes,N.numIntersection=x.numClipIntersection,N.vertexAlphas=x.vertexAlphas,N.vertexTangents=x.vertexTangents,N.toneMapping=x.toneMapping}function Zr(a,x){if(a.length===0)return null;if(a.length===1)return a[0].texture!==null?a[0]:null;h.setFromMatrixPosition(x.matrixWorld);for(let N=0,L=a.length;N<L;N++){const U=a[N];if(U.texture!==null&&U.boundingBox.containsPoint(h))return U}return null}function $r(a,x,N,L,U){x.isScene!==!0&&(x=dt),B.resetTextureUnits();const fe=x.fog,pe=L.isMeshStandardMaterial||L.isMeshLambertMaterial||L.isMeshPhongMaterial?x.environment:null,le=$===null?I.outputColorSpace:$.isXRRenderTarget===!0?$.texture.colorSpace:Qe.workingColorSpace,me=L.isMeshStandardMaterial||L.isMeshLambertMaterial&&!L.envMap||L.isMeshPhongMaterial&&!L.envMap,Ee=j.get(L.envMap||pe,me),Le=L.vertexColors===!0&&!!N.attributes.color&&N.attributes.color.itemSize===4,De=!!N.attributes.tangent&&(!!L.normalMap||L.anisotropy>0),Me=!!N.morphAttributes.position,Ve=!!N.morphAttributes.normal,nt=!!N.morphAttributes.color;let et=Ct;L.toneMapped&&($===null||$.isXRRenderTarget===!0)&&(et=I.toneMapping);const ke=N.morphAttributes.position||N.morphAttributes.normal||N.morphAttributes.color,ut=ke!==void 0?ke.length:0,ue=w.get(L),gt=g.state.lights;if(Oe===!0&&(ye===!0||a!==ge)){const Ke=a===ge&&L.id===ce;Te.setState(L,a,Ke)}let Fe=!1;L.version===ue.__version?(ue.needsLights&&ue.lightsStateVersion!==gt.state.version||ue.outputColorSpace!==le||U.isBatchedMesh&&ue.batching===!1||!U.isBatchedMesh&&ue.batching===!0||U.isBatchedMesh&&ue.batchingColor===!0&&U.colorTexture===null||U.isBatchedMesh&&ue.batchingColor===!1&&U.colorTexture!==null||U.isInstancedMesh&&ue.instancing===!1||!U.isInstancedMesh&&ue.instancing===!0||U.isSkinnedMesh&&ue.skinning===!1||!U.isSkinnedMesh&&ue.skinning===!0||U.isInstancedMesh&&ue.instancingColor===!0&&U.instanceColor===null||U.isInstancedMesh&&ue.instancingColor===!1&&U.instanceColor!==null||U.isInstancedMesh&&ue.instancingMorph===!0&&U.morphTexture===null||U.isInstancedMesh&&ue.instancingMorph===!1&&U.morphTexture!==null||ue.envMap!==Ee||L.fog===!0&&ue.fog!==fe||ue.numClippingPlanes!==void 0&&(ue.numClippingPlanes!==Te.numPlanes||ue.numIntersection!==Te.numIntersection)||ue.vertexAlphas!==Le||ue.vertexTangents!==De||ue.morphTargets!==Me||ue.morphNormals!==Ve||ue.morphColors!==nt||ue.toneMapping!==et||ue.morphTargetsCount!==ut||!!ue.lightProbeGrid!=g.state.lightProbeGridArray.length>0)&&(Fe=!0):(Fe=!0,ue.__version=L.version);let Et=ue.currentProgram;Fe===!0&&(Et=un(L,x,U),O&&L.isNodeMaterial&&O.onUpdateProgram(L,Et,ue));let Tt=!1,Nt=!1,zt=!1;const ze=Et.getUniforms(),it=ue.uniforms;if(r.useProgram(Et.program)&&(Tt=!0,Nt=!0,zt=!0),L.id!==ce&&(ce=L.id,Nt=!0),ue.needsLights){const Ke=Zr(g.state.lightProbeGridArray,U);ue.lightProbeGrid!==Ke&&(ue.lightProbeGrid=Ke,Nt=!0)}if(Tt||ge!==a){r.buffers.depth.getReversed()&&a.reversedDepth!==!0&&(a._reversedDepth=!0,a.updateProjectionMatrix()),ze.setValue(E,"projectionMatrix",a.projectionMatrix),ze.setValue(E,"viewMatrix",a.matrixWorldInverse);const Ft=ze.map.cameraPosition;Ft!==void 0&&Ft.setValue(E,st.setFromMatrixPosition(a.matrixWorld)),u.logarithmicDepthBuffer&&ze.setValue(E,"logDepthBufFC",2/(Math.log(a.far+1)/Math.LN2)),(L.isMeshPhongMaterial||L.isMeshToonMaterial||L.isMeshLambertMaterial||L.isMeshBasicMaterial||L.isMeshStandardMaterial||L.isShaderMaterial)&&ze.setValue(E,"isOrthographic",a.isOrthographicCamera===!0),ge!==a&&(ge=a,Nt=!0,zt=!0)}if(ue.needsLights&&(gt.state.directionalShadowMap.length>0&&ze.setValue(E,"directionalShadowMap",gt.state.directionalShadowMap,B),gt.state.spotShadowMap.length>0&&ze.setValue(E,"spotShadowMap",gt.state.spotShadowMap,B),gt.state.pointShadowMap.length>0&&ze.setValue(E,"pointShadowMap",gt.state.pointShadowMap,B)),U.isSkinnedMesh){ze.setOptional(E,U,"bindMatrix"),ze.setOptional(E,U,"bindMatrixInverse");const Ke=U.skeleton;Ke&&(Ke.boneTexture===null&&Ke.computeBoneTexture(),ze.setValue(E,"boneTexture",Ke.boneTexture,B))}U.isBatchedMesh&&(ze.setOptional(E,U,"batchingTexture"),ze.setValue(E,"batchingTexture",U._matricesTexture,B),ze.setOptional(E,U,"batchingIdTexture"),ze.setValue(E,"batchingIdTexture",U._indirectTexture,B),ze.setOptional(E,U,"batchingColorTexture"),U._colorsTexture!==null&&ze.setValue(E,"batchingColorTexture",U._colorsTexture,B));const yt=N.morphAttributes;if((yt.position!==void 0||yt.normal!==void 0||yt.color!==void 0)&&v.update(U,N,Et),(Nt||ue.receiveShadow!==U.receiveShadow)&&(ue.receiveShadow=U.receiveShadow,ze.setValue(E,"receiveShadow",U.receiveShadow)),(L.isMeshStandardMaterial||L.isMeshLambertMaterial||L.isMeshPhongMaterial)&&L.envMap===null&&x.environment!==null&&(it.envMapIntensity.value=x.environmentIntensity),it.dfgLUT!==void 0&&(it.dfgLUT.value=hd()),Nt){if(ze.setValue(E,"toneMappingExposure",I.toneMappingExposure),ue.needsLights&&Qr(it,zt),fe&&L.fog===!0&&Se.refreshFogUniforms(it,fe),Se.refreshMaterialUniforms(it,L,J,te,g.state.transmissionRenderTarget[a.id]),ue.needsLights&&ue.lightProbeGrid){const Ke=ue.lightProbeGrid;it.probesSH.value=Ke.texture,it.probesMin.value.copy(Ke.boundingBox.min),it.probesMax.value.copy(Ke.boundingBox.max),it.probesResolution.value.copy(Ke.resolution)}En.upload(E,ii(ue),it,B)}if(L.isShaderMaterial&&L.uniformsNeedUpdate===!0&&(En.upload(E,ii(ue),it,B),L.uniformsNeedUpdate=!1),L.isSpriteMaterial&&ze.setValue(E,"center",U.center),ze.setValue(E,"modelViewMatrix",U.modelViewMatrix),ze.setValue(E,"normalMatrix",U.normalMatrix),ze.setValue(E,"modelMatrix",U.matrixWorld),L.uniformsGroups!==void 0){const Ke=L.uniformsGroups;for(let Ft=0,Xt=Ke.length;Ft<Xt;Ft++){const ai=Ke[Ft];q.update(ai,Et),q.bind(ai,Et)}}return Et}function Qr(a,x){a.ambientLightColor.needsUpdate=x,a.lightProbe.needsUpdate=x,a.directionalLights.needsUpdate=x,a.directionalLightShadows.needsUpdate=x,a.pointLights.needsUpdate=x,a.pointLightShadows.needsUpdate=x,a.spotLights.needsUpdate=x,a.spotLightShadows.needsUpdate=x,a.rectAreaLights.needsUpdate=x,a.hemisphereLights.needsUpdate=x}function Jr(a){return a.isMeshLambertMaterial||a.isMeshToonMaterial||a.isMeshPhongMaterial||a.isMeshStandardMaterial||a.isShadowMaterial||a.isShaderMaterial&&a.lights===!0}this.getActiveCubeFace=function(){return Y},this.getActiveMipmapLevel=function(){return V},this.getRenderTarget=function(){return $},this.setRenderTargetTextures=function(a,x,N){const L=w.get(a);L.__autoAllocateDepthBuffer=a.resolveDepthBuffer===!1,L.__autoAllocateDepthBuffer===!1&&(L.__useRenderToTexture=!1),w.get(a.texture).__webglTexture=x,w.get(a.depthTexture).__webglTexture=L.__autoAllocateDepthBuffer?void 0:N,L.__hasExternalTextures=!0},this.setRenderTargetFramebuffer=function(a,x){const N=w.get(a);N.__webglFramebuffer=x,N.__useDefaultFramebuffer=x===void 0},this.setRenderTarget=function(a,x=0,N=0){$=a,Y=x,V=N;let L=null,U=!1,fe=!1;if(a){const le=w.get(a);if(le.__useDefaultFramebuffer!==void 0){r.bindFramebuffer(E.FRAMEBUFFER,le.__webglFramebuffer),ve.copy(a.viewport),xe.copy(a.scissor),Xe=a.scissorTest,r.viewport(ve),r.scissor(xe),r.setScissorTest(Xe),ce=-1;return}else if(le.__webglFramebuffer===void 0)B.setupRenderTarget(a);else if(le.__hasExternalTextures)B.rebindTextures(a,w.get(a.texture).__webglTexture,w.get(a.depthTexture).__webglTexture);else if(a.depthBuffer){const Le=a.depthTexture;if(le.__boundDepthTexture!==Le){if(Le!==null&&w.has(Le)&&(a.width!==Le.image.width||a.height!==Le.image.height))throw new Error("THREE.WebGLRenderer: Attached DepthTexture is initialized to the incorrect size.");B.setupDepthRenderbuffer(a)}}const me=a.texture;(me.isData3DTexture||me.isDataArrayTexture||me.isCompressedArrayTexture)&&(fe=!0);const Ee=w.get(a).__webglFramebuffer;a.isWebGLCubeRenderTarget?(Array.isArray(Ee[x])?L=Ee[x][N]:L=Ee[x],U=!0):a.samples>0&&B.useMultisampledRTT(a)===!1?L=w.get(a).__webglMultisampledFramebuffer:Array.isArray(Ee)?L=Ee[N]:L=Ee,ve.copy(a.viewport),xe.copy(a.scissor),Xe=a.scissorTest}else ve.copy(Ae).multiplyScalar(J).floor(),xe.copy(tt).multiplyScalar(J).floor(),Xe=we;if(N!==0&&(L=Q),r.bindFramebuffer(E.FRAMEBUFFER,L)&&r.drawBuffers(a,L),r.viewport(ve),r.scissor(xe),r.setScissorTest(Xe),U){const le=w.get(a.texture);E.framebufferTexture2D(E.FRAMEBUFFER,E.COLOR_ATTACHMENT0,E.TEXTURE_CUBE_MAP_POSITIVE_X+x,le.__webglTexture,N)}else if(fe){const le=x;for(let me=0;me<a.textures.length;me++){const Ee=w.get(a.textures[me]);E.framebufferTextureLayer(E.FRAMEBUFFER,E.COLOR_ATTACHMENT0+me,Ee.__webglTexture,N,le)}}else if(a!==null&&N!==0){const le=w.get(a.texture);E.framebufferTexture2D(E.FRAMEBUFFER,E.COLOR_ATTACHMENT0,E.TEXTURE_2D,le.__webglTexture,N)}ce=-1},this.readRenderTargetPixels=function(a,x,N,L,U,fe,pe,le=0){if(!(a&&a.isWebGLRenderTarget)){Ze("WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");return}let me=w.get(a).__webglFramebuffer;if(a.isWebGLCubeRenderTarget&&pe!==void 0&&(me=me[pe]),me){r.bindFramebuffer(E.FRAMEBUFFER,me);try{const Ee=a.textures[le],Le=Ee.format,De=Ee.type;if(a.textures.length>1&&E.readBuffer(E.COLOR_ATTACHMENT0+le),!u.textureFormatReadable(Le)){Ze("WebGLRenderer.readRenderTargetPixels: renderTarget is not in RGBA or implementation defined format.");return}if(!u.textureTypeReadable(De)){Ze("WebGLRenderer.readRenderTargetPixels: renderTarget is not in UnsignedByteType or implementation defined type.");return}x>=0&&x<=a.width-L&&N>=0&&N<=a.height-U&&E.readPixels(x,N,L,U,ae.convert(Le),ae.convert(De),fe)}finally{const Ee=$!==null?w.get($).__webglFramebuffer:null;r.bindFramebuffer(E.FRAMEBUFFER,Ee)}}},this.readRenderTargetPixelsAsync=async function(a,x,N,L,U,fe,pe,le=0){if(!(a&&a.isWebGLRenderTarget))throw new Error("THREE.WebGLRenderer.readRenderTargetPixels: renderTarget is not THREE.WebGLRenderTarget.");let me=w.get(a).__webglFramebuffer;if(a.isWebGLCubeRenderTarget&&pe!==void 0&&(me=me[pe]),me)if(x>=0&&x<=a.width-L&&N>=0&&N<=a.height-U){r.bindFramebuffer(E.FRAMEBUFFER,me);const Ee=a.textures[le],Le=Ee.format,De=Ee.type;if(a.textures.length>1&&E.readBuffer(E.COLOR_ATTACHMENT0+le),!u.textureFormatReadable(Le))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in RGBA or implementation defined format.");if(!u.textureTypeReadable(De))throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: renderTarget is not in UnsignedByteType or implementation defined type.");const Me=E.createBuffer();E.bindBuffer(E.PIXEL_PACK_BUFFER,Me),E.bufferData(E.PIXEL_PACK_BUFFER,fe.byteLength,E.STREAM_READ),E.readPixels(x,N,L,U,ae.convert(Le),ae.convert(De),0);const Ve=$!==null?w.get($).__webglFramebuffer:null;r.bindFramebuffer(E.FRAMEBUFFER,Ve);const nt=E.fenceSync(E.SYNC_GPU_COMMANDS_COMPLETE,0);return E.flush(),await na(E,nt,4),E.bindBuffer(E.PIXEL_PACK_BUFFER,Me),E.getBufferSubData(E.PIXEL_PACK_BUFFER,0,fe),E.deleteBuffer(Me),E.deleteSync(nt),fe}else throw new Error("THREE.WebGLRenderer.readRenderTargetPixelsAsync: requested read bounds are out of range.")},this.copyFramebufferToTexture=function(a,x=null,N=0){const L=Math.pow(2,-N),U=Math.floor(a.image.width*L),fe=Math.floor(a.image.height*L),pe=x!==null?x.x:0,le=x!==null?x.y:0;B.setTexture2D(a,0),E.copyTexSubImage2D(E.TEXTURE_2D,N,0,0,pe,le,U,fe),r.unbindTexture()},this.copyTextureToTexture=function(a,x,N=null,L=null,U=0,fe=0){let pe,le,me,Ee,Le,De,Me,Ve,nt;const et=a.isCompressedTexture?a.mipmaps[fe]:a.image;if(N!==null)pe=N.max.x-N.min.x,le=N.max.y-N.min.y,me=N.isBox3?N.max.z-N.min.z:1,Ee=N.min.x,Le=N.min.y,De=N.isBox3?N.min.z:0;else{const it=Math.pow(2,-U);pe=Math.floor(et.width*it),le=Math.floor(et.height*it),a.isDataArrayTexture?me=et.depth:a.isData3DTexture?me=Math.floor(et.depth*it):me=1,Ee=0,Le=0,De=0}L!==null?(Me=L.x,Ve=L.y,nt=L.z):(Me=0,Ve=0,nt=0);const ke=ae.convert(x.format),ut=ae.convert(x.type);let ue;x.isData3DTexture?(B.setTexture3D(x,0),ue=E.TEXTURE_3D):x.isDataArrayTexture||x.isCompressedArrayTexture?(B.setTexture2DArray(x,0),ue=E.TEXTURE_2D_ARRAY):(B.setTexture2D(x,0),ue=E.TEXTURE_2D),r.activeTexture(E.TEXTURE0),r.pixelStorei(E.UNPACK_FLIP_Y_WEBGL,x.flipY),r.pixelStorei(E.UNPACK_PREMULTIPLY_ALPHA_WEBGL,x.premultiplyAlpha),r.pixelStorei(E.UNPACK_ALIGNMENT,x.unpackAlignment);const gt=r.getParameter(E.UNPACK_ROW_LENGTH),Fe=r.getParameter(E.UNPACK_IMAGE_HEIGHT),Et=r.getParameter(E.UNPACK_SKIP_PIXELS),Tt=r.getParameter(E.UNPACK_SKIP_ROWS),Nt=r.getParameter(E.UNPACK_SKIP_IMAGES);r.pixelStorei(E.UNPACK_ROW_LENGTH,et.width),r.pixelStorei(E.UNPACK_IMAGE_HEIGHT,et.height),r.pixelStorei(E.UNPACK_SKIP_PIXELS,Ee),r.pixelStorei(E.UNPACK_SKIP_ROWS,Le),r.pixelStorei(E.UNPACK_SKIP_IMAGES,De);const zt=a.isDataArrayTexture||a.isData3DTexture,ze=x.isDataArrayTexture||x.isData3DTexture;if(a.isDepthTexture){const it=w.get(a),yt=w.get(x),Ke=w.get(it.__renderTarget),Ft=w.get(yt.__renderTarget);r.bindFramebuffer(E.READ_FRAMEBUFFER,Ke.__webglFramebuffer),r.bindFramebuffer(E.DRAW_FRAMEBUFFER,Ft.__webglFramebuffer);for(let Xt=0;Xt<me;Xt++)zt&&(E.framebufferTextureLayer(E.READ_FRAMEBUFFER,E.COLOR_ATTACHMENT0,w.get(a).__webglTexture,U,De+Xt),E.framebufferTextureLayer(E.DRAW_FRAMEBUFFER,E.COLOR_ATTACHMENT0,w.get(x).__webglTexture,fe,nt+Xt)),E.blitFramebuffer(Ee,Le,pe,le,Me,Ve,pe,le,E.DEPTH_BUFFER_BIT,E.NEAREST);r.bindFramebuffer(E.READ_FRAMEBUFFER,null),r.bindFramebuffer(E.DRAW_FRAMEBUFFER,null)}else if(U!==0||a.isRenderTargetTexture||w.has(a)){const it=w.get(a),yt=w.get(x);r.bindFramebuffer(E.READ_FRAMEBUFFER,Z),r.bindFramebuffer(E.DRAW_FRAMEBUFFER,k);for(let Ke=0;Ke<me;Ke++)zt?E.framebufferTextureLayer(E.READ_FRAMEBUFFER,E.COLOR_ATTACHMENT0,it.__webglTexture,U,De+Ke):E.framebufferTexture2D(E.READ_FRAMEBUFFER,E.COLOR_ATTACHMENT0,E.TEXTURE_2D,it.__webglTexture,U),ze?E.framebufferTextureLayer(E.DRAW_FRAMEBUFFER,E.COLOR_ATTACHMENT0,yt.__webglTexture,fe,nt+Ke):E.framebufferTexture2D(E.DRAW_FRAMEBUFFER,E.COLOR_ATTACHMENT0,E.TEXTURE_2D,yt.__webglTexture,fe),U!==0?E.blitFramebuffer(Ee,Le,pe,le,Me,Ve,pe,le,E.COLOR_BUFFER_BIT,E.NEAREST):ze?E.copyTexSubImage3D(ue,fe,Me,Ve,nt+Ke,Ee,Le,pe,le):E.copyTexSubImage2D(ue,fe,Me,Ve,Ee,Le,pe,le);r.bindFramebuffer(E.READ_FRAMEBUFFER,null),r.bindFramebuffer(E.DRAW_FRAMEBUFFER,null)}else ze?a.isDataTexture||a.isData3DTexture?E.texSubImage3D(ue,fe,Me,Ve,nt,pe,le,me,ke,ut,et.data):x.isCompressedArrayTexture?E.compressedTexSubImage3D(ue,fe,Me,Ve,nt,pe,le,me,ke,et.data):E.texSubImage3D(ue,fe,Me,Ve,nt,pe,le,me,ke,ut,et):a.isDataTexture?E.texSubImage2D(E.TEXTURE_2D,fe,Me,Ve,pe,le,ke,ut,et.data):a.isCompressedTexture?E.compressedTexSubImage2D(E.TEXTURE_2D,fe,Me,Ve,et.width,et.height,ke,et.data):E.texSubImage2D(E.TEXTURE_2D,fe,Me,Ve,pe,le,ke,ut,et);r.pixelStorei(E.UNPACK_ROW_LENGTH,gt),r.pixelStorei(E.UNPACK_IMAGE_HEIGHT,Fe),r.pixelStorei(E.UNPACK_SKIP_PIXELS,Et),r.pixelStorei(E.UNPACK_SKIP_ROWS,Tt),r.pixelStorei(E.UNPACK_SKIP_IMAGES,Nt),fe===0&&x.generateMipmaps&&E.generateMipmap(ue),r.unbindTexture()},this.initRenderTarget=function(a){w.get(a).__webglFramebuffer===void 0&&B.setupRenderTarget(a)},this.initTexture=function(a){a.isCubeTexture?B.setTextureCube(a,0):a.isData3DTexture?B.setTexture3D(a,0):a.isDataArrayTexture||a.isCompressedArrayTexture?B.setTexture2DArray(a,0):B.setTexture2D(a,0),r.unbindTexture()},this.resetState=function(){Y=0,V=0,$=null,r.reset(),de.reset()},typeof __THREE_DEVTOOLS__<"u"&&__THREE_DEVTOOLS__.dispatchEvent(new CustomEvent("observe",{detail:this}))}get coordinateSystem(){return si}get outputColorSpace(){return this._outputColorSpace}set outputColorSpace(n){this._outputColorSpace=n;const t=this.getContext();t.drawingBufferColorSpace=Qe._getDrawingBufferColorSpace(n),t.unpackColorSpace=Qe._getUnpackColorSpace()}}function gd(e){let n,t=!1;for(const i of e)if(i)try{i.dispose()}catch(c){t||(t=!0,n=c)}if(t)throw n}export{Zi as P,se as U,_d as W,gd as d};
