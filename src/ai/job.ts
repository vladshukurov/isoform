import type { Scene } from '../model';

// One generation run, whichever engine does it.
export type Step = { kind: 'think' | 'draft' | 'check' | 'tool' | 'text'; text: string };
export type Job = {
  prompt: string;
  file: string;
  scene: Scene;
  selection: string[];
  signal: AbortSignal;
  progress: (step: Step) => void;
  // A draft to show on the canvas; `final` drafts are complete scenes.
  draft: (scene: Scene, final: boolean) => void;
  // Claude Code: the conversation to continue, and where to report its id.
  session?: string;
  onSession?: (id: string) => void;
};
