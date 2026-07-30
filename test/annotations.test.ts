/**
 * Comments and footnotes — creation as well as reading.
 *
 * Both are multi-object structures where the interesting mistakes are
 * structural rather than arithmetic: a comment whose author is a fresh
 * duplicate of an existing person, a footnote anchored with the wrong
 * character, a note storage that is not of footnote kind. Each of those
 * produces a file that loads fine and is wrong in the app, so the tests
 * check the shape against what the corpus contains.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  authorsOf,
  COMMENT_TYPE,
  FOOTNOTE_MARK_CHARACTER,
  isUuidString,
  OBJECT_REPLACEMENT_CHARACTER,
  PagesDocument,
  randomUuid,
  STORAGE_KIND,
  type IwaObject,
} from "../src/index.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/** A plain document to add annotations to. */
const PLAIN = "threatconnect-v11.1-headers-footers-sections.pages";
/** Documents that already contain the structures, for shape comparison. */
const WITH_COMMENTS = "draftjs-v2.3-comments.pages";
const WITH_FOOTNOTES = "picopalette-v3.2-multisection-footnotes.pages";

describe("comments", () => {
  it("reads existing comments with their author and date", () => {
    const document = PagesDocument.load(bytes(WITH_COMMENTS));
    const comments = document.bodyOrUndefined!.comments();
    expect(comments.length).toBeGreaterThan(0);
    for (const comment of comments) {
      expect(comment.text.length).toBeGreaterThan(0);
      expect(comment.end).toBeGreaterThan(comment.start);
      expect(typeof comment.authorName).toBe("string");
      expect(comment.created instanceof Date).toBe(true);
      // Dates are stored from Apple's 2001 epoch; a wrong epoch lands in 1970.
      expect(comment.created!.getUTCFullYear()).toBeGreaterThan(2000);
    }
  });

  it("adds a comment that survives a save", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const body = document.bodyOrUndefined!;
    expect(body.comments().length).toBe(0);
    const id = body.addComment(10, 20, "Please double-check this.");

    const reloaded = PagesDocument.load(document.save());
    const comments = reloaded.bodyOrUndefined!.comments();
    expect(comments.length).toBe(1);
    expect(comments[0]!.commentStorageId).toBe(id);
    expect(comments[0]!.text).toBe("Please double-check this.");
    expect(comments[0]!.start).toBe(10);
    expect(comments[0]!.end).toBe(20);
    expect(comments[0]!.replyCount).toBe(0);
  });

  it("reuses the document's existing author rather than duplicating them", () => {
    // The mistake this guards against: a document where the same person
    // appears once per comment, which looks fine until someone filters.
    const document = PagesDocument.load(bytes(WITH_COMMENTS));
    const before = authorsOf(document.store);
    expect(before.length).toBe(1);

    const body = document.bodyOrUndefined!;
    body.addComment(5, 9, "One");
    body.addComment(40, 44, "Two");

    expect(authorsOf(document.store).length).toBe(1);
    const added = body.comments().filter((c) => c.text === "One" || c.text === "Two");
    expect(added.length).toBe(2);
    expect(new Set(added.map((c) => c.authorId)).size).toBe(1);
    expect(added[0]!.authorId).toBe(before[0]!.identifier);
  });

  it("reuses an author by name, and creates one only for a new name", () => {
    const document = PagesDocument.load(bytes(WITH_COMMENTS));
    const existing = authorsOf(document.store)[0]!;
    const name = existing.message.getString(1)!;
    const body = document.bodyOrUndefined!;

    body.addComment(5, 9, "Same person", { author: name });
    expect(authorsOf(document.store).length).toBe(1);

    body.addComment(40, 44, "Someone else", { author: "A Different Reviewer" });
    const authors = authorsOf(document.store);
    expect(authors.length).toBe(2);
    // The new author joins the document's roster, or the apps show a
    // commenter who is not in the list.
    let roster: IwaObject | undefined;
    for (const { obj } of document.store.allObjects()) {
      if (obj.type === COMMENT_TYPE.AUTHOR_STORAGE) roster = obj;
    }
    const listed = roster!.message.getMessages(1).map((r) => r.getVarint(1));
    expect(listed.includes(authors[1]!.identifier)).toBe(true);
  });

  it("records the date it was given", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const created = new Date("2024-03-05T09:15:00Z");
    document.bodyOrUndefined!.addComment(10, 20, "Dated", { created });

    const reloaded = PagesDocument.load(document.save());
    const comment = reloaded.bodyOrUndefined!.comments()[0]!;
    expect(comment.created!.getTime()).toBe(created.getTime());
  });

  it("builds a highlight shaped like the ones in the corpus", () => {
    const reference = PagesDocument.load(bytes(WITH_COMMENTS));
    const referenceHighlight = reference.store.object(
      reference.bodyOrUndefined!.comments()[0]!.highlightId,
    )!;

    const document = PagesDocument.load(bytes(PLAIN));
    document.bodyOrUndefined!.addComment(10, 20, "New");
    const built = document.store.object(
      document.bodyOrUndefined!.comments()[0]!.highlightId,
    )!;

    expect(built.type).toBe(referenceHighlight.type);
    expect(built.message.fields.map((f) => f.no).sort()).toEqual(
      referenceHighlight.message.fields.map((f) => f.no).sort(),
    );
    // The uuid string the apps match on must be a real v4 UUID.
    expect(isUuidString(built.message.getString(2)!)).toBe(true);
  });

  it("removes a comment, leaving the text alone", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const body = document.bodyOrUndefined!;
    const text = body.text;
    const id = body.addComment(10, 20, "Temporary");

    expect(body.removeComment(id)).toBe(true);
    expect(body.comments().length).toBe(0);
    expect(body.text).toBe(text);
    expect(body.removeComment(id)).toBe(false);

    const reloaded = PagesDocument.load(document.save());
    expect(reloaded.bodyOrUndefined!.comments().length).toBe(0);
  });

  it("rejects an empty or reversed range", () => {
    const body = PagesDocument.load(bytes(PLAIN)).bodyOrUndefined!;
    expect(() => body.addComment(10, 10, "Empty")).toThrow();
    expect(() => body.addComment(20, 10, "Backwards")).toThrow();
    expect(() => body.addComment(0, 1e9, "Past the end")).toThrow();
  });
});

