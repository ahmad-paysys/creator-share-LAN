import { useCallback, useEffect, useMemo, useReducer, useState } from "react";
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
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  const selectedItems = useMemo(
    () => items.filter((item) => selected.has(item.id)),
    [items, selected],
  );

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
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "a") {
        event.preventDefault();
        dispatchSelection({ type: "set-many", ids: items.map((item) => item.id) });
      }
      if (event.key === "Escape") {
        dispatchSelection({ type: "clear" });
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [items]);

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
      if (filtered.length === 1) {
        const single = filtered[0];
        const href = absoluteUrl(
          single.type === "image"
            ? `/media/${single.id}/resized?sizeVmb=${imageResizeMb}&quality=80`
            : `/media/${single.id}/original`,
        );
        window.open(href, "_blank", "noopener,noreferrer");
      } else {
        const plan = await createDownloadPlan(
          filtered.map((item) => ({
            id: item.id,
            resizeMb: item.type === "image" ? imageResizeMb : null,
          })),
        );

        const zip = new JSZip();
        for (let index = 0; index < plan.downloads.length; index += 1) {
          const file = plan.downloads[index];
          const response = await fetch(absoluteUrl(file.url));
          const blob = await response.blob();
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
  }, [imageResizeMb, includeImages, includeVideos, selectedItems]);

  return (
    <div className="min-h-screen animate-rise px-4 py-6 md:px-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <header className="glass rounded-3xl p-6 shadow-glow">
          <h1 className="hero-title text-3xl md:text-5xl">Creator Share LAN</h1>
          <p className="mt-2 text-sm text-white/80">
            Wedding photo and video delivery on your local network.
          </p>
          <p className="mt-1 text-xs text-white/70">Active folder: {activeFolderPath || "All Media"}</p>
        </header>

        <div className="grid gap-6 lg:grid-cols-[320px,1fr]">
          <aside className="glass rounded-3xl p-4 shadow-glow">
            <FolderTree
              root={folderTree}
              activeFolderId={activeFolderId}
              onSelect={(folderId, folderPath) => {
                loadFolder(folderId, folderPath).catch(console.error);
              }}
            />
          </aside>

          <main className="space-y-4">
            <section className="glass rounded-3xl p-4 shadow-glow">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-white">Gallery</h2>
                <div className="flex items-center gap-2 text-sm text-white/85">
                  <span>{selected.size} selected</span>
                  {selected.size > 0 && (
                    <>
                      <button
                        className="rounded-full bg-white/20 px-3 py-1 hover:bg-white/30"
                        onClick={() => setDownloadOpen(true)}
                      >
                        Download Selected
                      </button>
                      <button
                        className="rounded-full bg-white/20 px-3 py-1 hover:bg-white/30"
                        onClick={() => dispatchSelection({ type: "clear" })}
                      >
                        Clear
                      </button>
                    </>
                  )}
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
                Building download package: {progress}%
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
        onClose={() => setDownloadOpen(false)}
        onConfirm={() => {
          runBatchDownload().catch(console.error);
        }}
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
