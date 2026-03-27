import { explore, walkBooks, BOOKS_ROOT } from "./scanner";
import type { BookEntry, FolderEntry } from "./scanner";
import path from "path";

const NS = {
  atom: "http://www.w3.org/2005/Atom",
  opds: "http://opds-spec.org/2010/catalog",
  dc: "http://purl.org/dc/terms/",
};
const APP_NAME = "OPDS Library";

function xmlEscape(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function atomEntry(
  id: string,
  title: string,
  updated: string,
  links: string[],
  extra = ""
): string {
  return `  <entry>
    <id>${xmlEscape(id)}</id>
    <title>${xmlEscape(title)}</title>
    <updated>${updated}</updated>
    ${links.join("\n    ")}
    ${extra}
  </entry>`;
}

function feedHeader(
  id: string,
  title: string,
  updated: string,
  selfHref: string,
  startHref: string
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="${NS.atom}"
      xmlns:opds="${NS.opds}"
      xmlns:dc="${NS.dc}">
  <id>${xmlEscape(id)}</id>
  <title>${xmlEscape(title)}</title>
  <updated>${updated}</updated>
  <author>
    <name>${xmlEscape(APP_NAME)}</name>
  </author>
  <link rel="self" href="${xmlEscape(selfHref)}" type="application/atom+xml;profile=opds-catalog"/>
  <link rel="start" href="${xmlEscape(startHref)}" type="application/atom+xml;profile=opds-catalog"/>
`;
}

/** Root OPDS feed: two top-level catalogs */
export function generateRoot(baseUrl: string): string {
  const now = new Date().toISOString();
  let xml = feedHeader(
    `${baseUrl}/opds`,
    APP_NAME,
    now,
    `${baseUrl}/opds`,
    `${baseUrl}/opds`
  );

  xml += atomEntry(
    `${baseUrl}/opds/folder`,
    "Browse by Folder",
    now,
    [
      `<link rel="subsection" href="${xmlEscape(`${baseUrl}/opds/folder`)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>`,
    ],
    '<content type="text">Browse your library by folder structure</content>'
  );

  xml += "\n";

  xml += atomEntry(
    `${baseUrl}/opds/alpha`,
    "Browse Alphabetically",
    now,
    [
      `<link rel="subsection" href="${xmlEscape(`${baseUrl}/opds/alpha`)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>`,
    ],
    '<content type="text">Browse books sorted alphabetically (A-Z)</content>'
  );

  xml += "\n</feed>";
  return xml;
}

/** OPDS folder feed: list folders and books at the given path */
export function generateFolderFeed(
  relPath: string,
  baseUrl: string
): string {
  const now = new Date().toISOString();
  const selfHref = `${baseUrl}/opds/folder?path=${encodeURIComponent(relPath)}`;
  const title = relPath
    ? path.basename(relPath)
    : "Library Root";

  let xml = feedHeader(
    selfHref,
    title,
    now,
    selfHref,
    `${baseUrl}/opds`
  );

  const { folders, books } = explore(relPath);

  for (const folder of folders) {
    const folderHref = `${baseUrl}/opds/folder?path=${encodeURIComponent(folder.path)}`;
    xml += atomEntry(
      folderHref,
      folder.name,
      now,
      [
        `<link rel="subsection" href="${xmlEscape(folderHref)}" type="application/atom+xml;profile=opds-catalog;kind=navigation"/>`,
      ],
      '<content type="text">Folder</content>'
    );
    xml += "\n";
  }

  for (const book of books) {
    xml += bookEntry(book, baseUrl, now);
    xml += "\n";
  }

  xml += "</feed>";
  return xml;
}

/** OPDS alphabetical feed */
export function generateAlphaFeed(
  letter: string | undefined,
  baseUrl: string
): string {
  const now = new Date().toISOString();

  if (!letter) {
    // Return index of letters A-Z
    const selfHref = `${baseUrl}/opds/alpha`;
    let xml = feedHeader(selfHref, "Browse Alphabetically", now, selfHref, `${baseUrl}/opds`);

    for (let c = 65; c <= 90; c++) {
      const l = String.fromCharCode(c);
      const href = `${baseUrl}/opds/alpha?letter=${l}`;
      xml += atomEntry(href, l, now, [
        `<link rel="subsection" href="${xmlEscape(href)}" type="application/atom+xml;profile=opds-catalog;kind=acquisition"/>`,
      ]);
      xml += "\n";
    }

    xml += "</feed>";
    return xml;
  }

  const allBooks = walkBooks("");
  const filtered = allBooks.filter((b) =>
    b.name.toUpperCase().startsWith(letter.toUpperCase())
  );

  const selfHref = `${baseUrl}/opds/alpha?letter=${encodeURIComponent(letter)}`;
  let xml = feedHeader(
    selfHref,
    `Books starting with "${letter.toUpperCase()}"`,
    now,
    selfHref,
    `${baseUrl}/opds`
  );

  for (const book of filtered) {
    xml += bookEntry(book, baseUrl, now);
    xml += "\n";
  }

  xml += "</feed>";
  return xml;
}

function bookEntry(book: BookEntry, baseUrl: string, now: string): string {
  const downloadHref = `${baseUrl}/api/download?file=${encodeURIComponent(book.file)}`;
  const coverHref = `${baseUrl}/api/cover?file=${encodeURIComponent(book.file)}`;
  const titleDisplay = book.name.replace(/\.epub$/i, "");

  return atomEntry(
    downloadHref,
    titleDisplay,
    now,
    [
      `<link rel="http://opds-spec.org/acquisition" href="${xmlEscape(downloadHref)}" type="application/epub+zip"/>`,
      `<link rel="http://opds-spec.org/image" href="${xmlEscape(coverHref)}" type="image/jpeg"/>`,
      `<link rel="http://opds-spec.org/image/thumbnail" href="${xmlEscape(coverHref)}" type="image/jpeg"/>`,
    ]
  );
}
