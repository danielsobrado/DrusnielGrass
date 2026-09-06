import type { WorldVisibilitySnapshot } from "../render/visibility/WorldVisibilityProbe";
import type { GpuFrameTimingStats } from "./GpuFrameTimer";
import type { GrassWorkloadSnapshot } from "./GrassWorkloadProbe";

export class WorldDiagnosticsHud {
  private readonly element =
    document.querySelector<HTMLElement>("#world-stats");
  private readonly observer?: MutationObserver;
  private baseText = "";
  private renderedText = "";
  private snapshot?: GrassWorkloadSnapshot;
  private gpu?: GpuFrameTimingStats;
  private visibility?: WorldVisibilitySnapshot;

  constructor() {
    if (!this.element) {
      return;
    }
    this.baseText = this.element.textContent ?? "";
    this.observer = new MutationObserver(this.handleMutation);
    this.observer.observe(this.element, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  update(
    snapshot: GrassWorkloadSnapshot,
    gpu: GpuFrameTimingStats,
    visibility?: WorldVisibilitySnapshot,
  ): void {
    this.snapshot = snapshot;
    this.gpu = gpu;
    this.visibility = visibility;
    this.render();
  }

  dispose(): void {
    this.observer?.disconnect();
  }

  private readonly handleMutation = (): void => {
    if (!this.element) {
      return;
    }
    const current = this.element.textContent ?? "";
    if (current === this.renderedText) {
      return;
    }
    this.baseText = current;
    this.render();
  };

  private render(): void {
    if (!this.element || !this.baseText || !this.snapshot || !this.gpu) {
      return;
    }
    const output: string[] = [];
    let workloadInserted = false;

    for (const line of this.baseText.split("\n")) {
      if (line.startsWith("Grass submit ")) {
        continue;
      }
      if (isGrassSummaryLine(line) && this.snapshot.ready) {
        output.push(...formatWorkloadLines(this.snapshot));
        workloadInserted = true;
        continue;
      }
      if (line.startsWith("Draws ")) {
        output.push(`${line} · ${formatGpuTiming(this.gpu)}`);
        continue;
      }
      output.push(line);
    }

    if (!workloadInserted && this.snapshot.ready) {
      output.push(...formatWorkloadLines(this.snapshot));
    }

    if (this.visibility?.ready) {
      output.push(formatVisibilityLine(this.visibility));
    }

    const rendered = output.filter(Boolean).join("\n");
    if (rendered === this.renderedText) {
      return;
    }
    this.renderedText = rendered;
    this.element.textContent = rendered;
  }
}

function isGrassSummaryLine(line: string): boolean {
  return /^Grass [\d,]+ patches · [\d,]+ blades · [\d,]+ impostors$/.test(
    line,
  );
}

function formatWorkloadLines(snapshot: GrassWorkloadSnapshot): string[] {
  const nearSubmitted =
    snapshot.nearBaseInstances +
    snapshot.nearBridgeInstances +
    snapshot.nearDetailInstances +
    snapshot.nearUltraInstances;
  return [
    `Grass logical ${formatCompact(snapshot.logicalBladeEquivalents)} · visible ${formatCompact(snapshot.visibleLogicalBladeEquivalents)} · patch inst ${formatInteger(snapshot.residentPatchInstances)}`,
    `Near resident ${formatCompact(snapshot.nearResidentUniqueInstances)} unique · submit ${formatCompact(nearSubmitted)} inst / ${formatCompact(snapshot.nearSubmittedTriangles)} tris`,
    `Mid submit ${formatInteger(snapshot.midSubmittedBlades)} blades / ${formatCompact(snapshot.midSubmittedVertices)} verts · Far ${formatInteger(snapshot.farSubmittedCards)} cards · Accents ${formatInteger(snapshot.accentSubmittedCards)} cards`,
  ];
}

/**
 * The submission funnel, phrased so the interesting number leads.
 *
 * `unculled` is what decides whether spatial partitioning is worth building: it
 * counts meshes that bypass frustum culling entirely and are therefore drawn
 * whichever way the camera faces.
 */
function formatVisibilityLine(snapshot: WorldVisibilitySnapshot): string {
  const tested = snapshot.frustumVisible + snapshot.frustumRejected;
  const rejectedShare =
    tested > 0 ? Math.round((snapshot.frustumRejected / tested) * 100) : 0;
  const pending =
    snapshot.boundsPending > 0
      ? ` · pending ${formatInteger(snapshot.boundsPending)}`
      : "";
  return [
    `Vis ${formatInteger(snapshot.renderables)} meshes`,
    `unculled ${formatInteger(snapshot.unculled)}`,
    `frustum ${formatInteger(snapshot.frustumVisible)} vis / ${formatInteger(snapshot.frustumRejected)} rej (${rejectedShare}%)`,
    `inst ${formatCompact(snapshot.submittedInstances)}${pending}`,
    `probe ${Math.round(snapshot.sampleMicroseconds)}µs`,
  ].join(" · ");
}

function formatGpuTiming(stats: GpuFrameTimingStats): string {
  if (stats.status === "disabled") {
    return "GPU off (?gpuTiming=1)";
  }
  if (stats.status === "unsupported") {
    return "GPU N/A";
  }
  if (stats.medianMs === undefined || stats.p95Ms === undefined) {
    return "GPU warming";
  }
  return `GPU scene ${stats.medianMs.toFixed(2)} med / ${stats.p95Ms.toFixed(2)} p95 ms`;
}

function formatInteger(value: number): string {
  return Math.max(0, Math.round(value)).toLocaleString();
}

function formatCompact(value: number): string {
  const absolute = Math.max(0, value);
  if (absolute >= 1_000_000) {
    return `${(absolute / 1_000_000).toFixed(2)}M`;
  }
  if (absolute >= 100_000) {
    return `${Math.round(absolute / 1_000)}k`;
  }
  return formatInteger(absolute);
}
