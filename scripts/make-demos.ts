/**
 * Self-describing demo documents — one file per feature area, every
 * write capability of the public API exercised in a document that
 * explains itself.
 *
 * Each check has a stable id (T-01, C-04, …), states what the library
 * did and what the app should therefore show, and leaves room for
 * feedback in the document itself: a "→ Feedback:" line in Pages, a
 * feedback column in Numbers, the presenter notes in Keynote. A check
 * whose render differs from its FORVENTET line is a finding, and often
 * the more useful outcome.
 *
 *   npm run demos -- <outDir>          (default: out)
 *
 * Files regenerate fresh on every run and self-check on write, so a
 * demo that no longer matches the API cannot be sent.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  BorderPosition,
  colorFill,
  DEFAULT_SHADOW,
  type DrawableStyle,
  KeynoteDocument,
  NumbersDocument,
  PagesDocument,
  ShadowType,
  solidStroke,
  TabAlignment,
} from "../src/index.ts";
import {
  CellRecordExpandedFields,
  CellRecordTileFields,
  FORMULA_OWNER_DEPENDENCIES,
  FormulaOwnerFields,
  OwnerKind,
  TiledDependenciesFields,
} from "../src/tsce/owners.ts";
import { blockPng } from "./png.ts";

const TERRACOTTA = { r: 0.753, g: 0.224, b: 0.169 };
const DARKBLUE = { r: 0.16, g: 0.29, b: 0.62 };
const SOFTGREEN = { r: 0.31, g: 0.60, b: 0.32 };
const SOFTYELLOW = { r: 1, g: 0.92, b: 0.55 };

// ---------------------------------------------------------------- helpers

/** Sequential check ids: T-01, T-02, … */
function counter(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}-${String(++n).padStart(2, "0")}`;
}

/**
 * The layout law the checker's phone taught us: tables stay narrow
 * enough to read on a phone, prose wraps in a column built for it, and
 * value cells never wrap — their column is wide enough instead. Runs in
 * every Numbers demo's self-check so a rung cannot regress it.
 */
function assertPhoneLayout(doc: NumbersDocument, name: string, maxWidth = 560): void {
  for (const table of doc.tables()) {
    let total = 0;
    for (let c = 0; c < table.columnCount; c++) total += table.columnWidth(c);
    if (total > maxWidth) {
      throw new Error(`${name}: table ${table.name} is ${Math.round(total)} pt wide (max ${maxWidth})`);
    }
    for (let r = 0; r < table.rowCount; r++) {
      for (let c = 0; c < table.columnCount; c++) {
        const value = table.cellValue(r, c);
        if (!value) continue;
        const wrap = table.cellFormatting(r, c).textWrap === true;
        if (value.type === "text" && value.value.length > 40 && !wrap) {
          throw new Error(`${name}: ${table.name} r${r}c${c} holds long text without wrap`);
        }
        if ((value.type === "number" || value.type === "bool" || value.type === "date") && wrap) {
          throw new Error(`${name}: ${table.name} r${r}c${c} is a ${value.type} cell with wrap on`);
        }
      }
    }
  }
}

/**
 * A Pages check: one paragraph "«id» · what to look at", demo content in
 * between is appended by the caller, and `feedback()` closes it with the
 * line the reader answers on.
 */
function pagesCheck(doc: PagesDocument, id: string, expectation: string): void {
  const index = doc.appendParagraph(`${id} · ${expectation}`, "Body");
  const start = doc.body.paragraphStarts()[index]!;
  doc.applyCharacterFormatting(start, start + id.length, { bold: true });
}

function pagesFeedback(doc: PagesDocument): void {
  const index = doc.appendParagraph("→ Feedback: ", "Body");
  const paragraph = doc.paragraphs()[index]!;
  doc.applyCharacterFormatting(paragraph.start, paragraph.end, {
    italic: true,
    fontColor: { r: 0.45, g: 0.45, b: 0.45 },
  });
}

function pagesIntro(doc: PagesDocument, title: string, scope: string): void {
  doc.appendParagraph(title, "Title");
  doc.appendParagraph(
    `${scope} Hvert punkt har et id, en beskrivelse af hvad biblioteket har gjort, og hvad appen derfor bør vise. Skriv hvad du ser på »→ Feedback:«-linjen under punktet (tomt = som forventet), eller sæt en kommentar. Kun feedback-linjerne er grå kursiv — al anden brødtekst skal stå sort og opret; grå kursiv brødtekst er i sig selv en fejl. Arkivér til sidst og send filen retur.`,
    "Body",
  );
}

// ------------------------------------------------- demo 1: text & styles

function demoText(): Uint8Array {
  const doc = PagesDocument.blank();
  const check = counter("T");
  pagesIntro(doc, "DEMO 1 · Tekst og typografi", "Tegn- og afsnitsformatering, navngivne typografier, lister, indrykninger, rammer og skriveretning.");

  pagesCheck(doc, check(), "Ordene herunder skal stå med fed, kursiv og understreget — ét ord hver.");
  const t1 = doc.appendParagraph("Dette ord er fedt, dette er kursivt, og dette er understreget.", "Body");
  {
    const p = doc.paragraphs()[t1]!;
    const at = (word: string) => p.start + p.text.indexOf(word);
    doc.applyCharacterFormatting(at("fedt"), at("fedt") + 4, { bold: true });
    doc.applyCharacterFormatting(at("kursivt"), at("kursivt") + 7, { italic: true });
    doc.applyCharacterFormatting(at("understreget"), at("understreget") + 12, { underline: 1 });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Ét ord i 21 pt terrakotta, ét ord med gul fremhævning, ét ord gennemstreget, og ét ord i Courier.");
  const t2 = doc.appendParagraph("Stort og rødt · fremhævet · gennemstreget · skrivemaskine.", "Body");
  {
    const p = doc.paragraphs()[t2]!;
    const at = (word: string) => p.start + p.text.indexOf(word);
    doc.applyCharacterFormatting(at("Stort og rødt"), at("Stort og rødt") + 13, { fontSize: 21, fontColor: TERRACOTTA });
    doc.applyCharacterFormatting(at("fremhævet"), at("fremhævet") + 9, { backgroundColor: SOFTYELLOW });
    doc.applyCharacterFormatting(at("gennemstreget"), at("gennemstreget") + 13, { strikethru: 1 });
    doc.applyCharacterFormatting(at("skrivemaskine"), at("skrivemaskine") + 13, { fontName: "Courier" });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "»forsalede« i kapitæler, »x2« med 2 i hævet skrift, »H2O« med 2 i sænket skrift.");
  const t3 = doc.appendParagraph("Ordet forsalede · x2 · H2O.", "Body");
  {
    const p = doc.paragraphs()[t3]!;
    const at = (s: string) => p.start + p.text.indexOf(s);
    doc.applyCharacterFormatting(at("forsalede"), at("forsalede") + 9, { capitalization: 2 });
    doc.applyCharacterFormatting(at("x2") + 1, at("x2") + 2, { superscript: 1 });
    doc.applyCharacterFormatting(at("H2O") + 1, at("H2O") + 2, { superscript: 2 });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Linket herunder skal være klikbart og pege på den frie viljes hjemmeside.");
  const t4 = doc.appendParagraph("Besøg den frie vilje for at læse mere.", "Body");
  {
    const p = doc.paragraphs()[t4]!;
    const at = p.start + p.text.indexOf("den frie vilje");
    doc.insertLink(at, at + 14, "https://denfrievilje.dk");
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "En ny typografi »Demo Fremhævet« (kursiv, terrakotta) er oprettet, brugt på linjen herunder — og skal stå i typografi-panelet.");
  doc.createParagraphStyle({
    name: "Demo Fremhævet",
    basedOn: "Body",
    character: { italic: true, fontColor: TERRACOTTA },
  });
  doc.appendParagraph("Denne linje bruger typografien Demo Fremhævet.", "Demo Fremhævet");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Typografien »Heading 2« er redigeret til mørkeblå — så BEGGE overskrifter herunder skal være blå.");
  doc.stylesheet.style("Heading 2")?.setCharacter({ fontColor: DARKBLUE });
  doc.appendParagraph("Første mellemrubrik", "Heading 2");
  doc.appendParagraph("Anden mellemrubrik", "Heading 2");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Tre linjer: venstrestillet, centreret, højrestillet.");
  const align = [
    ["Denne linje er venstrestillet.", 0],
    ["Denne linje er centreret.", 2],
    ["Denne linje er højrestillet.", 1],
  ] as const;
  for (const [text, alignment] of align) {
    const i = doc.appendParagraph(text, "Body");
    doc.paragraph(i).format({ alignment });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "To punkttegn, to nummererede (1., 2.) — og derefter almindelig brødtekst UDEN punkttegn.");
  doc.appendParagraph("Første punkt", "Body", "Bullet");
  doc.appendParagraph("Andet punkt", "Body", "Bullet");
  doc.appendParagraph("Første nummererede", "Body", "Numbered");
  doc.appendParagraph("Andet nummererede", "Body", "Numbered");
  doc.appendParagraph("Denne brødtekst må ikke have fået et punkttegn.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "En blok-indrykket linje (60 pt) og en hængende indrykning (første linje længere ude end resten).");
  const ind1 = doc.appendParagraph("Denne linje er blok-indrykket 60 pt fra margenen.", "Body");
  doc.paragraph(ind1).format({ leftIndent: 60 });
  const ind2 = doc.appendParagraph(
    "Hængende indrykning: første linje starter her, og de følgende linjer i samme afsnit rykker længere ind — skriv nok tekst, og ombrydningen viser det. Denne sætning er kun med for at tvinge et linjeskift frem i afsnittet.",
    "Body",
  );
  doc.paragraph(ind2).format({ leftIndent: 60, firstLineIndent: 20 });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Afsnitsrammer: linje med streg over og under; linje med rød streg kun i venstre side; linje med blå streg kun i højre side.");
  const b1 = doc.appendParagraph("Streg over og under dette afsnit.", "Body");
  doc.paragraph(b1).format({ border: solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 1), borderPositions: BorderPosition.TOP_AND_BOTTOM });
  const b2 = doc.appendParagraph("Rød streg i venstre side.", "Body");
  doc.paragraph(b2).format({ border: solidStroke(TERRACOTTA, 3), borderPositions: BorderPosition.LEADING });
  const b3 = doc.appendParagraph("Blå streg i højre side.", "Body");
  doc.paragraph(b3).format({ border: solidStroke(DARKBLUE, 3), borderPositions: BorderPosition.TRAILING });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Et afsnit med lysegul baggrundsfarve.");
  const bg = doc.appendParagraph("Dette afsnit har sin egen baggrundsfarve.", "Body");
  doc.paragraph(bg).format({ backgroundColor: SOFTYELLOW });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Den hebraiske linje herunder skal stå højrestillet af sig selv (skriveretning højre-mod-venstre).");
  const rtl = doc.appendParagraph("עברית מיושרת לימין", "Body");
  doc.paragraph(rtl).setDirection("rtl");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Dobbelt linjeafstand og 18 pt luft før/efter i afsnittet herunder — det skal stå tydeligt mere luftigt end resten.");
  const sp = doc.appendParagraph(
    "Dette afsnit har dobbelt linjeafstand. Denne anden sætning er med, så afsnittet ombrydes over flere linjer og afstanden kan ses.",
    "Body",
  );
  doc.paragraph(sp).format({ lineSpacing: 2, spaceBefore: 18, spaceAfter: 18 });
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Decimaltabulator ved 200 pt: de to beløb herunder skal stå med kommaerne præcist under hinanden.");
  for (const line of ["Netto\t1.234,56", "Moms\t308,64"]) {
    const i = doc.appendParagraph(line, "Body");
    doc.paragraph(i).format({ tabs: [{ position: 200, alignment: TabAlignment.DECIMAL }], decimalTab: "," });
  }
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Rammeafstand: linjen herunder har streg over og under med afstanden sat til +12. Afstanden mellem tekst og streger skal være tydeligt større end i T-10. (Målt i forrige runde: minus trækker stregerne ind i teksten, 0 er standardafstanden.)");
  const off = doc.appendParagraph("Streg over og under, med eksplicit rammeafstand.", "Body");
  doc.paragraph(off).format({
    border: solidStroke({ r: 0.2, g: 0.2, b: 0.2 }, 1),
    borderPositions: BorderPosition.TOP_AND_BOTTOM,
    ruleOffset: 12,
  });
  pagesFeedback(doc);

  doc.appendParagraph("Tak! Arkivér (⌘S) og send filen retur.", "Heading 3");
  return doc.save();
}

// -------------------------------------------- demo 2: structure & fields

function demoFields(): Uint8Array {
  // blank()'s minimal donor lists no section objects, so this demo builds
  // on a corpus document with real sections: everything but three
  // structural paragraphs is deleted, and the checks are appended into
  // its second section.
  const doc = PagesDocument.load(
    new Uint8Array(readFileSync(new URL("../fixtures/picodocs-v14.4-headers-tables.pages", import.meta.url))),
  );
  const check = counter("S");
  const boundary = doc.body.text.indexOf("\u0004");
  const boundaryPara = doc.paragraphs().findIndex((p) => p.start <= boundary && p.end >= boundary);
  for (let i = doc.paragraphs().length - 1; i >= 1; i--) {
    if (i === boundaryPara || i === boundaryPara + 1) continue;
    doc.paragraph(i).delete();
  }
  doc.paragraph(0).text =
    "DEMO 2 · Struktur og felter — sektioner, sidehoved og -fod, sidetal, datofelter, bogmærker, fodnoter, kommentarer og pladsholdere. (Basisdokumentet stammer fra testkorpusset; resten af dets indhold er slettet af biblioteket.) Skriv hvad du ser på »→ Feedback:«-linjen under hvert punkt — tomt = som forventet — eller sæt en kommentar. Arkivér til sidst og send filen retur.";
  doc.paragraph(0).setStyle("Title");
  doc.paragraph(1).text = "Dette er sektion 1's sidste afsnit — sektion 2 begynder på næste side.";
  doc.paragraph(2).text = "Sektion 2 begynder her; alle punkterne herunder hører til den.";
  doc.paragraph(2).setStyle("Heading");

  pagesCheck(doc, check(), "Sektion 1's sidehoved siger »Sektion 1« — centreret, for feltets typografi centrerer. Sektion 2's siger »Sektion 2 · sidehoved« — venstrestillet, for dén typografi venstrestiller: sidehovedet er ét sidebredt felt, og teksten følger feltets egen afsnitstypografi. Sektion 2's sidefod viser »Side N af M« med rigtige tal (levende felter).");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Datofeltet i linjen herunder er et levende felt — klik på det, og Pages viser datovælgeren.");
  const dateLine = doc.appendParagraph("Dokumentet er bygget: ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Ordet »ankerpunkt« herunder bærer et bogmærke ved navn »Demo-bogmærke« — det skal stå i listen, når du indsætter et link og vælger bogmærke.");
  const bm = doc.appendParagraph("Dette afsnit indeholder et ankerpunkt for bogmærket.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Ordet »fodnote« herunder har et notetegn, og selve noten står nederst på siden.");
  const fn = doc.appendParagraph("Denne sætning har en fodnote efter ordet fodnote.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Sætningen herunder bærer en kommentar (forfatter »cupertino-files«) — svar gerne på den som feedback.");
  const cm = doc.appendParagraph("Denne sætning har en kommentar hæftet på sig.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Linje A herunder er en pladsholder: ét tryk skal markere HELE spannet, og det du skriver, erstatter det hele. Linje B var en pladsholder, som biblioteket selv har udfyldt — den skal opføre sig som helt almindelig tekst.");
  doc.appendParagraph("A: «SKRIV KUNDENS NAVN HER»", "Body");
  const filled = doc.appendParagraph("B: Udfyldt af biblioteket — var en pladsholder.", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Herunder begynder SEKTION 3, oprettet af biblioteket med sine egne klonede sidemastere: den starter på en ny side, og dens sidehoved siger »Sektion 3« — uafhængigt af sektion 2's.");
  const s3 = doc.appendParagraph("Sektion 3 begynder med dette afsnit.", "Heading");
  pagesFeedback(doc);
  doc.appendParagraph("Tak! Arkivér (⌘S) og send filen retur.", "Heading 2");

  // Fields and marks, after all text is in place (offsets are stable now).
  {
    const p = doc.paragraphs()[dateLine]!;
    doc.body.insertDateField(p.end, "9. august 2026");
  }
  {
    const p = doc.paragraphs()[bm]!;
    const at = p.start + p.text.indexOf("ankerpunkt");
    doc.body.addBookmark(at, at + 10, "Demo-bogmærke");
  }
  {
    const p = doc.paragraphs()[fn]!;
    const at = p.start + p.text.indexOf("fodnote.") + "fodnote".length;
    doc.body.addFootnote(at, "Fodnoten er skrevet af biblioteket, med dokumentets egen notetypografi.");
  }
  {
    const p = doc.paragraphs()[cm]!;
    doc.body.addComment(p.start, p.end, "Hej! Denne kommentar er skrevet af biblioteket. Svar gerne på den som feedback.");
  }
  doc.find("«SKRIV KUNDENS NAVN HER»")[0]!.asPlaceholder();
  {
    const p = doc.paragraphs()[filled]!;
    const start = p.start + "B: ".length;
    doc.defineAsPlaceholder(start, p.end);
    doc.body.fillPlaceholder({ start, end: p.end }, "Udfyldt af biblioteket — var en pladsholder.");
  }

  const sectionThree = doc.insertSectionBreak(s3, { name: "Demo-sektion" });
  sectionThree.setHeaderText("Sektion 3");
  const [one, two] = doc.sections();
  one!.setHeaderText("Sektion 1");
  two!.setHeaderText("Sektion 2 · sidehoved");
  for (const template of two!.templates()) {
    const filled = template.footers.find((f) => f.text.length > 0);
    for (const footer of template.footers) {
      const wasEmpty = footer.text.length === 0;
      footer.setText("Side  af ");
      footer.insertPageNumber(5);
      footer.insertPageCount(footer.text.length);
      if (wasEmpty && filled && filled !== footer) footer.copyShapeFrom(filled);
    }
  }
  return doc.save();
}

// ------------------------------------------------------- demo 3: media

function demoMedia(): Uint8Array {
  const doc = PagesDocument.blank();
  const check = counter("M");
  pagesIntro(doc, "DEMO 3 · Billeder og objekter", "Indsatte billeder (i tekstspalten og ved sidemargenen), flydende kopier, objektstil, beskæring.");

  // Build all paragraphs first; insert images after (appended empty
  // paragraphs are invisible to paragraphs() until they get content).
  pagesCheck(doc, check(), "Fotoet herunder (Earthrise, NASA) og linjen over det er BEGGE indrykket 80 pt — fotoets venstre kant skal flugte med tekstens.");
  const ref1 = doc.appendParagraph("Denne linje er indrykket 80 pt, som fotoet under den.", "Body");
  const img1 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Hokusais store bølge herunder er sat med tilstanden »ved siden«: den skal starte ude ved sidens venstre MARGEN — til venstre for linjen ovenover — og teksten efter må gerne flyde ved siden af den; det er tilstandens mening.");
  const img2 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Endnu en kopi af bølge-træsnittet, indsat i TEKSTFLOWET og beskåret af biblioteket til midterudsnittet: Fuji i midten, den store bølges klo skåret VÆK. Forventet for et billede »integreret med tekst«: beskæringen TEGNES, »nulstil masken« virker, men dobbeltklik åbner IKKE maske-værktøjet — det er appens adfærd for integrerede billeder, ikke en fejl. Åbner værktøjet alligevel, så skriv det.");
  const img3 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Samme beskæring på en FLYDENDE kopi af bølgen, placeret til højre herunder — den indstilling appens egen beskæring selv producerer. Her SKAL dobbeltklik åbne maske-værktøjet (skyder og håndtag). Åbner det ikke her, ligger forhindringen ikke i ombrydningen, og det er et vigtigt fund.");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "En FLYDENDE kopi af Earthrise-fotoet er sat øverst til højre på side 1 (60 % gennemsigtighed, mørk kant og slagskygge). Tekst skal flyde rundt om den.");
  pagesFeedback(doc);

  pagesCheck(doc, check(), "Grafikken herunder er en PDF (vektor, en videnskabelig pipeline-figur): zoom godt ind — stregerne og teksten i figuren skal forblive knivskarpe, ikke pixelerede.");
  const img5 = doc.appendParagraph(" ", "Body");
  pagesFeedback(doc);

  doc.appendParagraph("Tak! Arkivér (⌘S) og send filen retur.", "Heading 3");

  const indent = { leftIndent: 80 };
  for (const i of [ref1, img1, img2, img3]) doc.paragraph(i).format(indent);

  const assets = new URL("./assets/", import.meta.url);
  const earthrise = new Uint8Array(readFileSync(new URL("earthrise.jpg", assets)));
  const wave = new Uint8Array(readFileSync(new URL("great-wave.jpg", assets)));
  const pipeline = new Uint8Array(readFileSync(new URL("pipeline.pdf", assets)));
  const { imageId } = doc.insertInlineImage(doc.body.paragraphStarts()[img1]!, earthrise, {
    fileName: "earthrise.jpg",
    maxWidth: 200,
  });
  doc.insertInlineImage(doc.body.paragraphStarts()[img2]!, wave, {
    fileName: "great-wave.jpg",
    maxWidth: 260,
    wrap: "page",
  });
  const { imageId: croppedId } = doc.insertInlineImage(doc.body.paragraphStarts()[img3]!, wave, {
    fileName: "great-wave.jpg",
    maxWidth: 260,
  });
  doc.insertInlineImage(doc.body.paragraphStarts()[img5]!, pipeline, {
    fileName: "pipeline.pdf",
    maxWidth: 220,
  });
  const cropped = doc.images().find((image) => image.object.identifier === croppedId);
  // The crop window lives in the image's drawn space: this copy is 260 pt
  // wide (960 px scaled), so the centre half is x 65, width 130.
  cropped?.setCrop({ x: 65, y: 0, width: 130, height: 260 * (645 / 960) });

  const floating = doc.floatingDrawables(0, { create: true });
  const source = doc.store.object(imageId);
  if (floating && source) {
    const copy = floating.addCopyOf(source, { x: 400, y: 90 });
    copy.setGeometry({ width: 140, height: 70 });
    copy.style()?.set({ opacity: 0.6, stroke: solidStroke({ r: 0.15, g: 0.15, b: 0.15 }, 2) });
    copy.style()?.setShadowEnabled(true);
  }
  // The floating cropped wave: the arrangement the app's own crop flow
  // produces (the crop-delta seed converted to floating when the person
  // cropped), so the mask editor is expected to engage here where the
  // in-flow copy above only renders.
  const croppedSource = doc.store.object(croppedId);
  if (floating && croppedSource) {
    const floatCrop = floating.addCopyOf(croppedSource, { x: 330, y: 420 });
    const model = doc.images().find((image) => image.object.identifier === floatCrop.object.identifier);
    model?.setCrop({ x: 65, y: 0, width: 130, height: 260 * (645 / 960) });
  }
  return doc.save();
}

// ------------------------------------------------------- demo 4: chart

function demoChart(): Uint8Array {
  // The corpus's Pages document with a column chart; its body text is
  // replaced whole by this demo's instructions, the chart stays.
  const doc = PagesDocument.load(
    new Uint8Array(readFileSync(new URL("../fixtures/draftjs-v2.3-comments.pages", import.meta.url))),
  );
  const chart = doc.charts()[0]!;
  const n = (value: number) => ({ type: "number", value }) as const;
  chart.setData([
    [n(12), n(19), n(31), n(24)],
    [n(28), n(14), n(22), n(17)],
  ]);
  chart.setRowName(0, "Serie 2025");
  chart.setRowName(1, "Serie 2026");
  chart.setColumnName(0, "Nord");
  chart.setColumnName(1, "Syd");
  chart.setColumnName(2, "Øst");
  chart.setColumnName(3, "Vest");
  chart.setAxisMajorGridlines("value", false);

  // The donor anchors its chart in the body text (old-era file: no page
  // groups, so the text anchor is the only thing that renders it), and
  // wiping the text severed it — the returned round one reported no
  // chart at all. Keep the chart's attachment object and re-anchor it
  // after the rewrite.
  const chartAttachment = doc.body
    .attachments()
    .find((a) => a.drawableId !== undefined && doc.store.typeNameOf(doc.store.object(a.drawableId)!) === "TSCH.ChartDrawableArchive")?.objectId;
  doc.body.setText("");
  const check = counter("D");
  pagesIntro(doc, "DEMO 4 · Diagram", "Diagramdata og -udseende, redigeret i et eksisterende dokuments søjlediagram (dokumentet her stammer fra testkorpusset).");
  pagesCheck(doc, check(), "Diagrammet skal vise fire kategorier — Nord (12/28), Syd (19/14), Øst (31/22), Vest (24/17) — to søjler pr. kategori, serierne hedder »Serie 2025« og »Serie 2026«.");
  pagesFeedback(doc);
  pagesCheck(doc, check(), "Værdiaksens vandrette hjælpelinjer er SLÅET FRA af biblioteket — diagrammet skal stå uden vandrette linjer bag søjlerne.");
  pagesFeedback(doc);
  const anchor = doc.appendParagraph(" ", "Body");
  doc.appendParagraph("Tak! Arkivér (⌘S) og send filen retur.", "Heading 3");
  if (chartAttachment !== undefined) {
    doc.body.insertAttachment(doc.body.paragraphStarts()[anchor]!, chartAttachment);
  }
  return doc.save();
}

// ---------------------------------------------------- demo 11: shadows

function demoShadows(): Uint8Array {
  const doc = PagesDocument.blank();
  const check = counter("S");
  pagesIntro(
    doc,
    "DEMO 11 · Skygger, blur og refleksioner",
    "Slagskyggens parametre (retning, afstand, blur, dækkraft, farve), enabled-flaget, de tre skyggetyper og spejling — elleve farvede firkanter, én ændring pr. firkant. Firkanterne flyder i højre side af side 1 og 2 i punkternes rækkefølge, og hvert punkt navngiver sin firkants farve; nederst står en farveprøve-række i samme rækkefølge. Inspektøren: Formatér → Stil → Skygge.",
  );

  // One delta per rung against S-01's stated baseline (the app-verified
  // default: stored angle 45 = inspector 315°, offset 5, blur 1, black,
  // full opacity, enabled).
  const rungs: { rgb: [number, number, number]; text: string; style: DrawableStyle }[] = [
    {
      rgb: [192, 57, 43],
      text:
        "Referencen: den TERRAKOTTA firkant har appens egen standardskygge — den popup'en »Slagskygge« selv sætter: sort, LIGE NED (inspektøren viser 270°), tæt på (afstand 2 pkt.), let blødgjort (blur 5 pkt.), 50 % dækkraft. De næste punkter ændrer én ting hver i forhold til denne.",
      style: { shadow: { ...DEFAULT_SHADOW } },
    },
    {
      rgb: [41, 74, 158],
      text: "Retning: den BLÅ firkants skygge peger NEDAD MOD HØJRE (inspektøren viser 315°), den klassiske retning.",
      style: { shadow: { ...DEFAULT_SHADOW, angle: 45 } },
    },
    {
      rgb: [79, 153, 82],
      text:
        "Retning igen: den GRØNNE firkants skygge peger mod VENSTRE (inspektøren viser 180°). Peger den en anden vej, så skriv hvilken — retningsskalaen er præcis det, punktet måler.",
      style: { shadow: { ...DEFAULT_SHADOW, angle: 180 } },
    },
    {
      rgb: [230, 185, 50],
      text: "Afstand: den GULE firkants skygge er rykket 25 pkt. væk — klart adskilt fra firkanten, samme retning som referencen.",
      style: { shadow: { ...DEFAULT_SHADOW, offset: 25 } },
    },
    {
      rgb: [125, 60, 152],
      text: "Blur: den LILLA firkants skygge er meget blød (blur 20 pkt.) — en udtværet sky frem for en skarp kant.",
      style: { shadow: { ...DEFAULT_SHADOW, radius: 20 } },
    },
    {
      rgb: [230, 126, 34],
      text: "Dækkraft: den ORANGE firkants skygge er næsten fuld (90 %) — tydeligt mørkere end referencens 50 %.",
      style: { shadow: { ...DEFAULT_SHADOW, opacity: 0.9 } },
    },
    {
      rgb: [150, 150, 150],
      text: "Farve: den GRÅ firkants skygge er TERRAKOTTA-farvet, ikke sort.",
      style: { shadow: { ...DEFAULT_SHADOW, color: { r: 0.753, g: 0.224, b: 0.169, a: 1 } } },
    },
    {
      rgb: [30, 30, 30],
      text:
        "Slået fra: den SORTE firkant har en konfigureret men SLÅET FRA skygge — der må INGEN skygge tegnes, og inspektørens skygge-felt bør stå slået fra. Slå derefter skyggen TIL via popup'en (vælg Slagskygge): appen skal overleve skiftet og tegne skyggen. Denne fil er genopbygget efter at netop dét skifte fik Pages til at crashe; et nyt crash er derfor et vigtigt fund, og »skiftet virkede« er præcis det, punktet måler.",
      style: { shadow: { ...DEFAULT_SHADOW, enabled: false } },
    },
    {
      rgb: [26, 188, 156],
      text: "Type: den TURKISE firkant har en KONTAKT-skygge (popup'en »Kontakt«) med 40 pkt. blur — skyggen samler sig blødt under firkantens fod, som om den står på en flade.",
      style: { shadow: { ...DEFAULT_SHADOW, type: ShadowType.CONTACT, radius: 40 } },
    },
    {
      rgb: [121, 85, 61],
      text: "Type: den BRUNE firkant har en BUET skygge (popup'en »Buet«).",
      style: { shadow: { ...DEFAULT_SHADOW, type: ShadowType.CURVED } },
    },
    {
      rgb: [24, 38, 74],
      text: "Spejling: den MØRKEBLÅ firkant har INGEN skygge men en SPEJLING (50 %) — firkanten spejles under sig selv og fader ud. Inspektøren: Spejling slået til med skyderen på 50 %.",
      style: { reflection: 0.5 },
    },
  ];

  for (const [index, rung] of rungs.entries()) {
    pagesCheck(doc, check(), rung.text);
    pagesFeedback(doc);
    // A page break after the sixth check puts S-07..S-11 beside their
    // squares on page 2.
    if (index === 5) doc.body.insertText(doc.body.text.length, "\f");
  }
  doc.appendParagraph("Tak! Arkivér (⌘S) og send filen retur.", "Heading 3");
  const legend = doc.appendParagraph("Farveprøver i rækkefølgen S-01…S-11: ", "Body");

  // The legend chips are the sources; each floating square is a copy
  // carrying its rung's one-delta style.
  const sources: bigint[] = [];
  for (const [index, rung] of rungs.entries()) {
    const { imageId } = doc.insertInlineImage(doc.body.text.length, blockPng(40, 40, rung.rgb), {
      fileName: `demo-skygge-${String(index + 1).padStart(2, "0")}.png`,
      maxWidth: 14,
    });
    sources.push(imageId);
  }
  void legend;

  for (const [index, rung] of rungs.entries()) {
    const page = index < 6 ? 0 : 1;
    const floating = doc.floatingDrawables(page, { create: true });
    const source = doc.store.object(sources[index]!);
    if (!floating || !source) throw new Error(`skygger: source ${index} missing`);
    const slot = index < 6 ? index : index - 6;
    const copy = floating.addCopyOf(source, { x: 452, y: 92 + slot * 112, width: 72, height: 72 });
    copy.style()?.set(rung.style);
  }
  return doc.save();
}

// ------------------------------------------------------- demo 5: cells

function demoCells(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  const check = counter("C");
  if (table.columnCount < 5) table.insertColumns(table.columnCount, 5 - table.columnCount);
  const need = 24;
  if (table.rowCount < need) table.insertRows(table.rowCount, need - table.rowCount);
  table.setColumnWidth(0, 60);
  table.setColumnWidth(1, 330);
  table.setColumnWidth(2, 120);
  table.setColumnWidth(3, 120);
  table.setColumnWidth(4, 170);

  let row = 0;
  const head = (id: string, text: string): void => {
    table.setCell(row, 0, id);
    table.setCell(row, 1, text);
    table.setCellFormatting(row, 1, { textWrap: true });
    row++;
  };
  table.setCell(row, 0, "DEMO 5");
  table.setCell(row, 1, "Celler og formater — skriv feedback i kolonne E ud for hvert punkt (tomt = som forventet). Arkivér og send retur.");
  table.setCellFormatting(row, 1, { textWrap: true });
  table.setCell(row, 4, "Feedback");
  row += 2;

  head(check(), "Celletyper — C: tekst, D: tal. Rækken under: C: dato (skal vise en dato), D: varighed (skal vise 1t 30m).");
  table.setCell(row - 1, 2, "en tekst");
  table.setCell(row - 1, 3, 1234.5);
  table.setCell(row, 2, { type: "date", value: new Date(Date.UTC(2026, 7, 9, 12, 0, 0)) });
  table.setCell(row, 3, { type: "duration", seconds: 5400 });
  row += 2;

  head(check(), "Formater — C: valuta (kr., to decimaler), D: procent. Rækken under: C: afkrydsning (sand = flueben), D: tal med 3 decimaler.");
  table.setCell(row - 1, 2, 1234.5);
  table.setCellFormat(row - 1, 2, { kind: "currency", code: "DKK", decimals: 2 });
  table.setCell(row - 1, 3, 0.125);
  table.setCellFormat(row - 1, 3, { kind: "percentage", decimals: 1 });
  table.setCell(row, 2, true);
  table.setCellFormat(row, 2, { kind: "checkbox" });
  table.setCell(row, 3, 3.14159);
  table.setCellFormat(row, 3, { kind: "number", decimals: 3 });
  row += 2;

  head(check(), "Flettede celler: C og D i rækken herunder er flettet til én bred celle med CENTRERET tekst.");
  table.mergeCells(row, 2, 1, 2);
  table.setCell(row, 2, "flettet C+D");
  table.setCellFormatting(row, 2, { verticalAlignment: 1, horizontalAlignment: "center" });
  row += 2;

  head(check(), "Cellestil: C herunder har mørkeblå fyldfarve, luft (padding) og en terrakotta ramme hele vejen rundt.");
  table.setCell(row, 2, "stilet celle");
  table.setCellFormatting(row, 2, {
    fill: colorFill(DARKBLUE.r, DARKBLUE.g, DARKBLUE.b),
    padding: { left: 8, right: 8, top: 6, bottom: 6 },
    borders: {
      top: solidStroke(TERRACOTTA, 2),
      bottom: solidStroke(TERRACOTTA, 2),
      left: solidStroke(TERRACOTTA, 2),
      right: solidStroke(TERRACOTTA, 2),
    },
  });
  row += 2;

  head(check(), "Kolonne C er sat smal (120 pt) og E bred (170 pt); rækken herunder er 40 pt høj.");
  table.setRowHeight(row, 40);
  table.setCell(row, 2, "høj række");
  row += 2;

  head(check(), "Tabellen har fået skiftevis-farvede rækker (banded rows) — hver anden datarække let tonet.");
  table.tableStyle()?.setTable({ bandedRows: true });
  row += 2;

  head(check(), "Ombrydning: C herunder ombryder sin lange tekst inde i cellen; D klipper den.");
  table.setCell(row, 2, "denne tekst er for lang til cellen og skal ombrydes over flere linjer");
  table.setCellFormatting(row, 2, { textWrap: true });
  table.setCell(row, 3, "denne tekst er også for lang, men må ikke ombrydes");
  table.setCellFormatting(row, 3, { textWrap: false });
  row += 2;

  head(check(), "Strukturen selv: denne tabel fik sine rækker indsat af biblioteket (24 i alt), og tabellen hedder »Demotabel« — navnet skal stå SYNLIGT over tabellen.");
  table.name = "Demotabel";
  table.nameVisible = true;
  row += 2;

  return doc.save();
}

// ---------------------------------------------------- demo 6: formulas

function demoFormulas(): Uint8Array {
  const doc = NumbersDocument.blank();
  const data = doc.tables()[0]!;
  const check = counter("F");

  if (data.columnCount < 5) data.insertColumns(data.columnCount, 5 - data.columnCount);
  if (data.rowCount < 22) data.insertRows(data.rowCount, 22 - data.rowCount);
  data.setColumnWidth(0, 44);
  data.setColumnWidth(1, 250);
  data.setColumnWidth(2, 75);
  data.setColumnWidth(3, 75);
  data.setColumnWidth(4, 100);

  let row = 0;
  data.setCell(row, 0, "DEMO 6");
  data.setCell(row, 1, "Formler — alle er skrevet som AST af biblioteket; Numbers regner selv ved åbning. Viser en celle fejl eller ingenting, er dét fundet. Noter i kolonne E.");
  data.setCellFormatting(row, 1, { textWrap: true });
  data.setCell(row, 4, "Noter");
  row += 2;

  const head = (id: string, text: string): void => {
    data.setCell(row, 0, id);
    data.setCell(row, 1, text);
    data.setCellFormatting(row, 1, { textWrap: true });
    row++;
  };

  head(check(), "Grunddata: C=7, D=3. Rækken under: C skal vise 10 (sum), D skal vise 21 (produkt).");
  data.setCell(row - 1, 2, 7);
  data.setCell(row - 1, 3, 3);
  const base = row - 1;
  data.setFormula(row, 2, `=C${base + 1}+D${base + 1}`);
  data.setFormula(row, 3, `=C${base + 1}*D${base + 1}`);
  row += 2;

  head(check(), "Talrække i C (2, 4, 6, 8) — D ud for hver: SUM=20, AVERAGE=5, MAX=8, ROUND(3,7)=4 — i den rækkefølge.");
  const firstNum = row;
  for (const [i, v] of [2, 4, 6, 8].entries()) data.setCell(row + i, 2, v);
  data.setFormula(firstNum, 3, `=SUM(C${firstNum + 1}:C${firstNum + 4})`);
  data.setFormula(firstNum + 1, 3, `=AVERAGE(C${firstNum + 1}:C${firstNum + 4})`);
  data.setFormula(firstNum + 2, 3, `=MAX(C${firstNum + 1}:C${firstNum + 4})`);
  data.setFormula(firstNum + 3, 3, "=ROUND(3.7,0)");
  row += 5;

  head(check(), "Krydsreferencer begge veje: C herunder henter 5 fra tabellen »Krydstjek« nederst på arket. Krydstjeks øverste række henter omvendt 7 herfra, og dens SUM over hele kolonne B skal vise 30.");
  const crossRow = row;
  row += 2;

  // The comparative slots: the checker authors the same constructions
  // with the app, right under ours, and the returned file carries
  // Apple's formula bytes next to this library's for the same ask.
  head(
    check(),
    `DIN TUR — formel: skriv selv =SUM(C${row + 2}:C${row + 3}) i den gule D-celle ud for tallene herunder (skal vise 9). Så kan appens formel sammenlignes med bibliotekets, felt for felt.`,
  );
  data.setCell(row, 2, 4);
  data.setCell(row + 1, 2, 5);
  data.setCellFormatting(row, 3, { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) });
  row += 3;

  head(check(), "DIN TUR — krydsreference: skriv selv =Krydstjek::B3 i den gule C-celle herunder (skal vise 10).");
  data.setCellFormatting(row, 2, { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) });
  row += 2;

  // A clean second table: the cross-table reference each way, and a
  // whole-column span. Column B holds only the three numbers the span
  // sums, and both formulas sit in column C — a formula inside the
  // column it spans would be a circular reference.
  const sheet = doc.sheets()[0]!;
  const second = doc.addTable(sheet.id, { name: "Krydstjek", x: 40, y: 700, withContent: false });
  if (second.rowCount < 6) second.insertRows(second.rowCount, 6 - second.rowCount);
  second.setColumnWidth(0, 220);
  second.setColumnWidth(1, 75);
  second.setColumnWidth(2, 75);
  const dataName = data.name ?? "Tabel 1";
  second.setCell(0, 0, "Hentet fra hovedtabellen (skal vise 7):");
  second.setCellFormatting(0, 0, { textWrap: true });
  second.setFormula(0, 2, `=${dataName}::C${base + 1}`);
  second.setCell(1, 0, "Egne tal i B: 5, 10 og 15");
  second.setCellFormatting(1, 0, { textWrap: true });
  second.setCell(1, 1, 5);
  second.setCell(2, 1, 10);
  second.setCell(3, 1, 15);
  // The clone inherits the donor's wrapped prose styles cell by cell;
  // value cells must not keep them.
  for (const r of [1, 2, 3]) second.setCellFormatting(r, 1, { textWrap: false });
  second.setCell(4, 0, "SUM over hele kolonne B (skal vise 30):");
  second.setCellFormatting(4, 0, { textWrap: true });
  second.setFormula(4, 2, "=SUM(B)");
  data.setFormula(crossRow, 2, "=Krydstjek::B2");

  return doc.save();
}

// ------------------------------- demo 7: conditional rules & controls

function demoRules(): Uint8Array {
  const doc = NumbersDocument.blank();
  const table = doc.tables()[0]!;
  const check = counter("R");

  if (table.rowCount < 32) table.insertRows(table.rowCount, 32 - table.rowCount);
  if (table.columnCount < 4) table.insertColumns(table.columnCount, 4 - table.columnCount);
  table.setColumnWidth(0, 44);
  table.setColumnWidth(1, 270);
  table.setColumnWidth(2, 80);
  table.setColumnWidth(3, 120);

  let row = 0;
  table.setCell(row, 0, "DEMO 7");
  table.setCell(row, 1, "Betinget formatering og kontroller — svar med lokalmenuen i kolonne D ud for hvert punkt, og skriv gerne noter i frie D-celler.");
  table.setCellFormatting(row, 1, { textWrap: true });
  table.setCell(row, 3, "Din vurdering");
  row += 2;

  const verdictRows: number[] = [];
  const head = (id: string, text: string): void => {
    table.setCell(row, 0, id);
    table.setCell(row, 1, text);
    table.setCellFormatting(row, 1, { textWrap: true });
    verdictRows.push(row);
    row++;
  };

  head(check(), "Betinget regel »> 5« med grøn fyldfarve på C-cellerne herunder: 3 (umarkeret), 7 (grøn), 9 (grøn).");
  for (const [i, v] of [3, 7, 9].entries()) table.setCell(row + i, 2, v);
  table.setConditionalRules(row, 2, [{ operator: ">", value: 5, cell: { fill: colorFill(SOFTGREEN.r, SOFTGREEN.g, SOFTGREEN.b) } }], { rowCount: 3 });
  row += 4;

  head(check(), "Regel »= 4« gul og »<> 4« blå i C: 4 (gul), 5 (blå).");
  table.setCell(row, 2, 4);
  table.setConditionalRules(row, 2, [{ operator: "=", value: 4, cell: { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) } }]);
  table.setCell(row + 1, 2, 5);
  table.setConditionalRules(row + 1, 2, [{ operator: "<>", value: 4, cell: { fill: colorFill(0.62, 0.76, 0.95) } }]);
  row += 3;

  head(check(), "Samme regelsæt genbrugt: reglen fra første punkt (>5 grøn) er også lagt på de to C-celler herunder: 6 (grøn), 2 (umarkeret).");
  table.setCell(row, 2, 6);
  table.setCell(row + 1, 2, 2);
  const key = table.conditionalStyleKey(verdictRows[0]! + 1, 2);
  if (key !== undefined) {
    table.setConditionalStyleKey(row, 2, key);
    table.setConditionalStyleKey(row + 1, 2, key);
  }
  row += 3;

  head(check(), "Kontroller i C herunder: afkrydsningsfelt (markeret), stjerner (4 af 5), skyder (60 af 0–100), trinvælger (25, trin 5).");
  table.setCell(row, 2, true);
  table.setCellControl(row, 2, { widget: "checkbox", value: true });
  table.setCell(row + 1, 2, 4);
  table.setCellControl(row + 1, 2, { widget: "starRating", value: 4 });
  table.setCell(row + 2, 2, 60);
  table.setCellControl(row + 2, 2, { widget: "slider", minimum: 0, maximum: 100, increment: 5, value: 60 });
  table.setCell(row + 3, 2, 25);
  table.setCellControl(row + 3, 2, { widget: "stepper", minimum: 0, maximum: 100, increment: 5, value: 25 });
  row += 5;

  // The comparative slots: the same feature authored by the app, right
  // under this library's, so the returned file carries both archives.
  head(check(), "DIN TUR — regel: læg selv reglen »større end 5 → grønt fyld« på de tre C-celler herunder med Betinget fremhævning. Så kan appens regel sammenlignes med bibliotekets, felt for felt.");
  for (const [i, v] of [3, 7, 9].entries()) table.setCell(row + i, 2, v);
  row += 4;

  head(check(), "DIN TUR — lokalmenu: giv selv den gule C-celle herunder en lokalmenu med valgene Rød, Grøn og Blå (Formatér → Celle → Lokalmenu).");
  table.setCellFormatting(row, 2, { fill: colorFill(SOFTYELLOW.r, SOFTYELLOW.g, SOFTYELLOW.b) });
  row += 2;

  head(check(), "Farverne fra punkterne ovenfor skal stå der ALLEREDE når dokumentet åbner, og tallene i C skal være HØJRESTILLEDE med det samme — også 3, 2, 60 og 25 — uden at du rører nogen celle. Ellers: skriv hvilke celler det gjaldt.");
  head(check(), "Lokalmenuerne i kolonne D er selv skrevet af biblioteket — vælg »OK«, »Afvigelse« eller »Ved ikke« ud for hvert punkt.");
  row += 1;

  for (const r of verdictRows) {
    table.setCell(r, 3, "— vælg —");
    table.setCellControl(r, 3, {
      widget: "popupMenu",
      items: ["— vælg —", "OK", "Afvigelse", "Ved ikke"],
      value: "— vælg —",
    });
  }
  return doc.save();
}

// -------------------------------------- demo 8: sheets, tables, filter

function demoStructure(): Uint8Array {
  const doc = NumbersDocument.load(
    new Uint8Array(
      readFileSync(new URL("../fixtures/olekristensen-v26.3-mac-filters.numbers", import.meta.url)),
    ),
  );
  const check = counter("N");

  // The read-me sheet, moved first. Its table comes with the cloned
  // sheet and is renamed, so the two tables never share a name.
  const readme = doc.addSheet({ name: "LÆS MIG" });
  const table = doc.tablesOnSheet(readme.id)[0] ?? doc.addTable(readme.id, { name: "Instruktioner" });
  table.name = "Instruktioner";
  table.clearAllCells();
  if (table.rowCount < 12) table.insertRows(table.rowCount, 12 - table.rowCount);
  table.setColumnWidth(0, 44);
  table.setColumnWidth(1, 300);
  table.setColumnWidth(2, 120);
  let row = 0;
  table.setCell(row, 0, "DEMO 8");
  table.setCell(row, 1, "Ark, tabeller og filtre — dette er dit eget filter-dokument fra målingerne, redigeret af biblioteket. Noter i kolonne C.");
  table.setCellFormatting(row, 1, { textWrap: true });
  table.setCell(row, 2, "Noter");
  row += 2;
  const head = (id: string, text: string): void => {
    table.setCell(row, 0, id);
    table.setCell(row, 1, text);
    table.setCellFormatting(row, 1, { textWrap: true });
    row++;
  };
  head(check(), "Dokumentet skal ÅBNE på denne fane (»LÆS MIG«), som biblioteket har oprettet og flyttet først i arkrækkefølgen. Åbnede det på en anden fane, er den lagrede fanemarkering ikke ramt — skriv hvilken fane der åbnede.");
  head(check(), "Arket med data er omdøbt til »Data (omdøbt)«, og dets tabel er omdøbt fra »Table 1« til »Måledata«. Denne tabel her hedder »Instruktioner«. Ser du stadig et gammelt navn, er omdøbningen ikke slået igennem.");
  head(check(), "Datatabellens filter (B > 10 OG C indeholder »ko«) er SLÅET FRA af biblioteket — alle 10 datarækker skal derfor være synlige.");
  head(check(), "Kolonne A i »Måledata« er omskrevet af biblioteket. Står der stadig »SEED · filter rules« deroppe, er omskrivningen ikke slået igennem.");
  head(check(), "DIN TUR — ark: opret selv et nyt ark med ⊕, omdøb det til »Dit ark«, og LAD DET VÆRE DET AKTIVE ark når du gemmer. Så viser filen hvordan appen selv skriver et ark og husker den valgte fane.");
  head(check(), "DIN TUR — filter: slå filteret i »Måledata« TIL igen (Organisér → Filtrér) før du gemmer — kun rækkerne koral, koks og kobolt bør vises. Så viser filen appens egen tændte filtertilstand.");

  const dataSheetIndex = doc.sheets().findIndex((s) => s.id !== readme.id);
  doc.renameSheet(dataSheetIndex, "Data (omdøbt)");
  const dataTable = doc.tablesOnSheet(doc.sheets()[dataSheetIndex]!.id)[0]!;
  dataTable.name = "Måledata";
  // The seed-era instructions once needed a very wide A column; the
  // rewritten notes do not, and the table has to read on a phone.
  dataTable.setColumnWidth(0, 280);
  dataTable.setColumnWidth(1, 70);
  dataTable.setColumnWidth(2, 90);
  // The seed's send-back instructions are long gone; say what the column
  // means now instead of letting them sit stale next to the data.
  dataTable.setCell(0, 0, "noter");
  dataTable.setCell(1, 0, "B og C er dine egne værdier fra målingerne, urørt.");
  dataTable.setCell(2, 0, "Filteret (B > 10 og C indeholder »ko«) er slået fra.");
  dataTable.setCell(3, 0, "Med filteret til: kun koral-, koks- og kobolt-rækkerne.");
  for (let r = 4; r <= 8; r++) dataTable.setCell(r, 0, "");
  for (const r of [1, 2, 3]) dataTable.setCellFormatting(r, 0, { textWrap: true });

  doc.moveSheet(doc.sheets().findIndex((s) => s.id === readme.id), 0);
  doc.setActiveSheet(0);

  for (const sheet of doc.sheets()) {
    for (const t of doc.tablesOnSheet(sheet.id)) {
      const rows = t.filterSets().rows;
      if (rows && rows.rules().length > 0) rows.setEnabled(false);
    }
  }
  return doc.save();
}

// ------------------------------------------------------ demo 9: slides

function demoSlides(): Uint8Array {
  const doc = KeynoteDocument.blank();
  const check = counter("K");
  // Slide 5 is genuinely created second and moved last at the end, so its
  // note tells the truth about its own history.
  while (doc.slideCount() < 4) doc.addSlide({ copyOf: 0, withContent: true });
  doc.duplicateSlide(2);
  const ids: string[] = [check(), check(), check(), check(), check()];
  const slides = doc.slides();
  const content: { title: string; body: string; notes: string }[] = [
    {
      title: "DEMO 9 · Lysbilleder",
      body: "Fem lysbilleder, alle bygget af biblioteket.\nInstruktionerne står i præsentationsnoterne — skriv din feedback dér.",
      notes: `${ids[0]} · Dette dias' titel og brødtekst er sat af biblioteket, på et dias der er dyb-kopieret fra layoutet. FORVENTET: titel + to linjer brødtekst, husets typografi. Skriv feedback her i noterne.`,
    },
    {
      title: "Dias 2 · kopieret indhold",
      body: "Dette dias og det næste er ens i opbygning.",
      notes: `${ids[1]} · Dias 3 er en DUBLET af dette dias, lavet med duplicateSlide — de to skal se ens ud (pånær titlerne, der er rettet bagefter). FORVENTET: ingen synlig forskel i layout.`,
    },
    {
      title: "Dias 3 · dubletten",
      body: "Dette dias og det forrige er ens i opbygning.",
      notes: `${ids[2]} · Denne dublet fik sin titel rettet efter kopieringen. FORVENTET: identisk med dias 2 bortset fra titlen.`,
    },
    {
      title: "Dias 4 · overspringes",
      body: "Dette dias er markeret som overspring (skip).",
      notes: `${ids[3]} · Dias 4 er markeret overspring: i navigatoren skal det stå sammenklappet/overstreget, og det må IKKE vises, når du afspiller showet.`,
    },
    {
      title: "Dias 5 · flyttet hertil",
      body: "Dette dias blev oprettet som nummer 2 og flyttet til sidst med moveSlide.",
      notes: `${ids[4]} · Dette dias blev oprettet som nummer 2 og flyttet sidst af biblioteket. FORVENTET: præcis denne rækkefølge — Demo-forsiden først, dette dias sidst. Tak! Arkivér og send filen retur.`,
    },
  ];
  // Authoring order: [forside, dias5(!), dias2, dias3=dublet af dias2, dias4].
  const order = [0, 4, 1, 2, 3];
  for (const [at, slide] of slides.entries()) {
    const c = content[order[at]!]!;
    slide.title = c.title;
    slide.body = c.body;
    slide.notes = c.notes;
  }
  doc.moveSlide(1, 4); // the promised move: created second, shown last
  doc.slides()[3]!.isSkipped = true;
  return doc.save();
}

