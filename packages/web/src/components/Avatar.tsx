// Bot faces (specs/web-app): a shape in the bot's color with two eyes. The
// `orb` is the Orbis planet with its orbit ring. The face moves with the bot's
// state — it blinks when idle, looks up while thinking, bounces while working,
// waits, shakes when blocked and smiles when done — and its accessible name
// says the state in words.
import { useId } from "react";
import type { AvatarShape, Bot, BotState } from "@orbis/shared";
import { useT } from "../i18n.js";

export const STATE_COLORS: Record<BotState, string> = {
  idle: "#94a3b8",
  thinking: "#3b82f6",
  working: "#f59e0b",
  waiting: "#a855f7",
  blocked: "#ef4444",
  done: "#22c55e",
};

export const STATE_ICONS: Record<BotState, string> = {
  idle: "○",
  thinking: "…",
  working: "⚙",
  waiting: "✋",
  blocked: "!",
  done: "✓",
};

/** Mix a #rrggbb color with white (amount > 0) or black (amount < 0). */
export function shade(hex: string, amount: number): string {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  if (!Number.isFinite(n) || hex.length !== 7) return hex;
  const target = amount > 0 ? 255 : 0;
  const k = Math.abs(amount);
  const channel = (shift: number) => Math.round(((n >> shift) & 255) * (1 - k) + target * k);
  return `#${[16, 8, 0].map((s) => channel(s).toString(16).padStart(2, "0")).join("")}`;
}

/** Where the eyes sit on each shape (their center), in the 100 × 100 face. */
const EYES: Record<AvatarShape, { x: number; y: number }> = {
  orb: { x: 53, y: 44 },
  blob: { x: 54, y: 46 },
  square: { x: 53, y: 45 },
  pill: { x: 55, y: 48 },
  triangle: { x: 51, y: 62 },
  hexagon: { x: 53, y: 47 },
  cloud: { x: 52, y: 54 },
  drop: { x: 52, y: 62 },
};

function Body({ shape, fill }: { shape: AvatarShape; fill: string }) {
  switch (shape) {
    case "orb":
      return <circle cx="50" cy="50" r="33" fill={fill} />;
    case "blob":
      return <path d="M52 14c21 0 36 16 36 38 0 22-17 36-38 36S12 76 12 56c0-24 18-42 40-42Z" fill={fill} />;
    case "square":
      return <rect x="15" y="15" width="70" height="70" rx="20" fill={fill} />;
    case "pill":
      return <rect x="7" y="27" width="86" height="48" rx="24" fill={fill} />;
    case "triangle":
      return <polygon points="50,17 87,81 13,81" fill={fill} stroke={fill} strokeWidth="14" strokeLinejoin="round" />;
    case "hexagon":
      return <polygon points="50,14 83,32 83,68 50,86 17,68 17,32" fill={fill} stroke={fill} strokeWidth="10" strokeLinejoin="round" />;
    case "cloud":
      return (
        <g fill={fill}>
          <circle cx="31" cy="58" r="21" />
          <circle cx="50" cy="44" r="25" />
          <circle cx="70" cy="57" r="21" />
          <rect x="30" y="52" width="42" height="27" rx="13" />
        </g>
      );
    case "drop":
      return <path d="M50 8C54 16 83 42 83 64c0 18-15 29-33 29S17 82 17 64C17 42 46 16 50 8Z" fill={fill} />;
  }
}

/** The face itself; `color` "brand" paints it with the Orbis gradient (the mascot). */
export function BotFace({
  shape,
  color,
  state = "idle",
  size = 40,
  label,
}: {
  shape: AvatarShape;
  color: string;
  state?: BotState;
  size?: number;
  label?: string;
}) {
  const id = useId().replace(/:/g, "");
  const brand = color === "brand";
  const base = brand ? "#4f6bff" : color;
  const fill = `url(#face-${id})`;
  const eyes = EYES[shape] ?? EYES.orb;
  return (
    <svg
      className={`face face-${shape} state-${state}`}
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      <defs>
        {brand ? (
          <linearGradient id={`face-${id}`} x1="18" y1="16" x2="84" y2="86" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor="#3ecbff" />
            <stop offset="0.5" stopColor="#3b82f6" />
            <stop offset="1" stopColor="#7c4dff" />
          </linearGradient>
        ) : (
          <radialGradient id={`face-${id}`} cx="36" cy="30" r="72" gradientUnits="userSpaceOnUse">
            <stop offset="0" stopColor={shade(base, 0.38)} />
            <stop offset="0.55" stopColor={base} />
            <stop offset="1" stopColor={shade(base, -0.22)} />
          </radialGradient>
        )}
      </defs>
      <g className="face-body">
        {shape === "orb" && (
          // The orbit ring behind the planet…
          <ellipse cx="50" cy="55" rx="47" ry="12" transform="rotate(-18 50 55)" fill="none" stroke={brand ? "#c9d6ff" : shade(base, 0.5)} strokeWidth="4.5" />
        )}
        <Body shape={shape} fill={fill} />
        {shape === "orb" && (
          // …and in front of it.
          <path
            d="M3 55A47 12 0 0 0 97 55"
            transform="rotate(-18 50 55)"
            fill="none"
            stroke={brand ? "#c9d6ff" : shade(base, 0.5)}
            strokeWidth="4.5"
            strokeLinecap="round"
          />
        )}
        <g className="face-eyes" transform={`translate(${eyes.x} ${eyes.y})`}>
          {state === "done" ? (
            <g className="eyes-happy" fill="none" stroke="#fff" strokeWidth="3.6" strokeLinecap="round">
              <path d="M-12 2q4.5-7 9 0" />
              <path d="M3 2q4.5-7 9 0" />
            </g>
          ) : (
            <g className="eyes-open" fill="#fff">
              <rect x="-11.5" y="-7.5" width="6.5" height="14" rx="3.25" transform="rotate(9 -8.25 -0.5)" />
              <rect x="4" y="-7.5" width="6.5" height="14" rx="3.25" transform="rotate(9 7.25 -0.5)" />
            </g>
          )}
        </g>
      </g>
    </svg>
  );
}

/** A bot's face, with its state in its accessible name. */
/** A bot as a choice in a list: its name, then its role (who it is, not just what it is called). */
export const botLabel = (bot: Pick<Bot, "name" | "role">): string => (bot.role ? `${bot.name} · ${bot.role}` : bot.name);

export function Avatar({ bot, size = 40 }: { bot: Pick<Bot, "avatar" | "state" | "name">; size?: number }) {
  const t = useT();
  const state = t(`state.${bot.state}`);
  return (
    <span className={`avatar state-${bot.state}`} style={{ width: size, height: size }} data-state={bot.state} title={`${bot.name}: ${state}`}>
      <BotFace shape={bot.avatar.shape ?? "orb"} color={bot.avatar.color} state={bot.state} size={size} label={`${bot.name}: ${state}`} />
    </span>
  );
}

/** The Orbis mascot: the brand orb with its ring and two eyes. */
export function Mascot({ size = 40, state = "idle" as BotState }: { size?: number; state?: BotState }) {
  return <BotFace shape="orb" color="brand" state={state} size={size} />;
}

export function StateLabel({ state }: { state: BotState }) {
  const t = useT();
  return (
    <span className={`state-label state-${state}`} style={{ color: STATE_COLORS[state] }}>
      {STATE_ICONS[state]} {t(`state.${state}`)}
    </span>
  );
}
