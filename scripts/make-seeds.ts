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
  // Every writable direction candidate renders LTR — the style bag's
  // writing_direction (0/1/2) and the storage's bidi pairs (1/0/65535)
  // alike, with the donor's alignment measured natural, so nothing
  // masked them. Those fields are most likely derived values the app
  // recomputes. The decisive measurement is therefore inverted: stage
  // vanilla text, have the person flip it with Pages' own direction
  // control, and diff the returned file — it shows exactly, and only,
  // what the app writes for a real RTL paragraph.
  doc.appendParagraph(
    "SEED · skriveretning: hvad skriver appen selv? (docs/BLOCKERS.md). Alle felter, vi kan sætte — afsnitsformatets writing_direction og tekstlagerets bidi-par — renderer venstre-mod-højre, med naturlig justering målt i donoren, så intet maskerede dem. De er formentlig afledte værdier, appen genberegner. Målingen er derfor vendt om: DU vender linjen herunder med Pages' egen retningsknap, arkiverer og sender filen retur — så viser forskellen på filen præcis, hvor retningen bor. Virker på både iPhone og Mac; de præcise trin står i kommentaren på den hebraiske linje.",
  );
  const marker = "עברית לדוגמה";
  doc.appendParagraph(marker, "Body");
  doc.appendParagraph(
    "Arkivér til sidst, og send filen retur. Kunne du ikke finde retningsknappen, så send filen alligevel med en note — også dét er et fund.",
  );
  const range = doc.find(marker)[0];
  if (!range) throw new Error("seed-borders: marker not found");
  doc.body.addComment(
    range.start,
    range.end,
    "1) Slå et hebraisk tastatur til: iPhone — Indstillinger → Generelt → Tastatur → Tastaturer → Tilføj nyt tastatur → Hebraisk; Mac — Systemindstillinger → Tastatur → Inputkilder → Tilføj → Hebraisk. 2) Sæt markøren i denne linje. 3) Tryk på knappen for afsnitsretning (⇄) — den dukker op i formatværktøjerne, når et højre-mod-venstre-tastatur er slået til. Linjen skal nu stå højrestillet. 4) Skriv gerne et par tegn med det hebraiske tastatur i linjen. 5) Arkivér, og send filen retur.",
  );
  return doc.save();
}

// -------------------------------------------------------- placeholder.pages

function seedPlaceholder(): Uint8Array {
  // The one thing offline checks cannot see about placeholders is the
  // editor behaviour: does a span this library defines tap-select whole,
  // and does a filled one edit as plain text? Two taps answer both.
  const doc = PagesDocument.blank();
  doc.appendParagraph(
    "SEED · pladsholdertekst (docs/BLOCKERS.md). Biblioteket har markeret linje 2 som pladsholder og udfyldt en tidligere pladsholder i linje 3. To tryk afgør begge spørgsmål — og virker fint på iPhone.",
  );
  doc.appendParagraph("«PLADSHOLDER — tryk én gang her»", "Body");
  doc.appendParagraph("Udfyldt af biblioteket — denne linje var en pladsholder.", "Body");
  doc.appendParagraph(
    "1) Tryk én gang i linje 2: markeres HELE spannet mellem «…» i ét hug, og erstattes det hele, når du skriver? Ja = bibliotekets pladsholder-markering virker. Nej (markøren lander som i almindelig tekst) = appen ignorerer vores felt — også et fund. 2) Tryk i linje 3: opfører den sig som helt almindelig tekst? Ja = udfyldning fjerner markeringen korrekt. Arkivér til sidst, og send filen retur — så måles, hvad appen selv har skrevet om.",
  );
  const token = doc.find("«PLADSHOLDER — tryk én gang her»")[0];
  if (!token) throw new Error("seed-placeholder: token not found");
  token.asPlaceholder();
  const filled = doc.find("Udfyldt af biblioteket — denne linje var en pladsholder.")[0];
  if (!filled) throw new Error("seed-placeholder: filled line not found");
  doc.body.defineAsPlaceholder(filled.start, filled.end);
  doc.body.fillPlaceholder(
    { start: filled.start, end: filled.end },
    "Udfyldt af biblioteket — denne linje var en pladsholder.",
  );
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
      if (!d.bodyText.includes("send filen retur")) throw new Error("borders: instructions missing");
      if (!d.bodyText.includes("עברית לדוגמה")) throw new Error("borders: Hebrew line missing");
    },
  },
  {
    name: "seed-placeholder.pages",
    bytes: seedPlaceholder(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      const placeholders = d.placeholders();
      if (placeholders.length !== 1) throw new Error("placeholder: expected exactly 1 defined");
      if (!placeholders[0]!.text.startsWith("«PLADSHOLDER")) throw new Error("placeholder: wrong span");
      if (!d.bodyText.includes("send filen retur")) throw new Error("placeholder: instructions missing");
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
