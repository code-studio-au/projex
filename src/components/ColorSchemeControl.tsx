import {
  ActionIcon,
  Menu,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

import classes from './ColorSchemeControl.module.css';

const COLOR_SCHEME_CONTROL_LABEL = 'Toggle light or dark mode';

function useColorSchemeControl() {
  const computedColorScheme = useComputedColorScheme('light');
  const { setColorScheme } = useMantineColorScheme();
  const isDark = computedColorScheme === 'dark';

  return {
    toggle: () => setColorScheme(isDark ? 'light' : 'dark'),
  };
}

function ColorSchemeIcons({ size }: { size: number }) {
  return (
    <span className={classes.icons} aria-hidden="true">
      <IconMoon className={classes.moon} size={size} stroke={1.8} />
      <IconSun className={classes.sun} size={size} stroke={1.8} />
    </span>
  );
}

export function ColorSchemeToggle() {
  const { toggle } = useColorSchemeControl();

  return (
    <Tooltip label={COLOR_SCHEME_CONTROL_LABEL} withinPortal>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label={COLOR_SCHEME_CONTROL_LABEL}
        onClick={toggle}
      >
        <ColorSchemeIcons size={18} />
      </ActionIcon>
    </Tooltip>
  );
}

export function ColorSchemeMenuItem() {
  const { toggle } = useColorSchemeControl();

  return (
    <Menu.Item leftSection={<ColorSchemeIcons size={16} />} onClick={toggle}>
      {COLOR_SCHEME_CONTROL_LABEL}
    </Menu.Item>
  );
}
