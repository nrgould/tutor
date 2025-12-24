/**
 * Spaced Repetition System using a simplified SM-2 algorithm
 * Calculates optimal review intervals based on mastery level and review history
 */

export interface ReviewSchedule {
  nextReview: Date;
  intervalDays: number;
  urgency: 'overdue' | 'due' | 'upcoming' | 'good';
}

// Base intervals in days for different mastery levels
const BASE_INTERVALS = {
  new: 1, // Review tomorrow
  struggling: 1, // Review tomorrow
  learning: 3, // Review in 3 days
  proficient: 7, // Review in a week
  mastered: 14, // Review in 2 weeks
};

// Multipliers based on consecutive successful reviews
const INTERVAL_MULTIPLIERS = [1, 1.5, 2, 2.5, 3];

/**
 * Calculate the next review date for a topic
 */
export function calculateNextReview(
  masteryLevel: number,
  status: string,
  lastPracticed?: string,
  reviewCount: number = 0
): ReviewSchedule {
  const baseInterval = BASE_INTERVALS[status as keyof typeof BASE_INTERVALS] || BASE_INTERVALS.new;

  // Apply multiplier based on review count (capped at max multiplier)
  const multiplierIndex = Math.min(reviewCount, INTERVAL_MULTIPLIERS.length - 1);
  const multiplier = INTERVAL_MULTIPLIERS[multiplierIndex];

  // Adjust interval based on mastery level (higher mastery = longer intervals)
  const masteryAdjustment = 1 + masteryLevel;

  const intervalDays = Math.round(baseInterval * multiplier * masteryAdjustment);

  // Calculate next review date
  const lastDate = lastPracticed ? new Date(lastPracticed) : new Date();
  const nextReview = new Date(lastDate);
  nextReview.setDate(nextReview.getDate() + intervalDays);

  // Determine urgency
  const now = new Date();
  const daysUntilReview = Math.ceil(
    (nextReview.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  let urgency: ReviewSchedule['urgency'];
  if (daysUntilReview < 0) {
    urgency = 'overdue';
  } else if (daysUntilReview === 0) {
    urgency = 'due';
  } else if (daysUntilReview <= 2) {
    urgency = 'upcoming';
  } else {
    urgency = 'good';
  }

  return {
    nextReview,
    intervalDays,
    urgency,
  };
}

/**
 * Get human-readable time until review
 */
export function getReviewTimeText(nextReview: Date): string {
  const now = new Date();
  const diffMs = nextReview.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < -7) {
    return `${Math.abs(diffDays)} days overdue`;
  } else if (diffDays < -1) {
    return `${Math.abs(diffDays)} days overdue`;
  } else if (diffDays === -1) {
    return 'Yesterday';
  } else if (diffDays === 0) {
    return 'Today';
  } else if (diffDays === 1) {
    return 'Tomorrow';
  } else if (diffDays < 7) {
    return `In ${diffDays} days`;
  } else if (diffDays < 14) {
    return 'Next week';
  } else {
    return `In ${Math.round(diffDays / 7)} weeks`;
  }
}

/**
 * Sort topics by review urgency (most urgent first)
 */
export function sortByReviewUrgency<T extends { nextReview?: string; status: string; mastery_level: number }>(
  topics: T[]
): T[] {
  return [...topics].sort((a, b) => {
    const aSchedule = calculateNextReview(
      a.mastery_level,
      a.status,
      a.nextReview
    );
    const bSchedule = calculateNextReview(
      b.mastery_level,
      b.status,
      b.nextReview
    );

    // Sort by urgency priority
    const urgencyOrder = { overdue: 0, due: 1, upcoming: 2, good: 3 };
    const urgencyDiff = urgencyOrder[aSchedule.urgency] - urgencyOrder[bSchedule.urgency];

    if (urgencyDiff !== 0) return urgencyDiff;

    // If same urgency, sort by next review date
    return aSchedule.nextReview.getTime() - bSchedule.nextReview.getTime();
  });
}

/**
 * Filter topics that are due or overdue for review
 */
export function getTopicsDueForReview<T extends { next_review?: string; last_practiced?: string; status: string; mastery_level: number }>(
  topics: T[]
): T[] {
  const now = new Date();

  return topics.filter((topic) => {
    // If next_review is set, use it directly
    if (topic.next_review) {
      const nextReview = new Date(topic.next_review);
      return nextReview <= now;
    }

    // Otherwise calculate based on last practice
    const schedule = calculateNextReview(
      topic.mastery_level,
      topic.status,
      topic.last_practiced
    );

    return schedule.urgency === 'overdue' || schedule.urgency === 'due';
  });
}
