import { useMemo, useState } from 'react';

import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

type Props = {
  title?: string;
  jsonText: string;
  filename: string;
};

function fallbackCopy(text: string) {
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  textarea.style.pointerEvents = 'none';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  let ok = false;
  try {
    ok = document.execCommand('copy');
  } catch {
    ok = false;
  }
  document.body.removeChild(textarea);
  return ok;
}

function downloadTextFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function MobileFeatureJsonPanel({ title, jsonText, filename }: Props) {
  const [hint, setHint] = useState('可复制/下载后在“导入数据”中重新导入编辑');
  const displayTitle = useMemo(() => title?.trim() || '当前要素 JSON', [title]);

  const handleCopy = async () => {
    let ok = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(jsonText);
        ok = true;
      }
    } catch {
      ok = false;
    }
    if (!ok) ok = fallbackCopy(jsonText);
    setHint(ok ? '已复制到剪贴板' : '复制失败，请长按下方文本手动复制');
  };

  const handleDownload = () => {
    try {
      downloadTextFile(filename, jsonText);
      setHint('已开始下载 JSON 文件');
    } catch {
      setHint('下载失败，请稍后重试');
    }
  };

  return (
    <AppCard className="bg-transparent shadow-none border-0 w-full">
      <div className="px-1 py-1 flex flex-col gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-800">{displayTitle}</div>
          <div className="mt-1 text-[11px] text-gray-500">{hint}</div>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <AppButton
            type="button"
            className="px-3 py-2 text-xs border border-gray-200 bg-white text-gray-700 active:bg-gray-50"
            onClick={handleCopy}
          >
            复制
          </AppButton>
          <AppButton
            type="button"
            className="px-3 py-2 text-xs border border-gray-200 bg-white text-gray-700 active:bg-gray-50"
            onClick={handleDownload}
          >
            下载
          </AppButton>
          <div className="text-[11px] text-gray-400 truncate">{filename}</div>
        </div>

        <textarea
          className="w-full min-h-[360px] max-h-[56vh] text-xs font-mono border border-gray-200 rounded-2xl p-3 bg-white text-gray-800"
          value={jsonText}
          readOnly
        />
      </div>
    </AppCard>
  );
}
