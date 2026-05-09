RB_SLU_SF2:
- added dotAnchorMode for label rendering and layout;
- low-zoom BUD/STB dot labels now anchor the dot center at the selected candidate point;
- label text is rendered to the right of the anchored dot while preserving the current structure-label text style;
- updated layout viewport/collision rects for anchored-dot labels;
- added dotAnchorMode to clickable and non-clickable div label marker creation paths;
- included dotAnchorMode in marker reuse keys to avoid reusing old inline-dot markers;
- did not change BUD/STB zoom policy, priority list, high-zoom polygon mode, floor memory, or floor ordering;
- did not modify line labels, ISG surface labels, polygon geo-anchor scoring, density, or collision rules.
