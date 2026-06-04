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
  primaryColor: 'gray',
  defaultRadius: 'sm',
  fontFamily:
    '"Avenir Next", "Segoe UI Variable", "Inter", "Segoe UI", sans-serif',
  headings: {
    fontFamily:
      '"Avenir Next", "Segoe UI Variable", "Inter", "Segoe UI", sans-serif',
    fontWeight: '620',
  },
  spacing: {
    xs: '0.5rem',
    sm: '0.75rem',
    md: '1rem',
    lg: '1.5rem',
    xl: '2rem',
  },
  radius: {
    xs: '0.375rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.25rem',
  },
  shadows: {
    xs: '0 1px 2px rgba(15, 23, 42, 0.04)',
    sm: '0 1px 3px rgba(15, 23, 42, 0.08), 0 1px 2px rgba(15, 23, 42, 0.03)',
    md: '0 8px 24px rgba(15, 23, 42, 0.08)',
  },
  components: {
    AppShell: {
      styles: {
        main: {
          backgroundColor: 'var(--app-bg)',
        },
      },
    },
    Card: {
      defaultProps: {
        radius: 'md',
        withBorder: true,
        shadow: 'xs',
      },
    },
    Paper: {
      defaultProps: {
        radius: 'md',
        withBorder: true,
      },
      styles: {
        root: {
          backgroundColor: 'var(--surface-0)',
          borderColor: 'var(--surface-border)',
          boxShadow: 'var(--surface-shadow)',
        },
      },
    },
    Button: {
      defaultProps: {
        radius: 'sm',
        size: 'sm',
      },
      styles: {
        root: {
          fontWeight: 550,
        },
      },
    },
    Badge: {
      defaultProps: {
        radius: 'sm',
        variant: 'default',
        size: 'sm',
      },
      styles: {
        root: {
          minHeight: '1.15rem',
          paddingInline: '0.35rem',
        },
        label: {
          fontSize: '0.875rem',
          fontWeight: 400,
          textTransform: 'none',
          letterSpacing: '0',
          lineHeight: 1.2,
        },
      },
    },
    Modal: {
      defaultProps: {
        radius: 'md',
        centered: true,
        overlayProps: {
          backgroundOpacity: 0.55,
          blur: 2,
        },
      },
      styles: {
        content: {
          border: '1px solid var(--surface-border)',
          boxShadow: 'var(--surface-shadow-lg)',
          background:
            'linear-gradient(180deg, rgba(255, 255, 255, 0.98), rgba(255, 255, 255, 0.96))',
        },
        header: {
          padding: '1rem 1.1rem 0.5rem',
          background: 'transparent',
        },
        title: {
          fontSize: '1rem',
          fontWeight: 620,
          letterSpacing: '-0.01em',
        },
        body: {
          padding: '0.5rem 1.1rem 1.1rem',
        },
      },
    },
    Alert: {
      defaultProps: {
        radius: 'md',
        variant: 'light',
      },
      styles: {
        root: {
          border: '1px solid var(--surface-border)',
        },
        label: {
          fontSize: '0.92rem',
          fontWeight: 500,
          lineHeight: 1.5,
        },
        title: {
          fontSize: '0.92rem',
          fontWeight: 620,
        },
      },
    },
    TextInput: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Select: {
      defaultProps: {
        radius: 'sm',
      },
    },
    NumberInput: {
      defaultProps: {
        radius: 'sm',
      },
    },
    PasswordInput: {
      defaultProps: {
        radius: 'sm',
      },
    },
    Tabs: {
      defaultProps: {
        radius: 'sm',
      },
    },
    ActionIcon: {
      defaultProps: { variant: 'subtle' },
    },
    Table: {
      defaultProps: {
        verticalSpacing: 'sm',
        horizontalSpacing: 'md',
      },
    },
  },
});
