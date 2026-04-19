# SWE Specification: LAN-Based Photo & Video Sharing Web Application

## Project Overview
Build a production-grade, self-contained web application for sharing wedding photos and videos across a local network. The application must prioritize performance, UX, and ease of deployment with zero hardcoded configuration.

---

## Technology Stack (Non-Negotiable Decisions)

### Frontend
- **Framework**: React 18+ with TypeScript
- **Build Tool**: Vite (for fast HMR and optimized production builds)
- **Styling**: TailwindCSS + PostCSS (utility-first, minimal bundle)
- **Image Handling**: 
  - Thumbnails: `sharp` (server-side) for generation and caching
  - Lightbox/Gallery: `yet-another-react-lightbox` or custom React component with CSS-in-JS (performant modal)
  - Image Lazy Loading: Native `loading="lazy"` with Intersection Observer fallback
- **State Management**: React Context + `useCallback`/`useMemo` (no Redux bloat)
- **Download Handling**: `jszip` (client-side bundling) + `FileSaver.js` for cross-browser compatibility
- **Video Thumbnails**: Server-side ffmpeg integration for frame extraction

### Backend
- **Runtime**: Node.js 18+ (Express.js)
- **Image Processing**: `sharp` (fast, low-memory image resizing/thumbnail generation)
- **Video Processing**: `fluent-ffmpeg` wrapper (ffmpeg binary required on host system)
- **File Serving**: Express static middleware with conditional compression and caching headers
- **Environment Config**: `dotenv` for .env parsing
- **Concurrency**: Bull queue (optional, for heavy thumbnail generation on startup)

### Deployment Model
- **Single Binary**: Webpack/Vite bundle frontend into Express public directory
- **Port Configuration**: Environment variable (default 3000, configurable)
- **File System Watching**: chokidar (for dynamic folder indexing if needed in future)

---

## Core Features & Implementation

### 1. Configuration Management (`.env` File)
```
VITE_API_BASE_URL=http://localhost:3000
VITE_MAX_THUMBNAIL_RESOLUTION=1920x1080
PORT=3000
NODE_ENV=production

# Image Processing
DEFAULT_IMAGE_RESIZE_MB=2
DEFAULT_IMAGE_QUALITY=80
THUMBNAIL_SIZE_PX=280

# Video Processing
VIDEO_THUMBNAIL_QUALITY=80
VIDEO_FRAME_TIMESTAMP=00:00:05

# Folder Configuration
MEDIA_ROOT_PATH=./media
INCLUDE_FOLDERS=*
EXCLUDE_FOLDERS=.git,.cache,node_modules,__pycache__
RECURSIVE_SCAN=true

# Performance
MAX_CONCURRENT_RESIZE_JOBS=4
THUMBNAIL_CACHE_DIR=./cache/thumbnails

# Networking (Windows Firewall Integration)
EXPOSE_TO_LAN=true
CORS_ALLOWED_ORIGINS=*
```

**Backend Logic**: Parse .env on startup. Validate paths (no path traversal attacks). Cache parsed config in memory. Reload on .env changes (dev mode) or require restart (production).

### 2. File Structure & Serving

#### Directory Indexing
- **Endpoint**: `GET /api/folders`
- **Behavior**: Recursively scan `MEDIA_ROOT_PATH`, respect `INCLUDE_FOLDERS` and `EXCLUDE_FOLDERS` patterns (glob or regex), return tree structure with metadata:
  ```json
  {
    "id": "uuid",
    "name": "folder_name",
    "path": "relative/path",
    "children": [],
    "itemCount": 42,
    "hasImages": true,
    "hasVideos": true
  }
  ```
- **Caching**: Cache folder tree on startup; if `RECURSIVE_SCAN=true` and filesystem watch is implemented, invalidate on change.

