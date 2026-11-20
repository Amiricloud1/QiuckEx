import { Injectable, Logger } from "@nestjs/common";
import { CircuitBreaker, CircuitBreakerOptions, CircuitState } from "./circuit-breaker";
import { MetricsService } from "../metrics/metrics.service";

/**
 * Safe, privacy-preserving correlation metadata for a dependency failure.
 * Only approved upstream request identifiers are propagated; addresses,
 * payloads, and other potentially sensitive data must never be included.
 */
export interface DependencyErrorMetadata {
  dependency: string;
  /** Upstream request id, present only when the upstream supplied one. */
  upstreamRequestId?: string;
}

@Injectable()
export class CircuitBreakerService {
  private readonly logger = new Logger(CircuitBreakerService.name);
  private readonly breakers = new Map<string, CircuitBreaker>();

  constructor(private readonly metricsService: MetricsService) {}

  /**
   * Builds structured dependency error metadata for a failed upstream call.
   * The upstream request id is included only when supplied; nothing else
   * about the request (addresses, payloads, headers) is captured.
   */
  buildDependencyErrorMetadata(
    dependency: string,
    upstreamRequestId?: string | null,
  ): DependencyErrorMetadata {
    const metadata: DependencyErrorMetadata = { dependency };
    if (typeof upstreamRequestId === "string" && upstreamRequestId.trim() !== "") {
      metadata.upstreamRequestId = upstreamRequestId.trim();
    }
    return metadata;
  }

  /**
   * Records a failure against a named breaker, attaching safe dependency
   * error metadata (including any upstream request id) for correlation.
   * Returns the metadata so callers can surface it in client responses.
   */
  recordFailure(
    name: string,
    upstreamRequestId?: string | null,
  ): DependencyErrorMetadata {
    const breaker = this.getOrCreate(name);
    breaker.recordFailure();
    const metadata = this.buildDependencyErrorMetadata(name, upstreamRequestId);
    if (metadata.upstreamRequestId) {
      this.logger.warn(
        `Circuit breaker '${name}' recorded failure (upstreamRequestId=${metadata.upstreamRequestId})`,
      );
    } else {
      this.logger.warn(`Circuit breaker '${name}' recorded failure`);
    }
    return metadata;
  }

  /**
   * Get (or lazily create) a named circuit breaker.
   */
  getOrCreate(name: string, options: CircuitBreakerOptions = {}): CircuitBreaker {
    let breaker = this.breakers.get(name);
    if (!breaker) {
      breaker = new CircuitBreaker(options);
      this.breakers.set(name, breaker);
      this.logger.log(`Circuit breaker '${name}' created (${breaker.getState()})`);
    }
    return breaker;
  }

  /**
   * Convenience accessor for the Horizon API circuit.
   */
  get horizon(): CircuitBreaker {
    return this.getOrCreate("horizon", {
      failureThreshold: 5,
      windowMs: 60_000,
      openTimeoutMs: 30_000,
      probeIntervalMs: 30_000,
      successThreshold: 1,
    });
  }

  /**
   * Records the current state of every known breaker as a metric so it is
   * observable in Prometheus and reports.
   */
  snapshotMetrics(): void {
    for (const [name, breaker] of this.breakers.entries()) {
      const state = breaker.getState();
      this.metricsService.setCircuitBreakerState(name, state);
      // Increment a transition counter every time states change.
      const stats = breaker.getStats();
      this.metricsService.setCircuitBreakerTransitions(
        name,
        stats.transitionCount,
      );
    }
  }

  /**
   * Human-readable report for admin health endpoints.
   */
  getReport(): Array<{
    name: string;
    state: CircuitState;
    failuresInWindow: number;
    failureThreshold: number;
  }> {
    return [...this.breakers.entries()].map(([name, breaker]) => {
      const stats = breaker.getStats();
      return {
        name,
        state: stats.state,
        failuresInWindow: stats.failuresInWindow,
        failureThreshold: stats.failureThreshold,
      };
    });
  }
}
