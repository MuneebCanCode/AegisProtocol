import * as fc from 'fast-check';

describe('Trivial property tests', () => {
  it('string concatenation is associative', () => {
    fc.assert(
      fc.property(
        fc.string(),
        fc.string(),
        fc.string(),
        (a, b, c) => {
          expect((a + b) + c).toBe(a + (b + c));
        },
      ),
      { numRuns: 100 },
    );
  });
});
