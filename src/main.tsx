import React from "react";
import ReactDOM from "react-dom/client";
import { invoke } from "@tauri-apps/api/core";
import App from "./App";
import "./styles.css";

// F12 で DevTools を開く（ローディング中でも動作する）
window.addEventListener("keydown", (e) => {
  if (e.key === "F12") {
    void invoke("open_devtools");
  }
});

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
