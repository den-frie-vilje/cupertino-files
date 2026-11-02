/**
 * osascript harness for end-to-end tests against the real iWork apps.
 *
 * These tests are the only way to answer the question the unit suite
 * cannot: *does Pages actually accept what we wrote?* Everything else in
 * this repository verifies our model against our understanding of the
 * format. This verifies it against Apple.
 *
 * Safety rules encoded here, because these tests drive GUI applications
 * that may already hold the user's real documents open:
 *
 *  - Never run unless macOS + the app are present and automation is
 *    permitted. Otherwise skip with a reason; never fail.
 *  - Refuse to run if the app already has documents open, rather than
 *    risk interfering with them.
 *  - Refuse to run while the screen is held: the suite brings the apps to
 *    the front, so a person who needs the Mac creates the hold file and
 *    every app-driving test skips, naming the file, until it is removed.
 *  - Only ever touch files in a scratch directory we created.
 *  - Close documents we opened with `saving no` unless a test explicitly
 *    saves, and leave the app in the run state we found it in.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, copyFileSync, readFileSync, readdirSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export type IWorkApp = "Pages" | "Numbers" | "Keynote";

export class AppleScriptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AppleScriptError";
  }
}

/** Run an AppleScript snippet, returning trimmed stdout. */
export function osascript(script: string, timeoutMs = 120_000): string {
  try {
    return execFileSync("osascript", ["-e", script], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    throw new AppleScriptError(
      (err.stderr || err.stdout || err.message || String(e)).trim(),
    );
  }
}

/** Run JavaScript for Automation instead of AppleScript (better quoting). */
export function osajs(script: string, timeoutMs = 120_000): string {
  try {
    return execFileSync("osascript", ["-l", "JavaScript", "-e", script], {
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (e) {
    const err = e as { stderr?: string; stdout?: string; message?: string };
    throw new AppleScriptError(
      (err.stderr || err.stdout || err.message || String(e)).trim(),
    );
  }
}

let cachedPlatformReason: string | null | undefined;

/** Reason the whole e2e suite cannot run, or null when it can. */
export function platformSkipReason(): string | null {
  if (cachedPlatformReason !== undefined) return cachedPlatformReason;
  if (process.platform !== "darwin") {
    cachedPlatformReason = `requires macOS (running on ${process.platform})`;
    return cachedPlatformReason;
  }
  try {
    osascript('return "ok"', 15_000);
    cachedPlatformReason = null;
  } catch (e) {
    cachedPlatformReason = `osascript unavailable: ${(e as Error).message.split("\n")[0]}`;
  }
  return cachedPlatformReason;
}

const appReasons = new Map<IWorkApp, string | null>();

/**
 * Reason a given app cannot be driven, or null when it can.
 *
 * Distinguishes "not installed" from "automation not permitted", because
 * the fix for the latter is a one-time approval in System Settings →
 * Privacy & Security → Automation.
 */
export function appSkipReason(app: IWorkApp): string | null {
  const platform = platformSkipReason();
  if (platform) return platform;
  const cached = appReasons.get(app);
  if (cached !== undefined) return cached;

  let reason: string | null = null;
  try {
    osascript(`id of application "${app}"`, 15_000);
  } catch (e) {
    reason = `${app} is not installed (${(e as Error).message.split("\n")[0]})`;
    appReasons.set(app, reason);
    return reason;
  }
  try {
    // Touching the app object is what triggers the automation prompt.
    osascript(`tell application "${app}" to return name`, 30_000);
  } catch (e) {
    const message = (e as Error).message;
    reason = /-1743|not authori[sz]ed|not allowed/i.test(message)
      ? `automation of ${app} is not permitted — approve it in System Settings → ` +
        `Privacy & Security → Automation, then re-run`
      : `${app} could not be scripted: ${message.split("\n")[0]}`;
  }
  appReasons.set(app, reason);
  return reason;
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function retrying<T>(action: () => T, transient: RegExp, attempts = 10): T {
  for (let attempt = 1; ; attempt++) {
    try {
      return action();
    } catch (e) {
      if (attempt === attempts || !transient.test((e as Error).message)) throw e;
      sleep(1000);
    }
  }
}

/** True when the app is currently running (so we can restore that state). */
export function isRunning(app: IWorkApp): boolean {
  return osascript(`application "${app}" is running`) === "true";
}

/** Number of documents the app currently has open. */
export function openDocumentCount(app: IWorkApp): number {
  if (!isRunning(app)) return 0;
  const n = osascript(`tell application "${app}" to return count of documents`);
  return Number.parseInt(n, 10) || 0;
}

/**
 * Guard: refuse to drive an app that already has documents open.
 *
 * Returns a skip reason rather than throwing, so a developer with work in
 * progress gets a clear skip instead of a failing suite — or worse, an
 * interfered-with document.
 */
/** Create this file to keep the suite off the screen; remove it to let it drive the apps again. */
export const HOLD_SCREEN_FILE = join(homedir(), ".cupertino-files-hold-screen");

export function busySkipReason(app: IWorkApp): string | null {
  if (existsSync(HOLD_SCREEN_FILE)) return `the screen is held — remove ${HOLD_SCREEN_FILE} to let the suite drive ${app}`;
  const reason = appSkipReason(app);
  if (reason) return reason;
  try {
    // -600 (not running) comes from a cold app still launching, and from
    // a stale Launch Services record left by a quit: AppleScript says the
    // app is running, no process exists, and only Launch Services itself
    // (`open -a`) clears it. Open, then wait for the first answer.
    const open = retrying(
      () => {
        try {
          return openDocumentCount(app);
        } catch (e) {
          if (/-600/.test((e as Error).message)) execFileSync("open", ["-a", app], { stdio: "ignore" });
          throw e;
        }
      },
      /-600/,
      30,
    );
    if (open > 0) {
      return `${app} already has ${open} document(s) open — close them so the test cannot disturb your work`;
    }
  } catch (e) {
    return `could not query ${app}: ${(e as Error).message.split("\n")[0]}`;
  }
  return null;
}

/** A disposable directory plus the app run-states to restore afterwards. */
export class E2ESession {
  readonly dir: string;
  private readonly wasRunning = new Map<IWorkApp, boolean>();

  private constructor(dir: string) {
    this.dir = dir;
  }

  static create(): E2ESession {
    return new E2ESession(mkdtempSync(join(tmpdir(), "cupertino-files-e2e-")));
  }

  /** Record the app's run state so {@link cleanup} can restore it. */
  remember(app: IWorkApp): void {
    if (!this.wasRunning.has(app)) {
      try {
        this.wasRunning.set(app, isRunning(app));
      } catch {
        this.wasRunning.set(app, true); // assume running; never quit on doubt
      }
    }
  }

  /** Copy a repository fixture into the scratch directory. */
  stageFixture(fixtureName: string, asName = fixtureName): string {
    const source = fileURLToPath(new URL(`../../fixtures/${fixtureName}`, import.meta.url));
    const target = join(this.dir, asName);
    copyFileSync(source, target);
    return target;
  }

  /** Path inside the scratch directory (nothing is created). */
  path(name: string): string {
    return join(this.dir, name);
  }

  /** Close every document an app has open without saving. */
  closeAll(app: IWorkApp): void {
    try {
      if (isRunning(app)) osascript(`tell application "${app}" to close every document saving no`);
    } catch {
      /* best effort */
    }
  }

  cleanup(): void {
    for (const [app, wasRunning] of this.wasRunning) {
      this.closeAll(app);
      if (!wasRunning) {
        try {
          osascript(`tell application "${app}" to quit`);
        } catch {
          /* best effort */
        }
      }
    }
    try {
      rmSync(this.dir, { recursive: true, force: true });
    } catch {
      /* best effort */
    }
  }
}

/** POSIX path literal for embedding in AppleScript. */
export function posix(path: string): string {
  return `POSIX file ${JSON.stringify(path)}`;
}

/**
 * Open a document, evaluate `body` (AppleScript referring to `theDoc`),
 * then close it. `save` controls whether changes are written back.
 */
export function withDocument(
  app: IWorkApp,
  path: string,
  body: string,
  options: { save?: boolean } = {},
): string {
  const saveLine = options.save ? "  save theDoc\n" : "";
  return osascript(
    `tell application "${app}"\n` +
      `  set theDoc to open ${posix(path)}\n` +
      `  set theResult to (${body})\n` +
      saveLine +
      `  close theDoc saving no\n` +
      `  return theResult\n` +
      `end tell`,
  );
}

/**
 * Open a document and export it with the app's own exporter, then close it.
 * `format` is the app's export-format enumerator (`PDF`, `CSV`, …) and
 * `properties` an AppleScript record literal for `with properties`.
 */
export function exportDocument(
  app: IWorkApp,
  path: string,
  out: string,
  format = "PDF",
  properties?: string,
): void {
  const props = properties ? ` with properties ${properties}` : "";
  osascript(
    `tell application "${app}"\n` +
      `  set theDoc to open ${posix(path)}\n` +
      `  export theDoc to ${posix(out)} as ${format}${props}\n` +
      `  close theDoc saving no\n` +
      `end tell`,
  );
}

/** Reason poppler cannot be run through pkgx, or null when it can. */
export function popplerSkipReason(): string | null {
  try {
    poppler("pdfinfo", ["-v"]);
    return null;
  } catch (e) {
    return `poppler unavailable through pkgx: ${(e as Error).message.split("\n")[0]}`;
  }
}

function poppler(tool: string, args: string[]): string {
  return execFileSync("pkgx", ["+poppler.freedesktop.org", tool, ...args], {
    encoding: "utf8",
    timeout: 120_000,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

/** The PDF's page count. */
export function pdfPageCount(pdf: string): number {
  const line = poppler("pdfinfo", [pdf]).split("\n").find((l) => l.startsWith("Pages:"));
  return Number.parseInt(line?.slice(6) ?? "0", 10);
}

/** The PDF's text, page by page (form feeds separate pages in pdftotext's output). */
export function pdfText(pdf: string): string[] {
  return poppler("pdftotext", ["-layout", pdf, "-"]).split("\f").slice(0, -1);
}

export interface Raster {
  width: number;
  height: number;
  /** Packed RGB, three bytes per pixel, rows top to bottom. */
  rgb: Uint8Array;
  /** Points per pixel, from the dpi the page was rasterised at. */
  scale: number;
}

/** Rasterise one page (1-based) of a PDF through pdftoppm, as binary PPM. */
export function rasterize(pdf: string, page = 1, dpi = 36): Raster {
  const prefix = join(mkdtempSync(join(tmpdir(), "cupertino-files-ppm-")), "page");
  poppler("pdftoppm", ["-r", String(dpi), "-f", String(page), "-l", String(page), "-singlefile", pdf, prefix]);
  const dir = join(prefix, "..");
  const file = readdirSync(dir).find((name) => name.endsWith(".ppm"));
  if (!file) throw new Error(`pdftoppm wrote no page for ${pdf} page ${page}`);
  const bytes = readFileSync(join(dir, file));
  rmSync(dir, { recursive: true, force: true });
  // P6 header: magic, width, height, maxval, each followed by whitespace.
  const header = /^P6\s+(\d+)\s+(\d+)\s+(\d+)\s/.exec(bytes.subarray(0, 64).toString("latin1"));
  if (!header) throw new Error("pdftoppm output is not a binary PPM");
  const width = Number(header[1]);
  const height = Number(header[2]);
  const rgb = new Uint8Array(bytes.buffer, bytes.byteOffset + header[0].length, width * height * 3);
  return { width, height, rgb, scale: 72 / dpi };
}

/**
 * Count pixels within `rect` (in points; the whole page when omitted) whose
 * colour is within `tolerance` of `rgb` on every channel.
 */
export function countPixels(
  raster: Raster,
  rgb: readonly [number, number, number],
  tolerance = 24,
  rect?: { x: number; y: number; width: number; height: number },
): number {
  const x0 = rect ? Math.max(0, Math.floor(rect.x / raster.scale)) : 0;
  const y0 = rect ? Math.max(0, Math.floor(rect.y / raster.scale)) : 0;
  const x1 = rect ? Math.min(raster.width, Math.ceil((rect.x + rect.width) / raster.scale)) : raster.width;
  const y1 = rect ? Math.min(raster.height, Math.ceil((rect.y + rect.height) / raster.scale)) : raster.height;
  let count = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * raster.width + x) * 3;
      if (
        Math.abs(raster.rgb[i]! - rgb[0]) <= tolerance &&
        Math.abs(raster.rgb[i + 1]! - rgb[1]) <= tolerance &&
        Math.abs(raster.rgb[i + 2]! - rgb[2]) <= tolerance
      ) {
        count++;
      }
    }
  }
  return count;
}
