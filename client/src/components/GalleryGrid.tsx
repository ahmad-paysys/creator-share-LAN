import { memo } from "react";
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
    <article className="group relative overflow-hidden rounded-2xl bg-ink/80 shadow-glow">
      <button className="block w-full" onClick={() => onOpenLightbox(index)}>
        <img
          src={absoluteUrl(item.thumbnailUrl)}
          alt={item.name}
          className="h-48 w-full object-cover"
          loading="lazy"
        />
        {item.type === "video" && (
          <span className="absolute left-3 top-3 rounded-full bg-black/50 px-2 py-1 text-xs text-white">
            Video
          </span>
        )}
      </button>
      <label className="absolute right-3 top-3 flex cursor-pointer items-center gap-2 rounded-full bg-black/55 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
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
  if (items.length > 500) {
    const columnCount = 4;
    const rowCount = Math.ceil(items.length / columnCount);
    return (
      <Grid
        className="rounded-2xl"
        columnCount={columnCount}
        columnWidth={250}
        height={700}
        rowCount={rowCount}
        rowHeight={280}
        width={1020}
      >
        {({ columnIndex, rowIndex, style }: GridChildComponentProps) => {
          const index = rowIndex * columnCount + columnIndex;
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
