#!/usr/bin/env node
/**
 * iwork-dump — inspect modern iWork files from the command line.
 *
 *   iwork-dump info <file>              format versions, app, components
 *   iwork-dump ls <file>                objects per component with type names
 *   iwork-dump text <file>              extract all text
 *   iwork-dump styles <file>            named styles (Pages)
 *   iwork-dump sections <file>          sections + headers/footers (Pages)
 *   iwork-dump object <file> <id>       pretty-print one object's protobuf
 *   iwork-dump extract <file> <outdir>  write decompressed .iwa streams
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { IWorkDocument, detectApp } from "./model/document.ts";
import { PagesDocument } from "./pages/document.ts";
import { IWorkContainer } from "./package.ts";
import { decodeIwaData } from "./snappy.ts";
import { RawMessage, WireType, type RawField } from "./protobuf.ts";
import { typeName } from "./registry.ts";
import { utf8Decode } from "./bytes.ts";

function usage(): never {
  console.error(
    "usage: iwork-dump <info|ls|text|styles|sections|object|extract> <file.pages|.numbers|.key> [args]",
  );
  process.exit(2);
}

function printMessage(m: RawMessage, indent: string, depth: number): void {
  for (const f of m.fields) {
    printField(f, indent, depth);
  }
}

function printField(f: RawField, indent: string, depth: number): void {
  const head = `${indent}${f.no}`;
  if (f.wire === WireType.Varint) {
    console.log(`${head}: ${f.value}`);
    return;
  }
  if (f.wire === WireType.Fixed32) {
    const b = f.value as Uint8Array;
    const view = new DataView(b.buffer, b.byteOffset, 4);
    console.log(`${head}: float ${view.getFloat32(0, true)}`);
    return;
  }
  if (f.wire === WireType.Fixed64) {
    const b = f.value as Uint8Array;
    const view = new DataView(b.buffer, b.byteOffset, 8);
    console.log(`${head}: double ${view.getFloat64(0, true)}`);
    return;
  }
  const bytes = f.value instanceof RawMessage ? f.value.toBytes() : (f.value as Uint8Array);
  // Try nested message, then string, then hex.
  if (depth < 8 && bytes.length > 0) {
    try {
      const child = RawMessage.parse(bytes);
      if (child.fields.length > 0 && child.fields.every((cf) => cf.no > 0 && cf.no < 10000)) {
        console.log(`${head} {`);
        printMessage(child, indent + "  ", depth + 1);
        console.log(`${indent}}`);
        return;
      }
    } catch {
      /* not a message */
    }
  }
  const text = tryText(bytes);
  if (text !== undefined) {
    console.log(`${head}: ${JSON.stringify(text)}`);
  } else {
    const hex = [...bytes.slice(0, 32)].map((b) => b.toString(16).padStart(2, "0")).join(" ");
    console.log(`${head}: bytes(${bytes.length}) ${hex}${bytes.length > 32 ? " …" : ""}`);
  }
}

function tryText(bytes: Uint8Array): string | undefined {
  if (bytes.length === 0) return "";
  const s = utf8Decode(bytes);
  // Printable heuristic.
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    if (c === 0xfffd || (c < 0x20 && c !== 9 && c !== 10 && c !== 13)) return undefined;
  }
  return s;
}

function main(): void {
  const [cmd, file, ...rest] = process.argv.slice(2);
  if (!cmd || !file) usage();
  const bytes = new Uint8Array(readFileSync(file));

  switch (cmd) {
    case "info": {
      const doc = IWorkDocument.open(bytes);
      const s = doc.stats();
      console.log(`app: ${s.app}`);
      console.log(`objects: ${s.objectCount} across ${s.components.length} components`);
      const f = doc.format;
      if (f.fileFormatVersion.length) console.log(`file_format_version: ${f.fileFormatVersion.join(".")}`);
      if (f.writeVersion.length) console.log(`write_version: ${f.writeVersion.join(".")}`);
      if (f.propertiesFileFormatVersion) console.log(`Properties.plist fileFormatVersion: ${f.propertiesFileFormatVersion}`);
      if (f.documentUUID) console.log(`documentUUID: ${f.documentUUID}`);
      if (f.buildHistory.length) console.log(`build history: ${f.buildHistory.join(" | ")}`);
      for (const w of f.warnings) console.log(`warning: ${w}`);
      for (const c of s.components) console.log(`  ${c.name}: ${c.objects} objects`);
      break;
    }
    case "ls": {
      const doc = IWorkDocument.open(bytes);
      for (const component of doc.store.components) {
        console.log(component.name);
        for (const o of component.objects) {
          const name = typeName(o.type, doc.app) ?? "?";
          console.log(`  ${o.identifier}  ${o.type}  ${name}  refs=[${o.getObjectReferences().join(",")}]`);
        }
      }
      break;
    }
    case "text": {
      const doc = IWorkDocument.open(bytes);
      if (doc.app === "pages") {
        console.log(PagesDocument.load(bytes).bodyText);
      } else {
        console.log(doc.allText());
      }
      break;
    }
    case "styles": {
      const doc = PagesDocument.load(bytes);
      for (const s of doc.paragraphStyles()) {
        console.log(`${s.id}  ${s.name ?? "(anonymous)"}  ${s.identifier ?? ""}`);
      }
      break;
    }
    case "sections": {
      const doc = PagesDocument.load(bytes);
      for (const sec of doc.sections()) {
        console.log(
          `section ${sec.index} [${sec.start}..${sec.end}) name=${sec.name ?? "-"} ` +
            `pageNumberStart=${sec.pageNumberStart ?? "-"}`,
        );
        for (const t of sec.templates()) {
          console.log(
            `  ${t.role}: headers=[${t.headers.map((h) => JSON.stringify(h.text)).join(", ")}] ` +
              `footers=[${t.footers.map((x) => JSON.stringify(x.text)).join(", ")}]`,
          );
        }
      }
      break;
    }
    case "object": {
      const id = BigInt(rest[0] ?? usage());
      const doc = IWorkDocument.open(bytes);
      const obj = doc.object(id);
      if (!obj) {
        console.error(`object ${id} not found`);
        process.exit(1);
      }
      const name = typeName(obj.type, doc.app) ?? "?";
      console.log(`object ${id} type=${obj.type} (${name})`);
      printMessage(obj.message, "  ", 0);
      break;
    }
    case "extract": {
      const outdir = rest[0] ?? usage();
      const container = IWorkContainer.fromBytes(bytes);
      for (const [name, data] of container.iwaFiles) {
        const out = join(outdir, `${name}.stream`);
        mkdirSync(dirname(out), { recursive: true });
        writeFileSync(out, decodeIwaData(data));
        console.log(out);
      }
      break;
    }
    default:
      usage();
  }
}

main();
