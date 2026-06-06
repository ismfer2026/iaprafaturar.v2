import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "@/styles/globals.css";
import App from "./App";

const root = document.getElementById("root");
if (!root) throw new Error("Elemento #root não encontrado no DOM");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
