import path from "path";
import fs from "fs";

export const BOOKS_ROOT = process.env.BOOKS_DIR ?? "/books";

export interface BookEntry {
  name: string;
  file: string; // relative path from BOOKS_ROOT
}

export interface FolderEntry {
  name: string;
  path: string; // relative path from BOOKS_ROOT
}

export interface ExploreResult {
  folders: FolderEntry[];
  books: BookEntry[];
}

/**
 * Return the absolute path for a relative path inside BOOKS_ROOT.
 * Throws if the resolved path escapes BOOKS_ROOT (path traversal guard).
 */
export function resolveSafe(rel: string): string {
  const resolved = path.resolve(BOOKS_ROOT, rel.replace(/^\/+/, ""));
  if (!resolved.startsWith(BOOKS_ROOT)) {
    throw new Error("Path traversal detected");
  }
  return resolved;
}

/**
 * Explore a directory and return its immediate children split into
 * sub-folders and epub books.
 */
export function explore(relPath: string): ExploreResult {
  const abs = relPath ? resolveSafe(relPath) : BOOKS_ROOT;

  const entries = fs.readdirSync(abs, { withFileTypes: true });
  const folders: FolderEntry[] = [];
  const books: BookEntry[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;

    const rel = path.join(relPath, entry.name);
    if (entry.isDirectory()) {
      folders.push({ name: entry.name, path: rel });
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith(".epub")) {
      books.push({ name: entry.name, file: rel });
    }
  }

  folders.sort((a, b) => a.name.localeCompare(b.name));
  books.sort((a, b) => a.name.localeCompare(b.name));

  return { folders, books };
}

/**
 * Recursively collect all epub books under a given relative path.
 */
export function walkBooks(relPath: string): BookEntry[] {
  const abs = relPath ? resolveSafe(relPath) : BOOKS_ROOT;
  const results: BookEntry[] = [];

  function walk(dir: string, relDir: string) {
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const rel = path.join(relDir, entry.name);
      const absEntry = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(absEntry, rel);
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".epub")
      ) {
        results.push({ name: entry.name, file: rel });
      }
    }
  }

  walk(abs, relPath);
  return results;
}
