function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Canonical file kind for styling (must stay in sync with DriveItemIcon choice order). */
export type DriveIconKind =
  | "folder"
  | "image"
  | "video"
  | "audio"
  | "pdf"
  | "spreadsheet"
  | "presentation"
  | "archive"
  | "document"
  | "code"
  | "file";

export function driveIconKind(input: {
  name: string;
  type: string;
  mime?: string | null;
}): DriveIconKind {
  if (input.type === "folder") return "folder";

  const mime = (input.mime ?? "").toLowerCase();
  const ext = extFromName(input.name);

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (ext === "pdf") return "pdf";
  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    ["xlsx", "xls", "csv", "ods"].includes(ext)
  ) {
    return "spreadsheet";
  }
  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    ["ppt", "pptx", "key"].includes(ext)
  ) {
    return "presentation";
  }
  if (["zip", "tar", "gz", "tgz", "rar", "7z", "bz2"].includes(ext)) return "archive";
  if (
    ["txt", "md", "rtf", "doc", "docx", "odt"].includes(ext) ||
    mime.includes("text/") ||
    mime.includes("wordprocessing")
  ) {
    return "document";
  }
  if (
    ["json", "xml", "yml", "yaml", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "sql"].includes(
      ext,
    ) ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("json")
  ) {
    return "code";
  }
  return "file";
}
