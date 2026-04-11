/**
 * 玩家列表面板组件
 * 展示在线玩家列表，支持导航到玩家位置
 * 以模态框形式展示在左侧面板下方
 */

import { useState, useEffect, useCallback } from 'react';
import { MapPin, Navigation, RefreshCw, Users } from 'lucide-react';
import type { Player } from '@/types';
import { fetchPlayersDetailed } from '@/lib/playerApi';
import { getPlayerAvatarUrl } from '@/components/Map/PlayerLayer';
import AppButton from '@/components/ui/AppButton';
import AppCard from '@/components/ui/AppCard';

interface PlayersListProps {
  worldId: string;
  onClose: () => void;
  onPlayerSelect?: (player: Player) => void;
  onNavigateToPlayer?: (player: Player) => void;
}

export function PlayersList({
  worldId,
  onClose,
  onPlayerSelect,
  onNavigateToPlayer,
}: PlayersListProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // 加载玩家数据
  const loadPlayers = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchPlayersDetailed(worldId);
      setPlayers(result.players);
      setLoadError(result.error);
    } catch (error) {
      setPlayers([]);
      setLoadError(String((error as Error)?.message ?? error ?? '玩家信息读取失败'));
    } finally {
      setLoading(false);
    }
  }, [worldId]);

  // 初始加载和自动刷新
  useEffect(() => {
    loadPlayers();

    // 5秒自动刷新
    const interval = setInterval(loadPlayers, 5000);
    return () => clearInterval(interval);
  }, [loadPlayers]);

  return (
    <AppCard className="w-full sm:w-72 max-h-[50vh] flex flex-col" data-draggable-proxy-close="true">
      <button
        type="button"
        onClick={onClose}
        data-draggable-close
        aria-label="关闭"
        title="关闭"
        className="hidden"
        tabIndex={-1}
      />
      {/* 头部 */}
      <div className="flex items-center gap-3 border-b px-4 py-3 pr-28 flex-shrink-0">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Users className="h-5 w-5 shrink-0 text-cyan-500" />
          <h3 className="truncate font-bold text-gray-800" data-draggable-title>
            在线玩家
          </h3>
          <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {players.length}
          </span>
        </div>

        <div className="flex shrink-0 items-center">
          <AppButton
            onClick={loadPlayers}
            disabled={loading}
            className="rounded p-1.5 text-gray-400 transition hover:bg-gray-100 hover:text-gray-600 disabled:cursor-not-allowed disabled:opacity-50"
            title="刷新"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </AppButton>
        </div>
      </div>

      {/* 玩家列表 */}
      <div className="flex-1 overflow-y-auto">
        {loading && players.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">加载中...</div>
        ) : players.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-500">
            {loadError ? `玩家信息读取失败：${loadError}` : '当前没有在线玩家'}
          </div>
        ) : (
          <div className="divide-y">
            {players.map(player => (
              <PlayerItem
                key={player.name}
                player={player}
                worldId={worldId}
                onSelect={onPlayerSelect}
                onNavigate={onNavigateToPlayer}
              />
            ))}
          </div>
        )}
      </div>
    </AppCard>
  );
}

// 玩家列表项组件
interface PlayerItemProps {
  player: Player;
  worldId: string;
  onSelect?: (player: Player) => void;
  onNavigate?: (player: Player) => void;
}

function PlayerItem({ player, worldId, onSelect, onNavigate }: PlayerItemProps) {
  const avatarUrl = getPlayerAvatarUrl(player.name, 32, worldId);

  // 生命值百分比
  const healthPercent = (player.health / 20) * 100;

  return (
    <div className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50">
      {/* 头像 */}
      <AppButton
        onClick={() => onSelect?.(player)}
        className="flex-shrink-0 hover:opacity-80 transition-opacity"
      >
        <img
          src={avatarUrl}
          alt={player.name}
          className="w-8 h-8 rounded-full border-2 border-cyan-500"
          onError={(e) => {
            (e.target as HTMLImageElement).src =
              'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="%2306b6d4"><circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/></svg>';
          }}
        />
      </AppButton>

      {/* 信息 */}
      <div className="flex-1 min-w-0">
        <AppButton
          onClick={() => onSelect?.(player)}
          className="block truncate text-sm font-medium text-gray-800 transition-colors hover:text-cyan-600"
        >
          {player.name}
        </AppButton>
        <div className="mt-0.5 flex items-center gap-2">
          {/* 生命值小条 */}
          <div className="h-1 w-12 overflow-hidden rounded-full bg-gray-200">
            <div
              className="h-full bg-red-500"
              style={{ width: `${healthPercent}%` }}
            />
          </div>
          <span className="text-[10px] text-gray-400">
            {Math.round(player.x)}, {Math.round(player.z)}
          </span>
        </div>
      </div>

      {/* 操作按钮 */}
      <div className="flex items-center gap-1">
        <AppButton
          onClick={() => onSelect?.(player)}
          className="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-cyan-600"
          title="定位"
        >
          <MapPin className="w-4 h-4" />
        </AppButton>
        {onNavigate && (
          <AppButton
            onClick={() => onNavigate(player)}
            className="rounded p-1.5 text-gray-400 hover:bg-gray-200 hover:text-blue-600"
            title="导航"
          >
            <Navigation className="w-4 h-4" />
          </AppButton>
        )}
      </div>
    </div>
  );
}

export default PlayersList;
