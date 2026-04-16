import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import css from "./index.css?inline";
import { performSync, watchAuthState } from "./sync";

// Always-on: run sync on alarm ticks regardless of overlay visibility.
// This is the content script boot, not gated on mountApp().
let signedIn = false;
watchAuthState((s) => { signedIn = s; });
window.addEventListener("annotator-sync-tick", () => {
  if (!signedIn) return;
  performSync().catch(err => console.warn('[annotator] sync failed:', err));
});

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

  // Track full document height so the overlay covers all content
  const updateHeight = () => {
    const h = Math.max(
      document.body.scrollHeight,
      document.documentElement.scrollHeight
    );
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

// Listen for messages from background — mount lazily on first toggle
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

  // Alarm-driven sync tick from the background SW. Sync runs without
  // requiring the overlay to be open.
  if (msg.type === "SYNC_TICK") {
    window.dispatchEvent(new CustomEvent("annotator-sync-tick"));
  }
});
