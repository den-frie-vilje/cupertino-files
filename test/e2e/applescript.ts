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
 *  - Only ever touch files in a scratch directory we created.
 *  - Close documents we opened with `saving no` unless a test explicitly
 *    saves, and leave the app in the run state we found it in.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
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
export function busySkipReason(app: IWorkApp): string | null {
  const reason = appSkipReason(app);
  if (reason) return reason;
  try {
    const open = openDocumentCount(app);
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
