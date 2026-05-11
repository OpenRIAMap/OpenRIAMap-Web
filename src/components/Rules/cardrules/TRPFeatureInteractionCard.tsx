import type { FeatureCardCommonProps } from './featureCardRegistry';
import FeatureInteractionCard from '@/components/Rules/core/FeatureInteractionCard';
import TRPTradeSection from './TRPTradeSection';
import { buildInfoSectionsForFeature } from './fieldRules';

export default function TRPFeatureInteractionCard(props: FeatureCardCommonProps) {
  const { feature } = props;

  // TRP：主信息由 midSection 承担（总览 + 交易列表 + Land/wiki/brief）。
  // 其余字段全部归入“其他信息”下拉栏，避免主信息过长。
  const infoSectionsOverride = (() => {
    if (!feature) return undefined;
    const { mainRows, otherRows } = buildInfoSectionsForFeature(feature, null, { disableFieldRules: true });
    const all = [...mainRows, ...otherRows];
    const hidePrefixes = new Set([
      'Trade',
      'trade',
      'tags.Land',
      'tags.land',
      'extensions.link.wiki',
      'extensions.Link.wiki',
      'extensions.character.brief',
      'extensions.Character.brief',
    ]);
    const hideExact = new Set([
      'Interaction',
      'interaction',
      'Situation',
      'situation',
      'Kind',
      'SKind',
      'SKind2',
      '类型',
      '交互模式',
      '启用状况',
      '所属地理单元',
      'WIKI链接',
      '简介',
      '交易列表',
    ]);
    const filtered = all.filter((r) => {
      const label = String((r as any)?.label ?? '').trim();
      if (!label) return true;
      if (hideExact.has(label)) return false;
      for (const p of hidePrefixes) {
        if (label === p || label.startsWith(`${p}.`)) return false;
      }
      return true;
    });
    return { mainRows: [], otherRows: filtered };
  })();

  return (
    <FeatureInteractionCard
      {...props}
      // TRP：特殊解析模块插入到“图片幕”和“主信息”之间
      midSection={
        feature ? (
          <TRPTradeSection
            feature={feature}
            resolveFeatureById={props.resolveFeatureById}
            onTryTriggerLabelClickById={props.onTryTriggerLabelClickById}
          />
        ) : null
      }
      // 略微加宽，便于交易表与信息展示
      cardClassName="w-[420px]"
      // 图片幕保持原比例略加宽
      pictureItemSize={{ width: 384, height: 216 }}
      // 防止 TRP 被 fieldRules.ts 的意外规则覆盖
      disableFieldRules
      // 其余字段进入“其他信息”
      infoSectionsOverride={infoSectionsOverride}
    />
  );
}
