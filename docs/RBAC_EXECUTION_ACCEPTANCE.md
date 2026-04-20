# RBAC And Gallery Access Rollout: Execution And Acceptance

## Purpose

This document converts the approved RBAC and curated gallery roadmap into an execution checklist with explicit acceptance criteria and test IDs for each PR.

## Scope Summary

- Anonymous public access is allowed on LAN only.
- Public galleries are accessible to anyone on LAN.
- Private galleries require authorization.
- Access supports both role-based access and user-specific sharing.
- Accounts are admin-created only.
- Folder and full-library browsing can be globally toggled public/private by admin.
- View and download permissions are treated as identical.
- Custom slugs are supported for permanent galleries and temporary expiring views.
- Reconciliation is required for moved/renamed media.
- Operational visibility is prioritized over heavy compliance logging.

## Storage Plan

- Primary DB: SQLite at `server/data/app.db`.
- Media binaries remain in filesystem under configured media root.
- Application metadata stored in DB:
  - users
  - sessions
  - settings
  - galleries
  - gallery_items
  - gallery_access
  - share_views
  - share_view_items
  - media_reconciliation
  - audit_events

## Definitions

- Roles: `owner`, `admin`, `editor`, `viewer`, `guest`.
- Public gallery URL: `/gallery/:slug`.
- Temporary view URL: `/view/:slug`.
- Identical view/download policy: if readable, downloadable.

## PR Breakdown With Acceptance Criteria

## PR-01: Auth And Data Foundation

Branch: `feature/auth-db-foundation`

### Deliverables

- Add SQLite data layer and migrations.
- Add user/session/settings/audit core tables.
- Add admin-created user flow.
- Add session middleware and authenticated principal context.

### Acceptance Criteria

- AC-PR01-001: Server boots cleanly with migrations applied.
- AC-PR01-002: Admin can create users; self-signup endpoint does not exist.
- AC-PR01-003: Login creates session; logout invalidates session.
- AC-PR01-004: Expired sessions are denied consistently.

### Required Tests

- TC-PR01-001: Migration up/down smoke test.
- TC-PR01-002: User repository CRUD unit tests.
- TC-PR01-003: Session lifecycle integration test.
- TC-PR01-004: Password hashing verification test.

## PR-02: RBAC Policy Engine

Branch: `feature/rbac-engine`

### Deliverables

- Central policy evaluator for resource/action decisions.
- Role mapping and permission matrix.
- LAN-only anonymous guard middleware.
- Global settings checks for folder/library public-private toggles.

### Acceptance Criteria

- AC-PR02-001: Policy engine is the only authorization decision entry point.
- AC-PR02-002: Anonymous non-LAN requests to public endpoints are denied.
- AC-PR02-003: Global toggles are enforced before serving folder/library data.
- AC-PR02-004: Decision logs include allow/deny reason codes.

### Required Tests

- TC-PR02-001: Full role/resource/action matrix unit tests.
- TC-PR02-002: Middleware LAN IP allow/deny integration tests.
- TC-PR02-003: Settings toggle enforcement tests.
- TC-PR02-004: Decision reason-code assertion tests.

## PR-03: Gallery Core Domain

Branch: `feature/galleries-core`

### Deliverables

- Add gallery, gallery_items, gallery_access tables.
- Add gallery CRUD with custom slug support.
- Add media curation from multiple folders and depths.
- Add public/private visibility support.

### Acceptance Criteria

- AC-PR03-001: Admin creates gallery with custom slug.
- AC-PR03-002: Gallery can include media across multiple folder levels.
- AC-PR03-003: Public gallery is LAN-accessible anonymously.
- AC-PR03-004: Private gallery is denied to unauthorized users.
- AC-PR03-005: Role-based and user-specific sharing both work.

### Required Tests

- TC-PR03-001: Slug validation and uniqueness tests.
- TC-PR03-002: Gallery CRUD integration tests.
- TC-PR03-003: Cross-folder add/remove gallery item tests.
- TC-PR03-004: Role-shared and user-shared access tests.

## PR-04: Temporary Views And Expiry

Branch: `feature/temporary-views`

### Deliverables

- Add temporary view model with custom slug and expiry.
- Add view create/read/revoke endpoints.
- Support public/private temporary views.

### Acceptance Criteria

- AC-PR04-001: Temporary view link resolves with configured slug.
- AC-PR04-002: Expired links are denied with clear error.
- AC-PR04-003: Public temporary views are anonymous LAN-readable.
- AC-PR04-004: Private temporary views require authorization.

### Required Tests

- TC-PR04-001: Expiry boundary tests (pre/post expiration).
- TC-PR04-002: Revoked temporary view denial tests.
- TC-PR04-003: Public/private temporary view authorization tests.
- TC-PR04-004: Slug conflict handling tests.

## PR-05: Protect Existing Media And Download Routes

Branch: `feature/protect-existing-routes`

### Deliverables

