/**
 * Seed documents for the manual blockers — the file carries its own
 * instructions.
 *
 * Each open question in docs/BLOCKERS.md that needs a person in an app
 * gets a document staged as far as the library can take it: the data is
 * already in place, and the remaining clicks are written *inside* the
 * document — as cells beside the data, as presenter notes on the slide
 * they concern, as Pages comments anchored to the exact paragraph. Open,
 * follow, save, run the one command the file names. A refusal or a
 * surprising result is a finding, not a failure; every file says so.
 *
 * Regenerate fresh for every request (CLAUDE.md: attach the files again,
 * every time):
 *
 *   npm run seeds -- <outDir>
 *
 * The script reloads each file it wrote and asserts the instructions
 * landed, so a broken seed cannot be sent.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { KeynoteDocument, NumbersDocument, PagesDocument } from "../src/index.ts";

const outDir = process.argv[2] ?? "out";
mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------ rules.numbers

function seedRules(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  table.insertColumns(2, 2);
  table.setColumnWidth(0, 460);

  const instructions = [
    "SEED · conditional-formatting rules (docs/BLOCKERS.md #1)",
    "Do in Numbers, then save:",
    "1) Select B2:B11",
    "2) Format → Conditional Highlighting (Betinget fremhævning)",
    "3) Add rule: Greater than · 5",
    "4) Add rule: Greater than or equal to · 7",
    "5) Select C2:C11 → add rule: Text contains · pear",
    "6) Select D2:D11 → add rule: Is blank",
    "7) Save (⌘S), close, then run:",
    "npm run harvest:predicates -- seed-rules.numbers",
    "Either verdict is a finding: CONFIRMED pins the two missing operator codes, REFUTED corrects the prediction. Steps 5–6 widen the function table for free.",
  ];
  instructions.forEach((text, i) => { table.setCell(i, 0, text); });

  table.setCell(0, 1, "numbers");
  for (let i = 1; i <= 10; i++) table.setCell(i, 1, i);
  table.setCell(0, 2, "text");
  const words = ["apple", "pear", "plum", "pear tart", "quince", "fig", "pearl", "date", "sloe", "mirabelle"];
  words.forEach((w, i) => { table.setCell(i + 1, 2, w); });
  table.setCell(0, 3, "blanks");
  table.setCell(2, 3, "x");
  table.setCell(5, 3, "x");
  return doc.save();
}

// ------------------------------------------------------------ builds.key

function seedBuilds(): Uint8Array {
  const doc = KeynoteDocument.blank();
  // withContent carries the (empty) placeholder storages along — a bare
  // layout copy has no notes storage to write into.
  doc.addSlide({ copyOf: 0, withContent: true });
  doc.addSlide({ copyOf: 0, withContent: true });
  const slides = doc.slides();

  const perSlide = [
    {
      title: "Build seed 1 of 3 — Dissolve",
      body: "Animate this text box: Build In → Dissolve.\nThe exact clicks are in the presenter notes below.",
      notes:
        "1) Click this body text box once. 2) Animate (Animér) in the toolbar → Add an Effect → Dissolve. 3) Continue to slide 2.",
    },
    {
      title: "Build seed 2 of 3 — Move In",
      body: "Animate this text box: Build In → Move In.",
      notes: "Same as slide 1, choosing Move In. Then continue to slide 3.",
    },
    {
      title: "Build seed 3 of 3 — Anvil, by line",
      body: "Animate this text box: Build In → Anvil.\nDelivery: By Line. Duration: 3 s. Delay: 1 s.",
      notes:
        "1) Add the Anvil effect to this text box. 2) In the build options set Delivery: By Line (Efter linje), Duration 3 s, Delay 1 s. 3) Save (⌘S), close, then run: npm run probe -- seed-builds.key — section 4 prints each build's effect, delivery and timing. No builds in the output means Keynote dropped them, which is itself the finding (docs/BLOCKERS.md #2).",
    },
  ];
  perSlide.forEach((content, i) => {
    const slide = slides[i]!;
    slide.title = content.title;
    slide.body = content.body;
    slide.notes = content.notes;
  });
  return doc.save();
}

// ------------------------------------------------------------ borders.pages

function seedBorders(): Uint8Array {
  const doc = PagesDocument.blank();
  doc.appendParagraph(
    "SEED · paragraph borders (docs/BLOCKERS.md #3). Four paragraphs follow; give each the border its first word names. Each carries a comment with the exact clicks. Different colours matter — they are how the probe tells the edges apart.",
  );
  const targets = [
    { marker: "TOP — give this paragraph a red border on top only.", steps: "Click into this paragraph → Format sidebar → Layout → Borders & Rules → position: top · 3 pt line · red." },
    { marker: "BOTTOM — give this paragraph a blue border below only.", steps: "Same panel → position: bottom · 3 pt · blue." },
    { marker: "BOTH — give this paragraph green borders above and below.", steps: "Same panel → position: top and bottom · 3 pt · green." },
    { marker: "ALL — box this paragraph in orange.", steps: "Same panel → position: all four sides · 3 pt · orange." },
  ];
  for (const t of targets) doc.appendParagraph(t.marker);
  doc.appendParagraph(
    "Then save (⌘S), close, and run: npm run probe -- seed-borders.pages — it prints which border_positions code each paragraph carries, USED or unused. The saved package's own preview.jpg renders the visual answer too. If 1 and 2 come out swapped against the prediction, that is exactly what this seed exists to catch.",
  );
  const body = doc.body;
  for (const t of targets) {
    const range = doc.find(t.marker)[0];
    if (!range) throw new Error(`seed-borders: marker not found: ${t.marker}`);
    body.addComment(range.start, range.end, t.steps);
  }
  return doc.save();
}

// ------------------------------------------------------------ filters.numbers

function seedFilters(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  table.insertColumns(2, 1);
  table.setColumnWidth(0, 460);

  const instructions = [
    "SEED · filter rules (docs/BLOCKERS.md, optional fourth)",
    "Every filter set in the corpus is empty — this makes the first real one.",
    "1) Click the table, then Organize (Organiser) → Filter",
    "2) Add a Filter on column B: greater than · 10",
    "3) Add a Filter on column C: text contains · ko",
    "4) Keep filters ON (rows will hide — that is the point)",
    "5) Save (⌘S), close, then run:",
    "npm run probe -- seed-filters.numbers",
    "The probe reads the rules, not the view; a probe that still shows an empty filter set means Numbers stores rules elsewhere — the more interesting outcome.",
  ];
  instructions.forEach((text, i) => { table.setCell(i, 0, text); });

  table.setCell(0, 1, "numbers");
  [4, 7, 11, 14, 3, 18, 9, 21, 6, 25].forEach((n, i) => { table.setCell(i + 1, 1, n); });
  table.setCell(0, 2, "text");
  ["kobber", "sten", "koral", "birk", "kork", "lind", "skov", "koks", "eg", "kobolt"].forEach(
    (w, i) => { table.setCell(i + 1, 2, w); },
  );
  return doc.save();
}

// ------------------------------------------------------------ write + verify

const seeds: { name: string; bytes: Uint8Array; check: (bytes: Uint8Array) => void }[] = [
  {
    name: "seed-rules.numbers",
    bytes: seedRules(),
    check: (bytes) => {
      const t = NumbersDocument.load(bytes).tables()[0]!;
      if (!t.cellText(9, 0).includes("harvest:predicates")) throw new Error("rules: command missing");
      if (t.cellText(10, 1) !== "10") throw new Error("rules: data missing");
    },
  },
  {
    name: "seed-builds.key",
    bytes: seedBuilds(),
    check: (bytes) => {
      const d = KeynoteDocument.load(bytes);
      if (d.slides().length !== 3) throw new Error("builds: expected 3 slides");
      if (!d.slides()[2]!.notes.includes("npm run probe")) throw new Error("builds: command missing");
    },
  },
  {
    name: "seed-borders.pages",
    bytes: seedBorders(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      if (d.comments().length !== 4) throw new Error("borders: expected 4 comments");
      if (!d.bodyText.includes("border_positions")) throw new Error("borders: command missing");
    },
  },
  {
    name: "seed-filters.numbers",
    bytes: seedFilters(),
    check: (bytes) => {
      const t = NumbersDocument.load(bytes).tables()[0]!;
      if (!t.cellText(7, 0).includes("npm run probe")) throw new Error("filters: command missing");
    },
  },
];

for (const seed of seeds) {
  const path = join(outDir, seed.name);
  writeFileSync(path, seed.bytes);
  seed.check(new Uint8Array(readFileSync(path)));
  console.log(`${seed.name}: ${seed.bytes.length} bytes, instructions verified`);
}
