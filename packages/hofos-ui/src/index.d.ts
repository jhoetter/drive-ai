import type { ComponentType } from "react";

export interface DriveAiHostProps {
  apiBase?: string;
}
export interface DriveAiRouteDefinition {
  path: string;
}
export declare const product: "driveai";
export declare const routes: DriveAiRouteDefinition[];
export declare const driveAiRoutes: DriveAiRouteDefinition[];
export declare const DriveAiHost: ComponentType<DriveAiHostProps>;
export { DriveAiHost as Host };
