import { useState, useRef, useEffect } from "react";
import { Folder, MoreVertical, Trash2 } from "lucide-react";

interface FolderCardProps {
  name: string;
  path: string;
  onOpen: (path: string) => void;
  onDelete: (path: string) => void;
}

export default function FolderCard({
  name,
  path,
  onOpen,
  onDelete,
}: FolderCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    setMenuOpen(false);
    if (
      !confirm(
        `Delete folder "${name}" and ALL its contents? This cannot be undone.`
      )
    )
      return;
    await fetch(`/api/folder?path=${encodeURIComponent(path)}`, {
      method: "DELETE",
    });
    onDelete(path);
  }

  return (
    <div
      className="group relative flex items-center gap-3 px-4 py-3 rounded-xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-indigo-400 dark:hover:border-indigo-500 hover:shadow-md transition-all cursor-pointer select-none"
      onClick={() => onOpen(path)}
    >
      <Folder
        size={28}
        className="text-indigo-500 dark:text-indigo-400 flex-shrink-0"
        fill="currentColor"
        fillOpacity={0.15}
      />
      <span
        className="flex-1 text-sm font-medium text-gray-800 dark:text-gray-200 truncate"
        title={name}
      >
        {name}
      </span>

      {/* 3-dot menu */}
      <div
        className="relative"
        ref={menuRef}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen((v) => !v);
          }}
          className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 transition-all text-gray-500 dark:text-gray-400"
          aria-label="More options"
        >
          <MoreVertical size={15} />
        </button>

        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 w-36 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
            <button
              onClick={handleDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors text-red-600 dark:text-red-400"
            >
              <Trash2 size={14} />
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
