/**
 * Comments (`TSD.CommentStorageArchive`).
 *
 * A comment is three objects, not one:
 *
 * ```
 * table_highlight run  →  TSWP.HighlightArchive (2013)
 *                            └ commentStorage →  TSD.CommentStorageArchive (3056)
 *                                                   └ author → TSK.AnnotationAuthorArchive (212)
 * ```
 *
 * The **highlight** is what makes the commented words show highlighted; the
 * **comment storage** holds the text, its date and its author; the
 * **author** is shared across every comment that person made and is listed
 * in the document's `TSK.AnnotationAuthorStorageArchive` (213).
 *
 * That sharing is why creating a comment reuses an existing author rather
 * than minting one. A document where every comment has its own
 * identically-named author looks fine in a list and wrong the moment
 * someone filters by commenter — and it is not what the apps produce.
 *
 * Dates are `TSP.Date { seconds }` counted from Apple's 2001-01-01 epoch.
 */
import { writeColor } from "../tsd/style.ts";
import { protoFields } from "../proto/fields.ts";
import type { IwaObject } from "../tsp/iwa.ts";
import type { Component, ObjectStore } from "../tsp/store.ts";
import { RawMessage } from "../base/protobuf.ts";
import { APPLE_EPOCH_MS } from "../base/bytes.ts";
import { makeRef, refId } from "../tsp/schema.ts";
import { randomUuid } from "../base/uuid.ts";

/** Archive types in the comment graph. */
export const COMMENT_TYPE = {
  HIGHLIGHT: 2013,
  COMMENT_STORAGE: 3056,
  AUTHOR: 212,
  AUTHOR_STORAGE: 213,
} as const;

/** TSWP.HighlightArchive. */
export const HighlightFields = protoFields("TSWP.HighlightArchive", {
  COMMENT_STORAGE: "commentStorage",
  TEXT_ATTRIBUTE_UUID: "text_attribute_uuid_string",
});

/** TSD.CommentStorageArchive. */
export const CommentStorageFields = protoFields("TSD.CommentStorageArchive", {
  TEXT: "text",
  CREATION_DATE: "creation_date",
  AUTHOR: "author",
  REPLIES: "replies",
  STORAGE_UUID: "storage_uuid",
});

/** TSK.AnnotationAuthorArchive. */
export const AuthorFields = protoFields("TSK.AnnotationAuthorArchive", {
  NAME: "name",
  COLOR: "color",
  PUBLIC_ID: "public_id",
  IS_PUBLIC_AUTHOR: "is_public_author",
  PUBLIC_IDS: "public_ids",
});

/** TSK.AnnotationAuthorStorageArchive: annotation_author = 1. */
const AuthorStorageFields = { AUTHORS: 1 } as const;

/** TSP.Date: seconds = 1, from 2001-01-01. */
const DateFields = { SECONDS: 1 } as const;

/** Everything a reader can say about one comment. */
export interface CommentInfo {
  start: number;
  end: number;
  text: string;
  /** The `TSWP.HighlightArchive` making the words show highlighted. */
  highlightId: bigint;
  /** The `TSD.CommentStorageArchive` holding the text. */
  commentStorageId: bigint;
  authorId: bigint | undefined;
  authorName: string | undefined;
  created: Date | undefined;
  /** Threaded replies, which this library reads but does not create. */
  replyCount: number;
}

export interface AddCommentOptions {
  /**
   * Author for the comment. An identifier picks an existing
   * `TSK.AnnotationAuthorArchive`; a name reuses the author with that name
   * or creates one. Omitted, the document's first existing author is used,
   * because that is who the apps attribute a new comment to.
   */
  author?: bigint | string;
  /** Defaults to now. */
  created?: Date;
}

/** Every annotation author the document knows. */
export function authorsOf(store: ObjectStore): IwaObject[] {
  const out: IwaObject[] = [];
  for (const { obj } of store.allObjects()) {
    if (obj.type === COMMENT_TYPE.AUTHOR) out.push(obj);
  }
  return out;
}

/** The document's author list, which a new author must be registered in. */
function authorStorage(store: ObjectStore): IwaObject | undefined {
  for (const { obj } of store.allObjects()) {
    if (obj.type === COMMENT_TYPE.AUTHOR_STORAGE) return obj;
  }
  return undefined;
}

/**
 * Resolve the author a new comment should be attributed to.
 *
 * Reuse comes first at every step: by identifier, then by name, then the
 * document's existing author. Only a name that matches nobody creates a
 * new archive — and that one is registered in the author list, or the apps
 * show a comment whose commenter is not in the document's roster.
 */
