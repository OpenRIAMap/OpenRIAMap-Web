# RB_EDO_2

- Fixed the FLR workflow ID assembly so floor unit IDs now follow the displayed `worldPrefix + FLR + optional category abbreviation + field abbreviation` pattern.
- Kept the FLR `BuildingID` selector scoped to BUD + STB candidates while improving ID / Name field resolution.
- Added broader common ID / Name fallback support for workflow search selectors without changing their existing search scopes or write-back targets.
- Reworked workflow search pools into layered runtime caches:
  - `staticBasePool` is generated per world / search configuration / dataset version.
  - `committedOverlayPool` is generated from current layer-manager committed features.
  - committed layer candidates override static candidates with the same ID.
  - delete-marked feature IDs are excluded from workflow search results across both static and committed sources.
- Added core-field fingerprint handling for committed workflow search candidates, with non-core-field selectors rebuilding only the committed overlay pool instead of rebuilding the static base pool.
- Added a delayed local workflow search-pool loading overlay when search-pool preparation exceeds 1 second.
- Added current layer-manager committed features to workflow selector search results, allowing newly drawn or imported features to be selected before temporary mounting.
- Added temporary-mount picture synchronization from the current layer-manager picture bindings.
- Preserved the current picture order at the moment temporary mounting is executed.
- Added temporary-mounted picture registration so feature cards can prioritize temporary-mounted pictures before repository/public picture lookup.
- Fixed BUD polygon interaction so BUD feature cards are no longer opened by clicking the polygon body.
- Preserved BUD point / label card-opening behavior while making BUD polygon paths non-interactive.
- Added `SmallDraggablePanel` for compact desktop floating panels.
- Changed the desktop floor-view selector to use the small draggable panel and moved its default position lower.
- Restricted the desktop floor-view selector drag handle to the title/building-name area, keeping floor buttons clickable.
- Kept mobile floor-view selector behavior unchanged.
- Moved left-side desktop panels such as feature cards, navigation, about, settings, attribute query, and players lower to avoid overlapping the left toolbar.
- Adjusted the vector-import panel default desktop position so it opens beside the main mapping panel.
- Reworked the layer-manager panel height strategy:
  - replaced fixed estimated list height with measured available height;
  - allowed the panel to shrink when content is short;
  - preserved internal vertical and horizontal scrolling when content reaches the height limit;
  - retained the synchronized top horizontal scrollbar.
- Improved road and planning layer button active-state visibility.
- Adjusted the planning layer active tone to a lighter slate style so it remains visually consistent with the other toolbar buttons.
- Did not modify the RB_EDO_1 feature-share link logic, mobile bottom-sheet logic, line-label placement, polygon geo-anchor scoring, or the main DraggablePanel implementation.

Validation:
- `node node_modules/typescript/bin/tsc -b --pretty false` passed for RB_EDO_2.
- `node node_modules/typescript/bin/tsc -b --pretty false` passed after RB_EDO_2_F1 follow-up fixes.
