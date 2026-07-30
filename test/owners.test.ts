/**
 * Calc-engine formula owners — the map that names a cross-table reference.
 *
 * A formula reaching into another table stores the target as an owner UUID,
 * not as anything resembling a table. Before this map existed the reference
 * could only render as `OTHER_TABLE::A2`, because rendering a bare `A2`
 * would read as a cell in the formula's *own* table and be actively wrong.
 *
 * The mapping is `TSCE.FormulaOwnerDependenciesArchive`: entries carrying a
 * `formula_owner` reference name their object, and derived entries reach it
 * through `base_owner_uid`.
 */
import { readFileSync, readdirSync } from "node:fs";
import { describe, expect, it } from "./harness.ts";
import {
  FormulaOwnerRegistry,
  IWorkDocument,
  OwnerKind,
  ownerKey,
  readCfUid,
  readOwnerUid,
  tablesOf,
} from "../src/index.ts";
import { RawMessage } from "../src/base/protobuf.ts";

const FIXTURES = new URL("../fixtures/", import.meta.url);
const fixtureNames = readdirSync(FIXTURES).filter((name) => /\.(pages|numbers|key)$/.test(name));
const bytes = (name: string) => new Uint8Array(readFileSync(new URL(name, FIXTURES)));

/** The fixture whose tables were all copied from one source table. */
const CATEGORIES = "numbers-parser-v26.0-categories.numbers";

function open(name: string): IWorkDocument | undefined {
  try {
    return IWorkDocument.open(bytes(name));
  } catch {
    return undefined; // iWork '09 and friends are rejected on purpose
  }
}

describe("formula owner registry", () => {
  it("resolves owners to tables, and only to tables", () => {
    let resolved = 0;
    let total = 0;
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      const registry = new FormulaOwnerRegistry(document.store);
      const tableIds = new Set(
        tablesOf(document.store).flatMap((table) =>
          [table.object.identifier, table.infoObject?.identifier].filter(
            (id): id is bigint => id !== undefined,
          ),
        ),
      );
      for (const owner of registry.all()) {
        total++;
        if (owner.ownerId === undefined) continue;
        resolved++;
        // Every owner that names anything names a table.
        expect(`${name}: owner ${owner.ownerId} is a table`).toBe(
          tableIds.has(owner.ownerId)
            ? `${name}: owner ${owner.ownerId} is a table`
            : `${name}: owner ${owner.ownerId} is NOT a table`,
        );
      }
    }
    expect(total).toBeGreaterThan(400);
    expect(resolved).toBeGreaterThan(400);
  });

  it("names every table that owns formulas", () => {
    const document = open(CATEGORIES)!;
    const registry = new FormulaOwnerRegistry(document.store);
    const named = new Set(
      registry.all().map((owner) => owner.tableName).filter((n): n is string => n !== undefined),
    );
    for (const table of tablesOf(document.store)) {
      expect(`${table.name} named`).toBe(
        named.has(table.name!) ? `${table.name} named` : `${table.name} NOT named`,
      );
    }
  });

  it("reaches a table through base_owner_uid, not just directly", () => {
    // The derived owners — merges, conditional styles, hidden states — carry
    // no reference of their own. Following the base is what names them.
    const document = open(CATEGORIES)!;
    const registry = new FormulaOwnerRegistry(document.store);
    const derived = registry
      .all()
      .filter(
        (owner) =>
          owner.kind !== OwnerKind.TABLE &&
          owner.kind !== OwnerKind.DOCUMENT &&
          owner.base !== undefined,
      );
    expect(derived.length).toBeGreaterThan(50);
    expect(derived.filter((owner) => owner.tableName !== undefined).length).toBe(derived.length);
  });

  it("recognises the document-level owner rather than calling it unresolved", () => {
    // Every corpus file carries exactly one, with the same hardcoded
    // identity: uid 666 derived from base 466. It names no table because it
    // is not one.
    let seen = 0;
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      const registry = new FormulaOwnerRegistry(document.store);
      const documentOwners = registry
        .all()
        .filter((owner) => owner.kind === OwnerKind.DOCUMENT);
      for (const owner of documentOwners) {
        seen++;
        expect(`${name}: uid ${owner.uid.lo}:${owner.uid.hi}`).toBe(`${name}: uid 666:0`);
        expect(FormulaOwnerRegistry.isDocumentOwner(owner.uid)).toBe(true);
        expect(owner.tableName).toBe(undefined);
      }
      // It is excluded from the unresolved list, which is about real gaps.
      expect(registry.unresolved().some((o) => o.kind === OwnerKind.DOCUMENT)).toBe(false);
    }
    expect(seen).toBeGreaterThan(15);
  });

  it("records the arithmetic derivation without depending on it", () => {
    // Current apps compute a derived uid as base + owner_kind. Older files
    // use unrelated random UUIDs, so resolution follows the stored base —
    // but the pattern is worth reporting where it holds.
    let holds = 0;
    let withBase = 0;
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      for (const owner of new FormulaOwnerRegistry(document.store).all()) {
        if (owner.base === undefined) continue;
        withBase++;
        if (owner.derivedByArithmetic) holds++;
      }
    }
    expect(withBase).toBeGreaterThan(300);
    // It holds for most, and demonstrably not all — which is exactly why
    // the resolver does not rely on it.
    expect(holds).toBeGreaterThan(300);
    expect(holds).not.toBe(withBase);
  });
});

