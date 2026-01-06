/**
 * Enhanced Spaced Repetition System using SM-2 algorithm with improvements
 *
 * Based on SuperMemo SM-2 with additional features:
 * - Easiness Factor (EF) tracking per topic
 * - Quality grades (0-5) for review performance
 * - Adaptive intervals based on performance history
 * - Forgetting curve modeling with time decay
 * - Leitner-style box progression for struggling topics
 */

export interface ReviewSchedule {
  nextReview: Date;
  intervalDays: number;
  urgency: 'overdue' | 'due' | 'upcoming' | 'good';
  effectiveMastery: number; // Mastery adjusted for time decay
}

export interface ReviewResult {
  quality: 0 | 1 | 2 | 3 | 4 | 5; // 0=complete blackout, 5=perfect recall
  newEasiness: number;
  newInterval: number;
  newMastery: number;
  nextReview: Date;
}

export interface TopicReviewState {
  easinessFactor: number; // EF, starts at 2.5
  intervalDays: number;
  repetitions: number; // Consecutive successful reviews (quality >= 3)
  lastQuality?: number;
}

// Default easiness factor (SM-2 standard)
const DEFAULT_EF = 2.5;
const MIN_EF = 1.3;
const MAX_EF = 3.0;

// Base intervals in days for initial learning phase
const INITIAL_INTERVALS = {
  new: 1,
  struggling: 1,
  learning: 1,
  proficient: 6,
  mastered: 14,
};

// Forgetting curve parameters (Ebbinghaus-inspired)
const FORGETTING_CURVE = {
  halfLife: 7, // Days until memory strength halves without review
  minRetention: 0.2, // Minimum retention (never fully forget)
};

/**
 * Calculate memory retention based on time since last review
 * Uses exponential decay model based on forgetting curve research
 */
export function calculateRetention(
  daysSinceReview: number,
  strength: number = 1.0, // Memory strength (affected by EF and repetitions)
  halfLife: number = FORGETTING_CURVE.halfLife
): number {
  if (daysSinceReview <= 0) return 1.0;

  // Exponential decay: R = e^(-t/S) where S is stability
  // Stability increases with successful reviews
  const stability = halfLife * strength;
  const retention = Math.exp(-daysSinceReview / stability);

  // Apply minimum retention floor
  return Math.max(FORGETTING_CURVE.minRetention, retention);
}

/**
 * Calculate effective mastery accounting for time decay
 */
