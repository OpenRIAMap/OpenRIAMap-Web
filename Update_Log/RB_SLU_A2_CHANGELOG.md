# RB_SLU_A2

- Added canonical center-first revalidation for `structureLabel` labels using `center` placement.
- Prevents cached `W` / `E` / `N` / `S` layout candidates from overriding `C` when `C` is valid.
- Keeps cached non-center candidates as fallbacks after `C` fails viewport, density, or collision checks.
- Removed the STB `Stations.length >= 2` label-text clamp.
- STB label text now uses non-empty `Name` outside floor view.
- Preserved STB / BUD density, collision, optional role, hide policy, and label style.
- Improved polygon audit blocked-step reporting so empty label text is not overwritten by a generic geo-anchor failure.
- Did not modify ISG `surfaceLabel`, line labels, density logic, collision logic, geo-anchor scoring, or render styles.
