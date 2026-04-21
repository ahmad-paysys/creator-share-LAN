# Server Src Reorganization Plan

## Purpose

This document defines a concrete, phased movement plan for reorganizing server source files by responsibility domain, with low-risk execution steps suitable for community contributors.

## Current Problem Summary

- Server code is mostly flat under [server/src](server/src).
- Domain boundaries exist conceptually but are not reflected in folder layout.
- Bootstrap wiring in [server/src/server.ts](server/src/server.ts) has become a high-change concentration point.
- Similar authorization helpers are duplicated across multiple route files.

## Target Structure

Target folder structure under [server/src](server/src):

- [server/src/server.ts](server/src/server.ts) (entrypoint remains)
- [server/src/core](server/src/core)
- [server/src/types](server/src/types)
- [server/src/auth](server/src/auth)
- [server/src/access](server/src/access)
- [server/src/csrf](server/src/csrf)
- [server/src/gallery](server/src/gallery)
- [server/src/temporary-views](server/src/temporary-views)
- [server/src/media](server/src/media)
- [server/src/reconciliation](server/src/reconciliation)
- [server/src/settings](server/src/settings)
- [server/src/ops](server/src/ops)
- [server/src/shared](server/src/shared)

## Move Matrix

This matrix defines the intended final location of each existing server source file.

### Core And Infra

- [server/src/config.ts](server/src/config.ts) -> server/src/core/config.ts
- [server/src/database.ts](server/src/database.ts) -> server/src/core/database.ts
- [server/src/database.test.ts](server/src/database.test.ts) -> server/src/core/database.test.ts
- [server/src/db-migrations.ts](server/src/db-migrations.ts) -> server/src/core/db-migrations.ts
- [server/src/express.d.ts](server/src/express.d.ts) -> server/src/core/express.d.ts

### Shared Types

- [server/src/types.ts](server/src/types.ts) -> server/src/types/app.ts

### Auth

- [server/src/auth-types.ts](server/src/auth-types.ts) -> server/src/auth/types.ts
- [server/src/auth-store.ts](server/src/auth-store.ts) -> server/src/auth/store.ts
- [server/src/auth-store.test.ts](server/src/auth-store.test.ts) -> server/src/auth/store.test.ts
- [server/src/auth-service.ts](server/src/auth-service.ts) -> server/src/auth/service.ts
- [server/src/auth-middleware.ts](server/src/auth-middleware.ts) -> server/src/auth/middleware.ts
- [server/src/auth-routes.ts](server/src/auth-routes.ts) -> server/src/auth/routes.ts
- [server/src/auth-routes.test.ts](server/src/auth-routes.test.ts) -> server/src/auth/routes.test.ts
- [server/src/login-throttle.ts](server/src/login-throttle.ts) -> server/src/auth/throttle.ts

### Access

- [server/src/access-types.ts](server/src/access-types.ts) -> server/src/access/types.ts
- [server/src/access-policy.ts](server/src/access-policy.ts) -> server/src/access/policy.ts
- [server/src/access-policy.test.ts](server/src/access-policy.test.ts) -> server/src/access/policy.test.ts
- [server/src/access-middleware.ts](server/src/access-middleware.ts) -> server/src/access/middleware.ts
- [server/src/access-middleware.test.ts](server/src/access-middleware.test.ts) -> server/src/access/middleware.test.ts
- [server/src/lan-access.ts](server/src/lan-access.ts) -> server/src/access/lan.ts
- [server/src/lan-access.test.ts](server/src/lan-access.test.ts) -> server/src/access/lan.test.ts
- [server/src/existing-routes-authz.test.ts](server/src/existing-routes-authz.test.ts) -> server/src/access/existing-routes-authz.test.ts

### CSRF

- [server/src/csrf-middleware.ts](server/src/csrf-middleware.ts) -> server/src/csrf/middleware.ts
- [server/src/csrf-middleware.test.ts](server/src/csrf-middleware.test.ts) -> server/src/csrf/middleware.test.ts

### Gallery

- [server/src/gallery-types.ts](server/src/gallery-types.ts) -> server/src/gallery/types.ts
- [server/src/gallery-store.ts](server/src/gallery-store.ts) -> server/src/gallery/store.ts
- [server/src/gallery-store.test.ts](server/src/gallery-store.test.ts) -> server/src/gallery/store.test.ts
- [server/src/gallery-routes.ts](server/src/gallery-routes.ts) -> server/src/gallery/routes.ts
- [server/src/gallery-routes.test.ts](server/src/gallery-routes.test.ts) -> server/src/gallery/routes.test.ts

### Temporary Views

- [server/src/temporary-view-types.ts](server/src/temporary-view-types.ts) -> server/src/temporary-views/types.ts
- [server/src/temporary-view-store.ts](server/src/temporary-view-store.ts) -> server/src/temporary-views/store.ts
- [server/src/temporary-view-store.test.ts](server/src/temporary-view-store.test.ts) -> server/src/temporary-views/store.test.ts
- [server/src/temporary-view-routes.ts](server/src/temporary-view-routes.ts) -> server/src/temporary-views/routes.ts
- [server/src/temporary-view-routes.test.ts](server/src/temporary-view-routes.test.ts) -> server/src/temporary-views/routes.test.ts