describe("owner kinds", () => {
  /**
   * Each kind is named because a field somewhere *uses* it. These tests
   * re-derive the mapping from the files rather than trusting the table, so
   * a wrong name fails here rather than misleading a reader.
   */
  it("matches each named kind to the field that uses it", () => {
    const usage = new Map<string, Map<number, number>>();
    const note = (label: string, kind: number | undefined): void => {
      if (kind === undefined) return;
      if (!usage.has(label)) usage.set(label, new Map());
      const counts = usage.get(label)!;
      counts.set(kind, (counts.get(kind) ?? 0) + 1);
    };
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      const registry = new FormulaOwnerRegistry(document.store);
      for (const table of tablesOf(document.store)) {
        const model = table.object.message;
        note(
          "conditionalStyle",
          registry.lookup(readCfUid(model.getMessage(39)))?.kind,
        );
        note("haunted", registry.lookup(readOwnerUid(model.getMessage(84)?.getMessage(1)))?.kind);
        note("merge", registry.lookup(readCfUid(model.getMessage(47)?.getMessage(1)))?.kind);
      }
    }
    const only = (label: string): number[] => [...(usage.get(label) ?? new Map()).keys()];
    expect(only("conditionalStyle")).toEqual([OwnerKind.CONDITIONAL_STYLE]);
    expect(only("haunted")).toEqual([OwnerKind.HAUNTED]);
    expect(only("merge")).toEqual([OwnerKind.MERGE]);
  });

  it("names a merge owner as the table it sits on", () => {
    // The strongest single check on the whole resolution: a merge owner
    // must resolve to the very table whose model carries it.
    let checked = 0;
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      const registry = new FormulaOwnerRegistry(document.store);
      for (const table of tablesOf(document.store)) {
        const owner = registry.lookup(
          readCfUid(table.object.message.getMessage(47)?.getMessage(1)),
        );
        if (!owner?.tableName) continue;
        expect(`${name}: ${owner.tableName}`).toBe(`${name}: ${table.name}`);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(10);
  });

  it("labels the kinds it has established and leaves the rest unnamed", () => {
    const named = new Set<number>();
    const unnamed = new Set<number>();
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      for (const owner of new FormulaOwnerRegistry(document.store).all()) {
        (owner.kindName === undefined ? unnamed : named).add(owner.kind);
      }
    }
    expect([...named].sort((a, b) => a - b)).toEqual([1, 3, 4, 5, 8, 9, 11, 35, 200]);
    // Four kinds occur with no field in the protos pointing at them. They
    // stay unnamed rather than guessed — see src/tsce/owners.ts.
    expect([...unnamed].sort((a, b) => a - b)).toEqual([6, 7, 10, 12]);
  });
});

