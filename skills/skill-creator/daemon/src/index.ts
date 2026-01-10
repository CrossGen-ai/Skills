import express, { Request, Response } from 'express';
import { watch, FSWatcher } from 'chokidar';
import Database from 'better-sqlite3';
import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { SkillWatcher } from './watcher.js';
import { SkillHealer } from './healer.js';
import { SlackNotifier } from './slack.js';

interface DaemonConfig {
  skills_root: string;
  db_path: string;
  slack_webhook_url: string;
  slack_signing_secret: string;
  port: number;
}

interface SkillState {
  name: string;
  state: string;
  last_updated: string;
  health_score: number;
}

class SkillDaemon {
  private db: Database.Database;
  private watcher: SkillWatcher;
  private healer: SkillHealer;
  private slack: SlackNotifier;
  private app: express.Application;
  private config: DaemonConfig;

  constructor(config: DaemonConfig) {
    this.config = config;
    this.db = new Database(config.db_path);
    this.watcher = new SkillWatcher(config.skills_root);
    this.healer = new SkillHealer(config.skills_root, this.db);
    this.slack = new SlackNotifier(config.slack_webhook_url);
    this.app = express();
    this.initializeDatabase();
    this.setupRoutes();
  }

  private initializeDatabase(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS skills (
        name TEXT PRIMARY KEY,
        state TEXT NOT NULL DEFAULT 'DRAFT',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        health_score REAL DEFAULT 1.0,
        healing_attempts_today INTEGER DEFAULT 0,
        last_healing_date TEXT
      );

      CREATE TABLE IF NOT EXISTS healing_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        skill_name TEXT NOT NULL,
        triggered_at TEXT NOT NULL,
        trigger_reason TEXT,
        result TEXT,
        confidence REAL,
        approved INTEGER DEFAULT 0,
        FOREIGN KEY (skill_name) REFERENCES skills(name)
      );

