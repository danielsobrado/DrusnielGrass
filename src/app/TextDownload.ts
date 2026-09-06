const DOWNLOAD_URL_REVOKE_DELAY_MS = 0;

export function downloadTextFile(
  filename: string,
  content: string,
  mimeType: string,
): void {
  const url = URL.createObjectURL(new Blob([content], { type: mimeType }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.hidden = true;
  let revokeScheduled = false;

  try {
    document.body.appendChild(anchor);
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS);
    revokeScheduled = true;
  } finally {
    anchor.remove();
    if (!revokeScheduled) {
      URL.revokeObjectURL(url);
    }
  }
}
