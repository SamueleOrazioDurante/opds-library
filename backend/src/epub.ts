import yauzl from "yauzl";
import { resolveSafe } from "./scanner";

export interface EpubMetadata {
  title: string;
  author: string;
  language: string;
  coverFile?: string; // entry name inside the zip
}

interface ParsedOpf {
  title: string;
  author: string;
  language: string;
  coverId?: string;
  coverHref?: string;
}

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

/** 
 * Improved XML text-node extractor.
 * Handles namespaces and attributes.
 */
function xmlText(xml: string, tag: string): string {
  // Look for <tag>, <ns:tag>, <tag attr="val">, etc.
  // This regex matches the opening tag, then captures everything until the closing tag.
  const regex = new RegExp(`<([^:> ]+?:)?${tag}[^>]*>([^<]*)</([^:> ]+?:)?${tag}>`, "i");
  const m = xml.match(regex);
  return m ? m[2].trim() : "";
}

function parseOpf(xml: string): ParsedOpf {
  const title = xmlText(xml, "title") || "Unknown Title";
  const author = xmlText(xml, "creator") || "Unknown Author";
  const language = xmlText(xml, "language") || "";

  // Try to find cover image href
  // 1. Check for <meta name="cover" content="id"/>
  let coverId: string | undefined;
  const metaCover = xml.match(
    /<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i
  );
  if (metaCover) coverId = metaCover[1];

  let coverHref: string | undefined;
  if (coverId) {
    // Escape coverId for regex
    const escapedId = coverId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const manifestItem = xml.match(
      new RegExp(
        `<item[^>]*id=["']${escapedId}["'][^>]*href=["']([^"']+)["']`,
        "i"
      )
    );
    if (manifestItem) coverHref = manifestItem[1];
  }

  // 2. Check for <item properties="cover-image" ... /> (EPUB 3)
  if (!coverHref) {
    const epub3Cover = xml.match(
      /<item[^>]*properties=["'][^"']*cover-image[^"']*["'][^>]*href=["']([^"']+)["']/i
    );
    if (epub3Cover) coverHref = epub3Cover[1];
  }

  // 3. Fallback: first image/jpeg or image/png in manifest that looks like a cover
  if (!coverHref) {
    const imageItems = [
      ...xml.matchAll(
        /<item[^>]*media-type=["'](image\/jpeg|image\/png)["'][^>]*href=["']([^"']+)["']/gi
      ),
    ];
    // Prioritize items with "cover" in their ID or href
    const coverLike = imageItems.find(it => 
      it[0].toLowerCase().includes("cover") || it[2].toLowerCase().includes("cover")
    );
    if (coverLike) {
      coverHref = coverLike[2];
    } else if (imageItems.length > 0) {
      coverHref = imageItems[0][2];
    }
  }

  return { title, author, language, coverId, coverHref };
}

/** Extract epub metadata by streaming through the zip */
export async function getMetadata(relFile: string): Promise<EpubMetadata> {
  const absPath = resolveSafe(relFile);
  const zip = await openZip(absPath);

  return new Promise((resolve, reject) => {
    let opfPath = "";
    let opfBase = "";
    const opfFiles = new Map<string, string>(); // filename -> content

    zip.on("error", (err) => {
      zip.close();
      reject(err);
    });

    zip.on("end", () => {
      let finalOpfContent = "";
      let finalOpfBase = "";

      if (opfPath && opfFiles.has(opfPath)) {
        finalOpfContent = opfFiles.get(opfPath)!;
        finalOpfBase = opfPath.includes("/")
          ? opfPath.substring(0, opfPath.lastIndexOf("/"))
          : "";
      } else if (opfFiles.size > 0) {
        // Fallback to the first OPF found if container.xml was missing or path was wrong
        const first = Array.from(opfFiles.entries())[0];
        finalOpfContent = first[1];
        const path = first[0];
        finalOpfBase = path.includes("/")
          ? path.substring(0, path.lastIndexOf("/"))
          : "";
      }

      if (!finalOpfContent) {
        resolve({ title: "Unknown", author: "Unknown", language: "" });
      } else {
        const parsed = parseOpf(finalOpfContent);
        // Decode the cover filename in case it contains spaces/special chars encoded as %20 etc.
        const decodedCoverHref = parsed.coverHref ? decodeURIComponent(parsed.coverHref) : undefined;
        
        resolve({
          title: parsed.title,
          author: parsed.author,
          language: parsed.language,
          coverFile: decodedCoverHref
            ? finalOpfBase
              ? `${finalOpfBase}/${decodedCoverHref}`
              : decodedCoverHref
            : undefined,
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
        } catch { /* ignore */ }
        zip.readEntry();
      } else if (name.toLowerCase().endsWith(".opf")) {
        try {
          const buf = await readEntry(zip, entry);
          opfFiles.set(name, buf.toString("utf-8"));
        } catch { /* ignore */ }
        zip.readEntry();
      } else {
        zip.readEntry();
      }
    });
  });
}

/** Extract cover image bytes from an epub file */
export async function getCover(relFile: string): Promise<Buffer | null> {
  const meta = await getMetadata(relFile);
  if (!meta.coverFile) return null;

  const coverEntry = meta.coverFile.replace(/\\/g, "/");

  const absPath = resolveSafe(relFile);
  const zip2 = await openZip(absPath);

  return new Promise((resolve, reject) => {
    zip2.on("error", (err) => {
      zip2.close();
      reject(err);
    });

    zip2.on("end", () => {
      resolve(null);
      zip2.close();
    });

    zip2.readEntry();
    zip2.on("entry", async (entry: yauzl.Entry) => {
      if (entry.fileName === coverEntry || entry.fileName === coverEntry.replace(/^\//, "")) {
        try {
          const buf = await readEntry(zip2, entry);
          zip2.close();
          resolve(buf);
        } catch (e) {
          zip2.close();
          reject(e);
        }
        return;
      }
      zip2.readEntry();
    });
  });
}
