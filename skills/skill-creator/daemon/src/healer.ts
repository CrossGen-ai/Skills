import Database from 'better-sqlite3';
import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomUUID } from 'crypto';
import { SlackNotifier } from './slack.js';

interface HealthCheckEntry {
  timestamp: string;
  result?: {
    healthy: boolean;
    completion_score?: number;
    efficiency_score?: number;
    reliability_score?: number;
    issues?: string[];
    suggested_fixes?: string[];
    severity?: string;
  };
}

interface HealingContext {
  skillMd: string;
  recentContext: object;
  lessons: string;
  healthFailures: HealthCheckEntry[];
  userFeedback: object[];
}

export class SkillHealer {
  private skillsRoot: string;
  private db: Database.Database;
  private slack: SlackNotifier;

  constructor(skillsRoot: string, db: Database.Database) {
    this.skillsRoot = skillsRoot;
    this.db = db;
    this.slack = new SlackNotifier(process.env.SKILL_SLACK_WEBHOOK || '');
  }

  async triggerHealing(skillName: string, trigger: string): Promise<void> {
    // Check guards
    if (await this.isHealingInProgress(skillName)) {
      console.log(`Healing already in progress for ${skillName}`);
      return;
    }

    const attemptsToday = await this.healingAttemptsToday(skillName);
    if (attemptsToday >= 5) {
      console.log(`Healing rate limit exceeded for ${skillName}`);
      await this.escalateToHuman(skillName, 'Healing rate limit exceeded (5 attempts today)');
      return;
    }

    console.log(`Starting healing for ${skillName}, trigger: ${trigger}`);
    await this.markHealingStarted(skillName);

    try {
      const context = await this.buildHealingContext(skillName);
      const proposal = await this.generateHealingProposal(skillName, trigger, context);

      if (proposal) {
        await this.saveProposal(skillName, proposal);
        await this.notifyProposal(skillName, proposal);
      }
    } catch (err) {
      console.error(`Healing failed for ${skillName}:`, err);
      await this.updateSkillState(skillName, 'DEGRADED');
    }
  }

  private async isHealingInProgress(skillName: string): Promise<boolean> {
    const skill = this.db.prepare(`
      SELECT state FROM skills WHERE name = ?
    `).get(skillName) as { state: string } | undefined;
    return skill?.state === 'HEALING';
  }

  private async healingAttemptsToday(skillName: string): Promise<number> {
    const skill = this.db.prepare(`
      SELECT healing_attempts_today, last_healing_date FROM skills WHERE name = ?
    `).get(skillName) as { healing_attempts_today: number; last_healing_date: string } | undefined;

    if (!skill) return 0;

    const today = new Date().toISOString().split('T')[0];
    if (skill.last_healing_date !== today) {
      return 0;
    }
    return skill.healing_attempts_today;
  }

  private async markHealingStarted(skillName: string): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE skills
      SET state = 'HEALING',
          updated_at = ?,
          healing_attempts_today = CASE
            WHEN last_healing_date = ? THEN healing_attempts_today + 1
            ELSE 1
          END,
          last_healing_date = ?
      WHERE name = ?
    `).run(now, today, today, skillName);
  }

  private async updateSkillState(skillName: string, state: string): Promise<void> {
    const now = new Date().toISOString();
    this.db.prepare(`
      UPDATE skills SET state = ?, updated_at = ? WHERE name = ?
    `).run(state, now, skillName);
  }

  private async buildHealingContext(skillName: string): Promise<HealingContext> {
    const skillPath = join(this.skillsRoot, skillName);

    const skillMd = this.readFile(join(skillPath, 'SKILL.md'));
    const recentContext = this.readJson(join(skillPath, 'memory', 'recent-context.json'));
    const lessons = this.readFile(join(skillPath, 'memory', 'lessons.md'));

    // Get last 5 failed health checks
    const healthChecks = this.readJsonl<HealthCheckEntry>(join(skillPath, 'memory', 'health-checks.jsonl'));
    const healthFailures = healthChecks
      .filter((c: HealthCheckEntry) => c.result?.healthy === false)
      .slice(-5);

    // Get last 10 user feedback entries
    const userFeedback = this.readJsonl(join(skillPath, 'memory', 'user-feedback.jsonl'))
      .slice(-10);

    return { skillMd, recentContext, lessons, healthFailures, userFeedback };
  }

  private async generateHealingProposal(
    skillName: string,
    trigger: string,
    context: HealingContext
  ): Promise<object | null> {
    // In a full implementation, this would call Claude via the Agent SDK
    // For now, create a placeholder proposal
    const uuid = randomUUID();

    return {
      uuid,
      timestamp: new Date().toISOString(),
      trigger,
      analysis: `Healing triggered by: ${trigger}. Analysis of ${context.healthFailures.length} failures.`,
      changes: [
        { file: 'SKILL.md', reason: 'Clarify workflow steps based on failure patterns' }
      ],
      confidence: 0.75,
      rollback_safe: true
    };
  }

  private async saveProposal(skillName: string, proposal: any): Promise<void> {
    const proposalDir = join(this.skillsRoot, skillName, 'memory', 'proposed-updates', proposal.uuid);
    mkdirSync(proposalDir, { recursive: true });

    writeFileSync(
      join(proposalDir, 'manifest.json'),
      JSON.stringify(proposal, null, 2)
    );

    // Record in database
    this.db.prepare(`
      INSERT INTO pending_approvals (uuid, skill_name, proposed_at, changes, confidence)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      proposal.uuid,
      skillName,
      proposal.timestamp,
      JSON.stringify(proposal.changes),
      proposal.confidence
    );
  }

  private async notifyProposal(skillName: string, proposal: any): Promise<void> {
    const changes = proposal.changes.map((c: any) => `• ${c.file}: ${c.reason}`).join('\n');

    await this.slack.send({
      text: `🔧 Skill Update Proposed: ${skillName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🔧 Skill Update Proposed: ${skillName}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Changes:*\n${changes}\n\n*Triggered by:* ${proposal.trigger}\n*Confidence:* ${(proposal.confidence * 100).toFixed(0)}%`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Approve' },
              style: 'primary',
              action_id: `approve_${proposal.uuid}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '❌ Reject' },
              style: 'danger',
              action_id: `reject_${proposal.uuid}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '👁️ View Diff' },
              action_id: `view_${proposal.uuid}`
            }
          ]
        }
      ]
    });
  }

  private async escalateToHuman(skillName: string, reason: string): Promise<void> {
    await this.slack.send({
      text: `⚠️ Skill Alert: ${skillName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `⚠️ Skill Alert: ${skillName}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Reason:* ${reason}\n\nManual intervention required.`
          }
        }
      ]
    });
  }

  private readFile(path: string): string {
    if (!existsSync(path)) return '';
    return readFileSync(path, 'utf-8');
  }

  private readJson(path: string): object {
    if (!existsSync(path)) return {};
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return {};
    }
  }

  private readJsonl<T = object>(path: string): T[] {
    if (!existsSync(path)) return [];
    try {
      return readFileSync(path, 'utf-8')
        .trim()
        .split('\n')
        .filter(Boolean)
        .map(line => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean) as T[];
    } catch {
      return [];
    }
  }
}
