import { forwardRef, useEffect } from "react";

interface Props {
  isActive: boolean;
  pointerEvents: 'auto' | 'none';
  cursor: string;
}

/**
 * Viewport-sized canvas. The earlier implementation sized the canvas
 * to the full document (scrollWidth × scrollHeight), which on a 20k-px
 * page produced a 120 MB backing store. Now the canvas tracks the
 * viewport and we redraw strokes translated by -scroll on each scroll.
 *
 * Coordinate system in storage is document-space; the redraw in
 * usePenTool translates on draw. Retina is handled via DPR transform.
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
      canvas.style.transform = '';
      return;
    }

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const pin = () => {
      canvas.style.transform = `translate(${window.scrollX}px, ${window.scrollY}px)`;
    };

    resize();
    pin();

    const onScroll = () => { pin(); canvas.dispatchEvent(new CustomEvent('annotator-redraw')); };
    const onResize = () => { resize(); canvas.dispatchEvent(new CustomEvent('annotator-redraw')); };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [isActive, ref]);

  return (
    <canvas
      ref={ref}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        zIndex: 1,
        pointerEvents,
        cursor,
        willChange: 'transform',
      }}
    />
  );
});