### Media

- [server/src/media-index.ts](server/src/media-index.ts) -> server/src/media/indexer.ts
- [server/src/thumbnail-service.ts](server/src/thumbnail-service.ts) -> server/src/media/thumbnail-service.ts
- [server/src/thumbnail-manifest.ts](server/src/thumbnail-manifest.ts) -> server/src/media/thumbnail-manifest.ts
- [server/src/resize.ts](server/src/resize.ts) -> server/src/media/resize.ts
- [server/src/resize.test.ts](server/src/resize.test.ts) -> server/src/media/resize.test.ts

### Reconciliation

- [server/src/reconciliation-types.ts](server/src/reconciliation-types.ts) -> server/src/reconciliation/types.ts
- [server/src/reconciliation-store.ts](server/src/reconciliation-store.ts) -> server/src/reconciliation/store.ts
- [server/src/reconciliation-service.ts](server/src/reconciliation-service.ts) -> server/src/reconciliation/service.ts
- [server/src/reconciliation-service.test.ts](server/src/reconciliation-service.test.ts) -> server/src/reconciliation/service.test.ts
- [server/src/reconciliation-routes.ts](server/src/reconciliation-routes.ts) -> server/src/reconciliation/routes.ts
- [server/src/reconciliation-routes.test.ts](server/src/reconciliation-routes.test.ts) -> server/src/reconciliation/routes.test.ts

### Settings

- [server/src/settings-store.ts](server/src/settings-store.ts) -> server/src/settings/store.ts
- [server/src/settings-store.test.ts](server/src/settings-store.test.ts) -> server/src/settings/store.test.ts
- [server/src/settings-routes.ts](server/src/settings-routes.ts) -> server/src/settings/routes.ts
- [server/src/settings-routes.test.ts](server/src/settings-routes.test.ts) -> server/src/settings/routes.test.ts

### Ops

- [server/src/ops-routes.ts](server/src/ops-routes.ts) -> server/src/ops/routes.ts
- [server/src/ops-routes.test.ts](server/src/ops-routes.test.ts) -> server/src/ops/routes.test.ts
- [server/src/audit-store.ts](server/src/audit-store.ts) -> server/src/ops/audit-store.ts
- [server/src/rate-limit.ts](server/src/rate-limit.ts) -> server/src/ops/rate-limit.ts

### Shared Utilities

- New file: server/src/shared/auth-guards.ts (centralized requireAdmin and requireCurator helpers used by route modules)

## PR And Phase Plan

Each phase should be completed in a separate PR with build and test gates.

### Phase 1: Scaffolding Only

- Create all target folders.
- Add index files for each domain folder.
- No file moves yet.

Acceptance:

- Build unchanged.
- Test suite unchanged.

### Phase 2: Core And Types Move

- Move core files and shared types according to matrix.
- Update imports.

Acceptance:

- Build passes.
- Server tests pass.

### Phase 3: Auth And Access Move

- Move auth and access families.
- Add shared auth-guards utility and remove duplicate role-check helpers in route files.

Acceptance:

- Build passes.
- Auth and access test suites pass.
- No behavior changes in role enforcement.

### Phase 4: Gallery And Temporary Views Move

- Move gallery and temporary-view families.
- Keep route signatures and response contracts intact.

Acceptance:

- Build passes.
- Gallery and temporary-view tests pass.

### Phase 5: Media, Reconciliation, Settings, Ops Move

- Move remaining module families.
- Update imports in entrypoint and route dependencies.

Acceptance:

- Build passes.
- Full server tests pass.

### Phase 6: Bootstrap Thinning

- Keep [server/src/server.ts](server/src/server.ts) as entrypoint but reduce direct wiring noise by using module index exports.
- No endpoint behavior changes.

Acceptance:

- Build passes.
- Full server tests pass.
- Route registration order preserved.

### Phase 7: Cleanup

- Remove temporary re-export shims if used during migration.
- Ensure no imports still target legacy flat paths.

Acceptance:

- Build passes.
- Full tests pass.

## Contributor Execution Rules

- Do not mix file movement and behavior change in the same commit unless unavoidable.
- Prefer module-by-module movement to reduce merge conflicts.
- Keep import edits mechanical and minimal in move PRs.
- Run these commands before opening each PR:
  - npm run build --workspace server
  - npm run test --workspace server

## Risk Controls

- Use one module family per PR after scaffolding.
- Preserve exported function names during moves.
- Keep route paths, payloads, and auth decisions unchanged until migration is complete.
- If a phase causes broad failures, rollback to previous green commit and split that phase further.

## Follow-On Optional Improvements

- Add domain-level fixture helpers under each module for cleaner tests.
- Consider applying similar domain folder structure to client components once server migration stabilizes.