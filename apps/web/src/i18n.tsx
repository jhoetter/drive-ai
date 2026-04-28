import { createInstance } from "i18next";
import { I18nextProvider } from "react-i18next";
import { Suspense, type ReactNode } from "react";

const en = {
  appTitle: "Drive",
  home: "Home",
  viewAll: "View all",
  columnName: "Name",
  columnType: "Type",
  myDrive: "My Drive",
  recent: "Recent",
  starred: "Starred",
  trash: "Trash",
  searchPlaceholder: "Search in Drive",
  openPalette: "Command palette (⌘K)",
  notConfigured: "Not configured",
  loadError: "Could not load Drive",
  retry: "Retry",
  apiErrorHint: "Check the browser Network tab for /api/drives. Is the API running on :3520?",
  jwtDevHint:
    "Standalone dev: comment out HOF_SUBAPP_JWT_SECRET in .env (or the API returns 401 without a Bearer token). hofOS uses the secret; this harness does not send JWT unless wired.",
  emptyFolder: "This folder is empty",
  emptyList: "No items to show",
  upload: "Upload",
  uploadDropHint: "Drag files into this area, or use Upload above.",
  noPermission: "You do not have access",
  sharedWithMe: "Shared with me",
  sharedDrives: "Shared drives",
  downloadFile: "Download",
  searchHint: "Search",
  pageTitleSearch: "Search",
  noSearchResults: "No results",
  typeQueryToSearch: "Type to search (results update shortly) or press Return",
  back: "Back",
  searchFilters: "Filters",
  searchChipPdf: "PDF",
  searchChipOwnerMe: "Mine",
  searchChipTrash: "Trash",
  searchClearFilters: "Clear",
  searchLoadMore: "Load more",
  childrenLoadError: "Could not load this folder. You may not have access, or the link is outdated.",
  goToMyDrive: "Go to My Drive",
  uploadError: "Upload failed",
  dismiss: "Dismiss",
  uploadFolder: "Upload folder",
  searchInFolder: "Search this folder",
  searchChipImage: "Images",
  searchChipDocs: "Documents",
} as const;
const de: Record<keyof typeof en, string> = {
  appTitle: "Drive",
  home: "Startseite",
  viewAll: "Alle anzeigen",
  columnName: "Name",
  columnType: "Typ",
  myDrive: "Meine Dateien",
  recent: "Zuletzt",
  starred: "Markiert",
  trash: "Papierkorb",
  searchPlaceholder: "Suche in Drive",
  openPalette: "Befehlspalette (⌘K)",
  notConfigured: "Nicht konfiguriert",
  loadError: "Drive konnte nicht geladen werden",
  retry: "Erneut versuchen",
  apiErrorHint: "Im Network-Tab prüfen: /api/drives. Läuft die API auf :3520?",
  jwtDevHint:
    "Standalone: HOF_SUBAPP_JWT_SECRET in .env auskommentieren (ohne Bearer antwortet die API mit 401). hofOS nutzt den Secret; dieses UI sendet kein JWT.",
  emptyFolder: "Dieser Ordner ist leer",
  emptyList: "Keine Einträge",
  upload: "Hochladen",
  uploadDropHint: "Dateien hierher ziehen oder oben auf Hochladen klicken.",
  noPermission: "Kein Zugriff",
  sharedWithMe: "Für mich freigegeben",
  sharedDrives: "Gemeinsame Ablagen",
  downloadFile: "Herunterladen",
  searchHint: "Suche",
  pageTitleSearch: "Suche",
  noSearchResults: "Keine Treffer",
  typeQueryToSearch: "Tippen zum Suchen (kurze Verzögerung) oder Return",
  back: "Zurück",
  searchFilters: "Filter",
  searchChipPdf: "PDF",
  searchChipOwnerMe: "Von mir",
  searchChipTrash: "Papierkorb",
  searchClearFilters: "Zurücksetzen",
  searchLoadMore: "Mehr laden",
  childrenLoadError:
    "Dieser Ordner konnte nicht geladen werden. Kein Zugriff oder veralteter Link.",
  goToMyDrive: "Zu Meine Dateien",
  uploadError: "Upload fehlgeschlagen",
  dismiss: "Schließen",
  uploadFolder: "Ordner hochladen",
  searchInFolder: "Diesen Ordner durchsuchen",
  searchChipImage: "Bilder",
  searchChipDocs: "Dokumente",
};

const i18n = createInstance();
void i18n.init({
  resources: { en: { trans: en }, de: { trans: de } },
  ns: ["trans"],
  defaultNS: "trans",
  lng: navigator.language.slice(0, 2) === "de" ? "de" : "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export function I18nProvider({ children }: { children: ReactNode }) {
  return (
    <I18nextProvider i18n={i18n}>
      <Suspense fallback={null}>{children}</Suspense>
    </I18nextProvider>
  );
}

export function t(key: keyof typeof en) {
  return i18n.t(`trans:${key}`);
}
