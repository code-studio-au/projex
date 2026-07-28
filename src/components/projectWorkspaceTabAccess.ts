export type ProjectWorkspaceTab =
  | 'budget'
  | 'transactions'
  | 'import'
  | 'settings';

export function resolveProjectWorkspaceTabAccess(args: {
  isHydrated: boolean;
  isOperationalProject: boolean;
  initialCanImport: boolean;
  initialCanProjectEdit: boolean;
  liveCanImport: boolean;
  liveCanProjectEdit: boolean;
}) {
  const {
    isHydrated,
    isOperationalProject,
    initialCanImport,
    initialCanProjectEdit,
    liveCanImport,
    liveCanProjectEdit,
  } = args;

  return {
    canImport:
      isOperationalProject &&
      (initialCanImport || (isHydrated && liveCanImport)),
    canProjectEdit: initialCanProjectEdit || (isHydrated && liveCanProjectEdit),
  };
}
