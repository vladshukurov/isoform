// Export scenes to the site without opening the editor:
//   npm run export              every scene
//   npm run export storage cicd only these
import { exportScene, listScenes } from '../server/files';

const wanted = process.argv.slice(2);
for (const { name, scene } of listScenes()) {
  if (wanted.length && !wanted.includes(name)) continue;
  console.log(exportScene(name, scene).join('\n'));
}
