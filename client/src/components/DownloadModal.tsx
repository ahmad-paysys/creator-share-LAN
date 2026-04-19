interface DownloadModalProps {
  open: boolean;
  imageResizeMb: number;
  includeImages: boolean;
  includeVideos: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onUpdate: (next: { imageResizeMb?: number; includeImages?: boolean; includeVideos?: boolean }) => void;
}

export default function DownloadModal({
  open,
  imageResizeMb,
  includeImages,
  includeVideos,
  onClose,
  onConfirm,
  onUpdate,
}: DownloadModalProps) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-6">
        <h2 className="text-xl font-semibold text-ink">Batch Download</h2>
        <p className="mt-1 text-sm text-ink/70">Choose how selected files should be exported.</p>

        <label className="mt-4 flex items-center justify-between rounded-lg bg-sand px-3 py-2 text-sm">
          Include images
          <input
            type="checkbox"
            checked={includeImages}
            onChange={(event) => onUpdate({ includeImages: event.target.checked })}
          />
        </label>

        <label className="mt-2 flex items-center justify-between rounded-lg bg-sand px-3 py-2 text-sm">
          Include videos
          <input
            type="checkbox"
            checked={includeVideos}
            onChange={(event) => onUpdate({ includeVideos: event.target.checked })}
          />
        </label>

        <label className="mt-4 block text-sm text-ink">
          Image size target: {imageResizeMb} MB
          <input
            className="mt-2 w-full"
            type="range"
            min={1}
            max={5}
            value={imageResizeMb}
            onChange={(event) => onUpdate({ imageResizeMb: Number(event.target.value) })}
          />
        </label>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button className="rounded-lg border border-ink/20 px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-lg bg-ocean px-3 py-2 text-sm text-white" onClick={onConfirm}>
            Download ZIP
          </button>
        </div>
      </div>
    </div>
  );
}