#### Media File Listing
- **Endpoint**: `GET /api/folders/:folderId/media`
- **Response**: Array of files with metadata:
  ```json
  {
    "id": "uuid",
    "name": "photo.jpg",
    "type": "image",
    "originalSize": 21000000,
    "thumbnailUrl": "/thumbnails/uuid.jpg",
    "createdAt": "2024-01-15T10:30:00Z"
  }
  ```
- **Ordering**: By creation date (exif data for images, filesystem mtime for videos). Client-side UI sorting available.

#### Image Resizing Pipeline
- **On-Demand Resizing**: When user requests download of resized image:
  1. Calculate target size in KB → px dimensions (maintain aspect ratio)
  2. Check if resized version exists in temp cache (`THUMBNAIL_CACHE_DIR`)
  3. If not, use `sharp` to resize in-memory, stream to client, optionally cache
  4. **Never modify originals on disk**
- **Endpoint**: `GET /media/:mediaId/resized?sizeVmb=2&quality=80`
- **Default**: `sizeVmb=2` (configurable), quality=80
- **Video**: Serve original (no server-side video re-encoding; client-side constraints only)

#### Thumbnail Generation
- **On Startup**: Batch-generate thumbnails for all images/videos using Bull queue or simple Promise.all()
- **Storage**: Cache directory with UUID-based filenames
- **Size**: `THUMBNAIL_SIZE_PX` (default 280px)
- **Images**: Use `sharp` with `fit: 'cover'` + `position: 'center'` for consistent aspect ratio
- **Videos**: Extract single frame at `VIDEO_FRAME_TIMESTAMP` using ffmpeg, save as JPEG

### 3. Frontend: Gallery & Lightbox

#### Gallery Grid View (Folder/Album)
- **Layout**: CSS Grid (responsive, 3 cols mobile, 4-6 cols desktop)
- **Lazy Loading**: `loading="lazy"` on `<img>` tags + Intersection Observer for near-viewport images
- **Selection**: Checkbox overlay on each thumbnail (minimal visual weight, appears on hover)
- **State Persistence**: useReducer hook to track selected files (in-memory, persists while browsing)
- **Keyboard Shortcuts**: 
  - `Shift+Click` to range-select
  - `Ctrl+A` to select all in folder
  - `Escape` to deselect all
- **Performance**: Virtualization for folders with 500+ items (use `react-window` if needed)

#### Lightbox (Full-Screen Image/Video View)
- **Trigger**: Click thumbnail
- **Layout**: Full-screen centered media with dark overlay, minimal controls
- **Navigation**: 
  - Arrow keys / Swipe to prev/next
  - Click arrows or image edges (desktop)
  - Swipe gestures (mobile, hammer.js or native touch events)
- **Controls**:
  - Download button (triggers resize download, **does not clear folder selection**)
  - Close button (returns to folder view with selection intact)
  - Image counter ("3 of 42")
- **Performance**: Pre-load next/prev images in background (img.src = '')
- **Videos**: Show play button overlay, let browser handle video.js or native controls

#### Batch Download UX
- **Download Button** (in folder view, only shows if items selected):
  - Single file: Direct download (no compression)
  - Multiple files: Show modal with options:
    - All images resized (default), all videos original
    - Toggle checkboxes per file type
    - Customize resize MB (slider: 1–5 MB)
    - Show progress bar as files are fetched and zipped client-side
- **Implementation**: 
  - Fetch all selected files from `/api/download?ids=uuid1,uuid2`
  - Server returns JSON array of { id, url, filename }
  - Client loops, fetches each, jszip.add() each blob
  - Client zip.generateAsync() → FileSaver.saveAs()
  - **No state clearing** after download; user can continue selecting

### 4. Backend: Download Endpoint
- **Endpoint**: `POST /api/download`
- **Request Body**:
  ```json
  {
    "items": [
      { "id": "uuid1", "resizeMb": 2 },
      { "id": "uuid2", "resizeMb": null }
    ]
  }
  ```
