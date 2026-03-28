export interface BookMetadata {
  title: string;
  author: string;
  language: string;
  coverFile?: string; // entry name inside the zip/archive
}

export interface BookProcessor {
  getMetadata(relPath: string): Promise<BookMetadata>;
  getCover(relPath: string): Promise<{ buf: Buffer; mime: string } | null>;
}
