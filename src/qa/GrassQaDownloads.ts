import type * as THREE from "three";

const PANEL_ID = "grass-qa-downloads";
const REVOKE_DELAY_MS = 1_000;
const AUTO_DOWNLOAD_STAGGER_MS = 150;

export class GrassQaDownloads {
  private readonly objectUrls = new Set<string>();
  private readonly timeoutHandles = new Set<number>();
  private panel?: HTMLDivElement;
  private disposed = false;

  captureScreenshot(
    renderer: THREE.WebGLRenderer,
    name: string,
    signal?: AbortSignal,
  ): Promise<Blob> {
    return new Promise((resolve, reject) => {
      if (this.disposed || signal?.aborted) {
        reject(createAbortError());
        return;
      }
      renderer.domElement.toBlob((blob) => {
        if (this.disposed || signal?.aborted) {
          reject(createAbortError());
          return;
        }
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error(`Unable to capture QA screenshot ${name}.`));
        }
      }, "image/png");
    });
  }

  add(blob: Blob, fileName: string, label: string): void {
    if (this.disposed) {
      return;
    }
    const panel = this.getPanel();
    const link = document.createElement("a");
    const objectUrl = URL.createObjectURL(blob);
    this.objectUrls.add(objectUrl);
    link.href = objectUrl;
    link.download = fileName;
    link.textContent = label;
    link.dataset.pendingDownload = "1";
    link.style.color = "#fff";
    link.addEventListener(
      "click",
      () => this.scheduleObjectUrlRevoke(objectUrl),
      { once: true },
    );
    panel.appendChild(link);
  }

  triggerPending(): void {
    if (this.disposed || !this.panel) {
      return;
    }
    const links = this.panel.querySelectorAll<HTMLAnchorElement>(
      "a[data-pending-download='1']",
    );
    links.forEach((link, index) => {
      const handle = window.setTimeout(() => {
        this.timeoutHandles.delete(handle);
        if (!this.disposed && link.isConnected) {
          link.click();
        }
      }, index * AUTO_DOWNLOAD_STAGGER_MS);
      this.timeoutHandles.add(handle);
      delete link.dataset.pendingDownload;
    });
  }

  dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    for (const handle of this.timeoutHandles) {
      window.clearTimeout(handle);
    }
    this.timeoutHandles.clear();
    for (const objectUrl of this.objectUrls) {
      URL.revokeObjectURL(objectUrl);
    }
    this.objectUrls.clear();
    this.panel?.remove();
    this.panel = undefined;
  }

  private scheduleObjectUrlRevoke(objectUrl: string): void {
    if (this.disposed || !this.objectUrls.has(objectUrl)) {
      return;
    }
    const handle = window.setTimeout(() => {
      this.timeoutHandles.delete(handle);
      this.revokeObjectUrl(objectUrl);
    }, REVOKE_DELAY_MS);
    this.timeoutHandles.add(handle);
  }

  private revokeObjectUrl(objectUrl: string): void {
    if (!this.objectUrls.delete(objectUrl)) {
      return;
    }
    URL.revokeObjectURL(objectUrl);
  }

  private getPanel(): HTMLDivElement {
    if (this.panel) {
      return this.panel;
    }
    const existing = document.querySelector<HTMLDivElement>(`#${PANEL_ID}`);
    if (existing) {
      this.panel = existing;
      return existing;
    }

    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.style.cssText =
      "position:fixed;left:12px;bottom:12px;z-index:10000;padding:12px;background:#111d;color:#fff;font:13px sans-serif;border-radius:8px;display:flex;gap:10px;flex-wrap:wrap;max-width:70vw";
    document.body.appendChild(panel);
    this.panel = panel;
    return panel;
  }
}

function createAbortError(): Error {
  return new DOMException("Grass QA capture aborted.", "AbortError");
}
