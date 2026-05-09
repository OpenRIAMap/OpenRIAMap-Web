# RB_SLU_SF1

- Reworked BUD/STB structure labels into zoom-aware display modes.
- BUD/STB below zoomLevel 3 are hidden.
- BUD/STB at zoomLevel 3–5 use point+label mode with hidden polygon geometry.
- Added `src/components/Rules/priority/structureLabelPriority.ts` for low-zoom priority BUD/STB IDs.
- Priority BUD/STB labels receive higher low-zoom priority and C/N/S/E/W candidates while remaining below ISG priority.
- BUD/STB above zoomLevel 5 use unified STB-like structure label collision/density behavior; BUD/STB keep their original label style keys.
- BUD/STB labels no longer disappear solely because floor view is active.
- Added `src/components/Rules/rendering/order/floorDisplayOrder.ts` for common floor sorting and label formatting.
- Floor selector order is now top-to-bottom: 3F, 2F, 1F, G, B1F, B2F, B3F, with unknown floors last.
- The current browser session remembers the latest selected floor for the active building and restores it when re-entering the same floor view.
- Does not modify line label chainageSearch, polygon geo-anchor scoring, labelLayout internals, or ISG surfaceLabel logic.
