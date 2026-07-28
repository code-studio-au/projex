import { describe, expect, test } from 'vitest';
import { parseCliArgs } from '../scripts/cli-args.mjs';

describe('shared CLI argument parsing', () => {
  test('parses boolean flags and repeated option values', () => {
    const parsed = parseCliArgs(
      ['--browser', '--section', 'basics', '--section=privacy', '--unknown'],
      {
        booleanFlags: ['--browser'],
        valueOptions: ['--section'],
      }
    );

    expect(parsed.flags).toEqual(new Set(['--browser']));
    expect(parsed.getValues('--section')).toEqual(['basics', 'privacy']);
    expect(parsed.passthrough).toEqual(['--unknown']);
  });

  test('rejects a value option without a value', () => {
    expect(() =>
      parseCliArgs(['--section'], { valueOptions: ['--section'] })
    ).toThrow('Missing value after --section.');
  });
});
