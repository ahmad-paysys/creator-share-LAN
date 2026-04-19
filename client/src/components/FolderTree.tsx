import type { FolderNode } from "../types";

interface FolderTreeProps {
  root: FolderNode | null;
  activeFolderId: string;
  onSelect: (folderId: string, path: string) => void;
}

function FolderNodeButton({
  node,
  activeFolderId,
  onSelect,
}: {
  node: FolderNode;
  activeFolderId: string;
  onSelect: (folderId: string, path: string) => void;
}) {
  return (
    <li className="space-y-2">
      <button
        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
          node.id === activeFolderId
            ? "bg-mint/30 text-sand"
            : "bg-white/10 text-white/90 hover:bg-white/20"
        }`}
        onClick={() => onSelect(node.id, node.path)}
      >
        <div className="flex items-center justify-between gap-2">
          <span>{node.name}</span>
          <span className="text-xs text-white/70">{node.itemCount}</span>
        </div>
      </button>
      {node.children.length > 0 && (
        <ul className="ml-4 space-y-2 border-l border-white/20 pl-3">
          {node.children.map((child) => (
            <FolderNodeButton
              key={child.id}
              node={child}
              activeFolderId={activeFolderId}
              onSelect={onSelect}
            />
          ))}
        </ul>
      )}
    </li>
  );
}

export default function FolderTree({ root, activeFolderId, onSelect }: FolderTreeProps) {
  if (!root) {
    return <div className="text-sm text-white/70">Loading folders...</div>;
  }

  return (
    <div className="space-y-3">
      <button
        className={`w-full rounded-xl px-3 py-2 text-left text-sm transition ${
          activeFolderId === "root"
            ? "bg-coral text-white"
            : "bg-white/10 text-white/90 hover:bg-white/20"
        }`}
        onClick={() => onSelect("root", "")}
      >
        All Media ({root.itemCount})
      </button>
      <ul className="space-y-2">
        {root.children.map((child) => (
          <FolderNodeButton
            key={child.id}
            node={child}
            activeFolderId={activeFolderId}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </div>
  );
}
