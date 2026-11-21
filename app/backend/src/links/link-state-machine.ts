export enum LinkState {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  PAID = 'PAID',
  REFUNDED = 'REFUNDED',
}

const TRANSITIONS: Record<LinkState, LinkState[]> = {
  [LinkState.DRAFT]: [LinkState.ACTIVE],
  [LinkState.ACTIVE]: [LinkState.EXPIRED, LinkState.PAID],
  [LinkState.EXPIRED]: [LinkState.ACTIVE],
  [LinkState.PAID]: [LinkState.REFUNDED],
  [LinkState.REFUNDED]: [],
};

export function canTransition(from: LinkState, to: LinkState): boolean {
  return TRANSITIONS[from].includes(to);
}

export function applyTransition(from: LinkState, to: LinkState): LinkState {
  if (!canTransition(from, to)) {
    throw new Error(`Invalid link state transition: ${from} -> ${to}`);
  }
  return to;
}

export function getAvailableTransitions(state: LinkState): LinkState[] {
  return [...TRANSITIONS[state]];
}

/**
 * Canonical monotonic ranking of receipt/link states.
 *
 * Higher rank means "further along" in the receipt lifecycle. Reconciliation
 * uses this to ensure a late or duplicated chain event cannot regress the
 * canonical state to an earlier status.
 *
 * Note: EXPIRED is intentionally ranked below ACTIVE because an expiry
 * observation that arrives after an activation observation must not overwrite
 * the newer ACTIVE state. Re-activation is handled explicitly via the
 * LinkState transition table, not via receipt reconciliation.
 */
const RECEIPT_RANK: Record<LinkState, number> = {
  [LinkState.DRAFT]: 0,
  [LinkState.EXPIRED]: 1,
  [LinkState.ACTIVE]: 2,
  [LinkState.PAID]: 3,
  [LinkState.REFUNDED]: 4,
};

export function getReceiptRank(state: LinkState): number {
  return RECEIPT_RANK[state];
}

export type ReceiptTransitionOutcome =
  | { kind: 'applied'; state: LinkState }
  | { kind: 'duplicate'; state: LinkState }
  | { kind: 'conflict'; state: LinkState; observed: LinkState; reason: string };

/**
 * Determine whether an observed receipt status may advance the canonical
 * state. Returns true for forward (monotonic) transitions and false for
 * regressions or unrelated states.
 */
export function canTransitionReceipt(from: LinkState, to: LinkState): boolean {
  if (from === to) {
    return false;
  }
  return RECEIPT_RANK[to] > RECEIPT_RANK[from];
}

/**
 * Apply an observed receipt status to the canonical state without throwing.
 *
 * - Forward transitions advance the canonical state (`applied`).
 * - Re-observing the current state is idempotent (`duplicate`).
 * - Regressions or unrelated observations are rejected and reported as a
 *   `conflict` so callers can retain conflict evidence rather than silently
 *   overwriting newer state.
 */
export function applyReceiptTransition(
  from: LinkState,
  to: LinkState,
): ReceiptTransitionOutcome {
  if (from === to) {
    return { kind: 'duplicate', state: from };
  }
  if (canTransitionReceipt(from, to)) {
    return { kind: 'applied', state: to };
  }
  return {
    kind: 'conflict',
    state: from,
    observed: to,
    reason: `Receipt status regression rejected: ${from} -> ${to}`,
  };
}