/**
 * Slack integration for skill notifications
 */

import type { SlackMessage, ProposedUpdate, HealthCheckResult } from './types.js';

export class SlackIntegration {
  private webhookUrl: string;
  private signingSecret: string;

  constructor(webhookUrl: string, signingSecret: string) {
    this.webhookUrl = webhookUrl;
    this.signingSecret = signingSecret;
  }

  async sendMessage(message: SlackMessage): Promise<boolean> {
    if (!this.webhookUrl || this.webhookUrl.includes('${')) {
      console.log('[Slack] Webhook not configured, skipping notification');
      return false;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        console.error('[Slack] Failed to send message:', response.statusText);
        return false;
      }

      console.log('[Slack] Message sent successfully');
      return true;
    } catch (error) {
      console.error('[Slack] Error sending message:', error);
      return false;
    }
  }

  async notifySkillReady(skillName: string, testResults: string[]): Promise<boolean> {
    const message: SlackMessage = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Skill Ready: ${skillName}` },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Bootstrap complete!*\n\n*Test Results:*\n${testResults.map(r => `${r}`).join('\n')}`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Deploy' },
              style: 'primary',
              action_id: `deploy_${skillName}`,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Skill' },
              action_id: `view_${skillName}`,
            },
          ],
        },
      ],
    };

    return this.sendMessage(message);
  }

  async notifyUpdateProposed(skillName: string, update: ProposedUpdate): Promise<boolean> {
    const changeList = update.changes.map(c => `- *${c.file}*: ${c.reason}`).join('\n');

    const message: SlackMessage = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Update Proposed: ${skillName}` },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Changes:*\n${changeList}\n\n*Triggered by:* ${update.trigger}\n*Confidence:* ${(update.confidence * 100).toFixed(0)}%`,
          },
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Approve' },
              style: 'primary',
              action_id: `approve_${update.uuid}`,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'Reject' },
              style: 'danger',
              action_id: `reject_${update.uuid}`,
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: 'View Diff' },
              action_id: `diff_${update.uuid}`,
            },
          ],
        },
      ],
    };

    return this.sendMessage(message);
  }

  async notifyHealthAlert(skillName: string, result: HealthCheckResult): Promise<boolean> {
    const issues = result.result.issues.map(i => `- ${i}`).join('\n') || 'No specific issues identified';

    const message: SlackMessage = {
      attachments: [
        {
          color: result.result.severity === 'high' ? '#FF0000' : '#FFA500',
          blocks: [
            {
              type: 'header',
              text: { type: 'plain_text', text: `Health Alert: ${skillName}` },
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Severity:* ${result.result.severity}\n*Issues:*\n${issues}\n\n*Scores:*\n- Completion: ${result.result.completion_score}/5\n- Efficiency: ${result.result.efficiency_score}/5\n- Reliability: ${result.result.reliability_score}/5`,
              },
            },
            {
              type: 'actions',
              elements: [
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'Trigger Healing' },
                  style: 'primary',
                  action_id: `heal_${skillName}`,
                },
                {
                  type: 'button',
                  text: { type: 'plain_text', text: 'View Logs' },
                  action_id: `logs_${skillName}`,
                },
              ],
            },
          ],
        },
      ],
    };

    return this.sendMessage(message);
  }

  async notifyEvalRequest(
    skillName: string,
    taskSummary: string,
    autoScores: { reliability: number; efficiency: number }
  ): Promise<boolean> {
    const message: SlackMessage = {
      blocks: [
        {
          type: 'header',
          text: { type: 'plain_text', text: `Eval Request: ${skillName}` },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Task:* ${taskSummary}\n*Auto-scores:* Reliability ${autoScores.reliability}/5, Efficiency ${autoScores.efficiency}/5\n\n*Rate the output:*`,
          },
        },
        {
          type: 'actions',
          elements: [1, 2, 3, 4, 5].map(n => ({
            type: 'button',
            text: { type: 'plain_text', text: `${n}` },
            action_id: `feedback_${skillName}_${n}`,
          })),
        },
      ],
    };

    return this.sendMessage(message);
  }

  verifySignature(signature: string, timestamp: string, body: string): boolean {
    // In a real implementation, verify the Slack signature
    // For now, return true if signing secret is set
    return !!this.signingSecret;
  }
}
