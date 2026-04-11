import { useEffect, useMemo, useRef, useState } from 'react';
import AppCard from '@/components/ui/AppCard';
import BlockingFullscreenModal from '@/components/Common/BlockingFullscreenModal';
import AppButton from '@/components/ui/AppButton';
import { ArrowDown, ArrowUp, ImagePlus, RotateCcw, Trash2, X } from 'lucide-react';
import type { RelayPictureBindingItem } from '@/components/Mapping/core/relayPackageDraft';

function clonePictures(pictures: RelayPictureBindingItem[]): RelayPictureBindingItem[] {
  return pictures
    .map((p) => ({ ...p }))
    .sort((a, b) => a.order - b.order)
    .map((p, idx) => ({ ...p, order: idx + 1 }));
}

export default function FeaturePictureBindingPanel(props: {
  open: boolean;
  title: string;
  pictures: RelayPictureBindingItem[];
  onClose: () => void;
  onConfirm: (pictures: RelayPictureBindingItem[]) => void;
}) {
  const { open, title, pictures, onClose, onConfirm } = props;
  const [draft, setDraft] = useState<RelayPictureBindingItem[]>([]);
  const [previewPic, setPreviewPic] = useState<RelayPictureBindingItem | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setDraft(clonePictures(pictures));
    setPreviewPic(null);
  }, [open, pictures]);

  useEffect(() => () => {
    draft.forEach((pic) => {
      if (pic.source === 'new' && pic.previewUrl?.startsWith('blob:')) {
        try { URL.revokeObjectURL(pic.previewUrl); } catch {}
      }
    });
  }, [draft]);

  const activeCount = useMemo(() => draft.filter((x) => !x.deleted).length, [draft]);

  if (!open) return null;

  const renumber = (list: RelayPictureBindingItem[]) => list.map((p, idx) => ({ ...p, order: idx + 1 }));

  const ACCEPTED_EXTENSIONS = ['jpg','jpeg','png','webp','bmp','gif','tif','tiff'];

  const addFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const next = [...draft];
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
      if (!ACCEPTED_EXTENSIONS.includes(ext)) continue;
      next.push({
        uid: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
        originalName: file.name,
        file,
        previewUrl: URL.createObjectURL(file),
        deleted: false,
        order: next.length + 1,
        source: 'new',
      });
    }
    setDraft(renumber(next));
  };

  const move = (index: number, delta: number) => {
    const next = [...draft];
    const ni = index + delta;
    if (ni < 0 || ni >= next.length) return;
    const tmp = next[index];
    next[index] = next[ni];
    next[ni] = tmp;
    setDraft(renumber(next));
  };

  const toggleDelete = (uid: string, deleted: boolean) => {
    setDraft((prev) => prev.map((p) => (p.uid === uid ? { ...p, deleted } : p)));
  };

  return (
    <BlockingFullscreenModal open={open}>
      <AppCard className="w-[720px] max-w-[94vw] overflow-hidden border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-800">{title}</h3>
          <AppButton onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" type="button">
            <X className="w-4 h-4" />
          </AppButton>
        </div>
        <div className="p-4 text-sm text-gray-700 space-y-4">
          <div
            className="rounded border border-dashed p-6 text-center text-gray-500 cursor-pointer hover:bg-gray-50"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); addFiles(e.dataTransfer.files); }}
            onClick={() => fileRef.current?.click()}
          >
            <div className="flex items-center justify-center gap-2 mb-2"><ImagePlus className="w-4 h-4" /><span>拖拽进入 / 点击上传图片</span></div>
            <div className="text-xs text-gray-400">支持 jpg / jpeg / png / webp / bmp / gif / tif / tiff；确认后才会写回图层管理</div>
            <input
              ref={fileRef}
              className="hidden"
              type="file"
              accept=".jpg,.jpeg,.png,.webp,.bmp,.gif,.tif,.tiff"
              multiple
              onChange={(e) => addFiles(e.target.files)}
            />
          </div>

          <div className="rounded border bg-gray-50 p-3">
            <div className="font-bold mb-2">当前已绑定图片（有效 {activeCount}）</div>
            <div className="max-h-[42vh] overflow-y-auto space-y-2">
              {draft.length === 0 ? <div className="text-gray-400">当前无已绑定图片</div> : draft.map((pic, idx) => (
                <div key={pic.uid} className={`flex items-center gap-3 rounded border bg-white p-2 ${pic.deleted ? 'opacity-50' : ''}`}>
                  <button
                    type="button"
                    className="w-16 h-16 rounded bg-gray-100 overflow-hidden flex items-center justify-center text-xs text-gray-400 shrink-0 ring-offset-2 transition hover:ring-2 hover:ring-blue-300"
                    onClick={() => pic.previewUrl && setPreviewPic(pic)}
                    title="点击查看原图"
                  >
                    {pic.previewUrl ? <img src={pic.previewUrl} alt={pic.originalName} className="w-full h-full object-cover" /> : '图片'}
                  </button>
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{pic.originalName}</div>
                    <div className="text-xs text-gray-500">顺序 {pic.order} {pic.deleted ? '｜已灰化删除' : ''}</div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <AppButton type="button" className="px-2 py-1 text-xs rounded border bg-white" onClick={() => move(idx, -1)} disabled={idx === 0}><ArrowUp className="w-3 h-3" /></AppButton>
                    <AppButton type="button" className="px-2 py-1 text-xs rounded border bg-white" onClick={() => move(idx, 1)} disabled={idx === draft.length - 1}><ArrowDown className="w-3 h-3" /></AppButton>
                    {pic.deleted ? (
                      <AppButton type="button" className="px-2 py-1 text-xs rounded border bg-emerald-50 text-emerald-700" onClick={() => toggleDelete(pic.uid, false)}><RotateCcw className="w-3 h-3" /></AppButton>
                    ) : (
                      <AppButton type="button" className="px-2 py-1 text-xs rounded border bg-rose-50 text-rose-700" onClick={() => toggleDelete(pic.uid, true)}><Trash2 className="w-3 h-3" /></AppButton>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-2">
            <AppButton className="flex-1 bg-gray-200 text-gray-800 px-3 py-2 rounded-lg" onClick={onClose} type="button">取消</AppButton>
            <AppButton className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg" onClick={() => onConfirm(renumber(draft))} type="button">确认</AppButton>
          </div>
        </div>

    </AppCard>
    {previewPic ? (
      <div className="fixed inset-0 z-[30010] flex items-center justify-center bg-black/70 p-6" onClick={() => setPreviewPic(null)}>
        <div className="relative max-h-full max-w-[95vw]" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            className="absolute right-3 top-3 rounded-full bg-white/90 px-3 py-1 text-sm text-slate-700 shadow"
            onClick={() => setPreviewPic(null)}
          >
            关闭
          </button>
          <img
            src={previewPic.previewUrl}
            alt={previewPic.originalName}
            className="max-h-[85vh] max-w-[90vw] rounded-2xl bg-white object-contain shadow-2xl"
          />
          <div className="mt-3 rounded-xl bg-white/95 px-4 py-2 text-sm text-slate-700 shadow">
            {previewPic.originalName}
          </div>
        </div>
      </div>
    ) : null}
  </BlockingFullscreenModal>
);

}
