/**
 * Username rules for quickex.to/yourname
 *
 * Rules are enforced server-side in UsernamesService and by DTO validation.
 * Uniqueness and race conditions are enforced by the database (Supabase) unique constraint.
 */

/** Minimum username length (inclusive). */
export const USERNAME_MIN_LENGTH = 3;

/** Maximum username length (inclusive). */
export const USERNAME_MAX_LENGTH = 32;

/**
 * Allowed characters: lowercase letters (a-z), digits (0-9), underscore (_).
 * No spaces, hyphens, or special characters.
 */
export const USERNAME_PATTERN = /^[a-z0-9_]+$/;

/**
 * Default maximum usernames per wallet when MAX_USERNAMES_PER_WALLET is not set.
 * Use 0 to mean "no limit" (only when env is not set).
 */
export const USERNAME_DEFAULT_MAX_PER_WALLET = 0;

/** Display name for the pattern (for error messages). */
export const USERNAME_PATTERN_DESCRIPTION =
  'lowercase letters, numbers, and underscores only';

/**
 * Visibility levels for a username.
 * - PUBLIC: discoverable and searchable by anyone.
 * - UNLISTED: accessible by direct link but excluded from search/discovery.
 * - PRIVATE: only visible to the owner and explicitly authorized parties.
 */
export const VISIBILITY_LEVELS = ['public', 'unlisted', 'private'] as const;

/** Visibility level type derived from VISIBILITY_LEVELS. */
export type VisibilityLevel = (typeof VISIBILITY_LEVELS)[number];

/** Default visibility applied when none is specified. */
export const DEFAULT_VISIBILITY: VisibilityLevel = 'public';

/**
 * Grace period (in milliseconds) after a rotation during which the previous
 * username remains resolvable before it is fully released.
 */
export const ROTATION_GRACE_PERIOD_MS = 24 * 60 * 60 * 1000;

/**
 * Maximum number of announcements retained/emitted per rotation.
 */
export const ROTATION_MAX_ANNOUNCEMENTS = 10;

/**
 * Size of the nonce window used to prevent replay of rotation requests.
 */
export const ROTATION_NONCE_WINDOW = 100;