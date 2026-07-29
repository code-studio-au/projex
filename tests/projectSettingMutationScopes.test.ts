import { QueryClient } from '@tanstack/react-query';
import { describe, expect, test } from 'vitest';

import { projectSettingMutationScope } from '../src/queries/mutationScopes';
import { asProjectId } from '../src/types';

test('project setting scopes are stable by project and invariant group', () => {
  const projectId = asProjectId('prj_setting_scope');

  expect(projectSettingMutationScope(projectId, 'visibility')).toEqual({
    id: 'project-setting:prj_setting_scope:visibility',
  });
  expect(projectSettingMutationScope(projectId, 'structure')).toEqual({
    id: 'project-setting:prj_setting_scope:structure',
  });
  expect(projectSettingMutationScope(projectId, 'currency')).toEqual(
    projectSettingMutationScope(projectId, 'structure')
  );
  expect(
    projectSettingMutationScope(projectId, 'company-standards-sync')
  ).toEqual(projectSettingMutationScope(projectId, 'structure'));
  expect(
    projectSettingMutationScope(projectId, 'transaction-transfers')
  ).toEqual(projectSettingMutationScope(projectId, 'structure'));
});

describe('scoped project setting mutations', () => {
  test('serializes a dependent transfer write behind a structure write', async () => {
    const projectId = asProjectId('prj_setting_order');
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const events: string[] = [];
    let releaseFirst!: () => void;
    const firstGate = new Promise<void>((resolve) => {
      releaseFirst = resolve;
    });
    const mutationCache = queryClient.getMutationCache();
    const first = mutationCache.build(queryClient, {
      scope: projectSettingMutationScope(projectId, 'structure'),
      mutationFn: async () => {
        events.push('first:start');
        await firstGate;
        events.push('first:finish');
      },
    });
    const second = mutationCache.build(queryClient, {
      scope: projectSettingMutationScope(projectId, 'transaction-transfers'),
      mutationFn: async () => {
        events.push('second:start');
        events.push('second:finish');
      },
    });

    const firstRequest = first.execute(undefined);
    const secondRequest = second.execute(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual(['first:start']);

    releaseFirst();
    await Promise.all([firstRequest, secondRequest]);
    expect(events).toEqual([
      'first:start',
      'first:finish',
      'second:start',
      'second:finish',
    ]);
  });

  test('does not queue independent settings behind one another', async () => {
    const projectId = asProjectId('prj_setting_parallel');
    const queryClient = new QueryClient({
      defaultOptions: { mutations: { retry: false } },
    });
    const events: string[] = [];
    let releaseVisibility!: () => void;
    const visibilityGate = new Promise<void>((resolve) => {
      releaseVisibility = resolve;
    });
    const mutationCache = queryClient.getMutationCache();
    const visibility = mutationCache.build(queryClient, {
      scope: projectSettingMutationScope(projectId, 'visibility'),
      mutationFn: async () => {
        events.push('visibility:start');
        await visibilityGate;
        events.push('visibility:finish');
      },
    });
    const currency = mutationCache.build(queryClient, {
      scope: projectSettingMutationScope(projectId, 'currency'),
      mutationFn: async () => {
        events.push('currency:start');
        events.push('currency:finish');
      },
    });

    const visibilityRequest = visibility.execute(undefined);
    const currencyRequest = currency.execute(undefined);
    await Promise.resolve();
    await Promise.resolve();

    expect(events).toEqual([
      'visibility:start',
      'currency:start',
      'currency:finish',
    ]);

    releaseVisibility();
    await Promise.all([visibilityRequest, currencyRequest]);
  });
});
