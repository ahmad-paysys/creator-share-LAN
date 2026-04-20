import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { absoluteUrl, createDownloadPlan, fetchFolderMedia, fetchFolders } from "./api";
import DownloadModal from "./components/DownloadModal";
import FolderTree from "./components/FolderTree";
import GalleryGrid from "./components/GalleryGrid";
import Lightbox from "./components/Lightbox";
import type { FolderNode, MediaItem } from "./types";

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

interface SharedViewState {
  folderId: string;
  selectedIds: string[];
}

function parseSharedViewState(): SharedViewState {
  const params = new URLSearchParams(window.location.search);
  const folderId = params.get("folder") || "root";
  const selectedIds = (params.get("sel") || "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return { folderId, selectedIds };
}

function findFolderPathById(root: FolderNode, folderId: string): string {
  if (folderId === "root") {
    return "";
  }

  const stack: FolderNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === folderId) {
      return node.path;
    }
    stack.push(...node.children);
  }
  return "";
}

function hasFolderId(root: FolderNode, folderId: string): boolean {
  if (folderId === "root") {
    return true;
  }

  const stack: FolderNode[] = [root];
  while (stack.length > 0) {
    const node = stack.pop()!;
    if (node.id === folderId) {
      return true;
    }
    stack.push(...node.children);
  }
  return false;
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
  const [copiedViewLink, setCopiedViewLink] = useState(false);
  const copiedLinkTimerRef = useRef<number | null>(null);
  const urlHydratedRef = useRef(false);

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
    return media;
  }, []);

  useEffect(() => {
    (async () => {
      const tree = await fetchFolders();
      setFolderTree(tree);
      const shared = parseSharedViewState();
      const targetFolderId = hasFolderId(tree, shared.folderId) ? shared.folderId : "root";
      const folderPath = findFolderPathById(tree, targetFolderId);
      const media = await loadFolder(targetFolderId, folderPath);

      if (shared.selectedIds.length > 0) {
        const selectedSet = new Set(shared.selectedIds);
        const valid = media.filter((item) => selectedSet.has(item.id)).map((item) => item.id);
        if (valid.length > 0) {
          dispatchSelection({ type: "set-many", ids: valid });
        }
      }

      urlHydratedRef.current = true;
    })().catch(console.error);
  }, [loadFolder]);

  useEffect(() => {
    if (!urlHydratedRef.current) {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (activeFolderId === "root") {
      params.delete("folder");
    } else {
      params.set("folder", activeFolderId);
    }

    const selectedIdsForUrl = selectedItems.map((item) => item.id).slice(0, 400);
    if (selectedIdsForUrl.length > 0) {
      params.set("sel", selectedIdsForUrl.join(","));
    } else {
      params.delete("sel");
    }

    const query = params.toString();
    const nextUrl = query ? `${window.location.pathname}?${query}` : window.location.pathname;
    window.history.replaceState(null, "", nextUrl);
  }, [activeFolderId, selectedItems]);

  useEffect(() => {
    return () => {
      if (copiedLinkTimerRef.current) {
        window.clearTimeout(copiedLinkTimerRef.current);
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

  const handleCopyViewLink = useCallback(async () => {
    const link = window.location.href;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(link);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = link;
        textArea.style.position = "fixed";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
      }

      setCopiedViewLink(true);
      if (copiedLinkTimerRef.current) {
        window.clearTimeout(copiedLinkTimerRef.current);
      }
      copiedLinkTimerRef.current = window.setTimeout(() => {
        setCopiedViewLink(false);
      }, 2200);
    } catch {
      window.alert("Could not copy link. Please copy the URL from your browser address bar.");
    }
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

  return (
    <div className="min-h-screen animate-rise px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="glass rounded-3xl p-6 shadow-lg shadow-black/20">
          <h1 className="hero-title">Creator Share LAN</h1>
          <p className="mt-2 text-sm text-white/80">
            Wedding photo and video delivery on your local network.
          </p>
          <p className="mt-1 text-xs text-white/70">Active folder: {activeFolderPath || "All Media"}</p>
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

                    <button
                      className="rounded-full bg-white/20 px-3 py-1 hover:bg-white/30"
                      onClick={() => {
                        handleCopyViewLink().catch(() => undefined);
                      }}
                    >
                      {copiedViewLink ? "Link Copied" : "Copy View Link"}
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
    </div>
  );
}
