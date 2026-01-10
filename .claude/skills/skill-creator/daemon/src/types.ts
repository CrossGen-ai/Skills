/**
 * Type definitions for the Skill Daemon
 */

export interface DaemonConfig {
  skills_root: string;
  db_path: string;
  slack_webhook_url: string;
  slack_signing_secret: string;
  port: number;
}

export interface SkillConfig {
  name: string;
  version: string;
  created: string;
  state: SkillState;
  healing: HealingConfig;
  approval: ApprovalConfig;
  eval: EvalConfig;
  memory: MemoryConfig;
  bootstrap: BootstrapConfig;
}

export type SkillState =
  | 'DRAFT'
  | 'BOOTSTRAPPING'
  | 'TDD_LOOP'
  | 'PENDING_APPROVAL'
  | 'ACTIVE'
  | 'HEALING'
  | 'DEGRADED'
  | 'FAILED_BOOTSTRAP'
  | 'ARCHIVED';

export interface HealingConfig {
  enabled: boolean;
  auto_heal_threshold: number;
  max_heal_attempts_per_day?: number;
  confidence_auto_approve: number;
  confidence_require_approval?: number;
  reason?: string;
  manual_heal_command?: string;
}

export interface ApprovalConfig {
  channel: 'slack' | 'email' | 'webhook';
  timeout_hours: number;
  timeout_action: 'auto_approve_if_confident' | 'reject' | 'escalate';
  webhook_url: string;
  escalation?: {
    after_hours: number;
    method: string;
  };
}

export interface EvalConfig {
  auto_score_dimensions: string[];
  human_score_dimensions: string[];
  request_feedback_threshold: 'all' | 'significant_runs' | 'failures_only';
  trend_window_days: number;
}

export interface MemoryConfig {
  execution_log_retention_days: number;
  consolidation_threshold_runs: number;
  drift_detection_enabled: boolean;
}

export interface BootstrapConfig {
  max_tdd_iterations: number;
  test_evaluator_model: string;
  require_human_approval_to_deploy: boolean;
}

export interface HealthCheckResult {
  timestamp: string;
  result: {
    healthy: boolean;
    completion_score: number;
    efficiency_score: number;
    reliability_score: number;
    issues: string[];
    suggested_fixes: string[];
    severity: 'none' | 'low' | 'medium' | 'high';
  };
}

export interface ExecutionLogEntry {
  timestamp: string;
  event: string;
  [key: string]: unknown;
}

export interface ProposedUpdate {
  uuid: string;
  timestamp: string;
  trigger: string;
  analysis: string;
  changes: Array<{
    file: string;
    reason: string;
  }>;
  confidence: number;
  rollback_safe: boolean;
}

export interface SlackMessage {
  text?: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

export interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: unknown[];
}

export interface SlackAttachment {
  color?: string;
  blocks?: SlackBlock[];
}
