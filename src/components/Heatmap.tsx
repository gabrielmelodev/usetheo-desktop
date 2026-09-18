import type { HeatmapEntry } from "../lib/types";

function intensity(count: number): string {
  if (count === 0) return "bg-white/[0.04]";
  if (count < 5) return "bg-accent/25";
  if (count < 15) return "bg-accent/50";
  if (count < 30) return "bg-accent/75";
  return "bg-accent";
}

export function Heatmap({ data }: { data: HeatmapEntry[] }) {
  const byDate = new Map(data.map((d) => [d.date, d.count]));
  const days: { date: string; count: number }[] = [];
  const today = new Date();

  for (let i = 363; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = d.toISOString().slice(0, 10);
    days.push({ date: iso, count: byDate.get(iso) ?? 0 });
  }

  // Agrupa em semanas (colunas) para o layout estilo "commits do GitHub".
  const weeks: { date: string; count: number }[][] = [];
  for (let i = 0; i < days.length; i += 7) {
    weeks.push(days.slice(i, i + 7));
  }

  return (
    <div className="flex gap-[3px] overflow-x-auto pb-2">
      {weeks.map((week, wi) => (
        <div key={wi} className="flex flex-col gap-[3px]">
          {week.map((day) => (
            <div
              key={day.date}
              title={`${day.date}: ${day.count} revisões`}
              className={`h-3 w-3 rounded-sm ${intensity(day.count)}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
