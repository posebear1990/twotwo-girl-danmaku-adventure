import { FRAMES, SPRITE_HEIGHT, SPRITE_WIDTH } from "./generated/heroFrames";

const COLORS = {
  H: "#da4626",
  O: "#1f63e0",
  B: "#7a4408",
  S: "#f7b13d"
} as const;

type PixelCode = keyof typeof COLORS;
type FrameName = keyof typeof FRAMES;

export interface HeroSpriteState {
  facing: 1 | -1;
  grounded: boolean;
  vx: number;
  runCycle: number;
  onSpring: boolean;
  skidding: boolean;
}

function getFrameName(state: HeroSpriteState): FrameName {
  if (!state.grounded) {
    return "jump";
  }

  if (state.skidding) {
    return "skid";
  }

  if (state.onSpring || Math.abs(state.vx) < 18) {
    return "idle";
  }

  return (["run1", "run2", "run3"] as const)[Math.floor(state.runCycle) % 3] ?? "run2";
}

export function drawHero(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  state: HeroSpriteState
): void {
  const frame = FRAMES[getFrameName(state)];
  const unit = Math.min(width / SPRITE_WIDTH, height / SPRITE_HEIGHT);
  const drawnWidth = SPRITE_WIDTH * unit;
  const drawnHeight = SPRITE_HEIGHT * unit;
  const offsetX = Math.round((width - drawnWidth) * 0.5);
  const offsetY = Math.round(height - drawnHeight);

  ctx.save();
  ctx.translate(x + offsetX, y + offsetY);
  if (state.facing < 0) {
    ctx.translate(drawnWidth, 0);
    ctx.scale(-1, 1);
  }

  for (let rowIndex = 0; rowIndex < frame.length; rowIndex += 1) {
    const row = frame[rowIndex]!;
    for (let columnIndex = 0; columnIndex < row.length; columnIndex += 1) {
      const cell = row[columnIndex] as PixelCode | ".";
      if (cell === ".") {
        continue;
      }
      ctx.fillStyle = COLORS[cell];
      ctx.fillRect(
        Math.round(columnIndex * unit),
        Math.round(rowIndex * unit),
        Math.ceil(unit),
        Math.ceil(unit)
      );
    }
  }

  ctx.restore();
}
