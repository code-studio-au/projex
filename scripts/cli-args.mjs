export function parseCliArgs(
  argv,
  { booleanFlags = [], valueOptions = [] } = {}
) {
  const knownBooleanFlags = new Set(booleanFlags);
  const knownValueOptions = new Set(valueOptions);
  const flags = new Set();
  const values = new Map(valueOptions.map((option) => [option, []]));
  const passthrough = [];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (knownBooleanFlags.has(argument)) {
      flags.add(argument);
      continue;
    }

    if (knownValueOptions.has(argument)) {
      const value = argv[index + 1];
      if (!value) throw new Error(`Missing value after ${argument}.`);
      values.get(argument).push(value);
      index += 1;
      continue;
    }

    const equalsIndex = argument.indexOf('=');
    if (equalsIndex > 0) {
      const option = argument.slice(0, equalsIndex);
      if (knownValueOptions.has(option)) {
        values.get(option).push(argument.slice(equalsIndex + 1));
        continue;
      }
    }

    passthrough.push(argument);
  }

  return {
    flags,
    getValues(option) {
      return [...(values.get(option) ?? [])];
    },
    passthrough,
  };
}
