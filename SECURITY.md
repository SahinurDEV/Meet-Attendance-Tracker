# Security Policy

## Supported versions

| Version | Supported |
|---|---|
| 2.1.x (latest release) | ✅ |
| < 2.1 | ❌ Please update |
| `legacy/` (v1 server and dashboard) | ❌ Unmaintained, not part of the extension |

## Reporting a vulnerability

Please **do not** open a public issue, discussion or pull request for security problems.

Report it privately instead:

- **Preferred:** [Report a vulnerability](https://github.com/SahinurDEV/Meet-Attendance-Tracker/security/advisories/new)
  (GitHub private vulnerability reporting).
- **Or email:** infosahinur@gmail.com, with "SECURITY" in the subject.

Please include the affected version, steps to reproduce, the impact you expect, and a proof of concept if you
have one. You should get a reply within **5 business days**. Fixes for confirmed issues are prioritised, and
you will be credited in the release notes unless you'd rather not be.

## Scope

The extension is designed to keep all data on the user's device. These are especially relevant:

- Any way for extension data (attendance, rosters, chat) to leave the browser
- Script injection through participant names, chat messages, roster imports or JSON backups
- Formula injection in CSV or XLSX exports
- Ways for a web page other than `meet.google.com` to read or change extension data

These are out of scope: issues in Google Meet itself, issues that need a compromised browser or device,
and the unmaintained `legacy/` server. That server is not distributed and its default JWT secret is a
development placeholder; don't deploy it.
