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

/** Minimal XML text-node extractor (no heavy XML parser dependency) */
function xmlText(xml: string, tag: string): string {
  const m = xml.match(new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`, "i"));
  return m ? m[1].trim() : "";
}

function parseOpf(xml: string): ParsedOpf {
  const title = xmlText(xml, "dc:title") || "Unknown Title";
  const author = xmlText(xml, "dc:creator") || "Unknown Author";
  const language = xmlText(xml, "dc:language") || "";

  // Try to find cover image href
  // <meta name="cover" content="cover-image"/> or similar
  let coverId: string | undefined;
  const metaCover = xml.match(
    /<meta[^>]*name=["']cover["'][^>]*content=["']([^"']+)["']/i
  );
  if (metaCover) coverId = metaCover[1];

  // Find the actual file path in manifest
  let coverHref: string | undefined;
  if (coverId) {
    const manifestItem = xml.match(
      new RegExp(
        `<item[^>]*id=["']${coverId}["'][^>]*href=["']([^"']+)["']`,
        "i"
      )
    );
    if (manifestItem) coverHref = manifestItem[1];
  }

  // Fallback: first image/jpeg or image/png in manifest
  if (!coverHref) {
    const imageItems = [
      ...xml.matchAll(
        /<item[^>]*media-type=["'](image\/jpeg|image\/png)["'][^>]*href=["']([^"']+)["']/gi
      ),
    ];
    if (imageItems.length > 0) {
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
    let containerXml = "";
    let opfPath = "";
    let opfBase = "";
    let parsed: ParsedOpf | null = null;

    zip.on("error", reject);
    zip.on("end", () => {
      if (!parsed) {
        resolve({ title: "Unknown", author: "Unknown", language: "" });
      } else {
        resolve({
          title: parsed.title,
          author: parsed.author,
          language: parsed.language,
          coverFile: parsed.coverHref
            ? opfBase
              ? `${opfBase}/${parsed.coverHref}`
              : parsed.coverHref
            : undefined,
        });
      }
      zip.close();
    });

    zip.readEntry();
    zip.on("entry", async (entry: yauzl.Entry) => {
      const name: string = entry.fileName;

      // Step 1: read META-INF/container.xml to find content.opf path
      if (name === "META-INF/container.xml") {
        try {
          const buf = await readEntry(zip, entry);
          containerXml = buf.toString("utf-8");
          const m = containerXml.match(/full-path=["']([^"']+\.opf)["']/i);
          if (m) {
            opfPath = m[1];
            opfBase = opfPath.includes("/")
              ? opfPath.substring(0, opfPath.lastIndexOf("/"))
              : "";
          }
        } catch {
          // ignore
        }
        zip.readEntry();
        return;
      }

      // Step 2: read the .opf file
      if (opfPath && name === opfPath) {
        try {
          const buf = await readEntry(zip, entry);
          parsed = parseOpf(buf.toString("utf-8"));
        } catch {
          // ignore
        }
        zip.readEntry();
        return;
      }

      // Skip irrelevant entries quickly
      zip.readEntry();
    });
  });
}

/** Extract cover image bytes from an epub file */
export async function getCover(relFile: string): Promise<Buffer | null> {
  // First pass: get metadata to learn the cover file path
  const meta = await getMetadata(relFile);
  if (!meta.coverFile) return null;

  const coverEntry = meta.coverFile;

  const absPath = resolveSafe(relFile);
  const zip2 = await openZip(absPath);

  return new Promise((resolve, reject) => {
    zip2.on("error", reject);
    zip2.on("end", () => {
      resolve(null);
      zip2.close();
    });

    zip2.readEntry();
    zip2.on("entry", async (entry: yauzl.Entry) => {
      if (entry.fileName === coverEntry) {
        try {
          const buf = await readEntry(zip2, entry);
          zip2.close();
          resolve(buf);
        } catch (e) {
          reject(e);
        }
        return;
      }
      zip2.readEntry();
    });
  });
}
