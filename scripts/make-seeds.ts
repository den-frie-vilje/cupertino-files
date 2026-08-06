/**
 * Seed documents for manual blockers — the file carries its own
 * instructions.
 *
 * An open question in docs/BLOCKERS.md that needs a person in an app gets
 * a document staged as far as the library can take it: the data already
 * in place, and the remaining clicks written *inside* the document — as
 * cells beside the data, as presenter notes on the slide they concern, as
 * Pages comments anchored to the exact paragraph. Open, follow, save, run
 * the one command the file names. A refusal or a surprising result is a
 * finding, not a failure; every seed says so.
 *
 * The registry below is empty when nothing needs a person. To stage a new
 * question, add an entry:
 *
 *   const seeds: Seed[] = [
 *     {
 *       name: "seed-something.pages",
 *       bytes: buildSomethingSeed(),   // library-authored, instructions embedded
 *       check: (bytes) => { ... },     // reload and assert the instructions landed
 *     },
 *   ];
 *
 * Keep to the CLAUDE.md rules: regenerate fresh for every request, one
 * question per file where cheap, the expected result written into the
 * document, and name the probe/harvest command the checker should run.
 * A returned file gets probed, banked, and — when it settles something —
 * added to `fixtures/` with an ATTRIBUTION.md entry.
 *
 *   npm run seeds -- <outDir>
 *
 * The script reloads each file it wrote and asserts the instructions
 * landed, so a broken seed cannot be sent.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PagesDocument } from "../src/index.ts";

interface Seed {
  name: string;
  bytes: Uint8Array;
  check: (bytes: Uint8Array) => void;
}

const outDir = process.argv[2] ?? "out";

// ---------------------------------------------------------- collaboration

function seedCollaboration(): Uint8Array {
  // Turning on Pages' collaboration rewrites the package with two
  // components nothing else writes — OperationStorage.iwa and
  // ActivityStream.iwa, LZFSE-framed beside the Snappy ones — and no
  // redistributable document carries them. The library now decodes the
  // framing; what the decoded payload *means* is the open question, and
  // only a returned file can answer it.
  const doc = PagesDocument.blank();
  doc.appendParagraph(
    "SEED · samarbejdstilstand (docs/BLOCKERS.md). Dette dokument skal have slået samarbejde til og arkiveres — det omskriver pakken med to komponenter, ingen andre dokumenter har, og som biblioteket nu kan afkode men aldrig har målt.",
  );
  doc.appendParagraph(
    "1) Åbn dokumentet i Pages (kræver iCloud-login). 2) Tryk på Samarbejd-knappen i værktøjslinjen og del med \"Kun personer, du inviterer\" — du behøver ikke sende invitationen til nogen. 3) Arkivér (⌘S), luk, og kør: npm run probe -- seed-collaboration.pages — afsnit 8 viser, hvad afkoderen ser i de nye komponenter. 4) Send filen retur. 5) Du kan bagefter slå delingen fra igen (Samarbejd → Administrer delt dokument → Stop deling).",
    "Body",
  );
  doc.appendParagraph(
    "Hvis Pages nægter at dele, eller proben stadig viser 'every component parsed', er dét fundet — så skriver din version samarbejdsloggen et andet sted.",
    "Body",
  );
  return doc.save();
}

// ------------------------------------------------------------ inline image

/** A 240×120 PNG: a solid block, big enough to see which edge it starts at. */
function blockPng(): Uint8Array {
  const width = 240;
  const height = 120;
  const raw: number[] = [];
  for (let y = 0; y < height; y++) {
    raw.push(0); // filter byte
    for (let x = 0; x < width; x++) raw.push(0xc0, 0x39, 0x2b); // terracotta
  }
  const chunk = (type: string, body: number[]): number[] => {
    const bytes = [...body];
    const nameBytes = Array.from({ length: type.length }, (_, i) => type.charCodeAt(i));
    const payload = [...nameBytes, ...bytes];
    const crcTable: number[] = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
    let crc = 0xffffffff;
    for (const b of payload) crc = crcTable[(crc ^ b) & 0xff]! ^ (crc >>> 8);
    crc = (crc ^ 0xffffffff) >>> 0;
    const be = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
    return [...be(bytes.length), ...payload, ...be(crc)];
  };
  const be = (v: number): number[] => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const ihdr = chunk("IHDR", [...be(width), ...be(height), 8, 2, 0, 0, 0]);
  // Store the scanlines uncompressed in a zlib wrapper (deflate stored blocks).
  const blocks: number[] = [];
  for (let at = 0; at < raw.length; at += 65535) {
    const slice = raw.slice(at, at + 65535);
    const last = at + 65535 >= raw.length ? 1 : 0;
    blocks.push(last, slice.length & 255, (slice.length >> 8) & 255, ~slice.length & 255, (~slice.length >> 8) & 255, ...slice);
  }
  let a = 1;
  let b = 0;
  for (const byte of raw) {
    a = (a + byte) % 65521;
    b = (b + a) % 65521;
  }
  const idat = chunk("IDAT", [0x78, 0x01, ...blocks, ...be(((b << 16) | a) >>> 0)]);
  const iend = chunk("IEND", []);
  return new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, ...ihdr, ...idat, ...iend]);
}

