import React from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { App } from "@/app/App";
import "@/styles.css";
import { initTabSession } from "@/lib/tab-session";

// The tab session (own scene autosave, own open chat) is set before the first render.
void initTabSession().then(() =>
  ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <TooltipProvider>
        <App />
      </TooltipProvider>
    </React.StrictMode>,
  )
);
