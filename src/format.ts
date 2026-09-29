import { cleanHover, type Scene } from './model';

// One block per line keeps scene files short and their git diffs readable.
export function formatScene(scene: Scene) {
  const { objects, ...head } = scene;
  const lines = objects.map(p => '    ' + JSON.stringify(cleanHover(p)));
  return JSON.stringify(head, null, 2).replace(/\n}$/, `,\n  "objects": [\n${lines.join(',\n')}\n  ]\n}\n`);
}
