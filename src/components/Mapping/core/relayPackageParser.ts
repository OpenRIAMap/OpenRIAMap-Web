import { createEmptyRelayPackageDraft, type RelayPackageDraft, type RelayPictureBindingItem } from './relayPackageDraft';

export type ParsedRelayPackage = {
  draft: RelayPackageDraft;
  jsonItems: any[];
  isRelayPackageLike: boolean;
  rootPrefix: string;
  parsedFileCount: number;
  parsedFeatureCount: number;
  parsedPictureCount: number;
  parsedDeleteCount: number;
};

function isIgnoredZipPath(path: string) {
  const normalized = String(path || '').replace(/\\/g, '/');
  const lower = normalized.toLowerCase();
  return (
    !normalized ||
    lower.endsWith('/.ds_store') ||
    lower === '.ds_store' ||
    lower.startsWith('__macosx/') ||
    lower.includes('/__macosx/')
  );
}

function stripTrailingSlash(path: string) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
}

function stripRootPrefix(path: string, rootPrefix: string) {
  const normalized = String(path || '').replace(/\\/g, '/').replace(/^\/+/, '');
  if (!rootPrefix) return normalized;
  return normalized.startsWith(rootPrefix) ? normalized.slice(rootPrefix.length) : normalized;
}

function getTopLevelName(path: string) {
  const normalized = stripTrailingSlash(path);
  const first = normalized.split('/').filter(Boolean)[0];
  return first || '';
}

function hasRelayPackageMarkers(relativePaths: string[]) {
  for (const raw of relativePaths) {
    const p = stripTrailingSlash(raw);
    if (!p) continue;
    const lower = p.toLowerCase();
    if (lower === 'index.json') return true;
    if (lower === 'delete.json') return true;
    if (lower.startsWith('data_spilt/')) return true;
    if (lower.startsWith('picture/')) return true;
    if (lower.startsWith('tool_refresh/')) return true;
  }
  return false;
}

function detectRelayPackageRootPrefix(paths: string[]) {
  const effectivePaths = paths
    .map((p) => String(p || '').replace(/\\/g, '/').replace(/^\/+/, ''))
    .filter((p) => p && !isIgnoredZipPath(p));

  if (hasRelayPackageMarkers(effectivePaths)) {
    return { isRelayPackageLike: true, rootPrefix: '' };
  }

  const topLevelNames = Array.from(new Set(effectivePaths.map(getTopLevelName).filter(Boolean)));
  if (topLevelNames.length !== 1) {
    return { isRelayPackageLike: false, rootPrefix: '' };
  }

  const rootPrefix = `${topLevelNames[0]}/`;
  const strippedPaths = effectivePaths.map((p) => stripRootPrefix(p, rootPrefix));
  if (hasRelayPackageMarkers(strippedPaths)) {
    return { isRelayPackageLike: true, rootPrefix };
  }

  return { isRelayPackageLike: false, rootPrefix: '' };
}

function parsePicturePath(path: string) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 5) return null;
  if (String(parts[0] || '').toLowerCase() !== 'picture') return null;
  const worldId = parts[1];
  const className = parts[2];
  if (parts.length === 5) {
    const id = parts[3];
    const filename = parts[4];
    return { worldId, className, kind: '', id, filename };
  }
  const kind = parts[3];
  const id = parts[4];
  const filename = parts[5];
  return { worldId, className, kind, id, filename };
}

export async function parseRelayPackageZip(file: File): Promise<ParsedRelayPackage> {
  let JSZip: any = null;
  try {
    // @ts-ignore
    JSZip = (await import('jszip')).default;
  } catch {
    throw new Error('缺少依赖 jszip，无法解析标准包');
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const entries = Object.values(zip.files) as any[];
  const fileEntries = entries.filter((entry) => !entry.dir) as any[];
  const { isRelayPackageLike, rootPrefix } = detectRelayPackageRootPrefix(
    fileEntries.map((entry) => String(entry.name || ''))
  );

  const draft = createEmptyRelayPackageDraft();
  const jsonItems: any[] = [];
  let parsedFileCount = 0;
  let parsedPictureCount = 0;
  let parsedDeleteCount = 0;

  for (const entry of fileEntries) {
    const originalPath = String(entry.name || '').replace(/\\/g, '/').replace(/^\/+/, '');
    if (isIgnoredZipPath(originalPath)) continue;
    const p = stripRootPrefix(originalPath, rootPrefix);
    if (!p) continue;
    const lower = p.toLowerCase();

    if (lower === 'index.json') {
      parsedFileCount += 1;
      const text = await entry.async('string');
      try {
        const meta = JSON.parse(text);
        draft.meta = {
          ...draft.meta,
          operator: String(meta.operator ?? ''),
          note: String(meta.note ?? ''),
          draftStatus: 'imported_package',
          updatedAt: String(meta.exportedAt ?? meta.updatedAt ?? new Date().toISOString()),
          packageVersion: meta.version ?? meta.packageVersion,
        };
      } catch {}
      continue;
    }

    if (lower === 'delete.json') {
      parsedFileCount += 1;
      const text = await entry.async('string');
      try {
        const obj = JSON.parse(text);
        draft.deleteMarks = Array.isArray(obj.items)
          ? obj.items.map((item: any) => {
              if (item && typeof item === 'object' && !Array.isArray(item)) {
                const ID = String(item.ID ?? item.id ?? '').trim();
                const Name = String(item.Name ?? item.name ?? '').trim();
                return ID ? { ID, Name } : null;
              }
              const ID = String(item ?? '').trim();
              return ID ? { ID, Name: '' } : null;
            }).filter(Boolean) as any
          : [];
        parsedDeleteCount = draft.deleteMarks.length;
      } catch {}
      continue;
    }

    if (lower.startsWith('data_spilt/') && lower.endsWith('.json')) {
      parsedFileCount += 1;
      const text = await entry.async('string');
      try {
        const item = JSON.parse(text);
        if (item && typeof item === 'object' && !Array.isArray(item)) jsonItems.push(item);
      } catch {}
      continue;
    }

    if (lower.startsWith('picture/')) {
      parsedFileCount += 1;
      const info = parsePicturePath(p);
      if (!info) continue;
      const blob = await entry.async('blob');
      const file = new File([blob], info.filename, { type: blob.type || 'application/octet-stream' });
      const pic: RelayPictureBindingItem = {
        uid: `${info.id}:${info.filename}`,
        originalName: info.filename,
        file,
        previewUrl: URL.createObjectURL(file),
        relativePath: p,
        order: (draft.picturesById[info.id]?.length ?? 0) + 1,
        source: 'imported',
      };
      draft.picturesById[info.id] = [...(draft.picturesById[info.id] ?? []), pic];
      parsedPictureCount += 1;
    }
  }

  return {
    draft,
    jsonItems,
    isRelayPackageLike,
    rootPrefix,
    parsedFileCount,
    parsedFeatureCount: jsonItems.length,
    parsedPictureCount,
    parsedDeleteCount,
  };
}
