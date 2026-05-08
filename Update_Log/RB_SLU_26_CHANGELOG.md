# RB_SLU_26

Line Label Viewport Gate Correction.

- Added stable-first viewport temporary fallback candidates for `chainageSearch` line labels.
- `viewport-temp` candidates are generated only when stable candidates have no anchor inside the real viewport + buffer.
- `viewport-temp` candidates use the visible line segment midpoint and do not enter placement cache.
- Fixed line label viewport/collision gates with anchor-normalized compact text rects.
- Kept raw glyph/textPath metrics rects for diagnostics only.
- Expanded T2 audit with rawRect/normalizedRect/rectSource/rawRectImplausible/viewportTempBase fields.
- Preserved chainageSearch strict SVG and failure-hide behavior.
- Did not modify polygon label candidate logic or `labelGeoAnchorCache.ts`.
