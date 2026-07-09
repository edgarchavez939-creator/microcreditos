/** Logo de la marca: monograma con símbolo de peso estilizado. Escalable y nítido. */
export function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" className={className} xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="logoGrad" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7C84F4" />
          <stop offset="1" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      <rect width="48" height="48" rx="12" fill="url(#logoGrad)" />
      <circle cx="24" cy="24" r="13" stroke="white" strokeOpacity="0.35" strokeWidth="2" />
      <path d="M20 15v18M28 15v18M16 21h13a4.5 4.5 0 0 1 0 9H16M16 26h13"
        stroke="white" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
