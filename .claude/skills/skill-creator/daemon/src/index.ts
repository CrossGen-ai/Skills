/**
 * Skill Daemon - Main entry point
 *
 * Orchestrates skill monitoring, healing, and approval workflows.
 */

import express, { type Request, type Response } from 'express';
import Database from 'better-sqlite3';
import { join, resolve } from 'node:path';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SkillWatcher } from './watcher.js';
import { SkillHealer } from './healer.js';
import { SlackIntegration } from './slack.js';
import type { DaemonConfig, HealthCheckResult, SkillConfig, ProposedUpdate } from './types.js';

class SkillDaemon {
  private db: Database.Database;
  private watcher: SkillWatcher;
  private healer: SkillHealer;
  private slack: SlackIntegration;
  private app: express.Application;
  private config: DaemonConfig;

  constructor(config: DaemonConfig) {
    this.config = config;

    // Initialize SQLite database
    this.db = new Database(config.db_path);
    this.initializeDatabase();

    // Initialize components
    this.healer = new SkillHealer(config.skills_root);
    this.slack = new SlackIntegration(
      config.slack_webhook_url,
      config.slack_signing_secret
    );

    // Initialize watcher with callbacks
    this.watcher = new SkillWatcher(config.skills_root, {
      onHealthCheck: this.handleHealthCheck.bind(this),
      onProposedUpdate: this.handleProposedUpdate.bind(this),
      onConfigChange: this.handleConfigChange.bind(this),
    });

    // Initialize Express server
    this.app = express();
    this.app.use(express.json());
    this.setupRoutes();
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        name TEXT PRIMARY KEY,
        state TEXT NOT NULL,
        version TEXT,
        last_health_check TEXT,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE IF NOT EXISTS healing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT NOT NULL,
        uuid TEXT NOT NULL,
        trigger TEXT,
        status TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS pending_approvals (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT NOT NULL,
        uuid TEXT NOT NULL,
        type TEXT NOT NULL,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        expires_at TEXT
      );
    `);
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // List all skills
    this.app.get('/skills', (_req: Request, res: Response) => {
      const skills = this.listSkills();
      res.json({ skills });
    });

    // Get skill status
    this.app.get('/skills/:name', (req: Request, res: Response) => {
      const skill = this.getSkillStatus(req.params.name);
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      res.json(skill);
    });

    // Trigger healing
    this.app.post('/skills/:name/heal', async (req: Request, res: Response) => {
      const uuid = await this.healer.triggerHealing(
        req.params.name,
        'manual_trigger'
      );
      if (!uuid) {
        res.status(400).json({ error: 'Healing could not be triggered' });
        return;
      }
      res.json({ status: 'healing_started', uuid });
    });

    // Approve update
    this.app.post('/skills/:name/approve/:uuid', async (req: Request, res: Response) => {
      const success = await this.healer.applyProposedUpdate(
        req.params.name,
        req.params.uuid
      );
      if (!success) {
        res.status(400).json({ error: 'Failed to apply update' });
        return;
      }
      res.json({ status: 'approved' });
    });

    // Reject update
    this.app.post('/skills/:name/reject/:uuid', async (req: Request, res: Response) => {
      const reason = req.body.reason || 'Rejected by user';
      const success = await this.healer.rejectProposedUpdate(
        req.params.name,
        req.params.uuid,
        reason
      );
      if (!success) {
        res.status(400).json({ error: 'Failed to reject update' });
        return;
      }
      res.json({ status: 'rejected' });
    });

    // Slack webhook callbacks
    this.app.post('/slack/approve', (req: Request, res: Response) => {
      // Handle Slack interactive button for approval
      console.log('[Daemon] Slack approval received:', req.body);
      res.json({ status: 'ok' });
    });

    this.app.post('/slack/reject', (req: Request, res: Response) => {
      // Handle Slack interactive button for rejection
      console.log('[Daemon] Slack rejection received:', req.body);
      res.json({ status: 'ok' });
    });

    this.app.post('/slack/feedback', (req: Request, res: Response) => {
      // Handle Slack interactive button for feedback
      console.log('[Daemon] Slack feedback received:', req.body);
      res.json({ status: 'ok' });
    });
  }

  private listSkills(): string[] {
    const skillsRoot = this.config.skills_root;
    if (!existsSync(skillsRoot)) return [];

    return readdirSync(skillsRoot, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .filter(d => existsSync(join(skillsRoot, d.name, 'SKILL.md')))
      .map(d => d.name);
  }

  private getSkillStatus(name: string): object | null {
    const skillPath = join(this.config.skills_root, name);
    if (!existsSync(skillPath)) return null;

    const configPath = join(skillPath, 'skill-config.json');
    if (!existsSync(configPath)) return null;

    try {
      const config = JSON.parse(readFileSync(configPath, 'utf-8'));
      const recentContextPath = join(skillPath, 'memory', 'recent-context.json');
      const recentContext = existsSync(recentContextPath)
        ? JSON.parse(readFileSync(recentContextPath, 'utf-8'))
        : null;

      return {
        name,
        ...config,
        aggregate: recentContext?.aggregate || null,
      };
    } catch (error) {
      console.error(`[Daemon] Error reading skill ${name}:`, error);
      return null;
    }
  }

  private async handleHealthCheck(
    skillName: string,
    result: HealthCheckResult
  ): Promise<void> {
    console.log(`[Daemon] Health check for ${skillName}: healthy=${result.result.healthy}`);

    // Update database
    this.db
      .prepare(
        `INSERT OR REPLACE INTO skills (name, state, last_health_check, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(skillName, result.result.healthy ? 'ACTIVE' : 'DEGRADED', JSON.stringify(result));

    // Check if healing is needed
    const recentChecks = this.getRecentHealthChecks(skillName);
    const shouldHeal = await this.healer.shouldHeal(skillName, recentChecks);

    if (shouldHeal) {
      console.log(`[Daemon] Triggering healing for ${skillName}`);
      const uuid = await this.healer.triggerHealing(skillName, 'health_check_failure');

      if (uuid) {
        await this.slack.notifyHealthAlert(skillName, result);
      }
    }
  }

  private getRecentHealthChecks(skillName: string): HealthCheckResult[] {
    const path = join(this.config.skills_root, skillName, 'memory', 'health-checks.jsonl');
    if (!existsSync(path)) return [];

    const content = readFileSync(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    return lines.slice(-10).map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(Boolean);
  }

  private async handleProposedUpdate(
    skillName: string,
    updatePath: string
  ): Promise<void> {
    console.log(`[Daemon] Proposed update detected for ${skillName} at ${updatePath}`);

    const manifestPath = join(updatePath, 'manifest.json');
    if (!existsSync(manifestPath)) return;

    try {
      const manifest = JSON.parse(
        readFileSync(manifestPath, 'utf-8')
      ) as ProposedUpdate;

      // Store pending approval
      this.db
        .prepare(
          `INSERT INTO pending_approvals (skill_name, uuid, type, expires_at)
           VALUES (?, ?, 'update', datetime('now', '+24 hours'))`
        )
        .run(skillName, manifest.uuid);

      // Send Slack notification
      await this.slack.notifyUpdateProposed(skillName, manifest);
    } catch (error) {
      console.error(`[Daemon] Error processing proposed update:`, error);
    }
  }

  private async handleConfigChange(
    skillName: string,
    config: SkillConfig
  ): Promise<void> {
    console.log(`[Daemon] Config change for ${skillName}: state=${config.state}`);

    this.db
      .prepare(
        `INSERT OR REPLACE INTO skills (name, state, version, updated_at)
         VALUES (?, ?, ?, CURRENT_TIMESTAMP)`
      )
      .run(skillName, config.state, config.version);
  }

  async start(): Promise<void> {
    // Start file watcher
    this.watcher.start();

    // Start Express server
    this.app.listen(this.config.port, () => {
      console.log(`[Daemon] Running on port ${this.config.port}`);
      console.log(`[Daemon] Watching skills in: ${this.config.skills_root}`);
    });

    // Schedule nightly audit (runs at 2am)
    this.scheduleNightlyAudit();
  }

  private scheduleNightlyAudit(): void {
    const runAudit = async () => {
      console.log('[Daemon] Running nightly audit...');

      const skills = this.listSkills();
      for (const skill of skills) {
        try {
          await this.auditSkill(skill);
        } catch (error) {
          console.error(`[Daemon] Error auditing ${skill}:`, error);
        }
      }
    };

    // Calculate time until 2am
    const now = new Date();
    const next2am = new Date(now);
    next2am.setHours(2, 0, 0, 0);
    if (next2am <= now) {
      next2am.setDate(next2am.getDate() + 1);
    }
    const msUntil2am = next2am.getTime() - now.getTime();

    // Schedule first run
    setTimeout(() => {
      runAudit();
      // Then run every 24 hours
      setInterval(runAudit, 24 * 60 * 60 * 1000);
    }, msUntil2am);

    console.log(`[Daemon] Nightly audit scheduled for ${next2am.toISOString()}`);
  }

  private async auditSkill(skillName: string): Promise<void> {
    console.log(`[Daemon] Auditing ${skillName}...`);
    // Placeholder for:
    // - Log pruning (remove old entries)
    // - Lesson consolidation
    // - Drift detection
    // - Stale approval cleanup
  }

  async stop(): Promise<void> {
    this.watcher.stop();
    this.db.close();
    console.log('[Daemon] Stopped');
  }
}

// Main entry point
async function main(): Promise<void> {
  const config: DaemonConfig = {
    skills_root: resolve(process.env.SKILLS_ROOT || '.claude/skills'),
    db_path: resolve(
      process.env.SKILL_DAEMON_DB || '.claude/skills/skill-creator/daemon/skills.db'
    ),
    slack_webhook_url: process.env.SKILL_SLACK_WEBHOOK || '',
    slack_signing_secret: process.env.SKILL_SLACK_SIGNING_SECRET || '',
    port: parseInt(process.env.SKILL_DAEMON_PORT || '3847', 10),
  };

  console.log('[Daemon] Starting with config:', {
    ...config,
    slack_webhook_url: config.slack_webhook_url ? '[SET]' : '[NOT SET]',
    slack_signing_secret: config.slack_signing_secret ? '[SET]' : '[NOT SET]',
  });

  const daemon = new SkillDaemon(config);

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n[Daemon] Shutting down...');
    await daemon.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    console.log('\n[Daemon] Shutting down...');
    await daemon.stop();
    process.exit(0);
  });

  await daemon.start();
}

main().catch(console.error);
