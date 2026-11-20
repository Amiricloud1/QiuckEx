/**
 * Job Queue System - Job Repository
 * 
 * Data access layer for persisting and querying job records in Supabase.
 * Handles all database operations for the unified job queue system.
 * 
 * **Validates: Requirements 12.1, 12.2, 12.3, 12.5**
 */

import { Injectable, Logger } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { Job, JobStatus, JobType } from './types/job.types';

/**
 * Database row structure for jobs table
 * Maps to the Supabase jobs table schema
 */
interface JobRow {
  id: string;
  type: string;
  payload: unknown;
  status: string;
  attempts: number;
  max_attempts: number;
  created_at: string;
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  failure_reason: string | null;
  visibility_timeout: string | null;
}

/**
 * Filters for querying jobs
 */
export interface JobFilters {
  type?: JobType;
  status?: JobStatus;
  createdAfter?: Date;
  createdBefore?: Date;
  failureReasonContains?: string;
  limit?: number;
  offset?: number;
}

/**
 * Terminal job statuses eligible for retention cleanup.
 * Active statuses (pending, running) are never deleted.
 */
export const TERMINAL_JOB_STATUSES: readonly JobStatus[] = [
  JobStatus.COMPLETED,
  JobStatus.FAILED,
  JobStatus.CANCELLED,
];

/**
 * Safe, redacted projection of a job for operator triage.
 * Deliberately excludes payload and any credential material.
 */
export interface JobStatusProjection {
  id: string;
  type: JobType;
  status: JobStatus;
  attempts: number;
  maxAttempts: number;
  createdAt: Date;
  scheduledAt: Date;
  completedAt: Date | null;
  failureReason: string | null;
  correlationId: string | null;
}

/**
 * Result of a retention cleanup run.
 */
export interface RetentionCleanupResult {
  deleted: number;
  batches: number;
}

/**
 * Paginated job results
 */
