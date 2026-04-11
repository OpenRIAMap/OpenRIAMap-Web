import { useEffect, useMemo, useState } from 'react';
import { Loader2, PackageOpen } from 'lucide-react';
import AppCard from '@/components/ui/AppCard';
import { useFeatureModuleStore } from '@/store/featureModuleStore';

const MODULE_LABELS = {
  measuring: '测绘扩展模块',
  legacy: '旧图层扩展模块',
} as const;

const STEP_TEXTS = {
  measuring: [
    '正在准备测绘扩展模块',
    '正在请求测绘资源',
    '正在解析测绘模块代码',
    '正在初始化测绘界面',
    '即将进入测绘功能',
  ],
  legacy: [
    '正在准备旧图层扩展模块',
    '正在请求旧图层资源',
    '正在解析旧图层模块代码',
    '正在初始化旧图层界面',
    '即将进入目标功能',
  ],
} as const;

export default function FeatureModuleLoadingOverlay() {
  const overlay = useFeatureModuleStore((state) => state.loadingOverlay);
  const [stepIndex, setStepIndex] = useState(0);

  const steps = useMemo(() => {
    if (!overlay.moduleKey) return [] as string[];
    return [...STEP_TEXTS[overlay.moduleKey]];
  }, [overlay.moduleKey]);

  useEffect(() => {
    if (!overlay.isOpen) {
      setStepIndex(0);
      return;
    }
    setStepIndex(0);
    const timer = window.setInterval(() => {
      setStepIndex((prev) => {
        const next = prev + 1;
        return next >= Math.max(steps.length, 1) ? prev : next;
      });
    }, 420);
    return () => window.clearInterval(timer);
  }, [overlay.isOpen, steps.length]);

  if (!overlay.isOpen || !overlay.moduleKey) return null;

  const progress = steps.length > 0 ? Math.min(((stepIndex + 1) / steps.length) * 100, 96) : 30;
  const currentText = steps[Math.min(stepIndex, Math.max(steps.length - 1, 0))] ?? '正在加载扩展模块';

  return (
    <div className="fixed inset-0 z-[13000] flex items-center justify-center bg-gray-950/45 px-4 py-6 backdrop-blur-[1px]">
      <AppCard className="w-full max-w-md rounded-3xl border border-white/70 bg-white p-6 shadow-[0_24px_64px_rgba(15,23,42,0.22)]">
        <div className="flex items-start gap-4">
          <div className="mt-0.5 flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 text-lg font-semibold text-slate-900">
              <PackageOpen className="h-5 w-5 text-blue-600" />
              <span>{MODULE_LABELS[overlay.moduleKey]}</span>
            </div>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              正在加载扩展模块资源，完成后将自动继续刚才的操作。
            </p>
          </div>
        </div>

        <div className="mt-6 h-2 overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-blue-500 transition-all duration-300 ease-out"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
          {currentText}
        </div>
      </AppCard>
    </div>
  );
}
