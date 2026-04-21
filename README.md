# Creator Share LAN

LAN-focused photo and video sharing app for wedding media delivery.

## Open Source Readiness

- License: MIT (see LICENSE)
- Contribution guide: CONTRIBUTING.md
- Security reporting: SECURITY.md
- CI pipeline: .github/workflows/ci.yml
- Branch governance: main accepts changes through pull requests only and requires code owner approval.

## Planning Docs

- RBAC and gallery rollout acceptance criteria: docs/RBAC_EXECUTION_ACCEPTANCE.md

## Manifest Pending Items

Pending items below are tracked against the SWE manifest in prompt.md and represent requirements not yet implemented in the current codebase.

- Config hot-reload for .env in dev mode is not implemented (config is loaded at startup only).
- INCLUDE_FOLDERS and EXCLUDE_FOLDERS support only simple name lists today; manifest-level glob or regex matching is still pending.
- Media ordering is currently based on filesystem mtime; EXIF-first image ordering from the manifest is pending.
- Lazy loading fallback with IntersectionObserver is pending (native loading="lazy" is implemented).
- Desktop lightbox edge-click navigation is pending (arrow controls and keyboard navigation are implemented).
- Legacy batch flow endpoint parity is pending for the manifest's GET /api/download?ids flow; current implementation uses POST /api/download with item payload.
- Resized-file cache retention policy from the manifest is only partially implemented; explicit 1-hour TTL plus LRU eviction bound (for example 5GB cap) is pending.
- Performance benchmark suite from the manifest is pending (gallery render timing, thumbnail generation timing, and regression thresholds).
- End-to-end test coverage for navigation -> selection -> download is pending.
- Manifest requirement to keep the app LAN-only without login is intentionally not implemented because this project now uses authenticated RBAC workflows.
- Themes as separate loadable files from /themes folder, one theme per .dream file.

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

## Recent Features

- Shareable LAN view links: copy current folder and selection state into a URL query so clients can open the same view quickly.
- Smart background sync indicator: live sync state badge and toast notifications for newly indexed media.
- Slideshow and kiosk mode: in-lightbox playback controls with fullscreen kiosk support.

## Maintainer Workflow

- The main branch is protected and cannot be pushed directly.
- All changes must come through a pull request.
- At least one approval is required before merge.
- Code owner review is required for merge.
- Approvals are dismissed when new commits are pushed to an open pull request.

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
