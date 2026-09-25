import { describe, it, expect } from 'vitest';
import { UnseenProblems } from './logBadge';

describe('UnseenProblems', () => {
  it('counts warnings and errors logged while the panel is closed, most severe first', () => {
    const u = new UnseenProblems();
    u.record('warn', false);
    u.record('info', false);
    u.record('warn', false);
    u.record('error', false);
    expect(u.parts().map(p => p.text)).toEqual(['1 new error', '2 new warnings']);
    expect(u.parts().map(p => p.level)).toEqual(['error', 'warn']);
  });

  it('does not count what is logged while the panel is open', () => {
    const u = new UnseenProblems();
    u.record('warn', true);
    u.record('error', true);
    expect(u.parts()).toEqual([]);
  });

  it('starts again after the panel is opened', () => {
    const u = new UnseenProblems();
    u.record('warn', false);
    u.clear();
    expect(u.parts()).toEqual([]);
    u.record('warn', false);
    expect(u.parts().map(p => p.text)).toEqual(['1 new warning']);
  });
});
