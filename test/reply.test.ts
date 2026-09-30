import { describe, expect, it } from 'vitest';
import { splitReply } from '../src/ai/reply';

// Claude's last message: the sentence for the designer, then «Дальше:» chips.
describe('the reply and its next steps', () => {
  it('takes the chips off their own line', () => {
    expect(splitReply('Ящики выезжают волной.\nДальше: Крышку выше | Ящики волной | Упростить цоколь'))
      .toEqual({ text: 'Ящики выезжают волной.', next: ['Крышку выше', 'Ящики волной', 'Упростить цоколь'] });
  });
  it('keeps a reply without them as it is', () => {
    expect(splitReply('Готово, крышка поднимается.')).toEqual({ text: 'Готово, крышка поднимается.', next: [] });
  });
  it('drops quotes, empties and long ones, keeps three', () => {
    expect(splitReply('Ок.\nдальше: «Выше» |  | ' + 'очень '.repeat(12) + '| Шире | Уже | Ниже').next).toEqual(['Выше', 'Шире', 'Уже']);
  });
});
