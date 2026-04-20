import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { absoluteUrl, createDownloadPlan, fetchFolderMedia, fetchFolders, fetchSyncStatus } from "./api";
import DownloadModal from "./components/DownloadModal";
import FolderTree from "./components/FolderTree";
import GalleryGrid from "./components/GalleryGrid";
import Lightbox from "./components/Lightbox";
import type { FolderNode, MediaItem, SyncStatus } from "./types";

type SelectionAction =
  | { type: "toggle"; id: string }
  | { type: "set-many"; ids: string[] }
  | { type: "clear" };

function selectionReducer(state: Set<string>, action: SelectionAction): Set<string> {
  if (action.type === "clear") {
    return new Set();
  }
  if (action.type === "set-many") {
    return new Set(action.ids);
  }
  const next = new Set(state);
  if (next.has(action.id)) {
    next.delete(action.id);
  } else {
    next.add(action.id);
  }
  return next;
}

export default function App() {
  const [folderTree, setFolderTree] = useState<FolderNode | null>(null);
  const [activeFolderId, setActiveFolderId] = useState("root");
  const [activeFolderPath, setActiveFolderPath] = useState("");
  const [items, setItems] = useState<MediaItem[]>([]);
  const [selected, dispatchSelection] = useReducer(selectionReducer, new Set<string>());
  const [lastClickedIndex, setLastClickedIndex] = useState<number | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [downloadOpen, setDownloadOpen] = useState(false);
  const [includeImages, setIncludeImages] = useState(true);
  const [includeVideos, setIncludeVideos] = useState(true);
  const [imageResizeMb, setImageResizeMb] = useState(2);
  const [downloadMode, setDownloadMode] = useState<"zip" | "separate">("zip");
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [syncToast, setSyncToast] = useState<string | null>(null);
  const lastSeenRevisionRef = useRef<number | null>(null);
  const syncToastTimerRef = useRef<number | null>(null);

  const delay = useCallback((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)), []);

  const fetchBlobWithRetry = useCallback(async (url: string, retries = 2): Promise<Blob> => {
    let lastError: unknown;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`Failed download (${response.status})`);
        }
        return await response.blob();
      } catch (error) {
        lastError = error;
        if (attempt < retries) {
          await delay(200 * (attempt + 1));
        }
      }
    }
    throw lastError;
  }, [delay]);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );
  const selectedCount = selectedItems.length;
  const totalCount = items.length;
  const hasAnySelected = selectedCount > 0;
  const isAllSelected = totalCount > 0 && selectedCount === totalCount;

  const loadFolder = useCallback(async (folderId: string, folderPath = "") => {
    const media = await fetchFolderMedia(folderId);
    setItems(media);
    setActiveFolderId(folderId);
    setActiveFolderPath(folderPath);
  }, []);

  useEffect(() => {
    (async () => {
      const tree = await fetchFolders();
      setFolderTree(tree);
      await loadFolder("root", "");
    })().catch(console.error);
  }, [loadFolder]);

  useEffect(() => {
    let disposed = false;

    const pollSync = async () => {
      try {
        const status = await fetchSyncStatus();
        if (disposed) {
          return;
        }

        const previousRevision = lastSeenRevisionRef.current;
        lastSeenRevisionRef.current = status.revision;
        setSyncStatus(status);

        if (previousRevision !== null && status.revision !== previousRevision && status.newMediaCount > 0) {
          setSyncToast(`${status.newMediaCount} new media found`);
          if (syncToastTimerRef.current) {
            window.clearTimeout(syncToastTimerRef.current);
          }
          syncToastTimerRef.current = window.setTimeout(() => {
            setSyncToast(null);
          }, 3200);
        }
      } catch {
        // Ignore transient LAN polling failures.
      }
    };

    pollSync().catch(() => undefined);
    const interval = window.setInterval(() => {
      pollSync().catch(() => undefined);
    }, 5000);

    return () => {
      disposed = true;
      window.clearInterval(interval);
      if (syncToastTimerRef.current) {
        window.clearTimeout(syncToastTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && downloadOpen) {
        event.preventDefault();
        setDownloadOpen(false);
        return;
      }

      if (event.key === "Escape" && lightboxIndex !== null) {
        event.preventDefault();
        setLightboxIndex(null);
        return;
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        dispatchSelection({ type: "set-many", ids: items.map((item) => item.id) });
      }
      if (event.key === "Escape") {
        event.preventDefault();
        dispatchSelection({ type: "clear" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [downloadOpen, items, lightboxIndex]);

  const handleToggleSelect = useCallback(
    (id: string, index: number, withRange: boolean) => {
      if (withRange && lastClickedIndex !== null) {
        const start = Math.min(lastClickedIndex, index);
        const end = Math.max(lastClickedIndex, index);
        const ids = items.slice(start, end + 1).map((item) => item.id);
        const next = new Set(selected);
        ids.forEach((entry) => next.add(entry));
        dispatchSelection({ type: "set-many", ids: Array.from(next) });
      } else {
        dispatchSelection({ type: "toggle", id });
      }
      setLastClickedIndex(index);
    },
    [items, lastClickedIndex, selected],
  );

  const handleSelectAllCurrentView = useCallback(() => {
    if (items.length === 0) {
      return;
    }
    dispatchSelection({ type: "set-many", ids: items.map((item) => item.id) });
  }, [items]);

  const handleClearSelection = useCallback(() => {
    dispatchSelection({ type: "clear" });
  }, []);

  const runBatchDownload = useCallback(async () => {
    const filtered = selectedItems.filter((item) => {
      if (item.type === "image" && !includeImages) {
        return false;
      }
      if (item.type === "video" && !includeVideos) {
        return false;
      }
      return true;
    });

    if (filtered.length === 0) {
      setDownloadOpen(false);
      return;
    }

    setBusy(true);
    setProgress(0);
    try {
      const plan = await createDownloadPlan(
        filtered.map((item) => ({
          id: item.id,
          resizeMb: item.type === "image" ? imageResizeMb : null,
        })),
      );

      if (filtered.length === 1 || downloadMode === "separate") {
        const failures: string[] = [];
        for (let index = 0; index < plan.downloads.length; index += 1) {
          const file = plan.downloads[index];
          try {
            const blob = await fetchBlobWithRetry(absoluteUrl(file.url));
            saveAs(blob, file.filename);
          } catch {
            failures.push(file.filename);
          }
          setProgress(Math.round(((index + 1) / plan.downloads.length) * 100));
          await delay(80);
        }

        if (failures.length > 0) {
          window.alert(
            `Some files could not be downloaded. Failed: ${failures.slice(0, 5).join(", ")}${failures.length > 5 ? "..." : ""}`,
          );
        }
      } else {
        const zip = new JSZip();
        for (let index = 0; index < plan.downloads.length; index += 1) {
          const file = plan.downloads[index];
          const blob = await fetchBlobWithRetry(absoluteUrl(file.url));
          zip.file(file.filename, blob);
          setProgress(Math.round(((index + 1) / plan.downloads.length) * 100));
        }

        const archive = await zip.generateAsync({ type: "blob" });
        saveAs(archive, `creator-share-${Date.now()}.zip`);
      }
    } finally {
      setBusy(false);
      setDownloadOpen(false);
    }
  }, [
    absoluteUrl,
    createDownloadPlan,
    delay,
    downloadMode,
    fetchBlobWithRetry,
    imageResizeMb,
    includeImages,
    includeVideos,
    selectedItems,
  ]);

  const syncLabel = useMemo(() => {
    if (!syncStatus) {
      return "Sync status: connecting";
    }

    if (syncStatus.state === "scanning") {
      return "Sync: scanning media";
    }
    if (syncStatus.pendingThumbnails > 0) {
      return `Sync: building ${syncStatus.pendingThumbnails} thumbnails`;
    }
    if (syncStatus.state === "updated" && syncStatus.newMediaCount > 0) {
      return `Sync: ${syncStatus.newMediaCount} new items found`;
    }
    return "Sync: up to date";
  }, [syncStatus]);

  const syncBadgeTone = useMemo(() => {
    if (!syncStatus || syncStatus.state === "scanning") {
      return "border-coral/70 bg-coral/20 text-white";
    }
    if (syncStatus.pendingThumbnails > 0) {
      return "border-sand/70 bg-sand/20 text-white";
    }
    return "border-mint/70 bg-mint/20 text-white";
  }, [syncStatus]);

  return (
    <div className="min-h-screen animate-rise px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="glass rounded-3xl p-6 shadow-lg shadow-black/20">
          <h1 className="hero-title">Creator Share LAN</h1>
          <p className="mt-2 text-sm text-white/80">
            Wedding photo and video delivery on your local network.
          </p>
          <p className="mt-1 text-xs text-white/70">Active folder: {activeFolderPath || "All Media"}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-3 py-1 text-xs ${syncBadgeTone}`}>{syncLabel}</span>
            {syncStatus && (
              <span className="text-xs text-white/70">Revision {syncStatus.revision} • Media {syncStatus.mediaCount}</span>
            )}
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <aside className="glass rounded-3xl p-4 shadow-lg shadow-black/20">
            <FolderTree
              root={folderTree}
              activeFolderId={activeFolderId}
              onSelect={(folderId, folderPath) => {
                loadFolder(folderId, folderPath).catch(console.error);
              }}
            />
          </aside>

          <main className="space-y-4">
            <section className="glass rounded-3xl p-4 shadow-lg shadow-black/20">
              <div className="sticky top-2 z-20 mb-3 rounded-2xl border border-white/15 bg-ink/85 p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-white">Gallery</h2>
                  <div className="flex flex-wrap items-center gap-2 text-sm text-white/85">
                    <span className="rounded-full border border-white/20 px-3 py-1 text-white/90">
                      {selectedCount} / {totalCount} selected
                    </span>

                    <button
                      className="rounded-full bg-white/20 px-3 py-1 hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={handleSelectAllCurrentView}
                      disabled={isAllSelected || totalCount === 0}
                    >
                      Select All
                    </button>

                    <button
                      className="rounded-full bg-white/20 px-3 py-1 hover:bg-white/30 disabled:cursor-not-allowed disabled:opacity-40"
                      onClick={handleClearSelection}
                      disabled={!hasAnySelected}
                    >
                      Deselect All
                    </button>

                    {hasAnySelected && (
                      <>
                        <button
                          className="rounded-full bg-white/20 px-3 py-1 hover:bg-white/30"
                          onClick={() => setDownloadOpen(true)}
                        >
                          Download Selected
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>

              <GalleryGrid
                items={items}
                selected={selected}
                onToggleSelect={handleToggleSelect}
                onOpenLightbox={setLightboxIndex}
              />
            </section>

            {busy && (
              <section className="glass rounded-2xl p-3 text-sm text-white">
                {downloadMode === "zip" ? "Preparing ZIP package" : "Downloading separate files"}: {progress}%
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-white/15">
                  <div className="h-full bg-mint transition-all" style={{ width: `${progress}%` }} />
                </div>
              </section>
            )}
          </main>
        </div>
      </div>

      {lightboxIndex !== null && (
        <Lightbox
          items={items}
          index={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
          onMove={setLightboxIndex}
        />
      )}

      <DownloadModal
        open={downloadOpen}
        imageResizeMb={imageResizeMb}
        includeImages={includeImages}
        includeVideos={includeVideos}
        mode={downloadMode}
        onClose={() => setDownloadOpen(false)}
        onConfirm={() => {
          runBatchDownload().catch(console.error);
        }}
        onModeChange={setDownloadMode}
        onUpdate={(next) => {
          if (typeof next.imageResizeMb === "number") {
            setImageResizeMb(next.imageResizeMb);
          }
          if (typeof next.includeImages === "boolean") {
            setIncludeImages(next.includeImages);
          }
          if (typeof next.includeVideos === "boolean") {
            setIncludeVideos(next.includeVideos);
          }
        }}
      />

      {syncToast && (
        <div className="fixed bottom-4 right-4 z-50 rounded-xl border border-mint/60 bg-ink px-4 py-2 text-sm text-white shadow-lg shadow-black/40">
          {syncToast}
        </div>
      )}
    </div>
  );
}
