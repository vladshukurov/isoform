// Tiny isometric glyphs for the two kinds of block, drawn like the art.
export function BlockIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
      <path d="M8 2.5 13 5.3v5.6L8 13.7 3 10.9V5.3Z" />
      <path d="M3 5.3 8 8.1l5-2.8M8 8.1v5.6" />
    </svg>
  );
}

export function PlateIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
      <path d="M8 4.5 14 7.8v1.4L8 12.5 2 9.2V7.8Z" />
      <path d="M2 7.8 8 11.1l6-3.3M8 11.1v1.4" />
    </svg>
  );
}
