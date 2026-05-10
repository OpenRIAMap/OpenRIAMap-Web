import { useState } from 'react';
import { X } from 'lucide-react';

import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import { copyTextToClipboard } from '@/lib/clipboard';
import type { FeatureSharePayload } from '@/lib/featureShareLink';

type Props = {
  payload: FeatureSharePayload;
  onClose?: () => void;
  embedded?: boolean;
};

export default function FeatureSharePanel({ payload, onClose, embedded = false }: Props) {
  const [copied, setCopied] = useState<'link' | 'name' | null>(null);

  const copyAndMark = async (kind: 'link' | 'name', value: string) => {
    const ok = await copyTextToClipboard(value);
    if (!ok) return;
    setCopied(kind);
    window.setTimeout(() => setCopied(null), 1200);
  };

  const content = (
    <>
      {!embedded ? (
        <div className="flex items-center justify-between px-3 py-2 border-b border-black/10">
          <div className="min-w-0 truncate text-sm font-semibold" title={payload.title} data-draggable-title>
            分享要素
          </div>
          <AppButton
            className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-black/5 rounded"
            onClick={onClose}
            type="button"
            aria-label="关闭"
            title="关闭"
            data-draggable-close
          >
            <X className="w-4 h-4" />
          </AppButton>
        </div>
      ) : null}

      <div className="p-3 flex flex-col gap-2" onWheel={(e) => e.stopPropagation()} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2">
          <AppButton
            type="button"
            className="px-2 py-1 text-xs border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => { void copyAndMark('link', payload.url); }}
          >
            复制链接
          </AppButton>
          <AppButton
            type="button"
            className="px-2 py-1 text-xs border border-gray-300 bg-white hover:bg-gray-50"
            onClick={() => { void copyAndMark('name', payload.featureName); }}
          >
            复制要素名
          </AppButton>
          <div className="min-w-0 truncate text-[11px] text-gray-500">
            {copied === 'link' ? '链接已复制' : copied === 'name' ? '要素名已复制' : payload.featureName || 'Name 字段为空'}
          </div>
        </div>
        <textarea
          className="w-full min-h-[120px] text-xs font-mono border border-gray-200 rounded p-2 bg-white"
          value={payload.url}
          readOnly
          onFocus={(e) => e.currentTarget.select()}
        />
        <div className="text-[11px] text-gray-500">
          其他用户打开该链接后，地图加载完成会自动跳转到该要素并打开信息卡。
        </div>
      </div>
    </>
  );

  if (embedded) {
    return <div className="bg-white">{content}</div>;
  }

  return (
    <AppCard className="w-[420px] max-h-[70vh] overflow-hidden" onWheel={(e) => e.stopPropagation()}>
      {content}
    </AppCard>
  );
}
