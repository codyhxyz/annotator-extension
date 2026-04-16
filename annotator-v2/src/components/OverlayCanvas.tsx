import { forwardRef, useEffect } from "react";

interface Props {
  isActive: boolean;
  pointerEvents: 'auto' | 'none';
  cursor: string;
}

/**
 * Thin canvas element. Tools that want to draw consume the forwarded
 * ref via ToolContext.canvasRef — this component has no tool knowledge.
 */
export default forwardRef<HTMLCanvasElement, Props>(function OverlayCanvas(
  { isActive, pointerEvents, cursor },
  ref,
) {
  useEffect(() => {
    const canvas = typeof ref === 'function' ? null : ref?.current;
    if (!canvas) return;

    if (!isActive) {
      if (canvas.width > 0) { canvas.width = 0; canvas.height = 0; }
      return;
    }

    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const w = Math.max(document.body.scrollWidth, document.documentElement.scrollWidth);
      const h = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight);
      const targetW = Math.floor(w * dpr);
      const targetH = Math.floor(h * dpr);
      if (canvas.width !== targetW || canvas.height !== targetH) {
        canvas.width = targetW;
        canvas.height = targetH;
        canvas.style.width = `${w}px`;
        canvas.style.height = `${h}px`;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
    };
    resize();

    let timer: ReturnType<typeof setTimeout>;
    const ro = new ResizeObserver(() => {
      clearTimeout(timer);
      timer = setTimeout(resize, 200);
    });
    ro.observe(document.body);
    return () => { ro.disconnect(); clearTimeout(timer); };
  }, [isActive, ref]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        zIndex: 1,
        pointerEvents,
        cursor,
      }}
    />
  );
});
