'use client';

interface DataPoint {
  date: string;
  value: number;
}

interface SparklineProps {
  data: DataPoint[];
  width?: number;
  height?: number;
}

export function Sparkline({ data, width = 400, height = 80 }: SparklineProps) {
  if (data.length === 0) {
    return (
      <p
        className="text-muted-foreground flex items-center justify-center text-xs"
        style={{ height }}
      >
        No data yet
      </p>
    );
  }

  const values = data.map((d) => d.value);
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = max - min || 1;
  const padding = 4;
  const innerWidth = width - padding * 2;
  const innerHeight = height - padding * 2;

  const points = data.map((d, i) => {
    const x = padding + (i / Math.max(data.length - 1, 1)) * innerWidth;
    const y = padding + innerHeight - ((d.value - min) / range) * innerHeight;
    return `${x},${y}`;
  });

  const areaPoints = [
    `${padding},${padding + innerHeight}`,
    ...points,
    `${padding + innerWidth},${padding + innerHeight}`,
  ].join(' ');

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ maxHeight: height }}>
      <polygon points={areaPoints} fill="currentColor" className="text-primary/10" />
      <polyline
        points={points.join(' ')}
        fill="none"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
    </svg>
  );
}
