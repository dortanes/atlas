# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Atlas, please report it responsibly.

**Do NOT open a public issue.** Instead, email us directly:

📧 **[dortanes](https://github.com/dortanes)** — reach out via GitHub profile

### What to include

- Description of the vulnerability
- Steps to reproduce
- Potential impact
- Suggested fix (if any)

### Response timeline

- **Acknowledgement:** within 48 hours
- **Initial assessment:** within 1 week
- **Fix or mitigation:** as soon as possible, depending on severity

## Scope

The following are in scope:

- Arbitrary code execution via the agent loop
- Prompt injection that bypasses safety checks
- Unauthorized access to local files or system resources
- Credential/API key exposure

## Supported Versions

| Version | Supported |
|---------|-----------|
| 0.x (MVP) | ✅ Latest commit on `main` |

We are in active MVP development — security patches are applied to the latest version only.
