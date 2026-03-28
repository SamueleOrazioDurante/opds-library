import { epubProcessor } from "./epub";
import { archiveProcessor } from "./archive";
import { pdfProcessor } from "./pdf";
import { genericProcessor } from "./generic";
import { BookProcessor } from "./types";
import path from "path";

const processors: Record<string, BookProcessor> = {
  ".epub": epubProcessor,
  ".cbz": archiveProcessor,
  ".cbr": archiveProcessor,
  ".pdf": pdfProcessor,
};

export function getProcessor(relPath: string): BookProcessor {
  const ext = path.extname(relPath).toLowerCase();
  return processors[ext] || genericProcessor;
}

export * from "./constants";
