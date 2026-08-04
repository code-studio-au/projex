import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import {
  refreshAfterAccountSwitch,
  sessionQueryOptions,
} from '../src/queries/session';
import { asUserId } from '../src/types';

describe('refreshAfterAccountSwitch', () => {
  it('removes all protected data owned by the previous account', async () => {
    const queryClient = new QueryClient();
    const previousUserId = asUserId('usr_previous');
    queryClient.setQueryData(sessionQueryOptions().queryKey, {
      userId: previousUserId,
    });
    queryClient.setQueryData(
      ['companies', previousUserId],
      [{ id: 'private-company' }]
    );
    queryClient.setQueryData(['project', previousUserId, 'prj_private'], {
      id: 'prj_private',
    });

    await refreshAfterAccountSwitch(queryClient);

    expect(
      queryClient.getQueryData(['companies', previousUserId])
    ).toBeUndefined();
    expect(
      queryClient.getQueryData(['project', previousUserId, 'prj_private'])
    ).toBeUndefined();
    expect(queryClient.getQueryData(sessionQueryOptions().queryKey)).toBeNull();
  });
});
