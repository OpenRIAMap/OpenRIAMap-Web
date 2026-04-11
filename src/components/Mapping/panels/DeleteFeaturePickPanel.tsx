import { DraggablePanel } from '@/components/DraggablePanel/DraggablePanel';
import AppCard from '@/components/ui/AppCard';
import AppButton from '@/components/ui/AppButton';
import { Crosshair, X } from 'lucide-react';
import type { DeletePanelItem } from './DeleteFeatureSelectionPanel';

export default function DeleteFeaturePickPanel(props: {
  open: boolean;
  active: boolean;
  candidate: DeletePanelItem | null;
  onCancel: () => void;
  onConfirm: (item: DeletePanelItem) => void;
}) {
  const { open, active, candidate, onCancel, onConfirm } = props;
  if (!open) return null;

  return (
    <DraggablePanel id="delete-feature-pick-panel" defaultPosition={{ x: 1120, y: 220 }} zIndex={1920}>
      <AppCard className="w-[360px] max-w-[90vw] overflow-hidden border">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="font-bold text-gray-800">删除要素选择模式</div>
          <AppButton onClick={onCancel} className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded" type="button" data-draggable-close aria-label="关闭" title="关闭"><X className="w-4 h-4" /></AppButton>
        </div>
        <div className="space-y-3 p-4 text-sm text-gray-700">
          <div className="rounded border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-blue-700">
            <Crosshair className="inline-block w-3 h-3 mr-1" />
            {active ? '请在地图上点击一个当前 Rules 要素；支持点 / 线 / 面，每次只会记录一个候选。' : '当前未启用地图选择。'}
          </div>
          <div className="rounded border bg-gray-50 p-3">
            <div className="mb-2 font-bold text-gray-800">当前候选要素</div>
            {!candidate ? (
              <div className="text-gray-400">尚未选择要素</div>
            ) : (
              <div className="space-y-1">
                <div>{candidate.Name ? `${candidate.Name} (${candidate.ID})` : candidate.ID}</div>
                <div className="text-xs text-gray-500">Class：{candidate.className || '-'}</div>
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <AppButton className="flex-1 bg-gray-200 text-gray-800 px-3 py-2 rounded-lg" onClick={onCancel} type="button">取消</AppButton>
            <AppButton className="flex-1 bg-blue-600 text-white px-3 py-2 rounded-lg disabled:opacity-50" onClick={() => candidate && onConfirm(candidate)} type="button" disabled={!candidate}>确认</AppButton>
          </div>
        </div>
      </AppCard>
    </DraggablePanel>
  );
}