describe("cross-table formula references", () => {
  it("renders a real table name instead of a placeholder", () => {
    const document = open(CATEGORIES)!;
    const table = tablesOf(document.store).find((t) => t.name === "Categories")!;
    const cross = table.formulas().filter((f) => f.formula.includes("::"));
    expect(cross.length).toBeGreaterThan(50);
    // Every categorised table was built from "Uncategorized", and the
    // formulas say so.
    expect(cross[0]!.formula.startsWith("=Uncategorized::")).toBe(true);
    expect(cross.some((f) => f.formula.includes("OTHER_TABLE"))).toBe(false);
  });

  it("names every cross-table reference in the corpus", () => {
    let named = 0;
    let unnamed = 0;
    for (const name of fixtureNames) {
      const document = open(name);
      if (!document) continue;
      for (const table of tablesOf(document.store)) {
        if (table.storageGeneration !== "v5") continue;
        for (const cell of table.cells()) {
          if (cell.value.type === "empty" || !cell.value.isFormula) continue;
          const detail = table.cellFormulaDetail(cell.row, cell.column);
          if (!detail?.hasCrossTableReferences) continue;
          if (detail.hasUnnamedCrossTables) unnamed++;
          else named++;
        }
      }
    }
    expect(named).toBeGreaterThan(1000);
    expect(unnamed).toBe(0);
  });

  it("quotes a table name that would not parse bare", () => {
    const document = open(CATEGORIES)!;
    const source = tablesOf(document.store).find((t) => t.name === "Uncategorized")!;
    source.name = "Q3 Results";

    const table = tablesOf(document.store).find((t) => t.name === "Categories")!;
    const formula = table.formulas().find((f) => f.formula.includes("::"))!;
    // A space would otherwise end the reference, so Apple quotes it.
    expect(formula.formula.includes("'Q3 Results'::")).toBe(true);
  });
});

describe("owner identities", () => {
  it("reads a CFUUID and a UUID as the same 128 bits", () => {
    // The AST writes four uint32 words; the calc engine writes two uint64s.
    // Looking one up in the other's map only works because they agree.
    const cf = RawMessage.create();
    cf.setVarint(2, 0x11223344);
    cf.setVarint(3, 0x55667788);
    cf.setVarint(4, 0x99aabbcc);
    cf.setVarint(5, 0xddeeff00);
    const uuid = RawMessage.create();
    uuid.setVarint(1, 0x5566778811223344n);
    uuid.setVarint(2, 0xddeeff0099aabbccn);

    expect(ownerKey(readCfUid(cf))).toBe(ownerKey(readOwnerUid(uuid)));
  });

  it("reads the 16-byte blob form too", () => {
    const packed = RawMessage.create();
    packed.setBytes(1, new Uint8Array([
      0x44, 0x33, 0x22, 0x11, 0x88, 0x77, 0x66, 0x55,
      0xcc, 0xbb, 0xaa, 0x99, 0x00, 0xff, 0xee, 0xdd,
    ]));
    const words = RawMessage.create();
    words.setVarint(2, 0x11223344);
    words.setVarint(3, 0x55667788);
    words.setVarint(4, 0x99aabbcc);
    words.setVarint(5, 0xddeeff00);
    expect(ownerKey(readCfUid(packed))).toBe(ownerKey(readCfUid(words)));
  });

  it("reads nothing from nothing", () => {
    expect(readCfUid(undefined)).toBe(undefined);
    expect(readOwnerUid(undefined)).toBe(undefined);
    expect(ownerKey(undefined)).toBe("");
  });
});
