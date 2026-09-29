// Hover preview with the site's timing (siteMotion.artEnter / artLeave and
// the two eases), so a scene feels the same here as on the page. Opening
// honours each block's delay; closing never replays delays.
import { useEffect, useRef, useState } from 'react';
import { BOX_KEYS, hoverBox, type Box, type Motion, type Piece } from './model';

export const ENTER = .6, LEAVE = .45;
const ease: Record<Motion, (t: number) => number> = {
  // GSAP power2.inOut
  mechanical: t => t < .5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2,
  // GSAP power4.out = cubic-bezier(.22, 1, .36, 1) on the site
  layered: t => 1 - (1 - t) ** 5,
};

type Track = { from: number; to: number; start: number; delay: number; duration: number };
const value = (track: Track | undefined, now: number, motion: Motion) => {
  if (!track) return 0;
  const t = Math.min(1, Math.max(0, (now - track.start - track.delay) / track.duration));
  return track.from + (track.to - track.from) * ease[motion](t);
};

export const lerpBox = (a: Box, b: Box, t: number) =>
  Object.fromEntries(BOX_KEYS.map(k => [k, a[k] + (b[k] - a[k]) * t])) as Box;

// Returns each block's current geometry while the hover plays in or out.
export function useHoverBoxes(objects: Piece[], motion: Motion, active: boolean): Box[] {
  const tracks = useRef(new Map<string, Track>());
  const [now, setNow] = useState(() => performance.now() / 1000);
  useEffect(() => {
    const start = performance.now() / 1000;
    for (const piece of objects) {
      const from = value(tracks.current.get(piece.id), start, motion);
      tracks.current.set(piece.id, { from, to: active ? 1 : 0, start, delay: active ? piece.delay ?? 0 : 0, duration: active ? ENTER : LEAVE });
    }
    const end = start + (active ? ENTER + Math.max(0, ...objects.map(p => p.delay ?? 0)) : LEAVE);
    let frame = 0;
    const tick = () => {
      const t = performance.now() / 1000;
      setNow(t);
      if (t < end + .02) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
    // Only a change of hover state restarts the tweens; edits apply live.
  }, [active]);
  // Blocks that appear mid-hover (paste, undo, an agent) take the current
  // pose at once; tracks of blocks that are gone are dropped.
  const ids = new Set(objects.map(p => p.id));
  for (const id of tracks.current.keys()) if (!ids.has(id)) tracks.current.delete(id);
  for (const p of objects) if (!tracks.current.has(p.id)) {
    const to = active ? 1 : 0;
    tracks.current.set(p.id, { from: to, to, start: 0, delay: 0, duration: 1 });
  }
  return objects.map(p => lerpBox(p, hoverBox(p), value(tracks.current.get(p.id), now, motion)));
}
