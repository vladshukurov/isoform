// Стопка из трёх плит одним зазором: при наведении слои расходятся вверх волной.
import { cascade, lift, plate, row, scene } from '../src/kit';
import { GAP, GROUND } from '../src/model';

const THICK = 16;
const plates = row('layer', 3, THICK + GAP, (dz, id, i) => lift(plate(id, -100 + i * 10, -100 + i * 10, GROUND + dz, 200 - i * 20, 200 - i * 20, THICK), i * 18));

export default scene({ title: 'Слоистая защита данных', motion: 'layered', objects: cascade(plates, .06) });
