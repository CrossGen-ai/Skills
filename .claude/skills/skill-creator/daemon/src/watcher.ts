/**
 * File watcher for skill health checks and proposed updates
 */

import { watch, type FSWatcher } from 'chokidar';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, basename, join } from 'node:path';
import type { HealthCheckResult, SkillConfig } from './types.js';

export interface WatcherCallbacks {
  onHealthCheck: (skillName: string, result: HealthCheckResult) => Promise<void>;
  onProposedUpdate: (skillName: string, updatePath: string) => Promise<void>;
  onConfigChange: (skillName: string, config: SkillConfig) => Promise<void>;
}

export class SkillWatcher {
  private watcher: FSWatcher | null = null;
  private skillsRoot: string;
  private callbacks: WatcherCallbacks;

  constructor(skillsRoot: string, callbacks: WatcherCallbacks) {
    this.skillsRoot = skillsRoot;
    this.callbacks = callbacks;
  }

  start(): void {
    // Watch for health check updates
    const healthPattern = `${this.skillsRoot}/*/memory/health-checks.jsonl`;
    // Watch for proposed updates
    const proposedPattern = `${this.skillsRoot}/*/memory/proposed-updates/*/manifest.json`;
    // Watch for config changes
    const configPattern = `${this.skillsRoot}/*/skill-config.json`;

    this.watcher = watch([healthPattern, proposedPattern, configPattern], {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100,
      },
    });

    this.watcher.on('change', (path) => this.handleChange(path));
    this.watcher.on('add', (path) => this.handleChange(path));

    console.log(`[Watcher] Started watching: ${this.skillsRoot}`);
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('[Watcher] Stopped');
    }
  }

  private async handleChange(path: string): Promise<void> {
    try {
      const skillName = this.extractSkillName(path);

      // Skip skill-creator to prevent infinite loops
      if (skillName === 'skill-creator') {
        console.log('[Watcher] Ignoring skill-creator changes (self-reference safety)');
        return;
      }

      if (path.endsWith('health-checks.jsonl')) {
        await this.handleHealthCheckUpdate(skillName, path);
      } else if (path.includes('proposed-updates') && path.endsWith('manifest.json')) {
        await this.handleProposedUpdate(skillName, path);
      } else if (path.endsWith('skill-config.json')) {
        await this.handleConfigChange(skillName, path);
      }
    } catch (error) {
      console.error('[Watcher] Error handling change:', error);
    }
  }

  private extractSkillName(path: string): string {
    // Extract skill name from path like /skills/{skill-name}/memory/...
    const relativePath = path.replace(this.skillsRoot, '');
    const parts = relativePath.split('/').filter(Boolean);
    return parts[0] || 'unknown';
  }

  private async handleHealthCheckUpdate(skillName: string, path: string): Promise<void> {
    if (!existsSync(path)) return;

    const content = readFileSync(path, 'utf-8');
    const lines = content.trim().split('\n').filter(Boolean);

    if (lines.length === 0) return;

    // Get the last health check
    const lastLine = lines[lines.length - 1];
    try {
      const result = JSON.parse(lastLine) as HealthCheckResult;
      console.log(`[Watcher] Health check update for ${skillName}: healthy=${result.result.healthy}`);
      await this.callbacks.onHealthCheck(skillName, result);
    } catch (error) {
      console.error('[Watcher] Failed to parse health check:', error);
    }
  }

  private async handleProposedUpdate(skillName: string, path: string): Promise<void> {
    if (!existsSync(path)) return;

    const updateDir = dirname(path);
    console.log(`[Watcher] Proposed update detected for ${skillName}`);
    await this.callbacks.onProposedUpdate(skillName, updateDir);
  }

  private async handleConfigChange(skillName: string, path: string): Promise<void> {
    if (!existsSync(path)) return;

    try {
      const content = readFileSync(path, 'utf-8');
      const config = JSON.parse(content) as SkillConfig;
      console.log(`[Watcher] Config change for ${skillName}: state=${config.state}`);
      await this.callbacks.onConfigChange(skillName, config);
    } catch (error) {
      console.error('[Watcher] Failed to parse config:', error);
    }
  }

  getWatchedPaths(): string[] {
    if (!this.watcher) return [];
    return Object.keys(this.watcher.getWatched()).flatMap(dir => {
      const files = this.watcher!.getWatched()[dir];
      return files.map(f => join(dir, f));
    });
  }
}
