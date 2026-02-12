import AppCard from '@/components/ui/AppCard';
import ToolIconButton from '@/components/Toolbar/ToolIconButton';
import { RULE_BUTTON_DEFS } from './buttonRuleConfig';

type Props = {
  activeButtonIds: string[];
  onToggle: (id: string) => void;
};

export default function RuleButtonPanel({ activeButtonIds, onToggle }: Props) {
  const active = new Set((activeButtonIds ?? []).map((x) => String(x).trim()).filter(Boolean));

  return (
    <AppCard className="bg-white/90 p-3 flex flex-col gap-2 sm:min-w-[360px]">
      <div className="flex flex-wrap items-center gap-1">
        {RULE_BUTTON_DEFS.map((d) => (
          <ToolIconButton
            key={d.id}
            label={d.label}
            icon={d.icon}
            active={active.has(d.id)}
            tone={d.tone}
            onClick={() => onToggle(d.id)}
          />
        ))}
      </div>
    </AppCard>
  );
}