export function resolveAuthor(
  store: ObjectStore,
  component: Component,
  author: bigint | string | undefined,
): IwaObject {
  const existing = authorsOf(store);
  if (typeof author === "bigint") {
    const found = store.object(author);
    if (found?.type !== COMMENT_TYPE.AUTHOR) {
      throw new RangeError(`object ${author} is not a TSK.AnnotationAuthorArchive`);
    }
    return found;
  }
  if (typeof author === "string") {
    const byName = existing.find((a) => a.message.getString(AuthorFields.NAME) === author);
    if (byName) return byName;
    return createAuthor(store, component, author);
  }
  // No author given and none in the document: create one rather than write
  // an authorless comment. All corpus comments carry an author, and a
  // comment without one is the shape Pages for iOS showed as an empty
  // placeholder — the bubble exists, the text never displays. The ladder
  // base was exactly this case: a roster wired to the document root with
  // zero authors in it.
  return existing[0] ?? createAuthor(store, component, "cupertino-files");
}

/** Create an author and add them to the document's roster. */
export function createAuthor(
  store: ObjectStore,
  component: Component,
  name: string,
): IwaObject {
  const message = RawMessage.create();
  message.setString(AuthorFields.NAME, name);
  // The colour is not decoration. Both corpus authors carry the identical
  // TSP.Color — the comment yellow, r 0.980 g 0.937 b 0.353 — and a
  // name-only author was the difference between "comment renders" and
  // "Pages crashes on open": the comment UI draws the author's tint.
  // writeColor reproduces Apple's bytes for it exactly.
  message.setMessage(
    AuthorFields.COLOR,
    writeColor({ r: 0.9803921580314636, g: 0.9372549057006836, b: 0.3529411852359772, space: "srgb" }),
  );
  // Explicit false, as both corpus authors write it.
  message.setBool(AuthorFields.IS_PUBLIC_AUTHOR, false);
  // Left unset deliberately: `public_id` identifies an iCloud account, and
  // inventing one would attribute the comment to an account that is not
  // this person's. One corpus author carries it, the other does not.
  const object = store.createObject(COMMENT_TYPE.AUTHOR, component);
  object.setMessageBytes(message.toBytes());

  const roster = authorStorage(store);
  if (roster) {
    roster.message.addMessage(AuthorStorageFields.AUTHORS, makeRef(object.identifier));
    roster.message.markDirty();
    // No setObjectReferences: both corpus rosters list their author and
    // declare refs=[]. The container rule, in the direction this project
    // keeps relearning — declaring what Apple leaves undeclared is not
    // extra safety, it is a shape no real document has.
  }
  return object;
}

/**
 * Build the comment-storage and highlight objects for one comment.
 *
 * Returns both, because the caller has to anchor the highlight in a text
 * table and only it knows where.
 */
export function buildComment(
  store: ObjectStore,
  component: Component,
  text: string,
  options: AddCommentOptions = {},
): { highlight: IwaObject; commentStorage: IwaObject; author: IwaObject } {
  const author = resolveAuthor(store, component, options.author);

  const storageMessage = RawMessage.create();
  storageMessage.setString(CommentStorageFields.TEXT, text);
  const date = RawMessage.create();
  date.setDouble(DateFields.SECONDS, ((options.created ?? new Date()).getTime() - APPLE_EPOCH_MS) / 1000);
  storageMessage.setMessage(CommentStorageFields.CREATION_DATE, date);
  storageMessage.setMessage(CommentStorageFields.AUTHOR, makeRef(author.identifier));

  const commentStorage = store.createObject(COMMENT_TYPE.COMMENT_STORAGE, component);
  commentStorage.setMessageBytes(storageMessage.toBytes());
  commentStorage.setObjectReferences([author.identifier]);

  const highlightMessage = RawMessage.create();
  highlightMessage.setMessage(HighlightFields.COMMENT_STORAGE, makeRef(commentStorage.identifier));
  // Every highlight in the corpus carries one; the apps match the text
  // attribute to its archive through this string.
  highlightMessage.setString(HighlightFields.TEXT_ATTRIBUTE_UUID, randomUuid());

  const highlight = store.createObject(COMMENT_TYPE.HIGHLIGHT, component);
  highlight.setMessageBytes(highlightMessage.toBytes());
  highlight.setObjectReferences([commentStorage.identifier]);

  return { highlight, commentStorage, author };
}

/** Read a `TSD.CommentStorageArchive`. */
export function readCommentStorage(
  store: ObjectStore,
  object: IwaObject,
): Omit<CommentInfo, "start" | "end" | "highlightId"> | undefined {
  if (object.type !== COMMENT_TYPE.COMMENT_STORAGE) return undefined;
  const authorId = refId(object.message, CommentStorageFields.AUTHOR);
  const seconds = object.message
    .getMessage(CommentStorageFields.CREATION_DATE)
    ?.getDouble(DateFields.SECONDS);
  return {
    text: object.message.getString(CommentStorageFields.TEXT) ?? "",
    commentStorageId: object.identifier,
    authorId,
    authorName:
      authorId !== undefined
        ? store.object(authorId)?.message.getString(AuthorFields.NAME)
        : undefined,
    created: seconds === undefined ? undefined : new Date(APPLE_EPOCH_MS + seconds * 1000),
    replyCount: object.message.getMessages(CommentStorageFields.REPLIES).length,
  };
}
