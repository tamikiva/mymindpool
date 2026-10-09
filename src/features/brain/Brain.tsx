import { useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Platform } from "react-native";
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Stop, Text as SvgText } from "react-native-svg";
import { palette } from "@/theme/tokens";
import {
  VIEW,
  bounds,
  centroid,
  polygonPath,
  sectorPolygon,
  silhouettePath,
  wavePath,
} from "./geometry";
import { layoutLabel } from "./labels";

export interface BrainArea {
  id: string;
  name: string;
  fill: string;
  deep: string;
  /** Carga pendiente 0..1 (ya calculada por el dominio). */
  level: number;
}

interface Props {
  areas: readonly BrainArea[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  /** Si es true no se anima la transición de nivel. */
  reduceMotion?: boolean;
}

export function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduce(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/** Interpola hacia el objetivo con una transición breve; sin animación si se reduce el movimiento. */
function useTween(target: number, disabled: boolean): number {
  const [value, setValue] = useState(target);
  const ref = useRef(target);
  useEffect(() => {
    if (disabled) {
      ref.current = target;
      setValue(target);
      return;
    }
    const from = ref.current;
    const start = Date.now();
    const dur = 450;
    let raf: ReturnType<typeof requestAnimationFrame>;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      ref.current = from + (target - from) * eased;
      setValue(ref.current);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, disabled]);
  return value;
}

function Pool({
  area,
  index,
  count,
  selected,
  onSelect,
  reduceMotion,
}: {
  area: BrainArea;
  index: number;
  count: number;
  selected: boolean;
  onSelect?: (id: string) => void;
  reduceMotion: boolean;
}) {
  const level = useTween(area.level, reduceMotion);
  const poly = sectorPolygon(index, count, 0.07);
  const c = centroid(poly);
  const b = bounds(poly);
  const label = layoutLabel(area.name, (b.maxX - b.minX) * 0.62);
  const clipId = `clip-${area.id}`;
  const gradId = `water-${area.id}`;
  const lineH = label.fontSize * 1.1;
  const pct = Math.round(area.level * 100);
  const description = `${area.name}, carga pendiente ${pct} por ciento`;
  // En web `accessible` generaría un <button> HTML dentro del SVG: se usan atributos ARIA.
  const a11y = (
    Platform.OS === "web"
      ? {
          role: "radio",
          "aria-label": description,
          "aria-checked": selected,
          tabIndex: 0,
          onClick: () => onSelect?.(area.id),
          onKeyDown: (e: { key: string }) => {
            if (onSelect && (e.key === "Enter" || e.key === " ")) onSelect(area.id);
          },
        }
      : {
          onPress: onSelect ? () => onSelect(area.id) : undefined,
          accessible: true,
          accessibilityRole: "button",
          accessibilityLabel: description,
          accessibilityState: { selected },
        }
  ) as object;
  return (
    <G {...a11y}>
      <Defs>
        <ClipPath id={clipId}>
          <Path d={polygonPath(poly)} />
        </ClipPath>
        <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor={area.fill} stopOpacity="0.55" />
          <Stop offset="1" stopColor={area.fill} stopOpacity="0.9" />
        </LinearGradient>
      </Defs>
      {/* Piso de la pileta: más claro que el agua para que el nombre se lea al fondo. */}
      <Path d={polygonPath(poly)} fill={area.fill} fillOpacity={0.28} />
      {/* El nombre va en el piso, debajo del agua translúcida. */}
      <G rotation={-8} origin={`${c.x}, ${c.y}`}>
        {label.lines.map((line, i) => (
          <SvgText
            key={i}
            x={c.x}
            y={c.y + (i - (label.lines.length - 1) / 2) * lineH + label.fontSize * 0.35}
            fontSize={label.fontSize}
            fontWeight="700"
            fontFamily={Platform.OS === "web" ? "system-ui, -apple-system, Segoe UI, Roboto, sans-serif" : undefined}
            fill={area.deep}
            textAnchor="middle"
          >
            {line}
          </SvgText>
        ))}
      </G>
      <G clipPath={`url(#${clipId})`}>
        <Path d={wavePath(poly, level)} fill={`url(#${gradId})`} fillOpacity={0.6} />
      </G>
      <Path
        d={polygonPath(poly)}
        fill="none"
        stroke={selected ? palette.primary : "#FFFFFF"}
        strokeOpacity={selected ? 1 : 0.7}
        strokeWidth={selected ? 3.5 : 1.5}
      />
    </G>
  );
}

export function Brain({ areas, selectedId, onSelect, reduceMotion }: Props) {
  const systemReduce = useReduceMotion();
  const reduce = reduceMotion ?? systemReduce;
  return (
    <Svg
      viewBox={`0 0 ${VIEW.w} ${VIEW.h}`}
      width="100%"
      height="100%"
      accessibilityLabel="Mi equilibrio: una pileta por área"
    >
      <Path d={silhouettePath()} fill={palette.wall} stroke="#E2D4BF" strokeWidth={3} />
      {areas.map((a, i) => (
        <Pool
          key={a.id}
          area={a}
          index={i}
          count={areas.length}
          selected={a.id === selectedId}
          onSelect={onSelect}
          reduceMotion={reduce}
        />
      ))}
    </Svg>
  );
}
