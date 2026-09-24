# Security

ScreenPolish records screens, microphones and cameras, and writes only to the
recordings folder you choose. It makes no network requests.

## Reporting

Please report a security problem privately: open a
[security advisory](https://github.com/BkashJEE/screenpolish-omarchy/security/advisories/new)
rather than a public issue. Include what you observed, the version, and how to
reproduce it. Expect a first reply within a week.

## What matters most here

- Anything that sends recordings, input logs or file paths off the machine.
- Anything that lets a page or file served through `polish://` read outside the
  recordings folder.
- Anything that records input the app is not supposed to record. Keyboards are
  deliberately not opened on Linux; see `src/main/linux/input-source.ts`.
