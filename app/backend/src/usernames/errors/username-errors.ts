/**
 * Username-specific errors for deterministic conflict and validation handling.
 */

export enum UsernameErrorCode {
  /** Username is already taken (uniqueness conflict). */
  CONFLICT = 'USERNAME_CONFLICT',
  /** Wallet has reached the maximum allowed usernames. */
  LIMIT_EXCEEDED = 'USERNAME_LIMIT_EXCEEDED',
  /** Username format invalid (length or pattern). */
  INVALID_FORMAT = 'USERNAME_INVALID_FORMAT',
  /** Username not found. */
  NOT_FOUND = 'USERNAME_NOT_FOUND',
  /** Claim signature is invalid, expired, or not backed by a Stellar account. */
  CLAIM_INVALID = 'USERNAME_CLAIM_INVALID',
  /** Key rotation has been announced but is not yet active. */
  ROTATION_ANNOUNCED = 'USERNAME_ROTATION_ANNOUNCED',
  /** Key rotation is within its grace period. */
  ROTATION_GRACE_ACTIVE = 'USERNAME_ROTATION_GRACE_ACTIVE',
  /** Key rotation has been revoked. */
  ROTATION_REVOKED = 'USERNAME_ROTATION_REVOKED',
  /** Key rotation replay detected. */
  ROTATION_REPLAY = 'USERNAME_ROTATION_REPLAY',
  /** Key rotation record not found. */
  ROTATION_NOT_FOUND = 'USERNAME_ROTATION_NOT_FOUND',
  /** Key rotation has expired. */
  ROTATION_EXPIRED = 'USERNAME_ROTATION_EXPIRED',
  /** Visibility level change is not permitted. */
  VISIBILITY_FORBIDDEN = 'USERNAME_VISIBILITY_FORBIDDEN',
}

export enum VisibilityLevel {
  PRIVATE = 'private',
  UNLISTED = 'unlisted',
  PUBLIC = 'public',
}

export class UsernameConflictError extends Error {
  constructor(
    public readonly username: string,
    message = `Username "${username}" is already taken`,
  ) {
    super(message);
    this.name = 'UsernameConflictError';
  }
}

export class UsernameLimitExceededError extends Error {
  constructor(
    public readonly publicKey: string,
    public readonly limit: number,
    message?: string,
  ) {
    super(
      message ??
        `Wallet has reached the maximum of ${limit} username(s). Cannot register more.`,
    );
    this.name = 'UsernameLimitExceededError';
  }
}

export class UsernameValidationError extends Error {
  constructor(
    public code: UsernameErrorCode,
    message: string,
    public field?: string,
  ) {
    super(message);
    this.name = 'UsernameValidationError';
  }
}

export class UsernameClaimInvalidError extends Error {
  constructor(message = 'Username claim signature is invalid or expired') {
    super(message);
    this.name = 'UsernameClaimInvalidError';
  }
}

export class ProfileVisibilityError extends Error {
  constructor(
    public readonly code: UsernameErrorCode,
    message: string,
    public readonly visibility?: VisibilityLevel,
  ) {
    super(message);
    this.name = 'ProfileVisibilityError';
  }
}

export class KeyRotationError extends Error {
  constructor(
    public readonly code: UsernameErrorCode,
    message: string,
    public readonly username?: string,
  ) {
    super(message);
    this.name = 'KeyRotationError';
  }
}
