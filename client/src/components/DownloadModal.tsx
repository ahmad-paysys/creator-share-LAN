import { createPortal } from "react-dom";

interface DownloadModalProps {
  open: boolean;
  imageResizeMb: number;
  includeImages: boolean;
  includeVideos: boolean;
  mode: "zip" | "separate";
  onClose: () => void;
  onConfirm: () => void;
  onUpdate: (next: { imageResizeMb?: number; includeImages?: boolean; includeVideos?: boolean }) => void;
  onModeChange: (mode: "zip" | "separate") => void;
}

export default function DownloadModal({
  open,
  imageResizeMb,
  includeImages,
  includeVideos,
  mode,
  onClose,
  onConfirm,
  onUpdate,
  onModeChange,
}: DownloadModalProps) {
  if (!open) {
    return null;
  }

  return createPortal(
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/60 p-4">
      <div className="max-h-[92vh] w-full max-w-md overflow-auto rounded-2xl bg-white p-6">
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

        <div className="mt-4 rounded-lg bg-sand px-3 py-3 text-sm text-ink">
          <p className="mb-2 font-medium">Download mode</p>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="download-mode"
              checked={mode === "zip"}
              onChange={() => onModeChange("zip")}
            />
            Download as one ZIP file
          </label>
          <label className="mt-2 flex items-center gap-2">
            <input
              type="radio"
              name="download-mode"
              checked={mode === "separate"}
              onChange={() => onModeChange("separate")}
            />
            Download as separate files
          </label>
          <p className="mt-2 text-xs text-ink/70">
            Separate-files mode may prompt your browser to allow multiple downloads.
          </p>
        </div>

        <div className="mt-6 flex items-center justify-end gap-2">
          <button className="rounded-lg border border-ink/20 px-3 py-2 text-sm" onClick={onClose}>
            Cancel
          </button>
          <button className="rounded-lg bg-ocean px-3 py-2 text-sm text-white" onClick={onConfirm}>
            {mode === "zip" ? "Download ZIP" : "Download Separate Files"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
