# RB_EDO_3

- Fixed STB polygon-body interaction so station-building feature cards are no longer opened by clicking the polygon area.
- Preserved STB point / label card-opening behavior while making STB polygon paths non-interactive across the structure zoom modes.
- Updated the TRP special feature card so the Land / 所属地理单元 link displays the target ISG-NGF feature `Name` instead of the raw ID when the target can be resolved.
- Kept the TRP Land link jump target bound to the original target ID, preserving existing click-to-open behavior.
- Refined `SmallDraggablePanel` cursor behavior for the desktop floor-view selector:
  - hover over the drag area no longer changes the cursor;
  - the browser tooltip/title is no longer shown for the small panel root;
  - dragging uses a grabbing cursor state;
  - floor buttons remain outside the drag region and stay clickable.
- Removed the hover tooltip from the desktop floor-view building-name drag area.
- Stabilized BUD / STB structure-label rendering by replacing the previous coarse white text-shadow outline and dark drop shadow with the same stable 8-direction outline assembly used by the map text label system.
- Preserved the BUD / STB label format: black text, white outline, transparent background, same structure-label size keys, and same label interaction behavior.
- Did not modify RB_EDO_1 share-link behavior, RB_EDO_2 workflow search-pool caching, layer-manager height handling, temporary-mounted picture handling, mobile floor-view behavior, or the main DraggablePanel implementation.

Validation:
- `node node_modules/typescript/bin/tsc -b --pretty false` passed for RB_EDO_3.
