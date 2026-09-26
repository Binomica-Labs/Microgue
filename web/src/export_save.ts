// Microgue © 2026 Binomica Labs. CC BY-NC-SA 4.0. https://github.com/Binomica-Labs/Microgue
// Getting the card off the device.
//
// Two routes, tried in order, because the game is played on a phone:
//
//   1. The share sheet, if this browser has it and will take a file. On a
//      phone that is what people actually want -- straight into a message
//      or a post, no trip through Downloads.
//   2. A download link, which works everywhere and is the desktop answer.
//
// Everything here can fail for reasons that are nobody's fault -- a browser
// without the API, a user who dismisses the sheet, a blocked download -- so
// every path reports rather than throws. A share the player cancelled is
// not an error.

export type ExportResult = "shared" | "downloaded" | "cancelled" | "failed";

interface Shareable {
  canShare?: (data: { files?: File[] }) => boolean;
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
}

export async function exportCanvas(
  canvas: HTMLCanvasElement, filename: string, title: string,
): Promise<ExportResult> {
  const blob = await toBlob(canvas);
  if (!blob) return "failed";

  const nav = globalThis.navigator as unknown as Shareable | undefined;
  if (nav?.share && nav.canShare) {
    try {
      const file = new File([blob], filename, { type: "image/png" });
      if (nav.canShare({ files: [file] })) {
        await nav.share({ files: [file], title });
        return "shared";
      }
    } catch (e) {
      // AbortError is the player closing the sheet. That is a decision,
      // not a failure, and telling them it failed would be a lie.
      if (e instanceof Error && e.name === "AbortError") return "cancelled";
      // Anything else: fall through to the download.
    }
  }
  return download(blob, filename);
}

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    try { canvas.toBlob((b) => { resolve(b); }, "image/png"); }
    catch { resolve(null); }
  });
}

function download(blob: Blob, filename: string): ExportResult {
  try {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoked on a timer, not immediately: some browsers have not finished
    // reading the blob when click() returns, and revoking early gives a
    // download that silently produces nothing.
    setTimeout(() => { URL.revokeObjectURL(url); }, 30_000);
    return "downloaded";
  } catch { return "failed"; }
}
