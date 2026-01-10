/**
 * Healing system for self-healing skills
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { HealthCheckResult, SkillConfig, ProposedUpdate } from './types.js';

interface HealingContext {
  skillName: string;
  skillPath: string;
  skillMd: string;
  recentContext: object;
  lessons: string;
  healthCheckFailures: HealthCheckResult[];
  userFeedback: object[];
}

export class SkillHealer {
  private skillsRoot: string;
  private healingInProgress: Set<string> = new Set();
  private healingAttemptsToday: Map<string, number> = new Map();
  private lastResetDate: string = new Date().toISOString().split('T')[0];

  constructor(skillsRoot: string) {
    this.skillsRoot = skillsRoot;
  }

  async shouldHeal(skillName: string, recentHealthChecks: HealthCheckResult[]): Promise<boolean> {
    const config = this.getSkillConfig(skillName);

    if (!config || !config.healing.enabled) {
      return false;
    }

    // Check for high severity
    const lastCheck = recentHealthChecks[recentHealthChecks.length - 1];
    if (lastCheck?.result.severity === 'high') {
      return true;
    }

    // Check for consecutive unhealthy runs
    const threshold = config.healing.auto_heal_threshold || 3;
    const recentUnhealthy = recentHealthChecks
      .slice(-threshold)
      .filter(h => !h.result.healthy);

    if (recentUnhealthy.length >= threshold) {
      return true;
    }

    // Check for score degradation
    const avgScore = this.calculateAverageScore(recentHealthChecks);
    if (avgScore < 3.5 && recentHealthChecks.length >= 7) {
      return true;
    }

    return false;
  }

  async triggerHealing(skillName: string, trigger: string): Promise<string | null> {
    // Reset daily counter if needed
    const today = new Date().toISOString().split('T')[0];
    if (today !== this.lastResetDate) {
      this.healingAttemptsToday.clear();
      this.lastResetDate = today;
    }

    // Check guards
    if (this.healingInProgress.has(skillName)) {
      console.log(`[Healer] Healing already in progress for ${skillName}`);
      return null;
    }

    const attempts = this.healingAttemptsToday.get(skillName) || 0;
    if (attempts >= 5) {
      console.log(`[Healer] Daily healing limit reached for ${skillName}`);
      return null;
    }

    this.healingInProgress.add(skillName);
    this.healingAttemptsToday.set(skillName, attempts + 1);

    try {
      const context = this.buildHealingContext(skillName);
      const uuid = randomUUID();

      // In a full implementation, this would invoke Claude via the Agent SDK
      // For now, we create a placeholder proposed update
      const proposedUpdate: ProposedUpdate = {
        uuid,
        timestamp: new Date().toISOString(),
        trigger,
        analysis: 'Automated healing session triggered',
        changes: [],
        confidence: 0.5,
        rollback_safe: true,
      };

      // Save proposed update
      const updateDir = join(
        this.skillsRoot,
        skillName,
        'memory',
        'proposed-updates',
        uuid
      );

      // Create directory if it doesn't exist
      const fs = await import('node:fs/promises');
      await fs.mkdir(updateDir, { recursive: true });

      writeFileSync(
        join(updateDir, 'manifest.json'),
        JSON.stringify(proposedUpdate, null, 2)
      );

      console.log(`[Healer] Created proposed update ${uuid} for ${skillName}`);
      return uuid;
    } finally {
      this.healingInProgress.delete(skillName);
    }
  }

  private buildHealingContext(skillName: string): HealingContext {
    const skillPath = join(this.skillsRoot, skillName);

    return {
      skillName,
      skillPath,
      skillMd: this.readFileOrDefault(join(skillPath, 'SKILL.md'), ''),
      recentContext: this.readJsonOrDefault(
        join(skillPath, 'memory', 'recent-context.json'),
        {}
      ),
      lessons: this.readFileOrDefault(join(skillPath, 'memory', 'lessons.md'), ''),
      healthCheckFailures: this.getRecentHealthCheckFailures(skillName),
      userFeedback: this.getRecentUserFeedback(skillName),
    };
  }

  private getRecentHealthCheckFailures(skillName: string): HealthCheckResult[] {
    const path = join(this.skillsRoot, skillName, 'memory', 'health-checks.jsonl');
    if (!existsSync(path)) return [];

    const content = readFileSync(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    return lines
      .slice(-10)
      .map(line => {
        try {
          return JSON.parse(line) as HealthCheckResult;
        } catch {
          return null;
        }
      })
      .filter((h): h is HealthCheckResult => h !== null && !h.result.healthy);
  }

  private getRecentUserFeedback(skillName: string): object[] {
    const path = join(this.skillsRoot, skillName, 'memory', 'user-feedback.jsonl');
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

  private getSkillConfig(skillName: string): SkillConfig | null {
    const path = join(this.skillsRoot, skillName, 'skill-config.json');
    return this.readJsonOrDefault(path, null);
  }

  private readFileOrDefault(path: string, defaultValue: string): string {
    if (!existsSync(path)) return defaultValue;
    return readFileSync(path, 'utf-8');
  }

  private readJsonOrDefault<T>(path: string, defaultValue: T): T {
    if (!existsSync(path)) return defaultValue;
    try {
      return JSON.parse(readFileSync(path, 'utf-8'));
    } catch {
      return defaultValue;
    }
  }

  private calculateAverageScore(healthChecks: HealthCheckResult[]): number {
    if (healthChecks.length === 0) return 5;

    const total = healthChecks.reduce((sum, h) => {
      return sum + (
        h.result.completion_score +
        h.result.efficiency_score +
        h.result.reliability_score
      ) / 3;
    }, 0);

    return total / healthChecks.length;
  }

  async applyProposedUpdate(skillName: string, uuid: string): Promise<boolean> {
    const updateDir = join(
      this.skillsRoot,
      skillName,
      'memory',
      'proposed-updates',
      uuid
    );

    if (!existsSync(updateDir)) {
      console.error(`[Healer] Proposed update not found: ${uuid}`);
      return false;
    }

    const manifestPath = join(updateDir, 'manifest.json');
    const manifest = this.readJsonOrDefault<ProposedUpdate | null>(manifestPath, null);

    if (!manifest) {
      console.error(`[Healer] Invalid manifest for update: ${uuid}`);
      return false;
    }

    // Apply each change
    for (const change of manifest.changes) {
      const sourcePath = join(updateDir, change.file);
      const targetPath = join(this.skillsRoot, skillName, change.file);

      if (existsSync(sourcePath)) {
        const content = readFileSync(sourcePath, 'utf-8');
        writeFileSync(targetPath, content);
        console.log(`[Healer] Applied change: ${change.file}`);
      }
    }

    // Archive the update
    const archiveDir = join(
      this.skillsRoot,
      skillName,
      'memory',
      'applied-updates'
    );
    const fs = await import('node:fs/promises');
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.rename(updateDir, join(archiveDir, uuid));

    console.log(`[Healer] Successfully applied update ${uuid} for ${skillName}`);
    return true;
  }

  async rejectProposedUpdate(skillName: string, uuid: string, reason: string): Promise<boolean> {
    const updateDir = join(
      this.skillsRoot,
      skillName,
      'memory',
      'proposed-updates',
      uuid
    );

    if (!existsSync(updateDir)) {
      console.error(`[Healer] Proposed update not found: ${uuid}`);
      return false;
    }

    // Add rejection reason to manifest
    const manifestPath = join(updateDir, 'manifest.json');
    const manifest = this.readJsonOrDefault<ProposedUpdate>(manifestPath, {} as ProposedUpdate);
    (manifest as any).rejected = {
      timestamp: new Date().toISOString(),
      reason,
    };
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

    // Archive the update
    const archiveDir = join(
      this.skillsRoot,
      skillName,
      'memory',
      'rejected-updates'
    );
    const fs = await import('node:fs/promises');
    await fs.mkdir(archiveDir, { recursive: true });
    await fs.rename(updateDir, join(archiveDir, uuid));

    console.log(`[Healer] Rejected update ${uuid} for ${skillName}: ${reason}`);
    return true;
  }
}
