import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from '@tauri-apps/plugin-notification';

export interface NotificationOptions {
  title: string;
  body?: string;
  icon?: string;
}

let permissionGranted = false;
let permissionChecked = false;

/**
 * Check and request notification permissions
 */
export async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionChecked && permissionGranted) {
    return true;
  }

  try {
    permissionGranted = await isPermissionGranted();

    if (!permissionGranted) {
      const permission = await requestPermission();
      permissionGranted = permission === 'granted';
    }

    permissionChecked = true;
    return permissionGranted;
  } catch (error) {
    console.warn('Failed to check notification permissions:', error);
    return false;
  }
}

/**
 * Send a notification to the user
 */
export async function notify(options: NotificationOptions): Promise<boolean> {
  try {
    const hasPermission = await ensureNotificationPermission();
    if (!hasPermission) {
      console.warn('Notification permission not granted');
      return false;
    }

    await sendNotification({
      title: options.title,
      body: options.body,
    });

    return true;
  } catch (error) {
    console.error('Failed to send notification:', error);
    return false;
  }
}

/**
 * Notify user about topics due for review
 */
export async function notifyReviewDue(topicCount: number, topicNames: string[]): Promise<boolean> {
  const topicsPreview = topicNames.slice(0, 3).join(', ');
  const suffix = topicCount > 3 ? ` and ${topicCount - 3} more` : '';

  return notify({
    title: `${topicCount} topic${topicCount > 1 ? 's' : ''} due for review`,
    body: `${topicsPreview}${suffix}. Open Tutor to start reviewing!`,
  });
}

/**
 * Notify user about study session completion
 */
export async function notifyStudySessionComplete(
  duration: number,
  topicsStudied: number
): Promise<boolean> {
  return notify({
    title: 'Study session complete!',
    body: `Great work! You studied for ${duration} minutes and covered ${topicsStudied} topic${topicsStudied !== 1 ? 's' : ''}.`,
  });
}

/**
 * Notify user about a learning milestone
 */
export async function notifyMilestone(message: string): Promise<boolean> {
  return notify({
    title: 'Learning Milestone!',
    body: message,
  });
}

/**
 * Notify user about break time during study sessions
 */
export async function notifyBreakTime(): Promise<boolean> {
  return notify({
    title: 'Time for a break!',
    body: "You've been studying hard. Take a 5-minute break to refresh your mind.",
  });
}
