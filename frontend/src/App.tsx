import { useState, useEffect, useCallback } from "react";
import { Moon, Sun, Link, Upload, BookOpen, FolderPlus } from "lucide-react";
import Breadcrumb from "./components/Breadcrumb";
import BookCard from "./components/BookCard";
import FolderCard from "./components/FolderCard";
import NewFolderModal from "./components/NewFolderModal";

interface BookEntry {
  name: string;
  file: string;
}

interface FolderEntry {
  name: string;
  path: string;
}

interface ExploreResult {
  folders: FolderEntry[];
  books: BookEntry[];
}

function useDarkMode() {
  const [dark, setDark] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    return (
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches)
    );
  });

  useEffect(() => {
    const root = document.documentElement;
    if (dark) {
      root.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      root.classList.remove("dark");
      localStorage.setItem("theme", "light");
    }
  }, [dark]);

  return [dark, setDark] as const;
}

function buildSegments(currentPath: string) {
  if (!currentPath) return [];
  const parts = currentPath.split("/").filter(Boolean);
  return parts.map((name, i) => ({
    name,
    path: parts.slice(0, i + 1).join("/"),
  }));
}

export default function App() {
  const [dark, setDark] = useDarkMode();
  const [currentPath, setCurrentPath] = useState<string>("");
  const [data, setData] = useState<ExploreResult>({ folders: [], books: [] });
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);

  const fetchData = useCallback(async (path: string) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/explore?path=${encodeURIComponent(path)}`
      );
      if (!res.ok) throw new Error("Failed to fetch");
      const json = await res.json();
      setData(json);
    } catch {
      setData({ folders: [], books: [] });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(currentPath);
  }, [currentPath, fetchData]);

  function navigate(path: string) {
    setCurrentPath(path);
  }

  function copyOpdsLink() {
    navigator.clipboard.writeText(window.location.origin + "/opds").then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleBookDeleted(file: string) {
    setData((prev) => ({
      ...prev,
      books: prev.books.filter((b) => b.file !== file),
    }));
  }

  function handleFolderDeleted(path: string) {
    setData((prev) => ({
      ...prev,
      folders: prev.folders.filter((f) => f.path !== path),
    }));
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const form = new FormData();
    form.append("file", file);
    try {
      await fetch(
        `/api/upload?path=${encodeURIComponent(currentPath)}`,
        { method: "POST", body: form }
      );
      fetchData(currentPath);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  }

  const segments = buildSegments(currentPath);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center gap-3">
          {/* Logo */}
          <BookOpen
            size={22}
            className="text-indigo-600 dark:text-indigo-400 flex-shrink-0"
          />
          <span className="text-lg font-bold text-gray-900 dark:text-gray-100 mr-auto">
            OPDS Library
          </span>

          {/* Copy OPDS link */}
          <button
            onClick={copyOpdsLink}
            title="Copy OPDS URL"
            className="relative flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
          >
            <Link size={13} />
            {copied ? "Copied!" : "OPDS Link"}
          </button>

          {/* Dark mode toggle */}
          <button
            onClick={() => setDark((d) => !d)}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
            title={dark ? "Switch to light mode" : "Switch to dark mode"}
          >
            {dark ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Breadcrumb */}
        <Breadcrumb segments={segments} onNavigate={navigate} />

        {/* Action bar */}
        <div className="flex items-center justify-between mb-5">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {loading
              ? "Loading…"
              : `${data.folders.length} folder${data.folders.length !== 1 ? "s" : ""}, ${data.books.length} book${data.books.length !== 1 ? "s" : ""}`}
          </p>

          <div className="flex items-center gap-2">
            {/* New Folder button */}
            <button
              onClick={() => setShowNewFolder(true)}
              className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-700 dark:text-gray-200"
            >
              <FolderPlus size={13} />
              New Folder
            </button>

            {/* Upload button */}
            <label className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer transition-colors">
              <Upload size={13} />
              {uploading ? "Uploading…" : "Upload ePub"}
              <input
                type="file"
                accept=".epub"
                className="hidden"
                onChange={handleUpload}
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3 animate-pulse">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-64 rounded-xl bg-gray-200 dark:bg-gray-700"
              />
            ))}
          </div>
        ) : (
          <>
            {/* Folders */}
            {data.folders.length > 0 && (
              <section className="mb-6">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  Folders
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
                  {data.folders.map((folder) => (
                    <FolderCard
                      key={folder.path}
                      name={folder.name}
                      path={folder.path}
                      onOpen={navigate}
                      onDelete={handleFolderDeleted}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Books */}
            {data.books.length > 0 && (
              <section>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-2">
                  Books
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                  {data.books.map((book) => (
                    <BookCard
                      key={book.file}
                      name={book.name}
                      file={book.file}
                      onDelete={handleBookDeleted}
                    />
                  ))}
                </div>
              </section>
            )}

            {/* Empty state */}
            {data.folders.length === 0 && data.books.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-gray-400 dark:text-gray-500">
                <BookOpen size={48} className="mb-3 opacity-40" />
                <p className="text-sm">No books or folders found here.</p>
                <p className="text-xs mt-1">
                  Upload an ePub or add files to your /books directory.
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {/* New Folder Modal */}
      {showNewFolder && (
        <NewFolderModal
          currentPath={currentPath}
          onCreated={() => {
            setShowNewFolder(false);
            fetchData(currentPath);
          }}
          onClose={() => setShowNewFolder(false)}
        />
      )}
    </div>
  );
}
