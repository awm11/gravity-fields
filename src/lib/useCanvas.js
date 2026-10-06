import { useEffect, useRef } from 'react';

/*
 * A 2D canvas that fills its parent and repaints when `deps` change or
 * the parent resizes. draw(ctx, width, height, time) works in CSS pixels;
 * the device-pixel-ratio scaling is handled here.
 *
 * With { animate: true } it repaints every frame instead, and the draw
 * function is free to advance its own simulation from `time`.
 */
export function useCanvas(draw, deps = [], { animate = false } = {}) {
  const canvasRef = useRef(null);
  const drawRef = useRef(draw);
  drawRef.current = draw;
  const sizeRef = useRef({ w: 0, h: 0, dpr: 1 });

  const paintRef = useRef(() => {});
  paintRef.current = (time = performance.now()) => {
    const canvas = canvasRef.current;
    const { w, h, dpr } = sizeRef.current;
    if (!canvas || !w || !h) return;
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    drawRef.current(ctx, w, h, time);
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!host) return undefined;

    const resize = () => {
      const rect = host.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      if (!w || !h) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      sizeRef.current = { w, h, dpr };
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      paintRef.current();
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!animate) paintRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    if (!animate) return undefined;
    let raf = 0;
    const loop = (t) => {
      paintRef.current(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [animate]);

  return { canvasRef, sizeRef, repaint: () => paintRef.current() };
}

/** Pointer position in CSS pixels relative to an element. */
export function localPoint(event, element) {
  const rect = element.getBoundingClientRect();
  return [event.clientX - rect.left, event.clientY - rect.top];
}
