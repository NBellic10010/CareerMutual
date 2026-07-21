# Test report logs

This directory retains actual test output for every development task. Reports are handoff evidence, not disposable temporary files.

## File naming

```text
YYYYMMDDTHHMMSSZ-<short-scope>.log
```

- Use UTC.
- Use a kebab-case scope.
- A later fix creates a new report; it never overwrites an earlier report.

## Required content

Every report must include:

- UTC timestamp;
- change scope;
- Git branch and commit, when available;
- environment and runtime mode;
- exact commands executed;
- exit code for each command;
- raw or complete relevant output;
- Passed, Failed, Skipped, and Blocked summary;
- known pre-existing failures.

## Security

Remove all of the following before saving a report:

- API keys, tokens, cookies, and sessions;
- database credentials;
- real candidate personal information;
- private labels;
- unnecessary private workstation paths.

Never report Not Run, Skipped, or Blocked checks as Passed. Preserve failure reports and link every report from `HANDOFF.md`.
