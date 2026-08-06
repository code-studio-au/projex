import { describe, expect, it } from 'vitest';

import { getAssignableProjectUserOptions } from '../src/components/projectSettings/projectUserOptions';
import { asUserId } from '../src/types';

describe('getAssignableProjectUserOptions', () => {
  it('offers only company users who are not already project users', () => {
    const assignedUserId = asUserId('usr_assigned');
    const availableUserId = asUserId('usr_available');

    expect(
      getAssignableProjectUserOptions(
        [
          {
            id: assignedUserId,
            name: 'Assigned User',
            email: 'assigned@example.com',
          },
          {
            id: availableUserId,
            name: 'Available User',
            email: 'available@example.com',
          },
        ],
        [{ userId: assignedUserId }]
      )
    ).toEqual([
      {
        value: availableUserId,
        label: 'Available User (available@example.com)',
      },
    ]);
  });
});
