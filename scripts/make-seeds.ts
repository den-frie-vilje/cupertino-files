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
import { RawMessage } from "../src/base/protobuf.ts";
import {
  ATTR_TABLE_ENTRIES,
  ENTRY_CHARACTER_INDEX,
  ENTRY_PARA_FIRST,
  ENTRY_PARA_SECOND,
  Storage,
} from "../src/tswp/schema.ts";

const outDir = process.argv[2] ?? "out";
mkdirSync(outDir, { recursive: true });

// ------------------------------------------------------------ rules.numbers

function seedRules(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  table.insertColumns(2, 2);
  table.setColumnWidth(0, 460);

  const instructions = [
    "SEED · conditional-formatting rules (docs/BLOCKERS.md, send-back ask)",
    "Do in Numbers, then save:",
    "1) Select B2:B11",
    "2) Format → Conditional Highlighting (Betinget fremhævning)",
    "3) Add rule: Greater than · 5",
    "4) Add rule: Greater than or equal to · 7",
    "5) Select C2:C11 → add rule: Text contains · pear",
    "6) Select D2:D11 → add rule: Is blank",
    "7) Save (⌘S), close, then run:",
    "npm run harvest:predicates -- seed-rules.numbers",
    "All six comparison codes are pinned, so steps 3–4 re-measure them on your version — a mismatch is the finding. Steps 5–6 widen the function table: text contains compiles to a function no name table covers. Then send the saved file back — as a fixture it pins these rules against real bytes.",
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

  // UI terms verified against Apple's Danish Keynote guide (Animer,
  // Tilføj en effekt, Byg ind, Varighed, Forsinkelse, Bygrækkefølge);
  // the effect names themselves are best-effort — the instructions say
  // any distinct effect works, because the probe measures whatever was
  // picked.
  const perSlide = [
    {
      title: "Byg-frø 1 af 3 — Opløs",
      body: "Animér denne tekstboks: Byg ind → Opløs (Dissolve).\nDe præcise klik står i præsentationsnoterne.",
      notes:
        "1) Klik én gang på denne tekstboks. 2) Animer (i indholdsoversigten) → Byg ind → Tilføj en effekt → Opløs. Hedder effekten noget andet hos dig: vælg en hvilken som helst — proben måler den, du vælger. 3) Videre til lysbillede 2.",
    },
    {
      title: "Byg-frø 2 af 3 — Flyt ind",
      body: "Animér denne tekstboks: Byg ind → Flyt ind (Move In) — eller en anden effekt end på lysbillede 1.",
      notes: "Som lysbillede 1, blot med en anden effekt. Videre til lysbillede 3.",
    },
    {
      title: "Byg-frø 3 af 3 — Ambolt, efter linje",
      body: "Animér denne tekstboks: Byg ind → Ambolt (Anvil) — eller en tredje, forskellig effekt.\nLevering: Efter linje. Varighed: 3 s. Forsinkelse: 1 s.",
      notes:
        "1) Giv denne tekstboks en tredje effekt. 2) I effektens indstillinger: Levering → Efter linje, Varighed 3 s, Forsinkelse 1 s. 3) Arkivér (⌘S), luk, og kør: npm run probe -- seed-builds.key — afsnit 4 viser hver bygnings effekt, levering og timing. Ingen bygninger i outputtet betyder, at Keynote smed dem væk — hvilket i sig selv er fundet (docs/BLOCKERS.md #2).",
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
  // Direction is not the paragraph-style bag's writing_direction: no
  // corpus style carries that field, and styled 0/1/2 all render LTR.
  // The evidence points at the storage's per-paragraph bidi table
  // instead — the pptx-lineage deck writes pairs (0, 0) and
  // (65535, 65535), the NSWritingDirection scale at uint16 widths
  // (-1 natural, 0 LTR), and this library's own storage builder writes
  // (0, 0) — so 1 is the evidence-backed RTL candidate, written here
  // straight into table_para_bidi. UI terms verified against Apple's
  // Danish Pages guide (tan802e88b40).
  doc.appendParagraph(
    "SEED · skriveretning + rammernes sidste spørgsmål (docs/BLOCKERS.md). Målt: rammebittene er 1 top, 2 bund, 4 venstre, 8 højre i venstre-mod-højre-afsnit, og skriveretningen bor ikke i afsnitsformatet — den bor efter alt at dømme i tekstlagerets bidi-tabel, hvor 0 er venstre-mod-højre og 65535 er 'naturlig'. De tre hebraiske linjer herunder har bidi-parret 1 (kandidaten for højre-mod-venstre), 0 og 65535. Kig: står netop [bidi 1]-linjen højrestillet? Klikkene står i kommentaren; panelet er Layout → Afsnitsrammer i indholdsoversigten Format.",
  );
  const targets: { marker: string; pair: number; comment?: string }[] = [
    {
      marker: "העברית נכתבת מימין לשמאל [bidi 1]",
      pair: 1,
      comment:
        "Står denne linje højrestillet — og de to næste venstrestillet — er bidi-parret 1 målt som højre-mod-venstre. Giv så netop denne linje en grøn streg, 3 pt: indholdsoversigten Format → Layout → Afsnitsrammer → ubrudt streg i lokalmenuen Stregtype → kun positionsknappen for venstre kant → grøn i farvefeltet. Koden i proben afgør resten: 4 = siderne er visuelle, 8 = logiske (start/slut). Står ingen linje højrestillet, er også bidi-vejen afvist — spring stregen over, notér det, og næste skridt er at slå et hebraisk tastatur til og bruge Pages' egen retningsknap, så vi kan måle, hvad appen selv skriver.",
    },
    { marker: "העברית נכתבת מימין לשמאל [bidi 0]", pair: 0 },
    { marker: "העברית נכתבת מימין לשמאל [bidi naturlig]", pair: 65535 },
  ];
  for (const t of targets) doc.appendParagraph(t.marker);
  doc.appendParagraph(
    "Arkivér (⌘S), luk, og kør: npm run probe -- seed-borders.pages — proben skriver hvert afsnits bidi-par og hver rammekode med stregens farve. Resultatet føres i docs/BLOCKERS.md-loggen.",
  );
  // The bidi table is written after all text edits so nothing reshuffles
  // it: one run-anchored entry per paragraph, the pair duplicated across
  // both slots the way every observed entry duplicates its value.
  const body = doc.body;
  const bidi = RawMessage.create();
  for (const para of body.paragraphs()) {
    // Match the tag only at the paragraph's end: the intro *mentions*
    // "[bidi 1]" in prose, and a substring match would tag it too.
    const target = targets.find((t) => para.text.endsWith(`[bidi ${t.pair === 65535 ? "naturlig" : String(t.pair)}]`));
    const pair = target?.pair ?? 65535;
    const entry = RawMessage.create();
    entry.setVarint(ENTRY_CHARACTER_INDEX, para.start);
    entry.setVarint(ENTRY_PARA_FIRST, pair);
    entry.setVarint(ENTRY_PARA_SECOND, pair);
    bidi.addMessage(ATTR_TABLE_ENTRIES, entry);
  }
  body.object.message.setMessage(Storage.TABLE_PARA_BIDI, bidi);
  for (const t of targets) {
    if (t.comment === undefined) continue;
    const range = doc.find(t.marker)[0];
    if (!range) throw new Error(`seed-borders: marker not found: ${t.marker}`);
    body.addComment(range.start, range.end, t.comment);
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
    "SEED · filter rules (docs/BLOCKERS.md, send-back ask)",
    "The first real filter set is measured; a run on your version re-measures it, and the saved file is the outstanding fixture — send it back.",
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
      if (d.comments().length !== 1) throw new Error("borders: expected 1 comment");
      if (!d.bodyText.includes("npm run probe")) throw new Error("borders: command missing");
      if (!d.bodyText.includes("עברית")) throw new Error("borders: RTL paragraphs missing");
      const table = d.body.object.message.getMessage(Storage.TABLE_PARA_BIDI);
      const byStart = new Map(
        (table?.getMessages(ATTR_TABLE_ENTRIES) ?? []).map((e) => [
          Number(e.getVarint(ENTRY_CHARACTER_INDEX) ?? 0n),
          Number(e.getVarint(ENTRY_PARA_FIRST) ?? 0n),
        ]),
      );
      for (const para of d.body.paragraphs()) {
        const expected = para.text.endsWith("[bidi 1]") ? 1 : para.text.endsWith("[bidi 0]") ? 0 : 65535;
        const actual = byStart.get(para.start);
        if (actual !== expected) {
          throw new Error(`borders: bidi pair at ${String(para.start)} is ${String(actual)}, expected ${String(expected)}`);
        }
      }
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
