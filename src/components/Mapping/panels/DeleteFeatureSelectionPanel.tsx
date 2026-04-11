import { useEffect, useMemo, useState } from 'react';
import { DraggablePanel } from '@/components/DraggablePanel/DraggablePanel';
import AppCard from '@/components/ui/AppCard';
import AppButton from '@/components/ui/AppButton';
import { MapPinned, Plus, Search, Trash2, X } from 'lucide-react';
import { useRuleDataStore } from '@/store/ruleDataStore';
import { buildWorkflowSearchOptionsFromFeatures, filterWorkflowSearchOptions, type SearchSelectConfig } from '@/components/Mapping/Workflow/WorkflowFeatureSearchSelect';
import { pickIdFieldValue } from '@/components/Rules/rendering/renderRules';

export type DeletePanelItem = { ID: string; Name: string; className?: string };

const DELETE_SEARCH_CONFIG: SearchSelectConfig = {
  cacheKey: 'delete-panel-all-features',
  filter: () => true,
  getId: (fi) => {
    const cls = String(fi?.Class ?? '').trim();
    const { idValue } = pickIdFieldValue(fi as any, cls);
    return String(idValue ?? fi?.ID ?? '').trim();
  },
  getName: (fi) => String(fi?.Name ?? fi?.Label ?? fi?.ID ?? '').trim(),
  formatOption: (name, id) => `${name} (${id})`,
};

export default function DeleteFeatureSelectionPanel(props: {
  open: boolean;
  items: DeletePanelItem[];
  candidates: DeletePanelItem[];
  currentWorldId: string;
  mapPickEnabled?: boolean;
  pickedItem?: DeletePanelItem | null;
  onOpenPickPanel?: () => void;
  onClose: () => void;
  onConfirm: (items: DeletePanelItem[]) => void;
}) {
  const { open, items, candidates, currentWorldId, mapPickEnabled = false, pickedItem, onOpenPickPanel, onClose, onConfirm } = props;
  const [draft, setDraft] = useState<DeletePanelItem[]>([]);
  const [keyword, setKeyword] = useState('');
  const worldFeatures = useRuleDataStore((s) => s.datasets[currentWorldId]?.features ?? []);

  useEffect(() => {
    if (!open) return;
    setDraft(items.map((x) => ({ ...x })));
    setKeyword('');
  }, [open, items]);

  useEffect(() => {
    if (!open || !pickedItem?.ID) return;
    setDraft((prev) => {
      if (prev.some((x) => x.ID === pickedItem.ID)) return prev;
      return [...prev, pickedItem];
    });
  }, [open, pickedItem]);

  const candidateList = useMemo(() => {
    const existing = new Set(draft.map((x) => x.ID));
    const datasetOptions = buildWorkflowSearchOptionsFromFeatures(worldFeatures as any[], DELETE_SEARCH_CONFIG)
      .map((o) => ({ ID: o.id, Name: o.name || o.id, className: o.className }));
    const mergedMap = new Map<string, DeletePanelItem>();
    for (const item of [...datasetOptions, ...candidates]) {
      if (!item?.ID) continue;
      if (existing.has(item.ID)) continue;
      mergedMap.set(item.ID, item);
    }
    const merged = Array.from(mergedMap.values()).sort((a, b) => String(a.Name || a.ID).localeCompare(String(b.Name || b.ID), 'zh-Hans-CN'));
    const q = keyword.trim();
    if (!q) return merged.slice(0, 120);
    const pool = merged.map((x) => ({ id: x.ID, name: x.Name || x.ID, display: `${x.Name || x.ID} (${x.ID})`, className: x.className }));
    const hitIds = new Set(filterWorkflowSearchOptions(pool, q, 120).map((x) => x.id));
    return merged.filter((x) => hitIds.has(x.ID));
  }, [worldFeatures, candidates, draft, keyword]);

  if (!open) return null;

  return (
    <DraggablePanel id="delete-feature-selection-panel" defaultPosition={{ x: 340, y: 220 }} zIndex={1910}>
      <AppCard className="w-[760px] max-w-[94vw] overflow-hidden border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="font-bold text-gray-800">选择待删除要素</h3>
          <AppButton onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" type="button" data-draggable-close aria-label="关闭" title="关闭" > <X className="w-4 h-4" /> </AppButton>
        </div>
        <div className="grid grid-cols-2 gap-4 p-4 text-sm text-gray-700">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="font-bold">可加入候选</div>
              {onOpenPickPanel && (
                <AppButton
                  type="button"
                  className={`px-2 py-1 text-xs rounded border ${mapPickEnabled ? 'bg-blue-600 text-white border-blue-700' : 'bg-white text-gray-700'}`}
                  onClick={onOpenPickPanel}
                >
                  <MapPinned className="w-3 h-3 mr-1 inline-block" />选择模式
                </AppButton>
              )}
            </div>
            <div className="flex items-center gap-2 rounded border bg-white px-2 py-1.5">
              <Search className="w-4 h-4 text-gray-400" />
              <input
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
                placeholder="搜索 Name / ID / Class"
                className="w-full bg-transparent outline-none text-sm"
              />
            </div>
            <div className="max-h-[52vh] overflow-y-auto rounded border bg-gray-50 p-2 space-y-2">
              {candidateList.length === 0 ? <div className="text-gray-400">当前没有可加入的图层要素</div> : candidateList.map((it) => (
                <div key={it.ID} className="flex items-center gap-2 rounded border bg-white p-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate">{it.Name || it.ID} <span className="text-gray-500">({it.ID})</span></div>
                    <div className="text-xs text-gray-500">{it.className || '-'}</div>
                  </div>
                  <AppButton type="button" className="px-2 py-1 text-xs rounded border bg-white" onClick={() => setDraft((prev) => [...prev, it])}><Plus className="w-3 h-3" /></AppButton>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <div className="font-bold">待删除标记（{draft.length}）</div>
            {mapPickEnabled && (
              <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
                选择模式已开启：请在地图上点击一个当前 Rules 要素（点 / 线 / 面），并在小面板中确认。
              </div>
            )}
            <div className="max-h-[52vh] overflow-y-auto rounded border bg-gray-50 p-2 space-y-2">
              {draft.length === 0 ? <div className="text-gray-400">当前没有待删除标记</div> : draft.map((it) => (
                <div key={it.ID} className="flex items-center gap-2 rounded border bg-white p-2">
                  <div className="min-w-0 flex-1 truncate">{it.Name ? `${it.Name} (${it.ID})` : it.ID}</div>
                  <AppButton type="button" className="px-2 py-1 text-xs rounded border bg-rose-50 text-rose-700" onClick={() => setDraft((prev) => prev.filter((x) => x.ID !== it.ID))}><Trash2 className="w-3 h-3" /></AppButton>
                </div>
              ))}
            </div>
          </div>
          <div className="col-span-2 flex gap-2">
            <AppButton className="flex-1 bg-gray-200 text-gray-800 px-3 py-2 rounded-lg" onClick={onClose} type="button">取消</AppButton>
            <AppButton className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg" onClick={() => onConfirm(draft)} type="button">确认</AppButton>
          </div>
        </div>
      </AppCard>
    </DraggablePanel>
  );
}
