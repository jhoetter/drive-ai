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
import { driveIconKind } from "./driveIconKind.js";

/** Small icon badge for drives / MIME / extension (token-colored via wrapper `color`). */
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

  switch (driveIconKind(props)) {
    case "folder":
      return <Folder {...common} />;
    case "image":
      return <FileImage {...common} />;
    case "video":
      return <FileVideo {...common} />;
    case "audio":
      return <FileAudio {...common} />;
    case "pdf":
      return <FileText {...common} />;
    case "spreadsheet":
      return <FileSpreadsheet {...common} />;
    case "presentation":
      return <Presentation {...common} />;
    case "archive":
      return <Archive {...common} />;
    case "document":
      return <FileText {...common} />;
    case "code":
      return <FileCode {...common} />;
    default:
      return <File {...common} />;
  }
}
