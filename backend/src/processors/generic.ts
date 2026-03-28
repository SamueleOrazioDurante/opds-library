import path from "path";
import { BookMetadata, BookProcessor } from "./types";

export const genericProcessor: BookProcessor = {
  async getMetadata(relPath: string): Promise<BookMetadata> {
    const ext = path.extname(relPath);
    const name = path.basename(relPath, ext);
    return {
      title: name,
      author: "Unknown Author",
      language: "",
    };
  },
  async getCover(_relPath: string): Promise<{ buf: Buffer; mime: string } | null> {
    return null;
  },
};
