// A horizontal life timeline: saving → drawing-down phases (derived from actual flows,
// D22) with computed and user-defined milestones staggered above/below the axis.

import { drawdownStartAge } from '../engine/metrics';
import { Card } from '../components/ui';
import { useNav } from '../store/NavContext';
import { useSim } from '../store/SimContext';

const W = 1000;
const AXIS_Y = 150;
const LEVELS = [-96, 62, -56, 102, -16] as const; // label stagger offsets from the axis

export function TimelineView() {
  const { plan, milestones, proj } = useSim();
  const { goToCashFlow } = useNav();
  const { currentAge, lifeExpectancy } = plan.profile;
  const x = (age: number) => 40 + ((age - currentAge) / Math.max(1, lifeExpectancy - currentAge)) * (W - 80);
  const year = (age: number) => plan.planStartYear + age - currentAge;

  // Bands split where the money actually turns around, not at the retirement age input.
  const ddStart = drawdownStartAge(proj);
  const splitAge = Math.min(Math.max(ddStart ?? lifeExpectancy, currentAge), lifeExpectancy);

  const decades = [];
  for (let a = Math.ceil(currentAge / 5) * 5; a <= lifeExpectancy; a += 5) decades.push(a);

  return (
    <div className="grid grid-cols-1 gap-4">
      <Card title="Life timeline" subtitle="Computed milestones (FI, Coast, RMDs…) plus your own markers">
        <svg viewBox={`0 0 ${W} 300`} className="w-full" role="img" aria-label="Milestones timeline">
          {/* phase bands — split where net flows flip from saving to withdrawing (D22) */}
          <rect x={x(currentAge)} y={AXIS_Y - 11} width={x(splitAge) - x(currentAge)} height={22} rx={11} fill="var(--c-taxable)" opacity={0.15} />
          <rect x={x(splitAge)} y={AXIS_Y - 11} width={Math.max(0, x(lifeExpectancy) - x(splitAge))} height={22} rx={11} fill="var(--c-trad)" opacity={0.15} />
          {splitAge > currentAge && (
            <text x={(x(currentAge) + x(splitAge)) / 2} y={AXIS_Y + 4} textAnchor="middle" fontSize={11} fill="var(--c-ink-2)">
              Saving
            </text>
          )}
          {ddStart != null && splitAge < lifeExpectancy && (
            <text x={(x(splitAge) + x(lifeExpectancy)) / 2} y={AXIS_Y + 4} textAnchor="middle" fontSize={11} fill="var(--c-ink-2)">
              Drawing down (from {splitAge})
            </text>
          )}

          {/* axis + age ticks */}
          <line x1={30} x2={W - 30} y1={AXIS_Y} y2={AXIS_Y} stroke="var(--c-axis)" strokeWidth={1} />
          {decades.map((a) => (
            <g key={a}>
              <line x1={x(a)} x2={x(a)} y1={AXIS_Y + 14} y2={AXIS_Y + 20} stroke="var(--c-axis)" />
              <text x={x(a)} y={AXIS_Y + 34} textAnchor="middle" fontSize={10} fill="var(--c-muted)">{a}</text>
              <text x={x(a)} y={AXIS_Y + 46} textAnchor="middle" fontSize={9} fill="var(--c-muted)" opacity={0.7}>{year(a)}</text>
            </g>
          ))}

          {/* milestones */}
          {milestones.map((m, i) => {
            const offset = LEVELS[i % LEVELS.length];
            const above = offset < 0;
            const my = AXIS_Y + offset;
            const px = x(m.age!);
            return (
              // Each marker cross-links to that year's cash flow (F22). SVG groups take
              // focus/role/keys, so the link is keyboard-reachable too.
              <g
                key={`${m.name}-${i}`}
                role="button"
                tabIndex={0}
                aria-label={`View cash flow at age ${m.age}`}
                cursor="pointer"
                // bounding-box: the whole marker area is clickable, not just its sparse shapes
                pointerEvents="bounding-box"
                onClick={() => goToCashFlow(m.age!)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') goToCashFlow(m.age!); }}
              >
                <title>{`${m.name} — view cash flow at age ${m.age}`}</title>
                <line x1={px} x2={px} y1={above ? my + 14 : AXIS_Y + 11} y2={above ? AXIS_Y - 11 : my - 14} stroke="var(--c-muted)" strokeDasharray="2 3" strokeWidth={1} />
                <circle cx={px} cy={above ? AXIS_Y - 11 : AXIS_Y + 11} r={3} fill={m.kind === 'user' ? 'var(--c-cash)' : 'var(--c-median)'} />
                <text x={px} y={my} textAnchor="middle" fontSize={13}>{m.emoji}</text>
                <text x={px} y={my + (above ? -12 : 16)} textAnchor="middle" fontSize={10} fontWeight={600} fill="var(--c-ink)">
                  {m.name}
                </text>
                <text x={px} y={my + (above ? -24 : 28)} textAnchor="middle" fontSize={9} fill="var(--c-muted)">
                  age {m.age} · {year(m.age!)}
                </text>
              </g>
            );
          })}
        </svg>
        <div className="mt-1 flex flex-wrap gap-4 text-[11px] text-[var(--c-muted)]">
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--c-median)' }} />Computed from your plan</span>
          <span><span className="mr-1 inline-block h-2 w-2 rounded-full" style={{ background: 'var(--c-cash)' }} />Your milestones (add them on the Plan tab)</span>
        </div>
      </Card>

      <Card title="Milestone details">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-[var(--c-border)] text-[10px] uppercase tracking-wide text-[var(--c-muted)]">
              <th className="py-2 font-medium">Milestone</th>
              <th className="font-medium">Age</th>
              <th className="font-medium">Year</th>
              <th className="font-medium">Source</th>
            </tr>
          </thead>
          <tbody>
            {milestones.map((m, i) => (
              <tr key={`${m.name}-${i}`} className="border-b border-[var(--c-grid)]/60">
                <td className="py-1.5">{m.emoji} {m.name}</td>
                <td className="tabular-nums">{m.age}</td>
                <td className="tabular-nums">{year(m.age!)}</td>
                <td className="text-[var(--c-muted)]">{m.kind === 'user' ? 'You' : 'Computed'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
