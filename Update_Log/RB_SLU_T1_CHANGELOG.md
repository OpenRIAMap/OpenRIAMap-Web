# RB_SLU_T1 — Line Label Audit Console Tool

Baseline: `OpenRIAMap-Web_RB_SLU_25.zip`

## Scope

This patch adds a read-only line label audit tool for debugging current-viewport line-label display decisions.
It does not modify label placement, collision, candidate generation, rendering style, or map UI behavior.

## Added

- `RIA.debug.lineLabels()` console command.
  - Prints the current line-label audit snapshot to the browser console.
  - Returns the snapshot object for manual filtering, for example:
    - `RIA.debug.lineLabels().rows.filter(r => !r.displayed)`
    - `RIA.debug.lineLabels().rows.filter(r => r.classCode === "ROD")`

- `RIA.debug.lineLabelsTxt()` console command.
  - Downloads the current line-label audit snapshot as a `.txt` report.

- Current real-viewport line-feature audit rows, including:
  - ID / Name / Class / Kind / SKind / SKind2
  - expected viewport presence
  - expected label status
  - displayed status
  - blocked step and blocked reason
  - candidate id
  - chainage reposition diagnostics when available
  - glyph/textPath status when available
  - collision role / group / priority when available

## Files

- Added `src/components/Rules/debug/lineLabelAudit.ts`
- Added `src/types/riaDebug.d.ts`
- Modified `src/components/Rules/core/RuleDrivenLayer.tsx`

## Non-goals

- No display fixes.
- No collision or density changes.
- No candidate generation changes.
- No SVG eligibility changes.
- No polygon label changes.