describe("footnotes", () => {
  it("reads existing footnotes and their notes", () => {
    const document = PagesDocument.load(bytes(WITH_FOOTNOTES));
    const body = document.textStorages().find((s) => s.footnotes().length > 0)!;
    const footnotes = body.footnotes();
    expect(footnotes.length).toBeGreaterThan(1);
    for (const footnote of footnotes) {
      // The reference is a U+000E, not the U+FFFC every other attachment uses.
      expect(body.text[footnote.anchorIndex]).toBe(FOOTNOTE_MARK_CHARACTER);
      expect(footnote.storage.kind).toBe(STORAGE_KIND.FOOTNOTE);
      // The note begins with its own mark placeholder.
      expect(footnote.storage.text[0]).toBe(OBJECT_REPLACEMENT_CHARACTER);
    }
  });

  it("adds a footnote shaped like the ones in the corpus", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const body = document.bodyOrUndefined!;
    const before = body.text;
    const note = body.addFootnote(30, "See the appendix.");

    expect(body.text).toBe(`${before.slice(0, 30)}${FOOTNOTE_MARK_CHARACTER}${before.slice(30)}`);
    expect(note.kind).toBe(STORAGE_KIND.FOOTNOTE);
    expect(note.text).toBe(`${OBJECT_REPLACEMENT_CHARACTER} See the appendix.`);
    // The note's mark is anchored as an attachment inside the note itself.
    expect(note.attachments().length).toBe(1);
    expect(note.attachments()[0]!.index).toBe(0);
    // Same stylesheet as its host, so it inherits the footnote style.
    expect(note.stylesheetId).toBe(body.stylesheetId);
  });

  it("survives a save and reads back as a footnote", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const body = document.bodyOrUndefined!;
    const note = body.addFootnote(30, "See the appendix.");

    const reloaded = PagesDocument.load(document.save());
    const footnotes = reloaded.bodyOrUndefined!.footnotes();
    expect(footnotes.length).toBe(1);
    expect(footnotes[0]!.anchorIndex).toBe(30);
    expect(footnotes[0]!.storage.id).toBe(note.id);
    expect(footnotes[0]!.storage.text).toBe(`${OBJECT_REPLACEMENT_CHARACTER} See the appendix.`);
  });

  it("keeps several footnotes in order as they are added", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const body = document.bodyOrUndefined!;
    body.addFootnote(50, "Third");
    body.addFootnote(20, "First"); // inserted before, so it shifts the other
    body.addFootnote(40, "Second");

    const footnotes = body.footnotes().sort((a, b) => a.anchorIndex - b.anchorIndex);
    expect(footnotes.length).toBe(3);
    expect(footnotes.map((f) => f.storage.text.slice(2))).toEqual(["First", "Second", "Third"]);
    for (const footnote of footnotes) {
      expect(body.text[footnote.anchorIndex]).toBe(FOOTNOTE_MARK_CHARACTER);
    }
  });

  it("lets the note's text be edited like any other storage", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const note = document.bodyOrUndefined!.addFootnote(30, "Draft.");
    note.replaceAll("Draft.", "Final wording.");

    const reloaded = PagesDocument.load(document.save());
    expect(reloaded.bodyOrUndefined!.footnotes()[0]!.storage.text).toBe(
      `${OBJECT_REPLACEMENT_CHARACTER} Final wording.`,
    );
  });

  it("removes a footnote and its reference character", () => {
    const document = PagesDocument.load(bytes(PLAIN));
    const body = document.bodyOrUndefined!;
    const text = body.text;
    const note = body.addFootnote(30, "Temporary");

    expect(body.removeFootnote(note.id)).toBe(true);
    expect(body.footnotes().length).toBe(0);
    expect(body.text).toBe(text);
    expect(body.text.includes(FOOTNOTE_MARK_CHARACTER)).toBe(false);
    expect(body.removeFootnote(note.id)).toBe(false);
  });

  it("rejects a position outside the text", () => {
    const body = PagesDocument.load(bytes(PLAIN)).bodyOrUndefined!;
    expect(() => body.addFootnote(-1, "x")).toThrow();
    expect(() => body.addFootnote(1e9, "x")).toThrow();
  });
});

describe("uuid strings", () => {
  it("produces the uppercase v4 form the apps compare", () => {
    for (let i = 0; i < 50; i++) {
      const uuid = randomUuid();
      expect(isUuidString(uuid)).toBe(true);
      expect(uuid[14]).toBe("4");
      expect("89AB".includes(uuid[19]!)).toBe(true);
    }
  });

  it("does not repeat itself", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) seen.add(randomUuid());
    expect(seen.size).toBe(500);
  });
});
