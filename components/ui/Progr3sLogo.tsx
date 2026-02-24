export function Progr3sLogo() {
  return (
    <span className="brand__lockup">
      <span className="brand__mark" aria-hidden="true">
        <svg viewBox="0 0 120 120" role="presentation">
          <defs>
            <linearGradient id="progr3s-mark-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#9cffbe" />
              <stop offset="100%" stopColor="#52ff94" />
            </linearGradient>
          </defs>
          <circle cx="60" cy="60" r="42" />
          <path d="M30 62 C44 47, 58 55, 72 39 C79 32, 88 31, 96 40" />
          <path d="M33 78 C47 64, 62 72, 79 54" />
          <circle cx="82" cy="52" r="5" />
          <path d="M20 60 H40" />
          <path d="M80 60 H100" />
          <path d="M60 20 V40" />
          <path d="M60 80 V100" />
        </svg>
      </span>
      <span className="brand__word">progr3s</span>
    </span>
  );
}
