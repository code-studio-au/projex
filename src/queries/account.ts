import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useApi } from '../hooks/useApi';
import { qk } from './keys';

export function useUpdateCurrentUserProfileMutation() {
  const api = useApi();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.updateCurrentUserProfile(input),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: qk.users() });
    },
  });
}