export function calculateEffectiveMastery(
  baseMastery: number,
  lastPracticed?: string,
  easinessFactor: number = DEFAULT_EF,
  repetitions: number = 0
): number {
  if (!lastPracticed) return baseMastery;

  const daysSince = Math.max(0,
    (Date.now() - new Date(lastPracticed).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Memory strength increases with EF and repetitions
  const strength = (easinessFactor / DEFAULT_EF) * (1 + repetitions * 0.1);
  const retention = calculateRetention(daysSince, strength);

  // Effective mastery decays but never below 20% of base
  return Math.max(baseMastery * 0.2, baseMastery * retention);
}

/**
 * SM-2 Easiness Factor update
 * EF' = EF + (0.1 - (5-q) * (0.08 + (5-q) * 0.02))
 */
export function updateEasinessFactor(currentEF: number, quality: number): number {
  const newEF = currentEF + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
  return Math.max(MIN_EF, Math.min(MAX_EF, newEF));
}

/**
 * Calculate next interval using SM-2 algorithm
 */
export function calculateSM2Interval(
  quality: number,
  repetitions: number,
  previousInterval: number,
  easinessFactor: number
): { interval: number; newRepetitions: number } {
  // If quality < 3, reset to beginning (failed recall)
  if (quality < 3) {
    return { interval: 1, newRepetitions: 0 };
  }

  let interval: number;
  const newRepetitions = repetitions + 1;

  if (newRepetitions === 1) {
    interval = 1;
  } else if (newRepetitions === 2) {
    interval = 6;
  } else {
    // I(n) = I(n-1) * EF
    interval = Math.round(previousInterval * easinessFactor);
  }

  // Apply quality modifier for intervals
  // Higher quality = slightly longer intervals
  if (quality === 5) {
    interval = Math.round(interval * 1.1);
  } else if (quality === 3) {
    interval = Math.round(interval * 0.9);
  }

  return { interval: Math.max(1, interval), newRepetitions };
}

/**
 * Process a review result and calculate new scheduling
 */
export function processReview(
  quality: 0 | 1 | 2 | 3 | 4 | 5,
  currentState: TopicReviewState,
  currentMastery: number
): ReviewResult {
  // Update easiness factor
  const newEasiness = updateEasinessFactor(currentState.easinessFactor, quality);

  // Calculate new interval
  const { interval, newRepetitions } = calculateSM2Interval(
    quality,
    currentState.repetitions,
    currentState.intervalDays,
    newEasiness
  );

  // Update mastery based on quality
  let masteryDelta = 0;
  if (quality >= 4) {
    masteryDelta = 0.05 + (quality - 4) * 0.03; // +5-8%
  } else if (quality === 3) {
    masteryDelta = 0.02; // +2%
  } else if (quality === 2) {
    masteryDelta = -0.05; // -5%
  } else {
    masteryDelta = -0.1 - (2 - quality) * 0.05; // -10-20%
  }

  const newMastery = Math.max(0, Math.min(1, currentMastery + masteryDelta));

  // Calculate next review date
  const nextReview = new Date();
  nextReview.setDate(nextReview.getDate() + interval);

  return {
    quality,
    newEasiness,
    newInterval: interval,
    newMastery,
    nextReview,
  };
}

/**
 * Get default review state for a topic based on its status
 */
export function getDefaultReviewState(status: string, masteryLevel: number): TopicReviewState {
  // Estimate repetitions from mastery level
  const estimatedReps = Math.floor(masteryLevel * 10);

  // Estimate EF from mastery (higher mastery = easier recall typically)
  const estimatedEF = DEFAULT_EF + (masteryLevel - 0.5) * 0.4;

  return {
    easinessFactor: Math.max(MIN_EF, Math.min(MAX_EF, estimatedEF)),
    intervalDays: INITIAL_INTERVALS[status as keyof typeof INITIAL_INTERVALS] || 1,
    repetitions: estimatedReps,
  };
}

/**
 * Calculate the next review date for a topic (enhanced version)
 */
export function calculateNextReview(
  masteryLevel: number,
  status: string,
  lastPracticed?: string,
  reviewCount: number = 0,
  easinessFactor: number = DEFAULT_EF
): ReviewSchedule {
  // Get effective mastery with time decay
  const effectiveMastery = calculateEffectiveMastery(
    masteryLevel,
    lastPracticed,
    easinessFactor,
    reviewCount
  );

  // Determine base interval from status
  let baseInterval = INITIAL_INTERVALS[status as keyof typeof INITIAL_INTERVALS] || 1;

  // For established topics, use SM-2 style calculation
  if (reviewCount > 0 && lastPracticed) {
    const daysSinceLast = Math.max(1,
      Math.ceil((Date.now() - new Date(lastPracticed).getTime()) / (1000 * 60 * 60 * 24))
    );

    // If they've been reviewing successfully, extend interval
    if (reviewCount >= 2) {
      baseInterval = Math.round(daysSinceLast * easinessFactor);
    }
  }

  // Apply mastery adjustment (higher mastery = longer intervals)
  const masteryMultiplier = 1 + effectiveMastery;
  const intervalDays = Math.max(1, Math.round(baseInterval * masteryMultiplier));

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
  if (daysUntilReview < -3) {
    urgency = 'overdue';
  } else if (daysUntilReview <= 0) {
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
    effectiveMastery,
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
 * Sort topics by review urgency with effective mastery consideration
 */
export function sortByReviewUrgency<T extends {
  next_review?: string;
  last_practiced?: string;
  status: string;
  mastery_level: number;
}>(topics: T[]): T[] {
  return [...topics].sort((a, b) => {
    const aSchedule = calculateNextReview(
      a.mastery_level,
      a.status,
      a.last_practiced
    );
    const bSchedule = calculateNextReview(
      b.mastery_level,
      b.status,
      b.last_practiced
    );

    // Sort by urgency priority
    const urgencyOrder = { overdue: 0, due: 1, upcoming: 2, good: 3 };
    const urgencyDiff = urgencyOrder[aSchedule.urgency] - urgencyOrder[bSchedule.urgency];

    if (urgencyDiff !== 0) return urgencyDiff;

    // If same urgency, prioritize lower effective mastery (needs more practice)
    const masteryDiff = aSchedule.effectiveMastery - bSchedule.effectiveMastery;
    if (Math.abs(masteryDiff) > 0.1) return masteryDiff;

    // Finally, sort by next review date
    return aSchedule.nextReview.getTime() - bSchedule.nextReview.getTime();
  });
}

/**
 * Filter topics that are due or overdue for review
 */
export function getTopicsDueForReview<T extends {
  next_review?: string;
  last_practiced?: string;
  status: string;
  mastery_level: number;
}>(topics: T[]): T[] {
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

/**
 * Calculate optimal daily review count based on workload
 */
export function calculateDailyReviewTarget(
  totalTopics: number,
  averageRetention: number = 0.85
): number {
  // Aim to review enough to maintain target retention
  // Based on spaced repetition research: ~20 items/day is sustainable
  const baseTarget = Math.min(20, Math.ceil(totalTopics * 0.15));

  // Adjust based on current retention (lower retention = more reviews)
  const retentionAdjustment = 1 + (0.85 - averageRetention);

  return Math.max(5, Math.round(baseTarget * retentionAdjustment));
}

/**
 * Get recommended quality grade based on self-reported confidence
 */
export function confidenceToQuality(confidence: 'forgot' | 'hard' | 'good' | 'easy'): 0 | 1 | 2 | 3 | 4 | 5 {
  switch (confidence) {
    case 'forgot': return 1;
    case 'hard': return 3;
    case 'good': return 4;
    case 'easy': return 5;
    default: return 3;
  }
}

/**
 * Estimate topic difficulty based on review history
 */
export function estimateDifficulty(
  easinessFactor: number,
  failedReviews: number,
  totalReviews: number
): 'easy' | 'medium' | 'hard' {
  if (totalReviews === 0) return 'medium';

  const failRate = failedReviews / totalReviews;

  if (easinessFactor >= 2.5 && failRate < 0.1) return 'easy';
  if (easinessFactor < 2.0 || failRate > 0.3) return 'hard';
  return 'medium';
}
