import fs from "fs";
import path from "path";
import { resolveSafe } from "../scanner";
import { BookMetadata, BookProcessor } from "./types";

export const pdfProcessor: BookProcessor = {
  async getMetadata(relPath: string): Promise<BookMetadata> {
    const absPath = resolveSafe(relPath);
    const name = path.basename(relPath, ".pdf");
    
    try {
      const fd = fs.openSync(absPath, "r");
      const buffer = Buffer.alloc(8192);
      fs.readSync(fd, buffer, 0, 8192, 0);
      fs.closeSync(fd);
      
      const content = buffer.toString("binary");
      const titleMatch = content.match(/\/Title\s*\(([^)]+)\)/);
      const authorMatch = content.match(/\/Author\s*\(([^)]+)\)/);
      
      return {
        title: titleMatch ? titleMatch[1] : name,
        author: authorMatch ? authorMatch[1] : "Unknown Author",
        language: "",
      };
    } catch {
      return {
        title: name,
        author: "Unknown Author",
        language: "",
      };
    }
  },

  async getCover(_relPath: string): Promise<Buffer | null> {
    // Rendering PDF covers in Node is very hard without native deps.
    // Return null for now, a generic icon will be used on frontend.
    return null;
  },
};
