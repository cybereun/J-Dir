import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PreviewWindowApp } from "./PreviewWindowApp";
import "./styles.css";

// A file dropped on a part of the window without a drop handler would otherwise make the WebView
// navigate to that file; swallow those drops globally (handlers still run before this).
window.addEventListener("dragover", (e) => e.preventDefault());
window.addEventListener("drop", (e) => e.preventDefault());

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has("preview") ? <PreviewWindowApp /> : <App />}
  </React.StrictMode>
);
