# Creator Share LAN

LAN-focused photo and video sharing app for wedding media delivery.

## Open Source Readiness

- License: MIT (see LICENSE)
- Contribution guide: CONTRIBUTING.md
- Security reporting: SECURITY.md
- CI pipeline: .github/workflows/ci.yml

## Stack

- Frontend: React + TypeScript + Vite + Tailwind
- Backend: Node.js + Express + Sharp + Fluent-FFmpeg
- Download packaging: JSZip + FileSaver

## Setup

1. Install dependencies.

```bash
npm install
```

2. Create .env file from template.

```bash
copy .env.example .env
```

3. Put media files under media folder (nested folders supported).

4. Run development mode.

```bash
npm run dev
```

5. Build and run production mode.

```bash
npm run build
npm run start
```

## APIs

- GET /health
- GET /api/folders
- GET /api/folders/:folderId/media
- GET /media/:mediaId/original
- GET /media/:mediaId/resized?sizeVmb=2&quality=80
- POST /api/download

## Local Network Usage

- Set EXPOSE_TO_LAN=true in .env.
- Open firewall using instructions in FIREWALL_SETUP.md.
- Access from another device using http://<host-lan-ip>:3000.

## Release Checklist

- Ensure ffmpeg is installed and available on PATH for video thumbnail extraction.
- Put media under ./media and verify thumbnail generation completes.
- Validate /health and folder browsing from a second LAN device.
- Run npm run test and npm run build before creating a release tag.

## Notes

- Originals are never modified.
- Thumbnails and resized files are cached under cache/thumbnails.
- Thumbnail generation is background-first and startup-safe; the server does not block on full warmup.
- Thumbnail cache freshness is tracked with a manifest (source path, mtime, size, and processing signature).
- Unchanged media is skipped on subsequent startups; changed files are regenerated automatically.
- Videos are streamed as original files; only poster thumbnails are generated.
- If ffmpeg is not installed or not on PATH, video thumbnail extraction falls back to placeholder thumbnails.
