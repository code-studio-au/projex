import {
  ActionIcon,
  Menu,
  Tooltip,
  useComputedColorScheme,
  useMantineColorScheme,
} from '@mantine/core';
import { IconMoon, IconSun } from '@tabler/icons-react';

import { useIsHydrated } from '../hooks/useIsHydrated';
import classes from './ColorSchemeControl.module.css';

const COLOR_SCHEME_CONTROL_LABEL = 'Toggle light or dark mode';
const DISABLE_FIREFOX_BUTTON_STATE_RESTORATION = {
  autoComplete: 'off',
} as const;

function useColorSchemeControl() {
  const computedColorScheme = useComputedColorScheme('light');
  const { setColorScheme } = useMantineColorScheme();
  const isDark = computedColorScheme === 'dark';
  const isHydrated = useIsHydrated();

  return {
    isHydrated,
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
  const { isHydrated, toggle } = useColorSchemeControl();

  return (
    <Tooltip label={COLOR_SCHEME_CONTROL_LABEL} withinPortal>
      <ActionIcon
        variant="default"
        size="lg"
        aria-label={COLOR_SCHEME_CONTROL_LABEL}
        {...DISABLE_FIREFOX_BUTTON_STATE_RESTORATION}
        onClick={toggle}
        disabled={!isHydrated}
      >
        <ColorSchemeIcons size={18} />
      </ActionIcon>
    </Tooltip>
  );
}

export function ColorSchemeMenuItem() {
  const { isHydrated, toggle } = useColorSchemeControl();

  return (
    <Menu.Item
      leftSection={<ColorSchemeIcons size={16} />}
      onClick={toggle}
      disabled={!isHydrated}
    >
      {COLOR_SCHEME_CONTROL_LABEL}
    </Menu.Item>
  );
}
