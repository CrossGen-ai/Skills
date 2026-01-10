import { watch, FSWatcher } from 'chokidar';
import { basename, dirname, join } from 'path';

type WatchCallback = (skillName: string, event: string) => void;

export class SkillWatcher {
  private skillsRoot: string;
  private watcher: FSWatcher | null = null;

  constructor(skillsRoot: string) {
    this.skillsRoot = skillsRoot;
  }

  start(callback: WatchCallback): void {
    // Watch for health check updates
    const healthCheckPattern = join(this.skillsRoot, '*/memory/health-checks.jsonl');

    // Watch for proposed updates
    const proposedUpdatesPattern = join(this.skillsRoot, '*/memory/proposed-updates/*');

    // Watch for skill config changes
    const configPattern = join(this.skillsRoot, '*/skill-config.json');

    this.watcher = watch([healthCheckPattern, proposedUpdatesPattern, configPattern], {
      persistent: true,
      ignoreInitial: true,
      awaitWriteFinish: {
        stabilityThreshold: 500,
        pollInterval: 100
      }
    });

    this.watcher.on('add', (path) => {
      const skillName = this.extractSkillName(path);
      if (skillName) {
        if (path.includes('proposed-updates')) {
          callback(skillName, 'proposed_update_added');
        } else {
          callback(skillName, 'file_added');
        }
      }
    });

    this.watcher.on('change', (path) => {
      const skillName = this.extractSkillName(path);
      if (skillName) {
        if (path.includes('health-checks.jsonl')) {
          callback(skillName, 'health_check_update');
        } else if (path.includes('skill-config.json')) {
          callback(skillName, 'config_update');
        } else {
          callback(skillName, 'file_change');
        }
      }
    });

    this.watcher.on('error', (error) => {
      console.error('Watcher error:', error);
    });

    console.log('Skill watcher started');
  }

  private extractSkillName(path: string): string | null {
    // Extract skill name from path like /root/.claude/skills/{skill-name}/...
    const relativePath = path.replace(this.skillsRoot, '');
    const parts = relativePath.split('/').filter(Boolean);
    return parts.length > 0 ? parts[0] : null;
  }

  stop(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
      console.log('Skill watcher stopped');
    }
  }
}
