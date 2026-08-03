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
  // UI terms verified against Apple's Danish Pages guide (tan802e88b40):
  // indholdsoversigten Format → Layout → Afsnitsrammer, lokalmenuen
  // Stregtype, positionsknapper, farvefeltet. The third paragraph begins
  // with Hebrew on purpose: the donor styles leave writing_direction
  // unset (natural), so Pages resolves that paragraph right-to-left from
  // its first strong character — which sharpens "which bit is left?"
  // into "are the bits visual sides at all, or logical (start/end)?".
  doc.appendParagraph(
    "SEED · afsnitsrammer, de sidste bit (docs/BLOCKERS.md #3). Målingen 2026-08-03 afgjorde formen: en bitmaske — 1 top, 2 bund, 3 begge, 15 alle fire. To spørgsmål står tilbage: hvilken af bit 4 og 8 der er venstre — og om lagringen overhovedet er visuel (venstre/højre) eller logisk (start/slut). Det sidste afgør afsnit 3, som løber højre-mod-venstre. Hvert af de tre afsnit herunder bærer en kommentar med de præcise klik; panelet er Layout → Afsnitsrammer i indholdsoversigten Format.",
  );
  const targets = [
    {
      marker: "VENSTRE — giv dette afsnit en rød streg, kun i venstre side.",
      steps:
        "Klik i afsnittet → indholdsoversigten Format → Layout → Afsnitsrammer: vælg en ubrudt streg i lokalmenuen Stregtype, klik kun positionsknappen for venstre kant, vælg rød i farvefeltet, 3 pt.",
    },
    {
      marker: "HØJRE — giv dette afsnit en blå streg, kun i højre side.",
      steps: "Samme panel: kun positionsknappen for højre kant, farven blå, 3 pt.",
    },
    {
      marker: "העברית נכתבת מימין לשמאל — dette afsnit begynder med hebraisk og løber derfor højre-mod-venstre.",
      steps:
        "Tjek først, at linjen står højrestillet af sig selv — gør den ikke, så notér det og fortsæt alligevel. Samme panel: grøn streg, 3 pt, på samme positionsknap som i første afsnit (venstre kant). Viser proben bagefter samme kode som det røde afsnit, er lagringen visuel; viser den det blå afsnits kode, er den logisk (start/slut).",
    },
  ];
  for (const t of targets) doc.appendParagraph(t.marker);
  doc.appendParagraph(
    "Arkivér (⌘S), luk, og kør: npm run probe -- seed-borders.pages — proben skriver hver kode sammen med stregens farve, så rød/blå/grøn udpeger afsnittene. Rød afgør venstre-bitten (4 eller 8), blå den anden, grøn skiller visuel fra logisk. Alt andet end 4 og 8 ville være et helt nyt fund — endnu bedre. Resultaterne føres i docs/BLOCKERS.md-loggen.",
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
      if (d.comments().length !== 3) throw new Error("borders: expected 3 comments");
      if (!d.bodyText.includes("npm run probe")) throw new Error("borders: command missing");
      if (!d.bodyText.includes("העברית")) throw new Error("borders: RTL paragraph missing");
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
