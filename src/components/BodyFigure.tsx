import type { BodyShape } from "@/lib/builds";

/** Front-view silhouette drawn from a body type's shape numbers (viewBox 100 x 160). */
export function BodyFigure({ shape, className = "" }: { shape: BodyShape; className?: string }) {
  const { shoulder: s, chest: c, waist: w, hip: h, belly: b, arm: a, leg: l, neck: n } = shape;
  const x = (dx: number) => 50 + dx;
  const torso = [
    `M ${x(-n)} 29`,
    `L ${x(n)} 29`,
    `Q ${x(s - 4)} 30 ${x(s)} 37`,
    `C ${x(c + 1)} 47 ${x(w + b)} 62 ${x(w)} 78`,
    `L ${x(h)} 95`,
    `L ${x(-h)} 95`,
    `L ${x(-w)} 78`,
    `C ${x(-w - b)} 62 ${x(-c - 1)} 47 ${x(-s)} 37`,
    `Q ${x(-s + 4)} 30 ${x(-n)} 29`,
    "Z",
  ].join(" ");
  // Arms hang from the shoulders and splay out a little more on bigger frames.
  const armX = s - a / 2 + 1;
  const elbowX = armX + 2 + a / 4 + b / 3;
  const handX = elbowX + 1;
  const legTop = h - l / 2;
  return (
    <svg viewBox="0 0 100 160" className={className} aria-hidden fill="currentColor" stroke="currentColor" strokeLinecap="round">
      <ellipse cx="50" cy="15" rx="8.5" ry="10.5" stroke="none" />
      <rect x={x(-n)} y="22" width={2 * n} height="10" stroke="none" />
      <path d={torso} stroke="none" />
      {[-1, 1].map((side) => (
        <g key={side}>
          <line x1={x(side * armX)} y1="39" x2={x(side * elbowX)} y2="64" strokeWidth={a} />
          <line x1={x(side * elbowX)} y1="64" x2={x(side * handX)} y2="90" strokeWidth={a * 0.82} />
          <line x1={x(side * legTop)} y1="96" x2={x(side * (legTop - 1))} y2="153" strokeWidth={l} />
        </g>
      ))}
    </svg>
  );
}
