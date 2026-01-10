interface SlackMessage {
  text: string;
  blocks?: SlackBlock[];
  attachments?: SlackAttachment[];
}

interface SlackBlock {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  elements?: SlackElement[];
}

interface SlackElement {
  type: string;
  text?: {
    type: string;
    text: string;
  };
  style?: string;
  action_id?: string;
  value?: string;
}

interface SlackAttachment {
  color?: string;
  text?: string;
  fields?: { title: string; value: string; short?: boolean }[];
}

export class SlackNotifier {
  private webhookUrl: string;

  constructor(webhookUrl: string) {
    this.webhookUrl = webhookUrl;
  }

  async send(message: SlackMessage): Promise<boolean> {
    if (!this.webhookUrl) {
      console.log('Slack notification (no webhook configured):', message.text);
      return false;
    }

    try {
      const response = await fetch(this.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(message),
      });

      if (!response.ok) {
        console.error('Slack notification failed:', response.status, await response.text());
        return false;
      }

      console.log('Slack notification sent:', message.text);
      return true;
    } catch (error) {
      console.error('Slack notification error:', error);
      return false;
    }
  }

  async sendDeploymentReady(skillName: string, testResults: { passed: number; total: number; details: string[] }): Promise<boolean> {
    return this.send({
      text: `🎉 Skill Ready: ${skillName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `🎉 Skill Ready: ${skillName}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Test Results:* ${testResults.passed}/${testResults.total} passed\n\n${testResults.details.map(d => `✅ ${d}`).join('\n')}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '🚀 Deploy' },
              style: 'primary',
              action_id: `deploy_${skillName}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '🔄 Add Test & Retry' },
              action_id: `retry_${skillName}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '👁️ View Skill' },
              action_id: `view_${skillName}`
            }
          ]
        }
      ]
    });
  }

  async sendEvalRequest(
    skillName: string,
    sessionId: string,
    taskSummary: string,
    duration: number,
    tokens: number,
    autoScores: { reliability: number; efficiency: number }
  ): Promise<boolean> {
    return this.send({
      text: `📊 Eval Request: ${skillName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `📊 Eval Request: ${skillName}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Task:* ${taskSummary}\n*Duration:* ${duration}ms | *Tokens:* ${tokens}\n*Auto-scores:* Reliability ${autoScores.reliability}/5, Efficiency ${autoScores.efficiency}/5`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: 'Rate the output quality:'
          }
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '1️⃣' }, action_id: `rate_1_${sessionId}` },
            { type: 'button', text: { type: 'plain_text', text: '2️⃣' }, action_id: `rate_2_${sessionId}` },
            { type: 'button', text: { type: 'plain_text', text: '3️⃣' }, action_id: `rate_3_${sessionId}` },
            { type: 'button', text: { type: 'plain_text', text: '4️⃣' }, action_id: `rate_4_${sessionId}` },
            { type: 'button', text: { type: 'plain_text', text: '5️⃣' }, action_id: `rate_5_${sessionId}` }
          ]
        },
        {
          type: 'actions',
          elements: [
            { type: 'button', text: { type: 'plain_text', text: '💬 Add Feedback' }, action_id: `feedback_${sessionId}` },
            { type: 'button', text: { type: 'plain_text', text: '⏭️ Skip' }, action_id: `skip_${sessionId}` }
          ]
        }
      ]
    });
  }

  async sendHealthAlert(skillName: string, issues: string[], severity: string): Promise<boolean> {
    const emoji = severity === 'high' ? '🚨' : severity === 'medium' ? '⚠️' : 'ℹ️';

    return this.send({
      text: `${emoji} Health Alert: ${skillName}`,
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} Health Alert: ${skillName}`
          }
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Severity:* ${severity.toUpperCase()}\n\n*Issues:*\n${issues.map(i => `• ${i}`).join('\n')}`
          }
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '🔧 Trigger Healing' },
              style: 'primary',
              action_id: `heal_${skillName}`
            },
            {
              type: 'button',
              text: { type: 'plain_text', text: '📊 View Details' },
              action_id: `details_${skillName}`
            }
          ]
        }
      ]
    });
  }
}
