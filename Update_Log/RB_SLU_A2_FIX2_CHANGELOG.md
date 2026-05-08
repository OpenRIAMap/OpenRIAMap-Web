# RB_SLU_A2_FIX2

- Tightened `resolveEffectiveDisplayAnchor()` to return `DisplayAnchorConfig | undefined` instead of `DisplayAnchorConfig | null | undefined`.
- Normalized the no-anchor case to `undefined`, matching `LabelRequest.displayAnchor`'s expected `Partial<DisplayAnchorConfig> | undefined` type.
- Fixed the `RuleDrivenLayer.tsx` compile error at the label request return object without changing label placement, anchor resolution, density, collision, or rendering behavior.
