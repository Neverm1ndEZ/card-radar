export function RadarScope({ size = 360 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 380 380" className="max-w-full">
      <defs>
        <radialGradient id="cr-sweep" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#c9462e" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#c9462e" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle cx="190" cy="190" r="170" stroke="var(--ink)" strokeWidth="1.5" fill="none" />
      <circle cx="190" cy="190" r="120" stroke="var(--ink)" strokeWidth="1.25" fill="none" strokeDasharray="3 4" />
      <circle cx="190" cy="190" r="72" stroke="var(--ink)" strokeWidth="1.25" fill="none" strokeDasharray="3 4" />
      <circle cx="190" cy="190" r="22" stroke="var(--ink)" strokeWidth="1.25" fill="none" />
      <line x1="20" y1="190" x2="360" y2="190" stroke="var(--ink)" strokeWidth="0.75" strokeDasharray="2 5" />
      <line x1="190" y1="20" x2="190" y2="360" stroke="var(--ink)" strokeWidth="0.75" strokeDasharray="2 5" />
      {/* sweep wedge — slow rotation */}
      <g style={{ transformOrigin: '190px 190px', animation: 'cr-radar-spin 8s linear infinite' }}>
        <path d="M190 190 L340 90 A170 170 0 0 0 190 20 Z" fill="url(#cr-sweep)" />
        <line x1="190" y1="190" x2="340" y2="90" stroke="var(--accent)" strokeWidth="1.5" />
      </g>
      <g fontFamily="var(--font-mono), monospace" fontSize="9" fill="var(--ink)">
        <g><circle cx="100" cy="120" r="5" fill="var(--accent)" /><text x="66" y="108">Magnus ▼</text></g>
        <g><circle cx="280" cy="240" r="4" fill="var(--ink)" /><text x="288" y="244">Infinia</text></g>
        <g><circle cx="240" cy="80" r="3.5" fill="var(--accent-3)" /><text x="248" y="84">Mayura ▲</text></g>
        <g><circle cx="120" cy="280" r="3" fill="var(--ink)" /><text x="78" y="298">Atlas ⚠</text></g>
        <g><circle cx="320" cy="170" r="3" fill="var(--ink)" /><text x="246" y="162">Regalia</text></g>
        <g><circle cx="170" cy="320" r="3" fill="var(--ink)" /><text x="158" y="338">SBI Elite</text></g>
      </g>
    </svg>
  );
}
