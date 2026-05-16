/**
 * 玩家详情卡片组件
 * 展示选中玩家的动态状态信息。
 */

import { useEffect, useState } from 'react';
import { Check, Heart, Navigation, Share2, Shield, User, X } from 'lucide-react';
import type { Player } from '@/types';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';
import { copyTextToClipboard } from '@/lib/clipboard';
import { createPlayerShareLink } from '@/lib/featureShareLink';

interface PlayerDetailCardProps {
  player: Player;
  worldId: string;
  onClose: () => void;
  onNavigate?: (player: Player) => void;
  desktopWindowMode?: boolean;
}

export function PlayerDetailCard({
  player,
  worldId,
  onClose,
  onNavigate,
  desktopWindowMode = false,
}: PlayerDetailCardProps) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 1600);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const healthValue = Number.isFinite(player.health) ? player.health : 0;
  const armorValue = Number.isFinite(player.armor) ? player.armor : 0;
  const healthPercent = Math.max(0, Math.min(100, (healthValue / 20) * 100));
  const armorPercent = Math.max(0, Math.min(100, (armorValue / 20) * 100));
  const healthColor = healthPercent > 50 ? 'bg-red-500' : healthPercent > 25 ? 'bg-yellow-500' : 'bg-red-700';

  const handleShare = async () => {
    const playerId = player.account || player.name;
    const url = createPlayerShareLink(worldId, playerId);
    const ok = await copyTextToClipboard(url);
    if (ok) setCopied(true);
  };

  return (
    <AppCard
      className="w-full sm:w-72 max-h-[60vh] flex flex-col overflow-hidden rounded-2xl"
      data-draggable-proxy-close={desktopWindowMode ? 'true' : undefined}
    >
      {desktopWindowMode ? (
        <button
          type="button"
          data-draggable-close
          onClick={onClose}
          className="sr-only"
          aria-label="关闭"
          title="关闭"
        >
          关闭
        </button>
      ) : null}

      {/* 头部 */}
      <div className="relative flex items-start justify-between gap-3 bg-cyan-500 px-4 py-3 text-white">
        <div className="min-w-0 pr-1 sm:pr-[88px]" data-draggable-title>
          <div className="flex min-w-0 items-center gap-2">
            <User className="h-4 w-4 flex-none" />
            <h3 className="truncate text-base font-bold leading-6">{player.name}</h3>
          </div>
          <p className="mt-1 text-xs opacity-90">
            X: {Math.round(player.x)}, Y: {Math.round(player.y)}, Z: {Math.round(player.z)}
          </p>
        </div>

        <div className="flex flex-none items-center gap-1 sm:absolute sm:right-3 sm:top-[36px] sm:grid sm:grid-cols-2 sm:gap-1">
          <AppButton
            onClick={() => onNavigate?.(player)}
            className="flex h-7 w-7 items-center justify-center rounded text-white/90 transition hover:bg-white/15 hover:text-white"
            title="导航到玩家"
            aria-label="导航到玩家"
          >
            <Navigation className="h-4 w-4" />
          </AppButton>
          <AppButton
            onClick={handleShare}
            className="flex h-7 w-7 items-center justify-center rounded text-white/90 transition hover:bg-white/15 hover:text-white"
            title={copied ? '已复制' : '分享玩家'}
            aria-label={copied ? '已复制' : '分享玩家'}
          >
            {copied ? <Check className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
          </AppButton>
          {!desktopWindowMode ? (
            <AppButton
              onClick={onClose}
              className="flex h-7 w-7 items-center justify-center rounded text-white/90 transition hover:bg-white/15 hover:text-white"
              title="关闭"
              aria-label="关闭"
            >
              <X className="h-4 w-4" />
            </AppButton>
          ) : null}
        </div>
      </div>

      {/* 详情内容 */}
      <div className="flex-1 overflow-y-auto bg-white px-4 py-3">
        {/* 生命值 */}
        <div className="mb-4">
          <div className="mb-1 flex items-center gap-2 text-sm text-gray-600">
            <Heart className="h-4 w-4 text-red-500" />
            <span>生命值</span>
            <span className="ml-auto font-medium text-gray-800">
              {healthValue.toFixed(0)} / 20
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className={`h-full ${healthColor} transition-all`}
              style={{ width: `${healthPercent}%` }}
            />
          </div>
        </div>

        {/* 护甲值 */}
        <div>
          <div className="mb-1 flex items-center gap-2 text-sm text-gray-600">
            <Shield className="h-4 w-4 text-blue-500" />
            <span>护甲值</span>
            <span className="ml-auto font-medium text-gray-800">
              {armorValue.toFixed(0)} / 20
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-blue-500 transition-all"
              style={{ width: `${armorPercent}%` }}
            />
          </div>
        </div>
      </div>
    </AppCard>
  );
}

export default PlayerDetailCard;
