# Health Check Prompt

Analyze this session for the skill 'skill-creator'. Evaluate:

1. Did it complete the requested task?
2. Were there errors, retries, or timeouts?
3. Was token usage reasonable?
4. Any unexpected patterns?

Respond ONLY with JSON:

```json
{
  "healthy": true,
  "completion_score": 5,
  "efficiency_score": 5,
  "reliability_score": 5,
  "issues": [],
  "suggested_fixes": [],
  "severity": "none"
}
```

Scoring:
- 5 = Excellent
- 4 = Good
- 3 = Acceptable
- 2 = Needs improvement
- 1 = Failed

Severity levels:
- none = No issues
- low = Minor issues
- medium = Significant issues
- high = Critical issues requiring immediate attention
