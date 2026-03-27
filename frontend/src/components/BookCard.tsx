import { useState, useRef, useEffect } from "react";
import { Download, MoreVertical, Info, Trash2 } from "lucide-react";

interface Metadata {
  title: string;
  author: string;
  language: string;
}

interface BookCardProps {
  name: string;
  file: string;
  onDelete: (file: string) => void;
}

export default function BookCard({ name, file, onDelete }: BookCardProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [showMeta, setShowMeta] = useState(false);
  const [meta, setMeta] = useState<Metadata | null>(null);
  const [coverError, setCoverError] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const title = name.replace(/\.epub$/i, "");
  const coverUrl = `/api/cover?file=${encodeURIComponent(file)}`;
  const downloadUrl = `/api/download?file=${encodeURIComponent(file)}`;

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  async function viewMetadata() {
    setMenuOpen(false);
    if (!meta) {
      try {
        const res = await fetch(`/api/metadata?file=${encodeURIComponent(file)}`);
        const data = await res.json();
        setMeta(data);
      } catch {
        setMeta({ title, author: "Unknown", language: "" });
      }
    }
    setShowMeta(true);
  }

  async function handleDelete() {
    setMenuOpen(false);
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    await fetch(`/api/book?file=${encodeURIComponent(file)}`, {
      method: "DELETE",
    });
    onDelete(file);
  }

  return (
    <>
      <div className="group relative flex flex-col rounded-xl overflow-hidden shadow-md bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:shadow-lg transition-shadow">
        {/* Cover */}
        <div className="relative bg-gray-100 dark:bg-gray-700 aspect-[2/3] overflow-hidden">
          {!coverError ? (
            <img
              src={coverUrl}
              alt={title}
              className="w-full h-full object-cover"
              onError={() => setCoverError(true)}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-gray-400 dark:text-gray-500 text-sm px-2 text-center">
              No Cover
            </div>
          )}
        </div>

        {/* Info */}
        <div className="p-3 flex flex-col gap-2 flex-1">
          <p
            className="text-sm font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 leading-snug"
            title={title}
          >
            {title}
          </p>

          <div className="flex items-center gap-2 mt-auto">
            {/* Download button */}
            <a
              href={downloadUrl}
              download
              className="flex-1 flex items-center justify-center gap-1 text-xs font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg py-1.5 transition-colors"
            >
              <Download size={13} />
              Download
            </a>

            {/* 3-dot menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen((v) => !v)}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-500 dark:text-gray-400"
                aria-label="More options"
              >
                <MoreVertical size={15} />
              </button>

              {menuOpen && (
                <div className="absolute right-0 bottom-full mb-1 w-40 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-lg z-20 overflow-hidden">
                  <button
                    onClick={viewMetadata}
                    className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
                  >
                    <Info size={14} />
                    View Metadata
                  </button>
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
        </div>
      </div>

      {/* Metadata Modal */}
      {showMeta && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowMeta(false)}
        >
          <div
            className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl p-6 max-w-sm w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
              Book Metadata
            </h2>
            {meta ? (
              <dl className="space-y-2 text-sm">
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Title</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {meta.title}
                  </dd>
                </div>
                <div>
                  <dt className="text-gray-500 dark:text-gray-400">Author</dt>
                  <dd className="font-medium text-gray-900 dark:text-gray-100">
                    {meta.author}
                  </dd>
                </div>
                {meta.language && (
                  <div>
                    <dt className="text-gray-500 dark:text-gray-400">
                      Language
                    </dt>
                    <dd className="font-medium text-gray-900 dark:text-gray-100">
                      {meta.language}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-gray-500 dark:text-gray-400">Loading…</p>
            )}
            <button
              onClick={() => setShowMeta(false)}
              className="mt-5 w-full py-2 rounded-xl bg-gray-100 dark:bg-gray-700 text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
}
