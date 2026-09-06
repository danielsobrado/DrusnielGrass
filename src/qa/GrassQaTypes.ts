import * as THREE from "three";
import type { GrassDiagnostics } from "../grass/GrassSystem";

export interface GrassQaOptions {
  warmupSeconds: number;
  sampleSeconds: number;
  download: boolean;
}

export interface GrassQaPose {
  name: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export interface GrassFrameStats {
  samples: number;
  meanMs: number;
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
}

export interface GrassRendererStats {
  calls: number;
  triangles: number;
  points: number;
  lines: number;
}

export interface GrassQaCapture {
  name: string;
  camera: {
    position: readonly [number, number, number];
    target: readonly [number, number, number];
  };
  frameStats: GrassFrameStats;
  renderer: GrassRendererStats;
  grass: GrassDiagnostics;
  screenshot: string;
}

export interface GrassQaReport {
  version: 1;
  generatedAt: string;
  userAgent: string;
  viewport: {
    width: number;
    height: number;
    devicePixelRatio: number;
  };
  options: GrassQaOptions;
  captures: GrassQaCapture[];
}