- Apply policy checks on existing folder/media/download endpoints.
- Enforce identical view/download permission behavior.
- Ensure thumbnail/original/resized/download paths are all covered.

### Acceptance Criteria

- AC-PR05-001: Unauthorized requests cannot access private media via direct URL.
- AC-PR05-002: Authorized read access implies download access.
- AC-PR05-003: Folder/listing APIs honor global visibility settings.

### Required Tests

- TC-PR05-001: Endpoint-by-endpoint authorization integration tests.
- TC-PR05-002: Direct media URL bypass regression tests.
- TC-PR05-003: View/download parity tests.

## PR-06: Reconciliation For Moved/Renamed Media

Branch: `feature/media-reconciliation`

### Deliverables

- Add reconciliation job mapping old media IDs to new IDs.
- Auto-remap high-confidence matches.
- Persist remap records and unresolved candidates.

### Acceptance Criteria

- AC-PR06-001: Gallery items survive common rename/move events.
- AC-PR06-002: Unresolved mappings are visible to admin operations UI/API.
- AC-PR06-003: Reconciliation actions are audit-logged.

### Required Tests

- TC-PR06-001: Rename simulation remap tests.
- TC-PR06-002: Folder move simulation remap tests.
- TC-PR06-003: False-positive guard tests.
- TC-PR06-004: Unresolved queue population tests.

## PR-07: Admin Access-Control UI

Branch: `feature/admin-access-ui`

### Deliverables

- Admin interface for account provisioning and role assignment.
- Admin toggles for folder/library public-private visibility.
- Gallery builder and sharing management UI.
- Temporary view creation and revoke controls.

### Acceptance Criteria

- AC-PR07-001: Admin can create user and assign role.
- AC-PR07-002: Admin can toggle folder/library visibility.
- AC-PR07-003: Admin can share private gallery by role and specific user.
- AC-PR07-004: Admin can create expiring temporary links.

### Required Tests

- TC-PR07-001: UI integration tests for admin workflows.
- TC-PR07-002: Contract tests between frontend and API.
- TC-PR07-003: Access-denied UX tests.

## PR-08: Operational Visibility And Audit

Branch: `feature/ops-audit`

### Deliverables

- Add operational events and lightweight audit dashboard.
- Add counters for denied access, active sessions, expiring links, reconciliation backlog.

### Acceptance Criteria

- AC-PR08-001: Key events are persisted and queryable.
- AC-PR08-002: Dashboard reports are accurate for recent actions.
- AC-PR08-003: Retention policy runs without data corruption.

### Required Tests

- TC-PR08-001: Event persistence integration tests.
- TC-PR08-002: Metrics aggregation accuracy tests.
- TC-PR08-003: Retention task tests.

## PR-09: Security Hardening And CI Gates

Branch: `chore/security-ci-hardening`

### Deliverables

- Add CSRF protection for mutating authenticated routes.
- Add login throttling and brute-force mitigations.
- Expand CI pipelines for RBAC matrix and integration suites.

### Acceptance Criteria

- AC-PR09-001: Mutating routes reject invalid CSRF tokens.
- AC-PR09-002: Repeated failed logins trigger throttle behavior.
- AC-PR09-003: CI blocks merge on RBAC or integration regression.

### Required Tests

- TC-PR09-001: CSRF negative and positive tests.
- TC-PR09-002: Login throttling stress tests.
- TC-PR09-003: CI pipeline gate verification test.

## Global RBAC Test Matrix (Mandatory Across PR-02+)

Test IDs in this matrix should be re-run on each PR that touches auth, access control, media delivery, or gallery visibility.

- RBAC-MX-001: Anonymous LAN can read public gallery.
- RBAC-MX-002: Anonymous LAN cannot read private gallery.
- RBAC-MX-003: Anonymous non-LAN denied from public gallery endpoints.
- RBAC-MX-004: Viewer can read authorized private gallery.
- RBAC-MX-005: Viewer denied from unshared private gallery.
- RBAC-MX-006: Editor can curate when granted editor capability.
- RBAC-MX-007: Admin can toggle global folder/library visibility.
- RBAC-MX-008: Owner retains full control.
- RBAC-MX-009: Download allowed when read allowed.
- RBAC-MX-010: Download denied when read denied.

## Release Gate Checklist

All items are required before enabling RBAC mode in production by default.

- RG-001: All PR acceptance criteria complete and signed.
- RG-002: RBAC matrix green in CI.
- RG-003: Migration backup and restore rehearsal completed.
- RG-004: LAN-only anonymous enforcement validated in staging.
- RG-005: Reconciliation unresolved queue monitoring in place.
- RG-006: Admin runbook and rollback procedure published.

## Open Decisions To Lock Before Build Start

- Default temporary view expiry (`24h` or `72h`).
- Slug conflict behavior (`fail` or `auto-suggest`).
- Private temporary view mode (`login-only` or `optional passcode`).
- Default initial state for folder/library visibility after rollout.
