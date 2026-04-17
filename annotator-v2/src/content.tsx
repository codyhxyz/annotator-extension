import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import css from "./index.css?inline";

let mounted = false;

function mountApp() {
  if (mounted) return;
  mounted = true;

  const container = document.createElement("div");
  container.id = "annotator-v2-root";
  container.style.position = "absolute";
  container.style.top = "0";
  container.style.left = "0";
  container.style.width = "100%";
  container.style.zIndex = "2147483647";
  container.style.pointerEvents = "none";

  const updateHeight = () => {
    const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
    container.style.height = h + "px";
  };
  updateHeight();

  let debounceTimer: ReturnType<typeof setTimeout>;
  const ro = new ResizeObserver(() => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(updateHeight, 200);
  });
  ro.observe(document.body);

  const shadowRoot = container.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = css;
  shadowRoot.appendChild(style);

  const mountPoint = document.createElement("div");
  mountPoint.id = "app-mount";
  mountPoint.style.width = "100%";
  mountPoint.style.height = "100%";
  shadowRoot.appendChild(mountPoint);

  document.body.appendChild(container);

  createRoot(mountPoint).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "TOGGLE_OVERLAY") {
    mountApp();
    window.dispatchEvent(new CustomEvent("annotator-toggle"));
  }

  if (msg.type === "SCROLL_TO_ANNOTATION" && msg.annotationId) {
    mountApp();
    window.dispatchEvent(new CustomEvent("annotator-scroll-to", {
      detail: { annotationId: msg.annotationId },
    }));
    window.dispatchEvent(new CustomEvent("annotator-toggle"));
  }
});
