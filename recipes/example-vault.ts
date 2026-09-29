// Сейф: корпус, дверца на правой грани и крышка одним зазором выше.
// При наведении дверца выдвигается из корпуса (морф, как ящик в storage),
// а крышка чуть позже приподнимается.
import { block, grow, lift, onTop, scene } from '../src/kit';
import { GROUND } from '../src/model';

const body = block('vault-body', -70, -80, GROUND, 140, 160, 150);
const door = block('vault-door', 70, -56, GROUND + 22, 10, 112, 106);
const cap = onTop(body, 'vault-cap', { w: 150, d: 170, h: 10 });

export default scene({
  title: 'Сейф с выдвижной дверцей',
  motion: 'mechanical',
  objects: [body, grow(door, { w: 40 }), lift(cap, 16, .08)],
});
