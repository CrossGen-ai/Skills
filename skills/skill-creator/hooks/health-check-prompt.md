# Health Check Prompt

Analyze this session for the skill 'skill-creator'.

Evaluate:
1. Did it complete the requested task?
2. Were there errors, retries, or timeouts?
3. Was token usage reasonable?
4. Any unexpected patterns?

Respond ONLY with JSON:
```json
{
  "healthy": true|false,
  "completion_score": 1-5,
  "efficiency_score": 1-5,
  "reliability_score": 1-5,
  "issues": ["list of issues found"],
  "suggested_fixes": ["list of suggested fixes"],
  "severity": "none|low|medium|high"
}
```
