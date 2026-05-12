# RB_EDO_3_T1

- Optimized BUD/STB structure labels with a two-layer black text + white halo rendering approach.
- Preserved `structure-label-xx` size suffix parsing so font size and halo scale remain adjustable through the existing style key suffix.
- Changed structure-label halo scaling to use font-size-based offset and blur calculations, keeping small labels readable without producing an overly thick white outline.
- Increased the black structure-label text weight for clearer readability on complex map backgrounds.
- Kept the existing black-text / white-halo visual direction, transparent background, label placement, collision behavior, zoom thresholds, and interaction logic unchanged.
- Did not modify ISG/NGF/LAD labels, railway labels, road labels, station labels, or other label style families.
