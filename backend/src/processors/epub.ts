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
  const metaCover = xml.match(/<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i);
  if (metaCover) coverId = metaCover[1];

  let coverHref: string | undefined;
  if (coverId) {
    const escapedId = coverId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const manifestItem = xml.match(new RegExp(`<item[^>]*id=["']${escapedId}["'][^>]*href=["']([^"']+)["']`, "i"));
    if (manifestItem) coverHref = manifestItem[1];
  }

  if (!coverHref) {
    const epub3Cover = xml.match(/<item[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*href=["']([^"']+)["']/i);
    if (epub3Cover) coverHref = epub3Cover[1];
  }

  if (!coverHref) {
    const imageItems = [...xml.matchAll(/<item[^>]*media-type=["'](image\/jpeg|image\/png)["'][^>]*href=["']([^"']+)["']/gi)];
    const coverLike = imageItems.find((it) => it[0].toLowerCase().includes("cover") || it[2].toLowerCase().includes("cover"));
    if (coverLike) coverHref = coverLike[2];
    else if (imageItems.length > 0) coverHref = imageItems[0][2];
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
          const decodedCoverHref = parsed.coverHref ? decodeURIComponent(parsed.coverHref) : undefined;
          resolve({
            title: parsed.title,
            author: parsed.author,
            language: parsed.language,
            coverFile: decodedCoverHref ? (finalOpfBase ? `${finalOpfBase}/${decodedCoverHref}` : decodedCoverHref) : undefined,
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

  async getCover(relPath: string): Promise<Buffer | null> {
    const meta = await this.getMetadata(relPath);
    if (!meta.coverFile) return null;

    const coverEntry = meta.coverFile.replace(/\\/g, "/");
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
            resolve(buf);
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
