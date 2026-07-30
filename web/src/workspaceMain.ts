import "./workspace.css";
import "./siteHeader.css";

import { WorkspaceApp } from "./workspace/workspaceApp.ts";

const root = document.querySelector<HTMLElement>("#app");
if (!root) {
  throw new Error("Missing #app mount point.");
}

await WorkspaceApp.start(root);
