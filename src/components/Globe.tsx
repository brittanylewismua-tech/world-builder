export function Globe({
  size = 520,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  const meridians = [0.18, 0.42, 0.68, 0.92];
  const parallels = [-0.72, -0.42, 0, 0.42, 0.72];
  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <defs>
        <radialGradient id="gball" cx="34%" cy="28%" r="82%">
          <stop offset="0%" stopColor="#ff9ad9" />
          <stop offset="52%" stopColor="#ee6fc0" />
          <stop offset="100%" stopColor="#5d1f47" />
        </radialGradient>
      </defs>
      <circle cx="100" cy="100" r="82" fill="url(#gball)" opacity="0.16" />
      <circle
        cx="100"
        cy="100"
        r="82"
        fill="none"
        stroke="#ee6fc0"
        strokeWidth="1.1"
        opacity="0.85"
      />
      <g stroke="#ee6fc0" strokeWidth="0.7" fill="none" opacity="0.55">
        {meridians.map((m, i) => (
          <ellipse key={i} cx="100" cy="100" rx={82 * m} ry="82" />
        ))}
        {parallels.map((p, i) => {
          const cy = 100 + p * 82;
          const rx = 82 * Math.sqrt(Math.max(0, 1 - p * p));
          return <ellipse key={i} cx="100" cy={cy} rx={rx} ry={rx * 0.16} />;
        })}
        <line x1="100" y1="18" x2="100" y2="182" />
      </g>
    </svg>
  );
}

export function Sparkle({
  size = 18,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden
    >
      <path
        d="M12 0c.7 6.4 4.9 10.6 12 12-7.1 1.4-11.3 5.6-12 12-.7-6.4-4.9-10.6-12-12C7.1 10.6 11.3 6.4 12 0z"
        fill="currentColor"
      />
    </svg>
  );
}
