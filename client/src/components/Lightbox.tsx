import { useEffect, useRef } from "react";
import { absoluteUrl } from "../api";
import type { MediaItem } from "../types";

interface LightboxProps {
  items: MediaItem[];
  index: number;
  onClose: () => void;
  onMove: (nextIndex: number) => void;
}

export default function Lightbox({ items, index, onClose, onMove }: LightboxProps) {
  const item = items[index];
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
      if (event.key === "ArrowRight") {
        onMove(Math.min(items.length - 1, index + 1));
      }
      if (event.key === "ArrowLeft") {
        onMove(Math.max(0, index - 1));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [index, items.length, onClose, onMove]);

  useEffect(() => {
    const next = items[index + 1];
    const prev = items[index - 1];
    if (next?.type === "image") {
      const img = new Image();
      img.src = absoluteUrl(`/media/${next.id}/original`);
    }
    if (prev?.type === "image") {
      const img = new Image();
      img.src = absoluteUrl(`/media/${prev.id}/original`);
    }
  }, [index, items]);

  if (!item) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 p-4"
      onTouchStart={(event) => {
        touchStartX.current = event.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(event) => {
        if (touchStartX.current == null) {
          return;
        }
        const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStartX.current;
        if (delta > 40) {
          onMove(Math.max(0, index - 1));
        }
        if (delta < -40) {
          onMove(Math.min(items.length - 1, index + 1));
        }
      }}
    >
      <button
        className="absolute right-5 top-5 rounded-full bg-white/10 px-3 py-1 text-white"
        onClick={onClose}
      >
        Close
      </button>
      <button
        className="absolute left-5 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white"
        onClick={() => onMove(Math.max(0, index - 1))}
      >
        ◀
      </button>
      <button
        className="absolute right-5 top-1/2 -translate-y-1/2 rounded-full bg-white/10 px-3 py-2 text-white"
        onClick={() => onMove(Math.min(items.length - 1, index + 1))}
      >
        ▶
      </button>
      <div className="max-h-[85vh] max-w-[90vw]">
        {item.type === "image" ? (
          <img src={absoluteUrl(`/media/${item.id}/original`)} alt={item.name} className="max-h-[80vh] rounded-xl" />
        ) : (
          <video
            src={absoluteUrl(`/media/${item.id}/original`)}
            controls
            poster={absoluteUrl(item.thumbnailUrl)}
            className="max-h-[80vh] rounded-xl"
          />
        )}
        <div className="mt-3 flex items-center justify-between text-sm text-white/80">
          <span>
            {index + 1} of {items.length}
          </span>
          <a
            className="rounded-full bg-mint px-3 py-1 text-ink"
            href={absoluteUrl(item.type === "image" ? `/media/${item.id}/resized` : `/media/${item.id}/original`)}
          >
            Download
          </a>
        </div>
      </div>
    </div>
  );
}
