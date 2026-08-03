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

const seeds: Seed[] = [
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
