/**
 * Build the embedded blank-document donors, from corpus fixtures.
 *
 * The apps never create a document from nothing — a new document is an
 * instantiation of a bundled template — and neither does this library.
 * `blank()` instantiates a donor: an Apple-written fixture emptied with
 * `blankFrom`, so every style, master, and identity in a "new" document
 * was authored by an Apple app. This script produces those donors and
 * embeds them:
 *
 *   data/blanks/blank.{pages,numbers,key}     the donor packages
 *   src/<app>/blank-donor.generated.ts        the same bytes, base64
 *
 * Choices, and why:
 *  - Pages:   iwork-mcp-v14.5-sample.pages (MIT) — made from Apple's Blank
 *             template (13.2), so it carries the canonical style set
 *             (Title, Subtitle, Heading 1–3, Body, Caption …) —
 *             re-papered to A4 with the exact values Apple's own A4
 *             documents carry, since the source is US Letter.
 *  - Numbers: numbers-parser-v26.1-date-formats.numbers (MIT) — Apple's
 *             Blank template (dev/15.3), already `iso-a4`.
 *  - Keynote: iwork-mcp-v14.5-sample.key (MIT) — Apple's Basic White
 *             theme (13.2), the chooser's default, English master names,
 *             1920 × 1080. Its theme media makes this the heaviest donor;
 *             smaller decks in the corpus all carry custom or non-English
 *             templates, and the masters are the product.
 *
 * ASSERT_VANILLA below is the contract: each donor must present what a
 * new document from Apple's own chooser would — Blank-template styles,
 * A4 (Pages, Numbers), Basic White masters at 16:9 (Keynote). Generation
 * and `--check` both enforce it, so a donor swap that drifts from
 * Apple's defaults fails loudly.
 *
 * Preview images are dropped from the packages — the apps regenerate them
 * on save. Run with `--check` to verify the embedded modules match the
 * donor files (CI runs this as `blanks:check`).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import {
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  ZipReader,
  buildZip,
} from "../src/index.ts";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const BLANKS_DIR = join(ROOT, "data", "blanks");

/** Apple's A4, byte-measured (see PageSetup's doc comment). */
const A4 = {
  pageWidth: 595.280029296875,
  pageHeight: 841.8900146484375,
  leftMargin: 56.69291687011719,
  rightMargin: 56.69291687011719,
  topMargin: 56.69291687011719,
  bottomMargin: 56.69291687011719,
  headerMargin: 35.43307113647461,
  footerMargin: 42.519683837890625,
  paperId: "iso-a4",
} as const;

/** Drop the root preview images; the apps rebuild them on save. */
function stripPreviews(saved: Uint8Array): Uint8Array {
  const zip = ZipReader.parse(saved);
  const kept = zip.entries.filter((e) => !e.isDirectory && !/^preview/.test(e.name));
  return buildZip(kept.map((e) => ({ name: e.name, data: zip.read(e) })));
}

interface Donor {
  kind: "pages" | "numbers" | "keynote";
  fixture: string;
  file: string;
  module: string;
  make: (template: Uint8Array) => Uint8Array;
}

const DONORS: readonly Donor[] = [
  {
    kind: "pages",
    fixture: "iwork-mcp-v14.5-sample.pages",
    file: "blank.pages",
    module: "src/pages/blank-donor.generated.ts",
    make: (template) => {
      const doc = PagesDocument.blankFrom(template);
      doc.setPageSetup(A4);
      return stripPreviews(doc.save());
    },
  },
  {
    kind: "numbers",
    fixture: "numbers-parser-v26.1-date-formats.numbers",
    file: "blank.numbers",
    module: "src/numbers/blank-donor.generated.ts",
    make: (template) => stripPreviews(NumbersDocument.blankFrom(template).save()),
  },
  {
    kind: "keynote",
    fixture: "iwork-mcp-v14.5-sample.key",
    file: "blank.key",
    module: "src/keynote/blank-donor.generated.ts",
    make: (template) => stripPreviews(KeynoteDocument.blankFrom(template).save()),
  },
];

