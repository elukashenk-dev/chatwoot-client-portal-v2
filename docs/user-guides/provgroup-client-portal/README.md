# PROVGROUP Client Portal User Guide

This directory contains the source generator and generated assets for the
user-facing PROVGROUP client portal PDF guide.

Regenerate:

```bash
node docs/user-guides/provgroup-client-portal/generate.mjs
```

The generator starts a temporary local Vite server, captures current portal UI
screens with Playwright and safe mock API responses, writes `guide.html`, then
exports `provgroup-client-portal-user-guide.pdf`.

Generated screenshots use demo data only:

- email: `client@example.com`
- phone: `+7 (900) 000-00-00`
- name: `Иван Петров`