export interface PaginatedJobs {
  jobs: Job[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Repository for job database operations
 * 
 * Provides methods for creating, updating, and querying jobs in the database.
 * All methods use the Supabase client for database access.
 */
@Injectable()
export class JobRepository {
  private readonly logger = new Logger(JobRepository.name);

  constructor(private readonly supabase: SupabaseService) {}

  /**
   * Get the Supabase client for database operations
   */
  private get client() {
    return this.supabase.getClient();
  }

  /**
   * Create a new job in the database
   * 
   * @param type - Job type
   * @param payload - Job-specific payload data
   * @param maxAttempts - Maximum retry attempts
   * @param scheduledAt - When the job should execute (defaults to now)
   * @returns The created job
   * 
   * **Validates: Requirement 12.1** - Job persistence to database
   */
  async createJob<TPayload = unknown>(
    type: JobType,
    payload: TPayload,
    maxAttempts: number,
    scheduledAt: Date = new Date(),
    idempotencyKey?: string,
  ): Promise<Job<TPayload>> {
    const jobData = {
      type,
      payload: payload as unknown,
      status: JobStatus.PENDING,
      attempts: 0,
      max_attempts: maxAttempts,
      scheduled_at: scheduledAt.toISOString(),
      ...(idempotencyKey ? { idempotency_key: idempotencyKey } : {}),
    };
    const { data, error } = await this.client
      .from('jobs')
      .insert(jobData)
      .select()
      .single();

    if (error) {
      if (idempotencyKey && error.code === '23505') {
        const existing = await this.client
          .from('jobs')
          .select('*')
          .eq('type', type)
          .eq('idempotency_key', idempotencyKey)
          .single();
        if (!existing.error && existing.data) {
          return this.mapRowToJob<TPayload>(existing.data as JobRow);
        }
      }
      this.logger.error(`Failed to create job: ${error.message}`, error);
      throw error;
    }

    this.logger.debug(`Job created: ${data.id} (type: ${type})`);
    return this.mapRowToJob<TPayload>(data as JobRow);
  }

  /**
   * Update the status of a job
   * 
   * @param jobId - Job ID
   * @param status - New status
   * @param updates - Additional fields to update
   * 
   * **Validates: Requirement 12.1** - Job state persistence
   */
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    updates: {
      attempts?: number;
      startedAt?: Date;
      completedAt?: Date;
      failureReason?: string;
      visibilityTimeout?: Date;
      scheduledAt?: Date;
    } = {},
  ): Promise<void> {
    const updateData: Record<string, unknown> = {
      status,
    };

    if (updates.attempts !== undefined) {
      updateData.attempts = updates.attempts;
    }
    if (updates.startedAt !== undefined) {
      updateData.started_at = updates.startedAt.toISOString();
    }
    if (updates.completedAt !== undefined) {
      updateData.completed_at = updates.completedAt.toISOString();
    }
    if (updates.failureReason !== undefined) {
      updateData.failure_reason = updates.failureReason;
    }
    if (updates.visibilityTimeout !== undefined) {
      updateData.visibility_timeout = updates.visibilityTimeout.toISOString();
    }
    if (updates.scheduledAt !== undefined) {
      updateData.scheduled_at = updates.scheduledAt.toISOString();
    }

    const { error } = await this.client
      .from('jobs')
      .update(updateData)
      .eq('id', jobId);

    if (error) {
      this.logger.error(`Failed to update job ${jobId}: ${error.message}`, error);
      throw error;
    }

    this.logger.debug(`Job ${jobId} updated to status: ${status}`);
  }

  /**
   * Find jobs that are due for execution
   * 
   * Returns jobs where:
   * - status is 'pending'
   * - scheduled_at is in the past
   * - visibility_timeout is null or expired
   * 
   * @param limit - Maximum number of jobs to return
   * @returns Array of due jobs
   * 
   * **Validates: Requirements 12.3, 12.5** - Efficient querying with indexes
   */
  async findDueJobs(limit: number = 100): Promise<Job[]> {
    const now = new Date().toISOString();

    const { data, error } = await this.client
      .from('jobs')
      .select('*')
      .eq('status', JobStatus.PENDING)
      .lte('scheduled_at', now)
      .or(`visibility_timeout.is.null,visibility_timeout.lt.${now}`)
      .order('scheduled_at', { ascending: true })
      .limit(limit);

    if (error) {
      this.logger.error(`Failed to find due jobs: ${error.message}`, error);
      throw error;
    }

    return (data as JobRow[]).map(row => this.mapRowToJob(row));
  }

  /**
   * Find a job by ID
   * 
   * @param jobId - Job ID
   * @returns The job, or null if not found
   */
  async findById<TPayload = unknown>(jobId: string): Promise<Job<TPayload> | null> {
    const { data, error } = await this.client
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .maybeSingle();

    // PGRST116 = "no rows returned" — treat as not found, not an error
    if (error?.code === 'PGRST116') {
      return null;
    }

    if (error) {
      this.logger.error(`Failed to find job ${jobId}: ${error.message}`, error);
      throw error;
    }

    if (!data) {
      return null;
    }

    return this.mapRowToJob<TPayload>(data as JobRow);
  }

  /**
   * List jobs with optional filters
   * 
   * @param filters - Query filters
   * @returns Paginated job results
   * 
   * **Validates: Requirement 12.5** - Efficient querying with indexes
   */
  async listJobs(filters: JobFilters = {}): Promise<PaginatedJobs> {
    const limit = filters.limit ?? 50;
    const offset = filters.offset ?? 0;

    let query = this.client
      .from('jobs')
      .select('*', { count: 'exact' });

    // Apply filters
    if (filters.type) {
      query = query.eq('type', filters.type);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.createdAfter) {
      query = query.gte('created_at', filters.createdAfter.toISOString());
    }
    if (filters.createdBefore) {
      query = query.lte('created_at', filters.createdBefore.toISOString());
    }
    if (filters.failureReasonContains) {
      query = query.ilike('failure_reason', `%${filters.failureReasonContains}%`);
    }

    // Apply pagination and ordering
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      this.logger.error(`Failed to list jobs: ${error.message}`, error);
      throw error;
    }

    return {
      jobs: (data as JobRow[]).map(row => this.mapRowToJob(row)),
      total: count ?? 0,
      limit,
      offset,
    };
  }

  /**
   * Reset stale jobs on application startup
   * 
   * Resets all jobs with status 'running' to 'pending' to handle
   * application crashes or restarts.
   * 
   * @returns Number of jobs reset
   * 
   * **Validates: Requirements 12.2, 12.3** - Application startup recovery
   */
  async resetStaleJobs(): Promise<number> {
    const { data, error } = await this.client
      .from('jobs')
      .update({
        status: JobStatus.PENDING,
        visibility_timeout: null,
      })
      .eq('status', JobStatus.RUNNING)
      .select('id');

    if (error) {
      this.logger.error(`Failed to reset stale jobs: ${error.message}`, error);
      throw error;
    }

    const count = data?.length ?? 0;
    if (count > 0) {
      this.logger.warn(`Reset ${count} stale jobs on startup`);
    }

    return count;
  }

