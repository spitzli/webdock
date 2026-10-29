import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource-variable/inter";
import "./styles.css";
import { initializeTheme } from "./theme";
initializeTheme();
const root = document.getElementById("root");
if (!root) throw new Error("Console root element is missing.");
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
