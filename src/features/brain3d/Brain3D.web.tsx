import { createElement, useEffect, useMemo, useRef, useState } from "react";
import { Brain, useReduceMotion, type BrainArea } from "../brain/Brain";
import { BrainScene } from "./scene";

interface Props {
  areas: readonly BrainArea[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Si es true no se anima la transición de nivel ni las ondas. */
  reduceMotion?: boolean;
}

/** WebGL disponible (y no desactivado por el sistema). */
function hasWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

/**
 * Cerebro en 3D con piletas, agua translúcida y niveles que salen de los datos. Si WebGL no está
 * disponible o se pierde el contexto, se muestra el dibujo plano (la vista simplificada).
 * El lienzo no es accesible por sí mismo: la leyenda (radios) y la lista de áreas lo son.
 */
export function Brain3D({ areas, selectedId, onSelect, reduceMotion }: Props) {
  const systemReduce = useReduceMotion();
  // La preferencia del sistema llega de forma asíncrona por React Native; en web se lee ya, para que
  // con «reducir movimiento» el agua no se anime ni siquiera al cargar.
  const [mediaReduce] = useState(() => typeof window !== "undefined" && !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  const reduce = reduceMotion ?? (systemReduce || mediaReduce);
  const holder = useRef<HTMLDivElement | null>(null);
  const canvas = useRef<HTMLCanvasElement | null>(null);
  const scene = useRef<BrainScene | null>(null);
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const [failed, setFailed] = useState(() => typeof document !== "undefined" && !hasWebGL());
  const ratio = useMemo(() => BrainScene.aspectFor(Math.min(8, Math.max(2, areas.length))), [areas.length]);

  // Crear y destruir la escena.
  useEffect(() => {
    if (failed || !canvas.current || !holder.current) return;
    let s: BrainScene;
    try {
      s = new BrainScene(canvas.current);
    } catch {
      setFailed(true);
      return;
    }
    scene.current = s;
    const el = canvas.current;
    const box = holder.current;
    const measure = () => s.resize(box.clientWidth, box.clientHeight);
    const ro = new ResizeObserver(measure);
    ro.observe(box);
    measure();
    const io = new IntersectionObserver(([e]) => s.setActive(e.isIntersecting && !document.hidden));
    io.observe(box);
    const vis = () => s.setActive(!document.hidden);
    document.addEventListener("visibilitychange", vis);
    const click = (e: MouseEvent) => {
      const id = s.pick(e.clientX, e.clientY);
      if (id) onSelectRef.current?.(id);
    };
    el.addEventListener("click", click);
    const lost = (e: Event) => {
      e.preventDefault();
      setFailed(true);
    };
    el.addEventListener("webglcontextlost", lost);
    document.fonts?.load("800 24px Nunito").then(() => s.refreshLabels()).catch(() => {});
    return () => {
      ro.disconnect();
      io.disconnect();
      document.removeEventListener("visibilitychange", vis);
      el.removeEventListener("click", click);
      el.removeEventListener("webglcontextlost", lost);
      s.dispose();
      scene.current = null;
    };
  }, [failed]);

  useEffect(() => {
    scene.current?.setReduceMotion(reduce);
  }, [reduce, failed]);
  useEffect(() => {
    scene.current?.setAreas(areas);
  }, [areas, failed]);
  useEffect(() => {
    scene.current?.setSelected(selectedId ?? null);
  }, [selectedId, areas, failed]);

  if (failed) return <Brain areas={areas} selectedId={selectedId} onSelect={onSelect} reduceMotion={reduceMotion} />;

  const label = `Mi equilibrio: ${areas.map((a) => `${a.name}, carga pendiente ${Math.round(a.level * 100)} por ciento`).join("; ")}`;
  return createElement(
    "div",
    { ref: holder, style: { position: "relative", width: "100%", aspectRatio: String(1 / ratio) } },
    createElement("canvas", {
      ref: canvas,
      role: "img",
      "aria-label": label,
      style: { position: "absolute", inset: 0, width: "100%", height: "100%", display: "block", cursor: "pointer", touchAction: "manipulation" },
    }),
  );
}
