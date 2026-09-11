import { createRoot } from "react-dom/client";
import App from "./app/windows/App.jsx";
import { initRendererAssets } from "./app/services/assets.js";
import { installResizePerformanceMode } from "./app/services/windowControls.js";
import { initializeAppearanceMode } from "./modules/appearance/index.js";
import "./app/windows/styles/index.css";

async function bootstrap() {
  installResizePerformanceMode();
  await Promise.all([
    initRendererAssets(),
    initializeAppearanceMode(),
  ]);
  createRoot(document.getElementById("root")).render(<App />);
}

bootstrap();
