/// <reference types="vite/client" />

import type { WorkspaceApi } from "../preload/index";

declare global {
  interface Window {
    workspace: WorkspaceApi;
  }
}
