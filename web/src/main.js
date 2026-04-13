import "./styles.css";
import { createApp } from "./app.js";

const root = document.querySelector("#app");

if (!root) {
  throw new Error("Missing #app mount point");
}

root.innerHTML = "";
root.append(await createApp());
