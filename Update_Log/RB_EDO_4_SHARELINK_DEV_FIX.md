# RB_EDO_4 Share Link Dev Fix

## Scope

This hotfix only updates the share-link consumption flow introduced in RB_EDO_4.

## Changes

- Preserve the parsed share-link target in an in-memory one-tick fallback before cleaning the URL.
- Allow React development StrictMode's second mount to recover the target after the URL has already been replaced with the main URL.
- Keep refresh-safe behavior: the fallback is memory-only and does not survive a browser refresh.

## Files

- `src/lib/featureShareLink.ts`
