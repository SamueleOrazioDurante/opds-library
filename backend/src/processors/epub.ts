import yauzl from "yauzl";
import path from "path";
import { resolveSafe } from "../scanner";
import { BookMetadata, BookProcessor } from "./types";

/** Open a zip file promisified */
function openZip(absPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(absPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Failed to open zip"));
      resolve(zip);
    });
  });
}

/** Read the full contents of a zip entry as a Buffer */
function readEntry(
  zip: yauzl.ZipFile,
  entry: yauzl.Entry
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    zip.openReadStream(entry, (err, stream) => {
      if (err || !stream) return reject(err ?? new Error("No stream"));
      const chunks: Buffer[] = [];
      stream.on("data", (c: Buffer) => chunks.push(c));
      stream.on("end", () => resolve(Buffer.concat(chunks)));
      stream.on("error", reject);
    });
  });
}

function xmlText(xml: string, tag: string): string {
  const regex = new RegExp(`<([^:> ]+?:)?${tag}[^>]*>([^<]*?)</([^:> ]+?:)?${tag}>`, "i");
  const m = xml.match(regex);
  return m ? m[2].trim() : "";
}

function parseOpf(xml: string) {
  const title = xmlText(xml, "title") || "Unknown Title";
  const author = xmlText(xml, "creator") || "Unknown Author";
  const language = xmlText(xml, "language") || "";

  let coverId: string | undefined;
  const metaMatches = xml.matchAll(/<meta\s+([^>]+)>/gi);
  for (const m of metaMatches) {
    const attrs = m[1];
    const nameMatch = attrs.match(/name=["']([^"']+)["']/i);
    const contentMatch = attrs.match(/content=["']([^"']+)["']/i);
    if (nameMatch && nameMatch[1].toLowerCase() === "cover" && contentMatch) {
      coverId = contentMatch[1];
      break;
    }
  }

  const items: { id: string; href: string; mediaType: string; properties: string }[] = [];
  const itemMatches = xml.matchAll(/<item\s+([^>]+)>/gi);
  for (const m of itemMatches) {
    const attrs = m[1];
    const idMatch = attrs.match(/id=["']([^"']+)["']/i);
    const hrefMatch = attrs.match(/href=["']([^"']+)["']/i);
    const mediaMatch = attrs.match(/media-type=["']([^"']+)["']/i);
    const propMatch = attrs.match(/properties=["']([^"']+)["']/i);
    if (idMatch && hrefMatch) {
      items.push({
        id: idMatch[1],
        href: hrefMatch[1],
        mediaType: mediaMatch ? mediaMatch[1] : "",
        properties: propMatch ? propMatch[1] : ""
      });
    }
  }

  let coverHref: string | undefined;

  if (coverId) {
    const exactMatch = items.find((it) => it.id === coverId);
    if (exactMatch) coverHref = exactMatch.href;
  }

  if (!coverHref) {
    const epub3Match = items.find((it) => it.properties.includes("cover-image"));
    if (epub3Match) coverHref = epub3Match.href;
  }

  if (!coverHref) {
    const imageItems = items.filter((it) => it.mediaType.includes("image/"));
    const coverLike = imageItems.find((it) => it.id.toLowerCase().includes("cover") || it.href.toLowerCase().includes("cover"));
    if (coverLike) coverHref = coverLike.href;
    else if (imageItems.length > 0) coverHref = imageItems[0].href;
  }

  return { title, author, language, coverHref };
}

export const epubProcessor: BookProcessor = {
  async getMetadata(relPath: string): Promise<BookMetadata> {
    const absPath = resolveSafe(relPath);
    const zip = await openZip(absPath);

    return new Promise((resolve, reject) => {
      let opfPath = "";
      const opfFiles = new Map<string, string>();

      zip.on("error", (err) => {
        zip.close();
        reject(err);
      });

      zip.on("end", () => {
        let finalOpfContent = "";
        let finalOpfBase = "";

        if (opfPath && opfFiles.has(opfPath)) {
          finalOpfContent = opfFiles.get(opfPath)!;
          finalOpfBase = opfPath.includes("/") ? opfPath.substring(0, opfPath.lastIndexOf("/")) : "";
        } else if (opfFiles.size > 0) {
          const first = Array.from(opfFiles.entries())[0];
          finalOpfContent = first[1];
          const p = first[0];
          finalOpfBase = p.includes("/") ? p.substring(0, p.lastIndexOf("/")) : "";
        }

        if (!finalOpfContent) {
          resolve({ title: path.basename(relPath, ".epub"), author: "Unknown", language: "" });
        } else {
          const parsed = parseOpf(finalOpfContent);
          
          let rawHref = parsed.coverHref ? parsed.coverHref.split(/[#?]/)[0] : "";
          let decodedCoverHref = rawHref ? decodeURIComponent(rawHref) : undefined;
          
          let coverFile: string | undefined;
          if (decodedCoverHref) {
            if (finalOpfBase) {
               coverFile = path.posix.join(finalOpfBase, decodedCoverHref);
            } else {
               coverFile = path.posix.normalize(decodedCoverHref);
            }
          }

          resolve({
            title: parsed.title,
            author: parsed.author,
            language: parsed.language,
            coverFile,
          });
        }
        zip.close();
      });

      zip.readEntry();
      zip.on("entry", async (entry: yauzl.Entry) => {
        const name = entry.fileName;
        if (name === "META-INF/container.xml") {
          try {
            const buf = await readEntry(zip, entry);
            const xml = buf.toString("utf-8");
            const m = xml.match(/full-path=["']([^"']+\.opf)["']/i);
            if (m) opfPath = m[1];
          } catch {}
          zip.readEntry();
        } else if (name.toLowerCase().endsWith(".opf")) {
          try {
            const buf = await readEntry(zip, entry);
            opfFiles.set(name, buf.toString("utf-8"));
          } catch {}
          zip.readEntry();
        } else {
          zip.readEntry();
        }
      });
    });
  },

  async getCover(relPath: string): Promise<{ buf: Buffer; mime: string } | null> {
    const meta = await this.getMetadata(relPath);
    if (!meta.coverFile) return null;

    const coverEntry = meta.coverFile;
    const absPath = resolveSafe(relPath);
    const zip = await openZip(absPath);

    return new Promise((resolve, reject) => {
      zip.on("error", (err) => {
        zip.close();
        reject(err);
      });
      zip.on("end", () => {
        resolve(null);
        zip.close();
      });
      zip.readEntry();
      zip.on("entry", async (entry: yauzl.Entry) => {
        if (entry.fileName === coverEntry || entry.fileName === coverEntry.replace(/^\//, "")) {
          try {
            const buf = await readEntry(zip, entry);
            zip.close();
            
            const ext = path.extname(entry.fileName).toLowerCase();
            let mime = "image/jpeg";
            if (ext === ".png") mime = "image/png";
            else if (ext === ".svg") mime = "image/svg+xml";
            else if (ext === ".gif") mime = "image/gif";
            else if (ext === ".webp") mime = "image/webp";
            
            resolve({ buf, mime });
          } catch (e) {
            zip.close();
            reject(e);
          }
          return;
        }
        zip.readEntry();
      });
    });
  },
};
