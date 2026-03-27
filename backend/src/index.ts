import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { staticPlugin } from "@elysiajs/static";
import path from "path";
import fs from "fs";
import { explore, resolveSafe, BOOKS_ROOT } from "./scanner";
import { getMetadata, getCover } from "./epub";
import {
  generateRoot,
  generateFolderFeed,
  generateAlphaFeed,
} from "./opds";

const PORT = Number(process.env.PORT ?? 3000);

// Ensure the books directory exists
if (!fs.existsSync(BOOKS_ROOT)) {
  fs.mkdirSync(BOOKS_ROOT, { recursive: true });
}

// Determine the base URL for OPDS links
function getBaseUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

const app = new Elysia()
  .use(cors())
  // Serve the built frontend from ./public
  .use(
    staticPlugin({
      assets: path.join(import.meta.dir, "..", "public"),
      prefix: "/",
    })
  )

  .get("/opds", ({ request }) => {
    const xml = generateRoot(getBaseUrl(request));
    return new Response(xml, {
      headers: { "Content-Type": "application/atom+xml;charset=utf-8" },
    });
  })

  .get(
    "/opds/folder",
    ({ request, query }) => {
      const relPath = (query.path as string) ?? "";
      const xml = generateFolderFeed(relPath, getBaseUrl(request));
      return new Response(xml, {
        headers: { "Content-Type": "application/atom+xml;charset=utf-8" },
      });
    },
    { query: t.Object({ path: t.Optional(t.String()) }) }
  )

  .get(
    "/opds/alpha",
    ({ request, query }) => {
      const letter = (query.letter as string) ?? undefined;
      const xml = generateAlphaFeed(letter, getBaseUrl(request));
      return new Response(xml, {
        headers: { "Content-Type": "application/atom+xml;charset=utf-8" },
      });
    },
    { query: t.Object({ letter: t.Optional(t.String()) }) }
  )

  /** Explore a directory */
  .get(
    "/api/explore",
    ({ query, set }) => {
      try {
        const relPath = (query.path as string) ?? "";
        return explore(relPath);
      } catch (e) {
        set.status = 400;
        return { error: (e as Error).message };
      }
    },
    { query: t.Object({ path: t.Optional(t.String()) }) }
  )

  /** Serve a book cover image */
  .get(
    "/api/cover",
    async ({ query, set }) => {
      const relFile = query.file as string;
      if (!relFile) {
        set.status = 400;
        return "file parameter required";
      }
      try {
        const buf = await getCover(relFile);
        if (!buf) {
          set.status = 404;
          return "No cover found";
        }
        return new Response(buf, {
          headers: { "Content-Type": "image/jpeg" },
        });
      } catch (e) {
        set.status = 500;
        return (e as Error).message;
      }
    },
    { query: t.Object({ file: t.String() }) }
  )

  /** Serve metadata JSON */
  .get(
    "/api/metadata",
    async ({ query, set }) => {
      const relFile = query.file as string;
      if (!relFile) {
        set.status = 400;
        return { error: "file parameter required" };
      }
      try {
        const meta = await getMetadata(relFile);
        return {
          title: meta.title,
          author: meta.author,
          language: meta.language,
        };
      } catch (e) {
        set.status = 500;
        return { error: (e as Error).message };
      }
    },
    { query: t.Object({ file: t.String() }) }
  )

  /** Download a book */
  .get(
    "/api/download",
    ({ query, set }) => {
      const relFile = query.file as string;
      if (!relFile) {
        set.status = 400;
        return "file parameter required";
      }
      try {
        const absPath = resolveSafe(relFile);
        const buf = fs.readFileSync(absPath);
        const filename = path.basename(absPath);
        return new Response(buf, {
          headers: {
            "Content-Type": "application/epub+zip",
            "Content-Disposition": `attachment; filename="${filename}"`,
          },
        });
      } catch (e) {
        set.status = 500;
        return (e as Error).message;
      }
    },
    { query: t.Object({ file: t.String() }) }
  )

  /** Delete a book file */
  .delete(
    "/api/book",
    ({ query, set }) => {
      const relFile = query.file as string;
      if (!relFile) {
        set.status = 400;
        return { error: "file parameter required" };
      }
      try {
        const absPath = resolveSafe(relFile);
        fs.unlinkSync(absPath);
        return { ok: true };
      } catch (e) {
        set.status = 500;
        return { error: (e as Error).message };
      }
    },
    { query: t.Object({ file: t.String() }) }
  )

  /** Delete a folder */
  .delete(
    "/api/folder",
    ({ query, set }) => {
      const relPath = query.path as string;
      if (!relPath) {
        set.status = 400;
        return { error: "path parameter required" };
      }
      try {
        const absPath = resolveSafe(relPath);
        fs.rmSync(absPath, { recursive: true, force: true });
        return { ok: true };
      } catch (e) {
        set.status = 500;
        return { error: (e as Error).message };
      }
    },
    { query: t.Object({ path: t.String() }) }
  )

  /** Create a folder */
  .post(
    "/api/folder",
    ({ query, body, set }) => {
      const relPath = (query.path as string) ?? "";
      const name = ((body as { name: string }).name ?? "").trim();
      if (!name) {
        set.status = 400;
        return { error: "Folder name is required" };
      }
      if (/[\/\\]/.test(name)) {
        set.status = 400;
        return { error: "Folder name must not contain path separators" };
      }
      try {
        const parentDir = relPath ? resolveSafe(relPath) : BOOKS_ROOT;
        const newDir = path.join(parentDir, name);
        if (fs.existsSync(newDir)) {
          set.status = 409;
          return { error: "A folder with this name already exists" };
        }
        fs.mkdirSync(newDir, { recursive: true });
        return { ok: true, path: path.join(relPath, name) };
      } catch (e) {
        set.status = 500;
        return { error: (e as Error).message };
      }
    },
    {
      query: t.Object({ path: t.Optional(t.String()) }),
      body: t.Object({ name: t.String() }),
    }
  )

  /** Upload a book */
  .post(
    "/api/upload",
    async ({ query, body, set }) => {
      const relPath = (query.path as string) ?? "";
      try {
        const destDir = relPath ? resolveSafe(relPath) : BOOKS_ROOT;
        const file = (body as { file: File }).file;
        if (!file) {
          set.status = 400;
          return { error: "No file provided" };
        }
        const filename = file.name;
        if (!filename.toLowerCase().endsWith(".epub")) {
          set.status = 400;
          return { error: "Only .epub files are accepted" };
        }
        const destPath = path.join(destDir, filename);
        const buf = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(destPath, buf);
        return { ok: true, file: path.join(relPath, filename) };
      } catch (e) {
        set.status = 500;
        return { error: (e as Error).message };
      }
    },
    {
      query: t.Object({ path: t.Optional(t.String()) }),
      body: t.Object({ file: t.File() }),
    }
  )

  .listen(PORT);

console.log(`OPDS Library running on http://localhost:${PORT}`);