/** The donor must look like a new document from Apple's own chooser. */
const ASSERT_VANILLA: Record<Donor["kind"], (bytes: Uint8Array) => void> = {
  pages: (bytes) => {
    const doc = PagesDocument.load(bytes);
    const template = (doc.compatibility().appBuilds ?? []).find((s) => s.startsWith("Template:"));
    if (!template?.includes("Blank")) throw new Error(`pages donor is not from Blank: ${template}`);
    const styles = new Set(doc.paragraphStyles().map((s) => s.name));
    for (const wanted of ["Title", "Subtitle", "Heading", "Heading 2", "Heading 3", "Body", "Caption"]) {
      if (!styles.has(wanted)) throw new Error(`pages donor lacks the ${wanted} style`);
    }
    const setup = doc.pageSetup();
    if (setup.paperId !== "iso-a4") throw new Error(`pages donor paper is ${setup.paperId}, not iso-a4`);
  },
  numbers: (bytes) => {
    const doc = NumbersDocument.load(bytes);
    const template = (doc.compatibility().appBuilds ?? []).find((s) => s.startsWith("Template:"));
    if (!template?.includes("Blank")) throw new Error(`numbers donor is not from Blank: ${template}`);
    if (doc.object(1n)?.message.getString(11) !== "iso-a4") {
      throw new Error("numbers donor paper_id is not iso-a4");
    }
  },
  keynote: (bytes) => {
    const doc = KeynoteDocument.load(bytes);
    const size = doc.slideSize();
    if (size?.width !== 1920 || size.height !== 1080) {
      throw new Error(`keynote donor is ${size?.width}×${size?.height}, not 1920×1080`);
    }
    const masters = new Set(doc.masterSlides().map((m) => m.name));
    for (const wanted of ["Title", "Title & Bullets", "Bullets"]) {
      if (!masters.has(wanted)) throw new Error(`keynote donor lacks the ${wanted} master`);
    }
  },
};

function base64Lines(bytes: Uint8Array): string {
  const b64 = Buffer.from(bytes).toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 96) lines.push(`  "${b64.slice(i, i + 96)}",`);
  return lines.join("\n");
}

function moduleSource(donor: Donor, bytes: Uint8Array): string {
  const sha1 = createHash("sha1").update(bytes).digest("hex");
  return `/**
 * GENERATED — do not edit by hand. Regenerate with \`npm run blanks\`;
 * \`npm run blanks:check\` verifies it against data/blanks/${donor.file}.
 *
 * The embedded blank ${donor.kind} document behind \`blank()\`: fixture
 * \`${donor.fixture}\` emptied by \`blankFrom\`, previews dropped.
 * ${bytes.length} bytes, sha1 ${sha1}.
 */
const BASE64: readonly string[] = [
${base64Lines(bytes)}
];

/** The donor package bytes, decoded fresh so callers can never share state. */
export function blankDonorBytes(): Uint8Array {
  const b64 = BASE64.join("");
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
`;
}

const check = process.argv.includes("--check");
let failed = false;

for (const donor of DONORS) {
  const target = join(BLANKS_DIR, donor.file);
  const modulePath = join(ROOT, donor.module);
  if (check) {
    const wanted = new Uint8Array(readFileSync(target));
    const module = readFileSync(modulePath, "utf8");
    const b64 = [...module.matchAll(/"([A-Za-z0-9+/=]+)",/g)].map((m) => m[1]).join("");
    const embedded = new Uint8Array(Buffer.from(b64, "base64"));
    const same =
      embedded.length === wanted.length && embedded.every((b, i) => b === wanted[i]);
    if (!same) {
      console.error(`${donor.module} does not match data/blanks/${donor.file}`);
      failed = true;
    }
    try {
      ASSERT_VANILLA[donor.kind](wanted);
    } catch (error) {
      console.error((error as Error).message);
      failed = true;
    }
    continue;
  }
  const template = new Uint8Array(readFileSync(join(ROOT, "fixtures", donor.fixture)));
  const bytes = donor.make(template);
  ASSERT_VANILLA[donor.kind](bytes);
  if (!existsSync(BLANKS_DIR)) mkdirSync(BLANKS_DIR, { recursive: true });
  writeFileSync(target, bytes);
  writeFileSync(modulePath, moduleSource(donor, bytes));
  console.log(`${donor.file}: ${bytes.length} bytes from ${donor.fixture}`);
}

if (check) {
  if (failed) process.exit(1);
  console.log("embedded blank donors match data/blanks/.");
}
