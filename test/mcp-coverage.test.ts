/**
 * The MCP surface cannot silently go stale.
 *
 * `tool-docs.generated.ts` is a census of every public method on the
 * agent-facing classes, extracted from the API by
 * `scripts/generate-tool-docs.ts` (CI runs its `--check`). This suite
 * closes the loop: every method is either tagged `@agentTool` — in which
 * case the server must actually serve that tool, with the API's own doc
 * text — or ledgered below with a reason. A new public method fails here
 * until someone decides: expose it, or say why not. The decision is the
 * point; the failure is just the reminder.
 */
import { describe, expect, it } from "./harness.ts";
import { AGENT_SURFACE, TOOL_DOCS } from "../src/mcp/tool-docs.generated.ts";
import { COMPOSITE_TOOLS, TOOLS } from "../src/mcp/server.ts";

const READ =
  "read path — served by describe_document, read_table, read_text or list_formulas, or by the API directly";
const PLUMBING = "plumbing the server performs itself (loading, saving, auto-detection)";

/** Public API that is deliberately not an MCP tool, and why. */
const NOT_EXPOSED: ReadonlyMap<string, string> = new Map([
  // Loaders and savers — the server's own machinery.
  ["IWorkDocument.open", PLUMBING],
  ["IWorkDocument.save", PLUMBING],
  ["IWorkDocument.compact", PLUMBING],
  ["PagesDocument.load", PLUMBING],
  ["PagesDocument.blankFrom", PLUMBING],
  ["NumbersDocument.load", PLUMBING],
  ["NumbersDocument.blankFrom", PLUMBING],
  ["KeynoteDocument.load", PLUMBING],
  ["KeynoteDocument.blankFrom", PLUMBING],

  // Read surfaces the read tools compose over.
  ["IWorkDocument.allText", READ],
  ["IWorkDocument.charts", READ],
  ["IWorkDocument.compatibility", READ],
  ["IWorkDocument.compatibilitySummary", READ],
  ["IWorkDocument.drawables", READ],
  ["IWorkDocument.images", READ],
  ["IWorkDocument.object", READ],
  ["IWorkDocument.stats", READ],
  ["IWorkDocument.stylesheets", READ],
  ["IWorkDocument.tables", READ],
  ["IWorkDocument.textStorages", READ],
  ["IWorkDocument.typeNameOf", READ],
  ["KeynoteDocument.allNotes", READ],
  ["KeynoteDocument.masterSlides", READ],
  ["KeynoteDocument.noteStorages", READ],
  ["KeynoteDocument.presentation", READ],
  ["KeynoteDocument.presentedSlides", READ],
  ["KeynoteDocument.slideCount", READ],
  ["KeynoteDocument.slides", READ],
  ["KeynoteDocument.slideSize", READ],
  ["NumbersDocument.sheetContainer", READ],
  ["NumbersDocument.sheets", READ],
  ["NumbersDocument.tables", READ],
  ["NumbersDocument.tablesOnSheet", READ],
  ["PagesDocument.allLinks", READ],
  ["PagesDocument.attachments", READ],
  ["PagesDocument.bookmarks", READ],
  ["PagesDocument.comments", READ],
  ["PagesDocument.find", READ],
  ["PagesDocument.floatingDrawablePages", READ],
  ["PagesDocument.floatingDrawables", READ],
  ["PagesDocument.footnotes", READ],
  ["PagesDocument.links", READ],
  ["PagesDocument.listedParagraphStyles", READ],
  ["PagesDocument.listStyles", READ],
  ["PagesDocument.pageSetup", READ],
  ["PagesDocument.paragraph", READ],
  ["PagesDocument.paragraphs", READ],
  ["PagesDocument.paragraphStyles", READ],
  ["PagesDocument.range", READ],
  ["PagesDocument.sections", READ],
  ["PagesDocument.smartFields", READ],
  ["PagesDocument.textBoxes", READ],
  ["TableModel.activeCategories", READ],
  ["TableModel.bandStyle", READ],
  ["TableModel.bandTextStyle", READ],
  ["TableModel.categories", READ],
  ["TableModel.cellControl", READ],
  ["TableModel.cellFormat", READ],
  ["TableModel.cellFormatting", READ],
  ["TableModel.cellFormula", READ],
  ["TableModel.cellFormulaDetail", READ],
  ["TableModel.cells", READ],
  ["TableModel.cellStyle", READ],
  ["TableModel.cellStyleId", READ],
  ["TableModel.cellText", READ],
  ["TableModel.cellValue", READ],
  ["TableModel.columnWidth", READ],
  ["TableModel.conditionalRuleId", READ],
  ["TableModel.conditionalRules", READ],
  ["TableModel.conditionalStyleKey", READ],
  ["TableModel.conditionalStyleSet", READ],
  ["TableModel.conditionalStyleSets", READ],
  ["TableModel.controlKey", READ],
  ["TableModel.controls", READ],
  ["TableModel.filterRules", READ],
  ["TableModel.filterSets", READ],
  ["TableModel.formulaArchiveAt", READ],
  ["TableModel.formulaId", READ],
  ["TableModel.grid", READ],
  ["TableModel.isColumnHidden", READ],
  ["TableModel.isCovered", READ],
  ["TableModel.isRowHidden", READ],
  ["TableModel.mergeAt", READ],
  ["TableModel.merges", READ],
  ["TableModel.richTextStorage", READ],
  ["TableModel.rowHeight", READ],
  ["TableModel.staleCategoryGroups", READ],
  ["TableModel.tableStyle", READ],
  ["TableModel.uidMap", READ],
  ["TableModel.undecodedPreBncCells", READ],

  // Write surfaces folded into an existing tool's semantics.
  ["TableModel.clearCell", "set_cells with a null value clears a cell"],
  ["TableModel.clearAllCells", "set_cells covers it cell by cell; a whole-table wipe is not a tool an agent should reach for lightly"],
  ["TableModel.setCells", "set_cells takes the same list shape"],
  ["TableModel.setRow", "set_cells expresses a row as cells with a shared row index"],
  ["TableModel.setCellFormatting", "format_cells wraps the range variant; a 1x1 block is the single-cell form"],
  ["TableModel.clearFormula", "writing a value over the cell (set_cells) is the app's own convert-to-value"],
  ["PagesDocument.insertText", "replace_text and append_paragraph cover agent-shaped text edits; raw offsets do not travel well over JSON"],
  ["PagesDocument.deleteRange", "same offset-addressing concern as insertText; replace_text with an empty replacement deletes"],

  // Not exposed yet, each for a stated reason.
  ["KeynoteDocument.setPresentation", "advanced presentation settings; needs a designed schema before it is a tool"],
  ["NumbersDocument.removeTable", "addressed by object ids, not names; the name-addressed adapter is future work"],
  ["PagesDocument.createParagraphStyle", "style creation wants a designed schema (character + paragraph bags); apply-by-name is the common case and append_paragraph has it"],
  ["PagesDocument.setParagraphStyle", "paragraph addressing over JSON (by index) is error-prone; future find-based adapter"],
  ["PagesDocument.setListStyle", "list styling needs the same find-based design work"],
  ["PagesDocument.unlistParagraphStyle", "style-management edge case, not an editing task"],
  ["PagesDocument.insertSectionBreak", "section semantics need more than a position to be safe over JSON"],
  ["PagesDocument.insertInlineImage", "image bytes do not travel well as JSON tool arguments; the API takes them directly"],
  ["TableModel.setCellControl", "control creation is app-unverified (see docs/BLOCKERS.md); the tool waits for the app's word"],
  ["TableModel.setPopupMenu", "same app-unverified class as setCellControl"],
  ["TableModel.removeCellControl", "paired with control creation; ships with it"],
  ["TableModel.setConditionalRules", "all six comparison codes are measured, so a tool is unblocked; its JSON schema (operator + operand + styles) is still to be designed"],
  ["PagesDocument.placeholders", "ships as a placeholder tool trio (list/fill/define) once the schemas are designed"],
  ["PagesDocument.fillPlaceholder", "part of the placeholder tool trio; fill-by-index needs the list tool beside it"],
  ["PagesDocument.defineAsPlaceholder", "part of the placeholder tool trio; range addressing over JSON wants the find-based design"],
  ["PagesDocument.applyEdits", "raw offsets over JSON invite stale-snapshot mistakes; replace_text covers the common case until a find-integrated batch design"],
  ["PagesDocument.characterFormattingAt", "verification reader; the read tools cover agent needs"],
  [
    "PagesDocument.paragraphStylesInUse",
    "verification reader for build scripts; describe_document already reports the style vocabulary an agent needs",
  ],
  ["TableModel.setConditionalStyleKey", "internal plumbing of the conditional-rule path"],
  ["TableModel.regroupCategories", "category regrouping needs category context an agent gets no other tool for yet"],
]);

