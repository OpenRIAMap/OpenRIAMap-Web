# RB_EDO_6_F2 Change Log

Baseline: `OpenRIAMap-Web_RB_EDO_6_F1.zip`

## Scope

This patch fixes RelayPackage import behavior and ROD default classification hydration.

## Changes

### 1. RelayPackage single wrapper directory support

`parseRelayPackageZip()` now detects and strips one temporary top-level package directory when the real package contents are nested as:

```text
RelayPackage_xxx/
  Data_Spilt/
  Picture/
  Delete.json
  INDEX.json
  Tool_Refresh/
```

The wrapper is only used during parsing. Imported picture relative paths are normalized back to standard package paths, so future exports still use the standard root-level package layout.

### 2. RelayPackage-like ZIP no longer falls back to legacy ZIP JSON import

If a ZIP is detected as RelayPackage-like but cannot produce importable Data_Spilt entries, pictures, or delete marks, the importer now reports a standard package parse failure and stops. It no longer falls through into legacy ZIP JSON import, preventing `INDEX.json`, `Delete.json`, `Picture/`, and `Tool_Refresh/` from being treated as ordinary feature JSON input.

Non-RelayPackage ZIP files can still use the legacy ZIP JSON batch import fallback.

### 3. ROD hydrate no longer fabricates SKind from Kind

Road (`ROD`) hydration now keeps missing `SKind` as an empty optional value instead of defaulting it to `Kind`.

- Input `{ Kind: "NOM" }` stays as `Kind: "NOM"`.
- Explicit `SKind` values are preserved, including cases where `SKind === Kind`.

## Files

- `src/components/Mapping/core/relayPackageParser.ts`
- `src/components/Mapping/core/MeasuringModule.tsx`
- `src/components/Common/featureFormats.ts`
