export type ParsedCliArgs = {
  flags: Set<string>;
  getValues(option: string): string[];
  passthrough: string[];
};

export declare function parseCliArgs(
  argv: string[],
  options?: {
    booleanFlags?: string[];
    valueOptions?: string[];
  }
): ParsedCliArgs;
