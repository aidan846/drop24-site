# Drop24 portfolio demo

Drop24 was a temporary file-sharing web application. The hosted service has been retired; this repository contains a portfolio demo that preserves the original upload experience without its production backend or storage system.

The demo runs entirely in the browser. Selected files never leave the device, and the progress, transfer URL, and QR code are simulations created locally. No account, API key, environment variable, database, or hosted storage is required.

**Live demo:** https://aidan846.github.io/drop24-site/

## Technology

Next.js, React, TypeScript, Tailwind CSS, and a client-side QR-code generator. The application is exported as static files and deployed with GitHub Pages.

## Local development

```bash
npm ci
npm run dev
```

Run `npm run build` to create the static site in `out/`.

## Deployment

The public repository deploys its `main` branch through `.github/workflows/deploy.yml`. In GitHub, set **Settings → Pages → Source** to **GitHub Actions**.

The original private Drop24 repository keeps this source on its `portfolio` branch. `scripts/publish-portfolio.ps1` exports only the sanitized branch contents into a fresh Git repository and pushes that clean snapshot to the public repository, so the private repository's history is never published.
