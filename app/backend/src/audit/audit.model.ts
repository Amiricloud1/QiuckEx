export interface AuditLog {
  id: string;
  actor: string;
  action: string;
  target?: string;
  metadata?: Record<string, unknown>;
  requestId?: string;
  createdAt: Date;
}

export interface QueryAuditLogsDto {
  action?: string;
  actor?: string;
  startTime?: string;
  endTime?: string;
  page?: number;
  limit?: number;
}

/**
 * Enriched audit entry recorded for feature-flag changes (issue #26).
 * Stored in `metadata` of the parent AuditLog under key `flagAuditEntry`.
 */
export interface FlagAuditEntry {
  /** Feature flag key that was changed. */
  flagKey: string;
  /** Full flag record before the change. */
  previousValue: unknown;
  /** Full flag record after the change. */
  newValue: unknown;
  /** Identity of the actor who made the change (API key id, fallback to X-Admin-Actor header). */
  actor: string;
  /** Client IP address. */
  ip: string | undefined;
  /** User-Agent header. */
  userAgent: string | undefined;
}

/**
 * Outcome of an API-key scope change attempt (issue #644).
 * `failure` entries are recorded for rejected/unauthorized attempts so that
 * failed mutations are distinguishable from successful ones in the audit trail.
 */
export type ApiKeyScopeChangeOutcome = 'success' | 'failure';

/**
 * Enriched audit entry recorded for API-key scope changes (issue #644).
 * Stored in `metadata` of the parent AuditLog under key `apiKeyScopeChangeAuditEntry`.
 *
 * Scope changes are security-relevant, so the entry captures the actor, the
 * affected key record, and the before/after scope state. The API-key secret
 * (and any signing material) is deliberately excluded from this shape.
 */
export interface ApiKeyScopeChangeAuditEntry {
  /** Identity of the actor who attempted the change (API key id, fallback to X-Admin-Actor header). */
  actor: string;
  /** Identifier of the API-key record whose scopes were changed. Never the secret. */
  keyId: string;
  /** Scopes assigned to the key before the change. */
  previousScopes: string[];
  /** Scopes assigned to the key after the change (unchanged from previous on failure). */
  newScopes: string[];
  /** Whether the scope mutation was authorized and applied. */
  outcome: ApiKeyScopeChangeOutcome;
  /** Reason the attempt failed, when `outcome` is `failure`. */
  failureReason?: string;
  /** Client IP address. */
  ip: string | undefined;
  /** User-Agent header. */
  userAgent: string | undefined;
}