      CREATE TABLE IF NOT EXISTS pending_approvals (
        uuid TEXT PRIMARY KEY,
        skill_name TEXT NOT NULL,
        proposed_at TEXT NOT NULL,
        changes TEXT NOT NULL,
        confidence REAL,
        status TEXT DEFAULT 'pending',
        FOREIGN KEY (skill_name) REFERENCES skills(name)
      );
    `);
    console.log('Database initialized');
  }

  private setupRoutes(): void {
    this.app.use(express.json());

    // Health check
    this.app.get('/health', (_req: Request, res: Response) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // List all skills
    this.app.get('/skills', (_req: Request, res: Response) => {
      const skills = this.db.prepare('SELECT * FROM skills').all();
      res.json(skills);
    });

    // Get specific skill status
    this.app.get('/skills/:name', (req: Request, res: Response) => {
      const skill = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(req.params.name);
      if (skill) {
        res.json(skill);
      } else {
        res.status(404).json({ error: 'Skill not found' });
      }
    });

    // Register a new skill
    this.app.post('/skills', (req: Request, res: Response) => {
      const { name, state = 'DRAFT' } = req.body;
      const now = new Date().toISOString();
      try {
        this.db.prepare(`
          INSERT INTO skills (name, state, created_at, updated_at)
          VALUES (?, ?, ?, ?)
        `).run(name, state, now, now);
        res.json({ success: true, name, state });
      } catch (err) {
        res.status(400).json({ error: (err as Error).message });
      }
    });

    // Update skill state
    this.app.patch('/skills/:name', (req: Request, res: Response) => {
      const { state } = req.body;
      const now = new Date().toISOString();
      const result = this.db.prepare(`
        UPDATE skills SET state = ?, updated_at = ? WHERE name = ?
      `).run(state, now, req.params.name);
      if (result.changes > 0) {
        res.json({ success: true });
      } else {
        res.status(404).json({ error: 'Skill not found' });
      }
    });

    // Trigger healing
    this.app.post('/skills/:name/heal', async (req: Request, res: Response) => {
      const skillName = req.params.name;
      const skill = this.db.prepare('SELECT * FROM skills WHERE name = ?').get(skillName) as SkillState | undefined;
      if (!skill) {
        res.status(404).json({ error: 'Skill not found' });
        return;
      }
      try {
        await this.healer.triggerHealing(skillName, 'manual');
        res.json({ success: true, message: `Healing triggered for ${skillName}` });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    // Approve pending update
    this.app.post('/skills/:name/approve/:uuid', (req: Request, res: Response) => {
      const { name, uuid } = req.params;
      try {
        const approval = this.db.prepare(`
          SELECT * FROM pending_approvals WHERE uuid = ? AND skill_name = ?
        `).get(uuid, name);
        if (!approval) {
          res.status(404).json({ error: 'Approval not found' });
          return;
        }
        this.db.prepare(`
          UPDATE pending_approvals SET status = 'approved' WHERE uuid = ?
        `).run(uuid);
        // Apply the changes (in real implementation, this would move files)
        res.json({ success: true, message: 'Changes approved' });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });

    // Reject pending update
    this.app.post('/skills/:name/reject/:uuid', (req: Request, res: Response) => {
      const { uuid } = req.params;
      this.db.prepare(`
        UPDATE pending_approvals SET status = 'rejected' WHERE uuid = ?
      `).run(uuid);
      res.json({ success: true, message: 'Changes rejected' });
    });

    // Slack webhook callbacks
    this.app.post('/slack/approve', async (req: Request, res: Response) => {
      const { payload } = req.body;
      // Process Slack interactive message
      console.log('Slack approval received:', payload);
      res.json({ success: true });
    });

    this.app.post('/slack/reject', async (req: Request, res: Response) => {
      const { payload } = req.body;
      console.log('Slack rejection received:', payload);
      res.json({ success: true });
    });

    this.app.post('/slack/feedback', async (req: Request, res: Response) => {
      const { skill_name, session_id, scores, comment } = req.body;
      const skillPath = join(this.config.skills_root, skill_name, 'memory', 'user-feedback.jsonl');
      const feedback = {
        timestamp: new Date().toISOString(),
        session_id,
        scores,
        comment,
        source: 'slack'
      };
      try {
        const dir = dirname(skillPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        const existing = existsSync(skillPath) ? readFileSync(skillPath, 'utf-8') : '';
        writeFileSync(skillPath, existing + JSON.stringify(feedback) + '\n');
        res.json({ success: true });
      } catch (err) {
        res.status(500).json({ error: (err as Error).message });
      }
    });
  }

  async start(): Promise<void> {
    // Start file watcher
    this.watcher.start((skillName: string, event: string) => {
      console.log(`Skill ${skillName}: ${event}`);
      if (event === 'health_check_update') {
        this.evaluateHealingNeed(skillName);
      }
    });

    // Start express server
    this.app.listen(this.config.port, () => {
      console.log(`Skill daemon running on port ${this.config.port}`);
    });

    // Schedule nightly audit
    this.scheduleNightlyAudit();

    // Send startup notification
    if (this.config.slack_webhook_url) {
      await this.slack.send({
        text: '🚀 Skill Daemon Started',
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*Skill Daemon Online*\nPort: ${this.config.port}\nSkills Root: ${this.config.skills_root}`
            }
          }
        ]
      });
    }
  }

  private async evaluateHealingNeed(skillName: string): Promise<void> {
    // Skip skill-creator itself
    if (skillName === 'skill-creator') {
      return;
    }

    const healthPath = join(this.config.skills_root, skillName, 'memory', 'health-checks.jsonl');
    if (!existsSync(healthPath)) {
      return;
    }

    const lines = readFileSync(healthPath, 'utf-8').trim().split('\n');
    const recentChecks = lines.slice(-5).map(l => {
      try {
        return JSON.parse(l);
      } catch {
        return null;
      }
    }).filter(Boolean);

    // Check for healing triggers
    const unhealthyCount = recentChecks.filter(c => c.result?.healthy === false).length;
    const hasHighSeverity = recentChecks.some(c => c.result?.severity === 'high');

    if (unhealthyCount >= 3 || hasHighSeverity) {
      console.log(`Healing needed for ${skillName}: ${unhealthyCount} unhealthy, highSeverity: ${hasHighSeverity}`);
      await this.healer.triggerHealing(skillName, unhealthyCount >= 3 ? 'consecutive_failures' : 'high_severity');
    }
  }

  private scheduleNightlyAudit(): void {
    const runAudit = async () => {
      console.log('Running nightly audit...');
      // Reset daily healing counters
      this.db.prepare(`
        UPDATE skills SET healing_attempts_today = 0
      `).run();
      console.log('Nightly audit complete');
    };

    // Calculate time until next 3am
    const now = new Date();
    const next3am = new Date(now);
    next3am.setHours(3, 0, 0, 0);
    if (next3am <= now) {
      next3am.setDate(next3am.getDate() + 1);
    }
    const msUntil3am = next3am.getTime() - now.getTime();

    setTimeout(() => {
      runAudit();
      // Then run every 24 hours
      setInterval(runAudit, 24 * 60 * 60 * 1000);
    }, msUntil3am);
  }
}

// Main entry point
const config: DaemonConfig = {
  skills_root: process.env.SKILLS_ROOT || join(process.env.HOME || '/root', '.claude', 'skills'),
  db_path: join(process.env.SKILLS_ROOT || join(process.env.HOME || '/root', '.claude', 'skills'), 'skill-daemon.db'),
  slack_webhook_url: process.env.SKILL_SLACK_WEBHOOK || '',
  slack_signing_secret: process.env.SKILL_SLACK_SIGNING_SECRET || '',
  port: parseInt(process.env.SKILL_DAEMON_PORT || '3847', 10)
};

const daemon = new SkillDaemon(config);
daemon.start().catch(console.error);

export { SkillDaemon, DaemonConfig };