// ------------------------------------------------- demo 10: animations

function demoBuilds(): Uint8Array {
  const doc = KeynoteDocument.load(
    new Uint8Array(
      readFileSync(new URL("../fixtures/olekristensen-v26.3-mac-builds-effects.key", import.meta.url)),
    ),
  );
  const check = counter("B");
  const slides = doc.slides();

  const build = slides[0]!.builds()[0]!;
  build.set({ duration: 3, delay: 1 });
  slides[0]!.notes =
    `${check()} · Dette er dit eget animations-dokument fra målingerne. Biblioteket har RETIMET dette dias' Opløs-animation: varighed 3 s, forsinkelse 1 s (før: 1 s / 0 s). FORVENTET: Animer-panelet viser de nye tal, og afspilningen føles langsommere.`;

  const second = slides[1]!;
  const removed = second.builds()[0];
  if (removed) second.removeBuild(removed.id);
  second.notes =
    `${check()} · Biblioteket har FJERNET dette dias' Flyt ind-animation. FORVENTET: teksten står der stadig, men Animer-panelet viser ingen effekt, og den kommer uden animation når du afspiller.`;

  slides[2]!.notes =
    `${check()} · Dette dias er urørt (Ambolt, pr. afsnit, to trin). FORVENTET: alt som da du byggede det. Tak! Arkivér og send filen retur.`;
  return doc.save();
}

