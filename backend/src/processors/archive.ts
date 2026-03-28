import yauzl from "yauzl";
import path from "path";
import { resolveSafe } from "../scanner";
import { BookMetadata, BookProcessor } from "./types";

function openZip(absPath: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) => {
    yauzl.open(absPath, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error("Failed to open zip"));
      resolve(zip);
    });
  });
}

function readEntry(zip: yauzl.ZipFile, entry: yauzl.Entry): Promise<Buffer> {
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

const IMAGE_EXTS = [".jpg", ".jpeg", ".png", ".webp", ".gif"];

export const archiveProcessor: BookProcessor = {
  async getMetadata(relPath: string): Promise<BookMetadata> {
    const ext = path.extname(relPath);
    const name = path.basename(relPath, ext);
    const absPath = resolveSafe(relPath);
    let coverFile: string | undefined;

    if (ext.toLowerCase() === ".cbz") {
       try {
         const zip = await openZip(absPath);
         coverFile = await new Promise<string|undefined>((resolve) => {
           let firstImage: string | undefined;
           zip.on("entry", (entry: yauzl.Entry) => {
             const lowerName = entry.fileName.toLowerCase();
             if (IMAGE_EXTS.some(ex => lowerName.endsWith(ex)) && !firstImage) {
               firstImage = entry.fileName;
             }
             zip.readEntry();
           });
           zip.on("end", () => {
             zip.close();
             resolve(firstImage);
           });
           zip.readEntry();
         });
       } catch { /* ignore */ }
    }

    return {
      title: name,
      author: "Unknown Author",
      language: "",
      coverFile,
    };
  },

  async getCover(relPath: string): Promise<Buffer | null> {
    const ext = path.extname(relPath);
    if (ext.toLowerCase() !== ".cbz") return null; // No native CBR support without rar lib

    const meta = await this.getMetadata(relPath);
    if (!meta.coverFile) return null;

    const absPath = resolveSafe(relPath);
    const zip = await openZip(absPath);

    return new Promise((resolve, reject) => {
      zip.on("entry", async (entry: yauzl.Entry) => {
        if (entry.fileName === meta.coverFile) {
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
      zip.on("end", () => {
        zip.close();
        resolve(null);
      });
      zip.readEntry();
    });
  },
};
