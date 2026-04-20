import { memo, useEffect, useMemo, useRef, useState } from "react";
import { FixedSizeGrid as Grid } from "react-window";
import type { GridChildComponentProps } from "react-window";
import { absoluteUrl } from "../api";
import type { MediaItem } from "../types";

interface GalleryGridProps {
  items: MediaItem[];
  selected: Set<string>;
  onToggleSelect: (id: string, index: number, withRange: boolean) => void;
  onOpenLightbox: (index: number) => void;
}

const VIRTUALIZE_THRESHOLD = 100;
const CARD_WIDTH = 224;
const CARD_HEIGHT = 278;

const GridItem = memo(function GridItem({
  item,
  index,
  selected,
  onToggleSelect,
  onOpenLightbox,
}: {
  item: MediaItem;
  index: number;
  selected: boolean;
  onToggleSelect: (id: string, index: number, withRange: boolean) => void;
  onOpenLightbox: (index: number) => void;
}) {
  return (
    <article className="gallery-card group relative overflow-hidden rounded-2xl bg-ink/80 shadow-sm">
      <button className="block w-full" onClick={() => onOpenLightbox(index)}>
        <img
          src={absoluteUrl(item.thumbnailUrl)}
          alt={item.name}
          width={280}
          height={192}
          className="h-48 w-full object-cover"
          loading="lazy"
          decoding="async"
        />
        {item.type === "video" && (
          <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
            Video
          </span>
        )}
      </button>
      <label
        className={`absolute right-3 top-3 z-10 flex cursor-pointer items-center gap-2 rounded-full bg-black/60 px-2 py-1 text-xs text-white ${
          selected
            ? "opacity-100"
            : "opacity-95"
        }`}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => undefined}
          onClick={(event) => onToggleSelect(item.id, index, event.shiftKey)}
        />
        Select
      </label>
      <div className="px-3 py-2 text-xs text-white/90">{item.name}</div>
    </article>
  );
});

export default function GalleryGrid({
  items,
  selected,
  onToggleSelect,
  onOpenLightbox,
}: GalleryGridProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [containerWidth, setContainerWidth] = useState(1024);

  useEffect(() => {
    if (!containerRef.current) {
      return;
    }

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width;
      if (width) {
        setContainerWidth(width);
      }
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const virtualConfig = useMemo(() => {
    const columnCount = Math.max(1, Math.floor(containerWidth / CARD_WIDTH));
    const rowCount = Math.ceil(items.length / columnCount);
    return {
      columnCount,
      rowCount,
      gridWidth: Math.max(CARD_WIDTH, containerWidth),
      gridHeight: Math.min(window.innerHeight ? Math.floor(window.innerHeight * 0.74) : 760, 920),
    };
  }, [containerWidth, items.length]);

  if (items.length > VIRTUALIZE_THRESHOLD) {
    return (
      <div ref={containerRef} className="w-full">
        <Grid
          className="rounded-2xl"
          columnCount={virtualConfig.columnCount}
          columnWidth={CARD_WIDTH}
          height={virtualConfig.gridHeight}
          overscanRowCount={2}
          rowCount={virtualConfig.rowCount}
          rowHeight={CARD_HEIGHT}
          width={virtualConfig.gridWidth}
        >
          {({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
            const index = rowIndex * virtualConfig.columnCount + columnIndex;
            const item = items[index];
            if (!item) {
              return null;
            }

            return (
              <div style={style} className="p-2">
                <GridItem
                  item={item}
                  index={index}
                  selected={selected.has(item.id)}
                  onToggleSelect={onToggleSelect}
                  onOpenLightbox={onOpenLightbox}
                />
              </div>
            );
          }}
        </Grid>
      </div>
    );
  }

  return (
    <section className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {items.map((item, index) => (
        <GridItem
          key={item.id}
          item={item}
          index={index}
          selected={selected.has(item.id)}
          onToggleSelect={onToggleSelect}
          onOpenLightbox={onOpenLightbox}
        />
      ))}
    </section>
  );
}
