import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "./harness.ts";
import { KeynoteDocument } from "../src/keynote/document.ts";
import { PagesDocument } from "../src/pages/document.ts";
import { TOOLS } from "../src/mcp/server.ts";
import { blockPng } from "../scripts/png.ts";

const tool = TOOLS.find((t) => t.name === "add_image")!;

describe("the add_image tool", () => {
  const dir = mkdtempSync(join(tmpdir(), "cupertino-add-image-"));
  const picture = join(dir, "block.png");
  writeFileSync(picture, blockPng(40, 30));

  it("puts a picture inline at the end of a Pages body", () => {
    const path = join(dir, "a.pages");
    const doc = PagesDocument.blank();
    doc.appendParagraph("Before.", "Body");
    writeFileSync(path, doc.save());
    const reply = tool.handler({ path, file: picture, width: 120 });
    expect(reply.startsWith("inserted image")).toBe(true);
    const again = PagesDocument.load(new Uint8Array(readFileSync(path)));
    expect(again.images().length).toBe(1);
    expect(again.body.text.endsWith("\uFFFC")).toBe(true);
  });

  it("puts a picture on a Keynote slide where asked", () => {
    const path = join(dir, "a.key");
    writeFileSync(path, KeynoteDocument.blank().save());
    tool.handler({ path, file: picture, slide: 0, x: 100, y: 200, width: 300 });
    const again = KeynoteDocument.load(new Uint8Array(readFileSync(path)));
    const image = again.slides()[0]!.drawables().find((d) => d.object.type === 3005)!;
    expect([image.geometry()?.x, image.geometry()?.y, image.geometry()?.width]).toEqual([100, 200, 300]);
  });

  it("refuses a missing picture and a Numbers document", () => {
    const path = join(dir, "b.key");
    writeFileSync(path, KeynoteDocument.blank().save());
    expect(() => tool.handler({ path, file: join(dir, "none.png") })).toThrow(/no image/);
  });
});