function seedInlineImage(): Uint8Array {
  // An inline picture used to be drawn from the page margin rather than
  // the text column, because the drawable carried no exterior_text_wrap.
  // It now carries the in-the-text-flow one. Only the app can say whether
  // that is what the field means, and an indented body is what makes the
  // difference visible: at the page margin the picture starts to the left
  // of the words above it.
  const doc = PagesDocument.blank();
  const png = blockPng();

  doc.appendParagraph(
    "SEED · indrykket billede (docs/BLOCKERS.md). Brødteksten herunder er rykket 113 pt ind fra sidens margen. Spørgsmålet er, hvor de to billeder starter.",
  );

  const indent = { leftIndent: 113.4 };
  const first = doc.appendParagraph(
    "FORVENTET: billedet herunder starter i SAMME lodrette linje som denne sætnings første bogstav — altså langt inde på siden. Gør det ikke det, men starter helt ude ved sidens venstre margen, er dét fundet.",
    "Body",
  );
  doc.paragraph(first).format(indent);
  const firstImage = doc.appendParagraph("", "Body");
  doc.paragraph(firstImage).format(indent);
  doc.insertInlineImage(doc.body.paragraphStarts()[firstImage]!, png, {
    fileName: "i-tekstspalten.png",
    width: 200,
    height: 100,
  });

  const second = doc.appendParagraph(
    "FORVENTET: billedet herunder starter derimod ude ved sidens venstre margen, ikke i tekstspalten — det er skrevet med den anden tilstand, så de to skal se forskellige ud. Ser de to billeder ens ud, virker indstillingen ikke.",
    "Body",
  );
  doc.paragraph(second).format(indent);
  const secondImage = doc.appendParagraph("", "Body");
  doc.paragraph(secondImage).format(indent);
  doc.insertInlineImage(doc.body.paragraphStarts()[secondImage]!, png, {
    fileName: "ved-sidemargenen.png",
    width: 200,
    height: 100,
    wrap: "page",
  });

  const last = doc.appendParagraph(
    "Kig på de to billeders venstre kant. Forskellige = begge tilstande virker. Ens = kun den ene bliver brugt, uanset hvad filen siger. Send filen retur uden at ændre noget.",
    "Body",
  );
  doc.paragraph(last).format(indent);
  return doc.save();
}

const seeds: Seed[] = [
  {
    name: "seed-inline-image.pages",
    bytes: seedInlineImage(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      if (d.images().length !== 2) throw new Error("inline image: expected 2 images");
      if (!d.bodyText.includes("FORVENTET")) throw new Error("inline image: expectations missing");
      if (!d.bodyText.includes("Send filen retur")) throw new Error("inline image: return ask missing");
    },
  },
  {
    name: "seed-collaboration.pages",
    bytes: seedCollaboration(),
    check: (bytes) => {
      const d = PagesDocument.load(bytes);
      if (!d.bodyText.includes("npm run probe")) throw new Error("collaboration: command missing");
      if (!d.bodyText.includes("Send filen retur")) throw new Error("collaboration: return ask missing");
    },
  },
];

if (seeds.length === 0) {
  console.log("no open blocker needs a seed — nothing to write");
} else {
  mkdirSync(outDir, { recursive: true });
  for (const seed of seeds) {
    const path = join(outDir, seed.name);
    writeFileSync(path, seed.bytes);
    seed.check(new Uint8Array(readFileSync(path)));
    console.log(`${seed.name}: ${seed.bytes.length} bytes, instructions verified`);
  }
}
