# RB_SLU_T2 Changelog

- Added a viewport-focused line label audit command: `RIA.debug.lineLabelsViewport()`.
- Added a viewport-focused txt download command: `RIA.debug.lineLabelsViewportTxt()`.
- Split generic `BlockedStep=viewport` into viewport subtypes such as anchor outside viewport, label rect outside viewport, oversized label rect, path slice outside viewport, source-path limitation, step too small, and buffer-too-small cases.
- Added per-attempt chainage-search viewport diagnostics, including anchor point, label rect, overflow values, path slice bounds, path inside ratio, source path kind, label span, and effective step.
- Extended the existing T1 line label audit rows with viewport failure summary fields.
- Does not change label placement, collision, SVG rendering, candidate generation, fallback, or style behavior.
