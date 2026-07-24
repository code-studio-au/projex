import { describe, expect, it } from 'vitest';

import {
  buildRuleSuggestionMatchTextOptions,
  calculateRuleSuggestionConfidence,
  deriveRuleSuggestionPattern,
  normalizeRuleSuggestionPatternText,
  ruleSuggestionConfidenceLevel,
} from '../src/utils/ruleSuggestions';

describe('rule suggestion refinement', () => {
  it('removes unstable invoice and reference suffixes from patterns', () => {
    expect(normalizeRuleSuggestionPatternText('Qantas invoice INV-23891')).toBe(
      'qantas invoice'
    );
    expect(
      deriveRuleSuggestionPattern({
        item: 'Qantas invoice INV-23891',
        description: 'Flight booking',
      })
    ).toMatchObject({
      basis: 'item',
      normalized: 'qantas invoice',
    });
  });

  it('prefers the stable normalized text when raw references vary', () => {
    expect(
      buildRuleSuggestionMatchTextOptions({
        normalizedPattern: 'qantas invoice',
        rawPatterns: [
          'Qantas invoice INV-23891',
          'Qantas invoice INV-45102',
          'Qantas invoice INV-99210',
        ],
      })
    ).toEqual({
      proposedMatchText: 'qantas invoice',
      alternatives: [
        'qantas invoice',
        'Qantas invoice INV-23891',
        'Qantas invoice INV-45102',
      ],
    });
  });

  it('scores repeated patterns deterministically from visible evidence', () => {
    const mediumScore = calculateRuleSuggestionConfidence({
      sampleCount: 3,
      distinctTxnDateCount: 1,
      distinctProjectCount: 1,
      patternBasis: 'item',
    });
    const highScore = calculateRuleSuggestionConfidence({
      sampleCount: 5,
      distinctTxnDateCount: 3,
      distinctProjectCount: 2,
      patternBasis: 'item',
    });

    expect(mediumScore).toBe(65);
    expect(ruleSuggestionConfidenceLevel(mediumScore)).toBe('medium');
    expect(highScore).toBe(95);
    expect(ruleSuggestionConfidenceLevel(highScore)).toBe('high');
  });
});
