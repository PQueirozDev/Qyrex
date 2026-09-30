import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "@/App";
import { SplashScreen } from "@/components/SplashScreen";
import { applyStoredTheme } from "@/stores/useSettingsStore";
import "@fontsource-variable/inter";
import "@/styles/index.css";

applyStoredTheme();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <SplashScreen />
  </React.StrictMode>
);
