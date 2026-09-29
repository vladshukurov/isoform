import { describe, expect, it } from 'vitest';
import { explain } from '../src/ai/errors';

// Claude Code and the API speak English and their own terms; the dock shows
// one plain sentence and the one way out.
describe('explaining a failed run', () => {
  it('turns the subscription limit into a local time and offers the API key', () => {
    expect(explain("You've hit your session limit · resets 2:40am (Asia/Almaty)")).toEqual({ text: 'Лимит подписки Claude закончился — обновится в 2:40', fix: 'api' });
    expect(explain("You've hit your weekly limit · resets Oct 3, 5pm")).toEqual({ text: 'Лимит подписки Claude закончился — обновится в Oct 3, 17:00', fix: 'api' });
    expect(explain("You've hit your usage limit")).toMatchObject({ fix: 'api' });
  });

  it('knows the API statuses', () => {
    expect(explain('API 401: invalid x-api-key')).toMatchObject({ fix: 'key' });
    expect(explain('API 400: Your credit balance is too low to access the Anthropic API')).toMatchObject({ fix: 'key' });
    expect(explain('API 529: Overloaded')).toMatchObject({ fix: 'retry', text: expect.stringContaining('перегружен') });
    expect(explain('API 500: Internal server error')).toMatchObject({ fix: 'retry' });
  });

  it('asks to sign in again when Claude Code lost its login', () => {
    expect(explain('Invalid API key · Please run /login')).toMatchObject({ fix: 'login' });
    expect(explain('Claude Code не авторизован: выполните в терминале claude')).toMatchObject({ fix: 'login' });
  });

  it('keeps anything else short, as it came', () => {
    expect(explain('trace\nНужны файл и задача')).toEqual({ text: 'Нужны файл и задача', fix: 'retry' });
  });
});