- **Response**: JSON with presigned/direct URLs for each file:
  ```json
  {
    "downloads": [
      { "id": "uuid1", "url": "/media/uuid1/resized?sizeVmb=2", "filename": "photo1.jpg" }
    ]
  }
  ```
- **Caching Strategy**: 
  - Resized images: Cache in temp dir for 1 hour (LRU eviction if cache > 5GB)
  - Original videos: Stream directly from disk
- **Rate Limiting**: Simple token bucket (100 req/min per IP) to prevent abuse

### 5. Windows Firewall Integration
- **Approach**: No direct Windows API calls (complexity); instead:
  1. **Pre-flight Instructions**: Include `FIREWALL_SETUP.md` in repo with one-liner PowerShell script:
     ```powershell
     New-NetFirewallRule -DisplayName "Wedding Photo Share" -Direction Inbound -Action Allow -Protocol TCP -LocalPort 3000
     ```
  2. **ENV Variable**: `EXPOSE_TO_LAN=true` → App logs setup instructions on startup
  3. **CORS**: Set `CORS_ALLOWED_ORIGINS=*` when `EXPOSE_TO_LAN=true`
- **Documentation**: Clear README section for "Running on Local Network"

### 6. Startup & Execution
```bash
npm install
npm run build       # Build frontend + backend bundle
npm run start       # Start server on PORT from .env
```

- **Dev Mode**: `npm run dev` → Vite dev server (frontend) + nodemon (backend)
- **Production**: Single Node.js process serving bundled React + Express API
- **Health Check**: `GET /health` returns 200 + { version, mediaCount, thumbnailsReady }

---

## Performance & Optimization Targets

### Image Optimization
- Thumbnail generation parallelized (MAX_CONCURRENT_RESIZE_JOBS)
- Sharp encoding: JPEG quality 80 (configurable), progressive JPEGs
- Lazy loading on all thumbnails (native browser)
- Cache headers: `Cache-Control: public, max-age=86400` for thumbnails

### Frontend Performance
- Code splitting: Separate lightbox component chunk
- React.memo on Gallery item component
- useCallback for event handlers to prevent re-renders
- Vite optimizes bundle: esbuild + rollup
- Gzip compression on all responses (Express compression middleware)
- Target: <3s initial load, <300ms gallery re-render

### Video Handling
- Stream from disk (no transcoding); let browser decode
- Thumbnail only: Extract 1 frame at startup (ffmpeg)
- Optionally: Generate poster image (frame) for `<video poster="">`

---

## Security Considerations

- **Path Traversal**: Validate all file paths against MEDIA_ROOT_PATH; reject `..` sequences
- **CORS**: Restrict to LAN only if `EXPOSE_TO_LAN=true`; use CORS middleware
- **Rate Limiting**: Prevent DoS on resize/download endpoints
- **No Auth**: LAN-only app; assume trusted network. No login required.

---

## Testing & Quality
- Unit tests for image resize logic (mocking sharp)
- E2E tests: Folder navigation → selection → download
- Performance benchmarks: Gallery render time, thumbnail generation speed

---

## Deliverables
1. **Complete source code** (React frontend + Express backend)
2. **.env.example** with all configuration options documented
3. **README.md** with setup, deployment, and firewall instructions
4. **Package.json** with scripts for dev/build/start
5. **Dockerfile** (optional) for containerized deployment

---

## Questions for Clarification (If Needed)
1. Should videos be playable inline in the lightbox, or download-only?
2. Do you want folder breadcrumbs in the gallery view for nested navigation?
3. Should the app auto-generate thumbnails on startup, or on-demand on first access?
4. Any preference for video format support (MP4, MOV, WebM)?
5. Should users be able to navigate back to parent folder within the app, or only view selected folder?

---

**Tone**: Senior tech lead decisions prioritize simplicity, performance, and reliability over feature bloat. This spec is implementable in ~3–4 weeks for a competent full-stack team.
