# RB_SLU_A1 Changelog

- Added a read-only polygon label audit console tool.
- Added `RIA.debug.polygonLabels()` for console inspection.
- Added `RIA.debug.polygonLabelsTxt()` for downloading a `.txt` polygon label audit report.
- Added support for `allCandidates`, `classCodes`, `onlyHidden`, `onlyDisplayed`, `includePadded`, `includeCollisionDetails`, and `includeDensityDetails` options.
- Reports polygon label displayed / hidden state and blocked step / reason.
- Reports polygon geometry bounds, screen area, selected geo anchor, anchor candidate kind, previous candidate reuse, and switch-threshold status.
- Reports layout candidate, density status, and collision status where available.
- Adds geo-anchor diagnostics from `labelGeoAnchorCache.ts` / `labelAnchor.ts` without changing candidate scoring or selection.
- Adds label layout diagnostics without changing placement, collision, density, rendering, or style behavior.
- Does not modify line label chainageSearch logic.