  /**
   * Delete terminal jobs older than the given cutoff, in bounded batches.
   *
   * Only terminal statuses (completed, failed, cancelled) whose `completed_at`
   * is strictly older than `cutoff` are eligible. Active jobs (pending,
   * running) and audit-required records (`audit_required = true`) are always
   * preserved. The operation is idempotent: re-running after a successful pass
   * deletes nothing further.
   *
   * @param cutoff - Jobs completed before this instant are eligible
   * @param batchSize - Maximum rows deleted per batch (bounded)
   * @returns Count of deleted rows and number of batches executed
   */
  async deleteTerminalJobsOlderThan(
    cutoff: Date,
    batchSize: number = 500,
  ): Promise<RetentionCleanupResult> {
    if (!(cutoff instanceof Date) || Number.isNaN(cutoff.getTime())) {
      throw new Error('deleteTerminalJobsOlderThan requires a valid cutoff Date');
    }
    if (!Number.isInteger(batchSize) || batchSize <= 0) {
      throw new Error('batchSize must be a positive integer');
    }

    const cutoffIso = cutoff.toISOString();
    let deleted = 0;
    let batches = 0;

    // Loop until a batch returns fewer rows than requested (no more eligible).
    // Each iteration is bounded by batchSize, keeping memory and lock time low.
    for (;;) {
      const { data, error } = await this.client
        .from('jobs')
        .select('id')
        .in('status', TERMINAL_JOB_STATUSES as string[])
        .lt('completed_at', cutoffIso)
        .or('audit_required.is.null,audit_required.eq.false')
        .order('completed_at', { ascending: true })
        .limit(batchSize);

      if (error) {
        this.logger.error(
          `Failed to select terminal jobs for retention: ${error.message}`,
          error,
        );
        throw error;
      }

      const ids = (data as Array<{ id: string }> | null)?.map(r => r.id) ?? [];
      if (ids.length === 0) {
        break;
      }

      const { error: deleteError } = await this.client
        .from('jobs')
        .delete()
        .in('id', ids)
        .in('status', TERMINAL_JOB_STATUSES as string[])
        .lt('completed_at', cutoffIso)
        .or('audit_required.is.null,audit_required.eq.false');

      if (deleteError) {
        this.logger.error(
          `Failed to delete terminal jobs for retention: ${deleteError.message}`,
          deleteError,
        );
        throw deleteError;
      }

      deleted += ids.length;
      batches += 1;

      if (ids.length < batchSize) {
        break;
      }
    }

    if (deleted > 0) {
      this.logger.log(
        `Retention cleanup removed ${deleted} terminal jobs in ${batches} batch(es) (cutoff: ${cutoffIso})`,
      );
    }

    return { deleted, batches };
  }

  /**
   * Fetch a safe, redacted status projection for operator triage.
   *
   * Returns attempts, next retry (scheduled_at), stable failure reason,
   * status, type, timestamps and correlation id. Payload and credentials are
   * never selected.
   *
   * @param jobId - Job ID
   * @returns Projection, or null if not found
   */
  async findJobStatusProjection(jobId: string): Promise<JobStatusProjection | null> {
    const { data, error } = await this.client
      .from('jobs')
      .select(
        'id, type, status, attempts, max_attempts, created_at, scheduled_at, completed_at, failure_reason, correlation_id',
      )
      .eq('id', jobId)
      .maybeSingle();

    if (error?.code === 'PGRST116') {
      return null;
    }

    if (error) {
      this.logger.error(
        `Failed to load job status projection ${jobId}: ${error.message}`,
        error,
      );
      throw error;
    }

    if (!data) {
      return null;
    }

    const row = data as {
      id: string;
      type: string;
      status: string;
      attempts: number;
      max_attempts: number;
      created_at: string;
      scheduled_at: string;
      completed_at: string | null;
      failure_reason: string | null;
      correlation_id: string | null;
    };

    return {
      id: row.id,
      type: row.type as JobType,
      status: row.status as JobStatus,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      createdAt: new Date(row.created_at),
      scheduledAt: new Date(row.scheduled_at),
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      failureReason: row.failure_reason,
      correlationId: row.correlation_id ?? null,
    };
  }

  /**
   * Map a database row to a Job object
   * 
   * @param row - Database row
   * @returns Job object
   */
  private mapRowToJob<TPayload = unknown>(row: JobRow): Job<TPayload> {
    return {
      id: row.id,
      type: row.type as JobType,
      payload: row.payload as TPayload,
      status: row.status as JobStatus,
      attempts: row.attempts,
      maxAttempts: row.max_attempts,
      createdAt: new Date(row.created_at),
      scheduledAt: new Date(row.scheduled_at),
      startedAt: row.started_at ? new Date(row.started_at) : null,
      completedAt: row.completed_at ? new Date(row.completed_at) : null,
      failureReason: row.failure_reason,
      visibilityTimeout: row.visibility_timeout ? new Date(row.visibility_timeout) : null,
    };
  }
}