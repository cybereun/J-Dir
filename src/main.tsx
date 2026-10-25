import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { PreviewWindowApp } from "./PreviewWindowApp";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {new URLSearchParams(window.location.search).has("preview") ? <PreviewWindowApp /> : <App />}
  </React.StrictMode>
);
