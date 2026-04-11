import { createEmptyRelayPackageDraft, type RelayPackageDraft, type RelayPictureBindingItem } from './relayPackageDraft';

export type ParsedRelayPackage = {
  draft: RelayPackageDraft;
  jsonItems: any[];
};

function parsePicturePath(path: string) {
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 5) return null;
  if (parts[0] !== 'Picture') return null;
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
  const draft = createEmptyRelayPackageDraft();
  const jsonItems: any[] = [];

  for (const entry of entries) {
    if (entry.dir) continue;
    const p = String(entry.name || '');
    const lower = p.toLowerCase();

    if (lower === 'index.json') {
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
      } catch {}
      continue;
    }

    if (lower.startsWith('data_spilt/') && lower.endsWith('.json')) {
      const text = await entry.async('string');
      try {
        const item = JSON.parse(text);
        if (item && typeof item === 'object') jsonItems.push(item);
      } catch {}
      continue;
    }

    if (lower.startsWith('picture/')) {
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
    }
  }

  return { draft, jsonItems };
}