// ------------------------------------------------------ write + verify

interface Demo {
  name: string;
  bytes: Uint8Array;
  check: (bytes: Uint8Array) => void;
}

/** The feedback line's grey-italic style must rule nothing past its own paragraph. */
function assertNoFeedbackBleed(d: PagesDocument): void {
  for (const p of d.paragraphs()) {
    if (!p.text.startsWith("→ Feedback:")) continue;
    const styleId = d.body.characterStyleIdAt(p.start);
    if (styleId === undefined) throw new Error("feedback line lost its styling");
    for (const run of d.body.characterStyleRuns()) {
      if (run.objectId === styleId && run.start >= p.end) {
        throw new Error(`feedback style bleeds to ${run.start}`);
      }
    }
  }
}

const outDir = process.argv[2] ?? "out";
mkdirSync(outDir, { recursive: true });

const demos: Demo[] = [
  {
    name: "demo-01-tekst.pages",
    bytes: demoText(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (!d.bodyText.includes("T-15")) throw new Error("tekst: checks missing");
      const offIndex = d.paragraphs().findIndex((p) => p.text.startsWith("Streg over og under, med eksplicit"));
      const offStyle = d.body.sheet()!.style(d.paragraph(offIndex).styleId!)!;
      if (offStyle.resolved().paragraph.ruleOffset !== 12) throw new Error("tekst: rammeafstand missing");
      if (d.paragraphStyles().every((s) => s.name !== "Demo Fremhævet")) throw new Error("tekst: created style missing");
      const rtl = d.paragraphs().findIndex((p) => /[֐-׿]/.test(p.text));
      if (d.body.paragraphDirection(rtl) !== "rtl") throw new Error("tekst: rtl missing");
      const rtlCount = d.paragraphs().filter((_, i) => d.body.paragraphDirection(i) === "rtl").length;
      if (rtlCount !== 1) throw new Error(`tekst: rtl rules ${rtlCount} paragraphs, expected 1`);
    },
  },
  {
    name: "demo-02-felter.pages",
    bytes: demoFields(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (d.sections().length !== 3) throw new Error("felter: expected 3 sections");
      if (d.placeholders().length !== 1) throw new Error("felter: expected 1 live placeholder");
      if (d.footnotes().length !== 1) throw new Error("felter: expected a footnote");
      if (d.comments().length !== 1) throw new Error("felter: expected a comment");
      if (d.bookmarks().length !== 1) throw new Error("felter: expected a bookmark");
      if (d.body.dateFields().length !== 1) throw new Error("felter: expected a date field");
    },
  },
  {
    name: "demo-03-billeder.pages",
    bytes: demoMedia(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (d.images().length < 5) throw new Error(`billeder: expected 5 images, got ${d.images().length}`);
      if (!d.images().some((i) => i.hasMask)) throw new Error("billeder: crop missing");
      if (!d.images().some((i) => i.fileName?.endsWith(".pdf"))) throw new Error("billeder: pdf missing");
      const withImage = d.paragraphs().filter((p) => p.text.includes("￼"));
      if (withImage.some((p) => p.text.trim() !== "￼")) throw new Error("billeder: image shares a paragraph with text");
    },
  },
  {
    name: "demo-04-diagram.pages",
    bytes: demoChart(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      const chart = d.charts()[0];
      if (!chart) throw new Error("diagram: chart missing");
      if (chart.rowNames()[0] !== "Serie 2025") throw new Error("diagram: data edit missing");
      if (!d.bodyText.includes("D-01")) throw new Error("diagram: checks missing");
    },
  },
  {
    name: "demo-05-celler.numbers",
    bytes: demoCells(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      const t = d.tables()[0]!;
      if (t.merges().length !== 1) throw new Error("celler: merge missing");
      if (!t.cellText(0, 0).includes("DEMO 5")) throw new Error("celler: intro missing");
    },
  },
  {
    name: "demo-06-formler.numbers",
    bytes: demoFormulas(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      assertPhoneLayout(d, "formler");
      const formulas = d.tables().flatMap((t) => t.formulas().map((f) => ({ table: t, ...f })));
      if (formulas.length < 8) throw new Error(`formler: expected 8+, got ${formulas.length}`);
      const cross = formulas.filter((f) => f.formula.includes("::"));
      if (cross.length !== 2) throw new Error(`formler: expected 2 cross-table references, got ${cross.length}`);
      // A whole-column span from inside its own column is circular; the
      // returned first round showed exactly that as #ERROR.
      for (const f of formulas) {
        const span = /\(([A-Z])\)/.exec(f.formula);
        if (span && f.column === span[1]!.charCodeAt(0) - 65) {
          throw new Error(`formler: ${f.formula} sits inside its own span column`);
        }
      }
      // The second table is built clean, not as a content copy.
      const krydstjek = d.tables().find((t) => t.name === "Krydstjek");
      if (!krydstjek) throw new Error("formler: Krydstjek missing");
      for (const cell of krydstjek.cells()) {
        if (krydstjek.cellText(cell.row, cell.column).includes("F-0")) {
          throw new Error("formler: Krydstjek carries copied check texts");
        }
      }
    },
  },
  {
    name: "demo-07-regler.numbers",
    bytes: demoRules(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      assertPhoneLayout(d, "regler");
      const t = d.tables()[0]!;
      if (t.conditionalStyleSets().size < 3) throw new Error("regler: conditional sets missing");
      if (t.controls().size < 4) throw new Error("regler: controls missing");
      // Every rule-keyed cell must be in the engine's dependency ledger,
      // or the app shows the rule but never evaluates it (round one).
      const keyed = new Set<string>();
      for (let r = 0; r < t.rowCount; r++) {
        for (let c = 0; c < t.columnCount; c++) {
          if (t.conditionalStyleKey(r, c) !== undefined) keyed.add(`${r},${c}`);
        }
      }
      const registered = new Set<string>();
      for (const { obj } of d.store.allObjects()) {
        if (obj.type !== FORMULA_OWNER_DEPENDENCIES) continue;
        if (obj.message.getUint(FormulaOwnerFields.OWNER_KIND) !== OwnerKind.CONDITIONAL_STYLE) continue;
        const tiled = obj.message.getMessage(FormulaOwnerFields.TILED_CELL_DEPENDENCIES);
        for (const ref of tiled?.getMessages(TiledDependenciesFields.TILES) ?? []) {
          const tile = d.store.resolve(ref);
          for (const rec of tile?.message.getMessages(CellRecordTileFields.CELL_RECORDS) ?? []) {
            registered.add(
              `${rec.getUint(CellRecordExpandedFields.ROW)},${rec.getUint(CellRecordExpandedFields.COLUMN)}`,
            );
          }
        }
      }
      for (const cell of keyed) {
        if (!registered.has(cell)) throw new Error(`regler: rule cell ${cell} not in engine ledger`);
      }
    },
  },
  {
    name: "demo-08-struktur.numbers",
    bytes: demoStructure(),
    check: (bytes) => {
      const d = NumbersDocument.load(bytes);
      assertPhoneLayout(d, "struktur");
      if (d.sheets()[0]!.name !== "LÆS MIG") throw new Error("struktur: readme sheet not first");
      const anyEnabled = d
        .tables()
        .some((t) => (t.filterSets().rows?.rules().length ?? 0) > 0 && t.filterSets().rows!.enabled);
      if (anyEnabled) throw new Error("struktur: filter still enabled");
      const names = d.tables().map((t) => t.name);
      if (new Set(names).size !== names.length) {
        throw new Error(`struktur: table names not distinct: ${names.join(", ")}`);
      }
      if (!names.includes("Måledata") || !names.includes("Instruktioner")) {
        throw new Error(`struktur: expected renamed tables, got ${names.join(", ")}`);
      }
      const data = d.tables().find((t) => t.name === "Måledata")!;
      for (let r = 0; r < data.rowCount; r++) {
        if (data.cellText(r, 0).includes("SEED")) throw new Error("struktur: stale seed text");
      }
      const readmeId = d.sheets()[0]!.id;
      for (const { obj } of d.store.allObjects()) {
        if (d.store.typeNameOf(obj) !== "TN.SheetSelectionArchive") continue;
        const ref = obj.message.getMessage(1)?.getVarint(1);
        if (ref !== readmeId) throw new Error("struktur: a sheet selection still names another sheet");
      }
    },
  },
  {
    name: "demo-09-lysbilleder.key",
    bytes: demoSlides(),
    check: (bytes) => {
      const d = KeynoteDocument.load(bytes);
      if (d.slideCount() !== 5) throw new Error("lysbilleder: expected 5 slides");
      if (!d.slides()[3]!.isSkipped) throw new Error("lysbilleder: skip flag missing");
      if (!d.allNotes().every((n) => n.notes.length > 0)) throw new Error("lysbilleder: notes missing");
    },
  },
  {
    name: "demo-10-animationer.key",
    bytes: demoBuilds(),
    check: (bytes) => {
      const d = KeynoteDocument.load(bytes);
      const info = d.slides()[0]!.builds()[0]!.read();
      if (info.duration !== 3 || info.delay !== 1) throw new Error("animationer: retime missing");
      if (d.slides()[1]!.builds().length !== 0) throw new Error("animationer: removal missing");
    },
  },
  {
    name: "demo-11-skygger.pages",
    bytes: demoShadows(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      assertNoFeedbackBleed(d);
      if (!d.bodyText.includes("S-11")) throw new Error("skygger: checks missing");
      if (d.images().length !== 22) throw new Error(`skygger: expected 22 images, got ${d.images().length}`);
      // The floats' own styles — the theme's presets carry shadows too.
      const handles = [0, 1].flatMap(
        (page) => d.floatingDrawables(page)?.drawables().map((f) => f.style()!) ?? [],
      );
      const styles = handles.map((h) => h.read());
      if (styles.length !== 11) throw new Error(`skygger: expected 11 floats, got ${styles.length}`);
      const enabled = styles.filter((s) => s.shadow?.enabled === true).length;
      if (enabled !== 9) throw new Error(`skygger: expected 9 enabled shadows, got ${enabled}`);
      if (!styles.some((s) => s.shadow?.enabled === false)) throw new Error("skygger: disabled shadow missing");
      if (!styles.some((s) => s.shadow?.type === ShadowType.CONTACT)) throw new Error("skygger: contact type missing");
      if (!styles.some((s) => s.shadow?.type === ShadowType.CURVED)) throw new Error("skygger: curved type missing");
      if (!styles.some((s) => s.reflection === 0.5)) throw new Error("skygger: reflection missing");
      // The crash laws: every shadow written whole, every override style
      // anonymous and parented — the app aborts over anything less when
      // its inspector edits one.
      for (const s of styles) {
        if (!s.shadow) continue;
        for (const key of ["color", "angle", "offset", "radius", "opacity", "enabled", "type"] as const) {
          if (s.shadow[key] === undefined) throw new Error(`skygger: shadow missing ${key}`);
        }
        if (s.shadow.color?.space === undefined) throw new Error("skygger: shadow colour names no space");
      }
      for (const h of handles) {
        const sup = h.object.message.getMessage(1);
        if (sup?.getString(2) !== undefined) throw new Error("skygger: override style kept an identifier");
        if (sup?.getMessage(3) === undefined) throw new Error("skygger: override style has no parent");
      }
    },
  },
];

for (const demo of demos) {
  const path = join(outDir, demo.name);
  writeFileSync(path, demo.bytes);
  demo.check(new Uint8Array(readFileSync(path)));
  console.log(`${demo.name}: ${demo.bytes.length} bytes, self-check passed`);
}
