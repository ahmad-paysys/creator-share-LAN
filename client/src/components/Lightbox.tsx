import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
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
  const hasPrev = index > 0;
  const hasNext = index < items.length - 1;

  useEffect(() => {
    const scrollY = window.scrollY;
    const originalPosition = document.body.style.position;
    const originalTop = document.body.style.top;
    const originalLeft = document.body.style.left;
    const originalRight = document.body.style.right;
    const originalWidth = document.body.style.width;
    const originalOverflowY = document.body.style.overflowY;

    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = "0";
    document.body.style.right = "0";
    document.body.style.width = "100%";
    document.body.style.overflowY = "scroll";

    return () => {
      document.body.style.position = originalPosition;
      document.body.style.top = originalTop;
      document.body.style.left = originalLeft;
      document.body.style.right = originalRight;
      document.body.style.width = originalWidth;
      document.body.style.overflowY = originalOverflowY;
      window.scrollTo(0, scrollY);
    };
  }, []);

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

  return createPortal(
    <div
      className="fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-black/90 p-4"
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
        className="fixed right-5 top-5 z-30 rounded-full border border-white/35 bg-black/70 px-3 py-1 text-white shadow-lg shadow-black/50 transition hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
        onClick={onClose}
        aria-label="Close media viewer"
        title="Close"
      >
        Close
      </button>

      <div className="pointer-events-none fixed inset-y-0 left-0 z-20 hidden w-24 bg-gradient-to-r from-black/55 to-transparent md:block" />
      <div className="pointer-events-none fixed inset-y-0 right-0 z-20 hidden w-24 bg-gradient-to-l from-black/55 to-transparent md:block" />
      <div className="pointer-events-none fixed inset-x-0 top-0 z-20 h-20 bg-gradient-to-b from-black/55 to-transparent md:hidden" />
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-20 h-20 bg-gradient-to-t from-black/55 to-transparent md:hidden" />

      <button
        className={`fixed left-4 top-1/2 z-30 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/70 text-2xl text-white shadow-lg shadow-black/60 transition md:flex ${
          hasPrev
            ? "hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            : "cursor-not-allowed opacity-40"
        }`}
        onClick={() => hasPrev && onMove(index - 1)}
        disabled={!hasPrev}
        aria-disabled={!hasPrev}
        aria-label="Previous media"
        title="Previous"
      >
        ◀
      </button>
      <button
        className={`fixed right-4 top-1/2 z-30 hidden h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full border border-white/35 bg-black/70 text-2xl text-white shadow-lg shadow-black/60 transition md:flex ${
          hasNext
            ? "hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            : "cursor-not-allowed opacity-40"
        }`}
        onClick={() => hasNext && onMove(index + 1)}
        disabled={!hasNext}
        aria-disabled={!hasNext}
        aria-label="Next media"
        title="Next"
      >
        ▶
      </button>

      <button
        className={`fixed left-1/2 top-4 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-white/35 bg-black/70 text-xl text-white shadow-lg shadow-black/60 transition md:hidden ${
          hasPrev
            ? "hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            : "cursor-not-allowed opacity-40"
        }`}
        onClick={() => hasPrev && onMove(index - 1)}
        disabled={!hasPrev}
        aria-disabled={!hasPrev}
        aria-label="Previous media"
        title="Previous"
      >
        ▲
      </button>

      <button
        className={`fixed bottom-4 left-1/2 z-30 flex h-12 w-12 -translate-x-1/2 items-center justify-center rounded-full border border-white/35 bg-black/70 text-xl text-white shadow-lg shadow-black/60 transition md:hidden ${
          hasNext
            ? "hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
            : "cursor-not-allowed opacity-40"
        }`}
        onClick={() => hasNext && onMove(index + 1)}
        disabled={!hasNext}
        aria-disabled={!hasNext}
        aria-label="Next media"
        title="Next"
      >
        ▼
      </button>

      <div className="mx-auto flex min-h-full w-full items-center justify-center py-10">
        <div className="max-h-[calc(100vh-5rem)] max-w-[90vw] overflow-auto animate-[fadeIn_160ms_ease-out]">
          {item.type === "image" ? (
            <img
              src={absoluteUrl(`/media/${item.id}/original`)}
              alt={item.name}
              className="max-h-[calc(100vh-10rem)] rounded-xl"
            />
          ) : (
            <video
              src={absoluteUrl(`/media/${item.id}/original`)}
              controls
              poster={absoluteUrl(item.thumbnailUrl)}
              className="max-h-[calc(100vh-10rem)] rounded-xl"
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
    </div>,
    document.body,
  );
}
