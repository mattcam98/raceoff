/** The RaceOff wordmark: chunky italic letters on a checkered flag. */
export function Logo({ size = 'm' }: { size?: 's' | 'm' | 'l' }) {
  return (
    <div className={`logo logo--${size}`} aria-label="RaceOff">
      <svg className="logo__flag" viewBox="0 0 40 40" aria-hidden>
        <path d="M6 4 V38" stroke="#fff" strokeWidth="3.5" strokeLinecap="round" />
        <path d="M7 5 Q20 1 34 6 V24 Q20 19 7 23 Z" fill="#fff" />
        <g fill="#1b1740">
          <rect x="7" y="5" width="6.5" height="6" />
          <rect x="20" y="4.5" width="6.5" height="6" />
          <rect x="13.5" y="11" width="6.5" height="6" />
          <rect x="27" y="11" width="6.5" height="6.5" />
          <rect x="7" y="17" width="6.5" height="6" />
          <rect x="20" y="17" width="6.5" height="5" />
        </g>
      </svg>
      <span className="logo__word">
        Race<b>Off</b>
      </span>
    </div>
  );
}
