'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  PointerEvent as ReactPointerEvent,
  RefObject,
  WheelEvent as ReactWheelEvent,
} from 'react';
import type { Rect } from '@/lib/floorPlan';

// Lightweight pan/zoom for an SVG <g transform>. Content is drawn in the floor's
// own coordinate space; this hook keeps a {scale, tx, ty} transform that maps it
// to screen pixels, fits the content box on mount/resize, and supports wheel
// zoom-to-cursor, pointer-drag pan, and keyboard/button zoom.

export interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

interface PanZoomApi {
  containerRef: RefObject<HTMLDivElement | null>;
  transform: Transform;
  /** `transform` attribute string for the <g>. */
  matrix: string;
  isPanning: boolean;
  onPointerDown: (e: ReactPointerEvent) => void;
  onWheel: (e: ReactWheelEvent) => void;
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
}

const PAD = 24;

export function usePanZoom(content: Rect, deps: unknown[] = []): PanZoomApi {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const fitScaleRef = useRef(1);
  const [transform, setTransform] = useState<Transform>({ scale: 1, tx: 0, ty: 0 });
  const [isPanning, setIsPanning] = useState(false);

  const fit = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    const { clientWidth: cw, clientHeight: ch } = el;
    if (!cw || !ch || !content.width || !content.height) return;
    const scale = Math.min((cw - PAD * 2) / content.width, (ch - PAD * 2) / content.height);
    fitScaleRef.current = scale;
    setTransform({
      scale,
      tx: (cw - content.width * scale) / 2 - content.x * scale,
      ty: (ch - content.height * scale) / 2 - content.y * scale,
    });
  }, [content.x, content.y, content.width, content.height]);

  useEffect(() => {
    fit();
    const el = containerRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fit, ...deps]);

  const clampScale = useCallback((s: number) => {
    const base = fitScaleRef.current || 1;
    return Math.max(base * 0.6, Math.min(base * 5, s));
  }, []);

  const zoomAt = useCallback(
    (factor: number, px: number, py: number) => {
      setTransform((t) => {
        const scale = clampScale(t.scale * factor);
        const k = scale / t.scale;
        return { scale, tx: px - (px - t.tx) * k, ty: py - (py - t.ty) * k };
      });
    },
    [clampScale]
  );

  const onWheel = useCallback(
    (e: ReactWheelEvent) => {
      const el = containerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - rect.left, e.clientY - rect.top);
    },
    [zoomAt]
  );

  const onPointerDown = useCallback((e: ReactPointerEvent) => {
    if (e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    // Don't start a pan when grabbing an interactive table — let its click fire.
    if ((e.target as Element).closest('.fp-table--interactive')) return;

    // Pan only kicks in once the pointer actually moves, so a plain click on the
    // background never suppresses anything. Note: no preventDefault() here — that
    // would also cancel the synthetic click on the tables.
    const startX = e.clientX;
    const startY = e.clientY;
    let last = { x: startX, y: startY };
    let started = false;

    const move = (ev: PointerEvent) => {
      if (!started) {
        if (Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        started = true;
        setIsPanning(true);
      }
      const dx = ev.clientX - last.x;
      const dy = ev.clientY - last.y;
      last = { x: ev.clientX, y: ev.clientY };
      setTransform((t) => ({ ...t, tx: t.tx + dx, ty: t.ty + dy }));
    };
    const up = () => {
      setIsPanning(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }, []);

  const zoomCenter = useCallback(
    (factor: number) => {
      const el = containerRef.current;
      if (!el) return;
      zoomAt(factor, el.clientWidth / 2, el.clientHeight / 2);
    },
    [zoomAt]
  );

  const matrix = `translate(${transform.tx} ${transform.ty}) scale(${transform.scale})`;

  const zoomIn = useCallback(() => zoomCenter(1.25), [zoomCenter]);
  const zoomOut = useCallback(() => zoomCenter(1 / 1.25), [zoomCenter]);

  return {
    containerRef,
    transform,
    matrix,
    isPanning,
    onPointerDown,
    onWheel,
    zoomIn,
    zoomOut,
    reset: fit,
  };
}
