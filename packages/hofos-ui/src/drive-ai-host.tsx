import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router";
import "../../../apps/web/src/index.css";
import { App } from "../../../apps/web/src/App";
import { I18nProvider } from "../../../apps/web/src/i18n";

export interface DriveAiHostProps {
  apiBase?: string;
}

export interface DriveAiRouteDefinition {
  path: string;
}

declare global {
  interface Window {
    __DRIVEAI_API_BASE__?: string;
  }
}

export const product = "driveai" as const;

export const driveAiRoutes: DriveAiRouteDefinition[] = [
  { path: "/drive" },
  { path: "/drive/home" },
  { path: "/drive/my-drive" },
  { path: "/drive/recent" },
  { path: "/drive/starred" },
  { path: "/drive/trash" },
  { path: "/drive/shared-with-me" },
  { path: "/drive/shared-drives" },
  { path: "/drive/f/:rootId" },
  { path: "/drive/file/:fileId" },
  { path: "/drive/search" },
];

const queryClient = new QueryClient();

export function DriveAiHost({ apiBase = "/api/drive" }: DriveAiHostProps) {
  if (typeof window !== "undefined") {
    window.__DRIVEAI_API_BASE__ = apiBase;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <I18nProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </I18nProvider>
    </QueryClientProvider>
  );
}