describe("the MCP tool registry stays bound to the API", () => {
  it("serves every @agentTool tag, and only knows tools that exist", () => {
    const served = new Set(TOOLS.map((t) => t.name));
    for (const tool of TOOL_DOCS.keys()) {
      expect(`${tool} served: ${served.has(tool)}`).toBe(`${tool} served: true`);
    }
    for (const tool of TOOLS) {
      const bound = TOOL_DOCS.has(tool.name);
      const composite = COMPOSITE_TOOLS.includes(tool.name);
      expect(`${tool.name} bound or composite: ${bound || composite}`).toBe(
        `${tool.name} bound or composite: true`,
      );
      expect(`${tool.name} both: ${bound && composite}`).toBe(`${tool.name} both: false`);
      // Bound tools carry the API's own words — the docblock is the
      // description's prefix, so the two cannot say different things.
      if (bound) {
        const first = TOOL_DOCS.get(tool.name)![0]!;
        const lead =
          TOOL_DOCS.get(tool.name)!.length === 1
            ? first.summary
            : `${first.api.split(".")[1]}: ${first.summary}`;
        expect(`${tool.name} description carries the API doc: ${tool.description.startsWith(lead)}`).toBe(
          `${tool.name} description carries the API doc: true`,
        );
      }
    }
  });

  it("has a decision on record for every public method", () => {
    const served = new Set(TOOLS.map((t) => t.name));
    const undecided: string[] = [];
    for (const { api, tool } of AGENT_SURFACE) {
      if (tool !== null) {
        if (!served.has(tool)) undecided.push(`${api} tagged ${tool}, which no tool serves`);
        if (NOT_EXPOSED.has(api)) undecided.push(`${api} is both tagged and ledgered`);
      } else if (!NOT_EXPOSED.has(api)) {
        undecided.push(`${api} — expose it (@agentTool) or ledger it here with a reason`);
      }
    }
    expect(`undecided: ${undecided.join(" | ")}`).toBe("undecided: ");

    // And no dead ledger entries: everything listed must still exist.
    const census = new Set(AGENT_SURFACE.map((e) => e.api));
    const dead = [...NOT_EXPOSED.keys()].filter((api) => !census.has(api));
    expect(`dead ledger entries: ${dead.join(" ")}`).toBe("dead ledger entries: ");
  });
});
