import type { NotificationData } from '@mantine/notifications';
import { notifications } from '@mantine/notifications';

export type AppToastTone = 'info' | 'success' | 'warning' | 'error';

const toneColorMap: Record<AppToastTone, string> = {
  info: 'blue',
  success: 'green',
  warning: 'yellow',
  error: 'red',
};

export function showAppToast(
  args: Pick<NotificationData, 'message' | 'title' | 'autoClose'> & {
    tone?: AppToastTone;
  }
) {
  const { tone = 'info', autoClose, ...rest } = args;

  notifications.show({
    position: 'top-right',
    withBorder: true,
    color: toneColorMap[tone],
    autoClose:
      autoClose ??
      (tone === 'error' ? false : tone === 'warning' ? 8000 : 6000),
    ...rest,
  });
}
