import type { ReactNode } from "react";
import {
  Archive,
  File,
  FileAudio,
  FileCode,
  FileImage,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Folder,
  Presentation,
  type LucideProps,
} from "lucide-react";

function extFromName(name: string): string {
  const i = name.lastIndexOf(".");
  return i <= 0 ? "" : name.slice(i + 1).toLowerCase();
}

/** Small icon badge for drives / MIME / extension (token-colored via className only). */
export function DriveItemIcon(props: {
  name: string;
  /** file | folder | … */
  type: string;
  mime?: string | null;
  size?: "sm" | "lg";
  className?: string;
}): ReactNode {
  const dim = props.size === "lg" ? 26 : 18;
  const common: LucideProps = {
    size: dim,
    className: props.className,
    "aria-hidden": true,
    strokeWidth: 2,
  };

  if (props.type === "folder") {
    return <Folder {...common} />;
  }

  const mime = (props.mime ?? "").toLowerCase();
  const ext = extFromName(props.name);

  if (mime.startsWith("image/")) return <FileImage {...common} />;
  if (mime.startsWith("video/")) return <FileVideo {...common} />;
  if (mime.startsWith("audio/")) return <FileAudio {...common} />;

  if (ext === "pdf") return <FileText {...common} />;

  if (
    mime.includes("spreadsheet") ||
    mime.includes("excel") ||
    ["xlsx", "xls", "csv", "ods"].includes(ext)
  ) {
    return <FileSpreadsheet {...common} />;
  }

  if (
    mime.includes("presentation") ||
    mime.includes("powerpoint") ||
    ["ppt", "pptx", "key"].includes(ext)
  ) {
    return <Presentation {...common} />;
  }

  if (["zip", "tar", "gz", "tgz", "rar", "7z", "bz2"].includes(ext)) return <Archive {...common} />;

  if (
    ["txt", "md", "rtf", "doc", "docx", "odt"].includes(ext) ||
    mime.includes("text/") ||
    mime.includes("wordprocessing")
  ) {
    return <FileText {...common} />;
  }

  if (
    ["json", "xml", "yml", "yaml", "ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "rs", "go", "sql"].includes(
      ext,
    ) ||
    mime.includes("javascript") ||
    mime.includes("typescript") ||
    mime.includes("json")
  ) {
    return <FileCode {...common} />;
  }

  return <File {...common} />;
}
