import { createTheme } from '@mantine/core';

/**
 * App theme (styling only).
 *
 * Goals:
 * - professional typography + spacing
 * - consistent radii + shadows
 * - sensible component defaults
 */
export const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily:
    '"Plus Jakarta Sans", "Avenir Next", "Segoe UI Variable", "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      '"Plus Jakarta Sans", "Avenir Next", "Segoe UI Variable", "Segoe UI", sans-serif',
    fontWeight: '650',
  },
  spacing: {
    xs: '0.625rem', // 10px
    sm: '0.875rem', // 14px
    md: '1.125rem', // 18px
    lg: '1.5rem', // 24px
    xl: '2rem', // 32px
  },
  radius: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.25rem',
    xl: '1.5rem',
  },
  shadows: {
    xs: '0 1px 2px rgba(0,0,0,0.06)',
    sm: '0 2px 10px rgba(0,0,0,0.06)',
    md: '0 6px 20px rgba(0,0,0,0.08)',
  },
  components: {
    AppShell: {
      styles: {
        main: {
          background:
            'radial-gradient(circle at top right, rgba(226, 232, 240, 0.45), transparent 35%), var(--mantine-color-gray-0)',
        },
      },
    },
    Card: {
      defaultProps: {
        radius: 'lg',
        withBorder: true,
        shadow: 'xs',
      },
    },
    Paper: {
      defaultProps: {
        radius: 'lg',
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(2px)',
        },
      },
    },
    Button: {
      defaultProps: {
        radius: 'md',
        size: 'sm',
      },
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
        variant: 'light',
      },
    },
    Modal: {
      defaultProps: {
        radius: 'lg',
        centered: true,
        overlayProps: { blur: 2 },
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Select: {
      defaultProps: {
        radius: 'md',
      },
    },
    NumberInput: {
      defaultProps: {
        radius: 'md',
      },
    },
    Tabs: {
      defaultProps: {
        radius: 'md',
      },
    },
    ActionIcon: {
      defaultProps: { variant: 'subtle' },
    },
  },
});
