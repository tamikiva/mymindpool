import type { ColorValue } from "react-native";
import Svg, { Circle, Path, Rect } from "react-native-svg";

interface IconProps {
  color?: ColorValue;
  size?: number;
}

const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none" as const });
const stroke = (color: ColorValue) => ({ stroke: color, strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

/** Brote: sugerencias. */
export const SproutIcon = ({ color = "#2C7A5C", size = 28 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="M12 21v-8" {...stroke(color)} />
    <Path d="M12 13c0-3.5-2.5-6-6.5-6 0 3.8 2.6 6 6.5 6Z" {...stroke(color)} />
    <Path d="M12 11c0-3 2.2-5.2 6-5.2 0 3.4-2.4 5.2-6 5.2Z" {...stroke(color)} />
  </Svg>
);

export const GearIcon = ({ color = "#392747", size = 26 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Circle cx="12" cy="12" r="3.2" {...stroke(color)} />
    <Path d="M19.4 13.5a7.7 7.7 0 0 0 0-3l1.9-1.5-1.9-3.3-2.3.9a7.7 7.7 0 0 0-2.6-1.5L14.1 2h-3.8l-.4 2.6a7.7 7.7 0 0 0-2.6 1.5l-2.3-.9-1.9 3.3 1.9 1.5a7.7 7.7 0 0 0 0 3l-1.9 1.5 1.9 3.3 2.3-.9a7.7 7.7 0 0 0 2.6 1.5l.4 2.6h3.8l.4-2.6a7.7 7.7 0 0 0 2.6-1.5l2.3.9 1.9-3.3-1.9-1.5Z" {...stroke(color)} />
  </Svg>
);

export const ChevronIcon = ({ color = "#6B5B7B", size = 20 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="m9 6 6 6-6 6" {...stroke(color)} />
  </Svg>
);

export const PlusIcon = ({ color = "#fff", size = 22 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="M12 5v14M5 12h14" {...stroke(color)} />
  </Svg>
);

/** Marca provisoria: cuatro piletas. No es el logo (pendiente, PRD §25). */
export const MarkIcon = ({ size = 30 }: { size?: number }) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Rect x="2.5" y="2.5" width="9.5" height="9.5" rx="4" fill="#B7A3EE" />
    <Rect x="12" y="2.5" width="9.5" height="9.5" rx="4" fill="#8DC8F5" />
    <Rect x="2.5" y="12" width="9.5" height="9.5" rx="4" fill="#8FD4B7" />
    <Rect x="12" y="12" width="9.5" height="9.5" rx="4" fill="#F3A2BE" />
  </Svg>
);

export const PieIcon = ({ color = "#392747", size = 26 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="M12 3a9 9 0 1 0 9 9h-9V3Z" {...stroke(color)} />
    <Path d="M15 3.4A9 9 0 0 1 20.6 9H15V3.4Z" {...stroke(color)} />
  </Svg>
);

export const ListIcon = ({ color = "#392747", size = 26 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="m4 7 1.6 1.6L8.4 5.5M4 13l1.6 1.6L8.4 11.5M4 19l1.6 1.6L8.4 17.5" {...stroke(color)} />
    <Path d="M12 7h8M12 13h8M12 19h8" {...stroke(color)} />
  </Svg>
);

export const DayIcon = ({ color = "#392747", size = 26 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Rect x="3.5" y="5" width="17" height="15" rx="3" {...stroke(color)} />
    <Path d="M8 3v4M16 3v4M3.5 10h17" {...stroke(color)} />
  </Svg>
);

export const LoopIcon = ({ color = "#392747", size = 26 }: IconProps) => (
  <Svg {...base(size)} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
    <Path d="M17 4.5 20 8l-3.5 3M4 11V9.5A3.5 3.5 0 0 1 7.5 6H20M7 19.5 4 16l3.5-3M20 13v1.5a3.5 3.5 0 0 1-3.5 3.5H4" {...stroke(color)} />
  </Svg>
);
