import { sampleDanmakuPlatforms } from "./platformProbe";
import { drawHero } from "./sprite";
import type { Platform } from "./types";

const OVERLAY_ID = "twotwo-girl-danmaku-adventure-root";
const BASE_HERO_WIDTH = 24;
const BASE_HERO_HEIGHT = 28;
const BASE_GRAVITY_ASCEND = 1180;
const BASE_GRAVITY_RELEASE = 2550;
const BASE_GRAVITY_FALL = 2050;
const BASE_WALK_SPEED = 180;
const BASE_RUN_SPEED = 320;
const BASE_GROUND_ACCELERATION = 1800;
const BASE_RUN_ACCELERATION = 2450;
const BASE_AIR_ACCELERATION = 1050;
const BASE_GROUND_DECELERATION = 1650;
const BASE_SKID_DECELERATION = 2800;
const BASE_AIR_DECELERATION = 720;
const BASE_JUMP_SPEED = 660;
const BASE_RUN_JUMP_BONUS = 120;
const JUMP_HOLD_TIME = 0.18;
const PLATFORM_PROBE_INTERVAL = 80;
const VIDEO_REFRESH_INTERVAL = 500;
const BASE_SPRING_WIDTH = 26;
const BASE_SPRING_HEIGHT = 20;
const SPRING_BOTTOM_MARGIN = 0;
const SPRING_COMPRESS_TIME = 0.2;
const BASE_SPRING_COMPRESS_DISTANCE = 13;
const BASE_SPRING_EJECTION_SPEED = 450;
const BASE_SPRING_LAUNCH_SPEED = 480;
const BASE_SPRING_HIGH_LAUNCH_SPEED = 780;
const GROUND_IDLE_RETURN_SECONDS = 5;
const SPRING_IDLE_BOUNCE_RESET_COUNT = 5;
const BASE_SEEK_RAIL_VISUAL_HEIGHT = 3;
const BASE_SEEK_RAIL_HIT_HEIGHT = 26;
const BASE_SEEK_RAIL_CENTER_OFFSET = 6;
const BASE_SEEK_RAIL_VISUAL_CENTER_OFFSET = 3;
const SEEK_RAIL_VISUAL_Y_NUDGE_PX = 3;
const SEEK_RAIL_FALLBACK_LEFT_INSET_MIN = 72;
const SEEK_RAIL_FALLBACK_LEFT_INSET_MAX = 148;
const SEEK_RAIL_FALLBACK_RIGHT_INSET_MIN = 116;
const SEEK_RAIL_FALLBACK_RIGHT_INSET_MAX = 228;
const BASE_SEEK_TARGET_PADDING = 6;
const BASE_WORLD_HEIGHT = 520;
const MAX_WORLD_SCALE = 1.85;
const START_PROMPT_TEXT = "PRESS J / K TO START";
const OPENING_AIRBORNE_TARGET_SECONDS = 20;
const OPENING_AIRBORNE_MESSAGE = "FOOTLESS BIRD";
const ACHIEVEMENT_BANNER_DURATION_MS = 30000;
const VIDEO_REPLAY_RESET_THRESHOLD_SECONDS = 1.25;
const VIDEO_END_EPSILON_SECONDS = 0.2;
const SEEK_RAIL_SELECTOR_CANDIDATES = [
  ".bpx-player-progress-wrap",
  ".bpx-player-progress",
  ".bpx-player-shadow-progress-area",
  ".bpx-player-shadow-progress-wrap",
  ".bilibili-player-video-progress-wrap",
  ".bilibili-player-video-progress",
  ".squirtle-progress-wrap",
  ".squirtle-progress",
  "[role='slider']"
] as const;

type HudTheme = "dark" | "light";

interface InputState {
  left: boolean;
  right: boolean;
  run: boolean;
  jumpHeld: boolean;
  jumpPressed: boolean;
}

interface HeroState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  runCycle: number;
  skidding: boolean;
  facing: 1 | -1;
  grounded: boolean;
  jumpHoldRemaining: number;
  visible: boolean;
}

type SurfaceKind = "ground" | "platform" | "spring" | null;

interface SpringState {
  active: boolean;
  progress: number;
  x: number;
  prevX: number;
  y: number;
  width: number;
  height: number;
  compression: number;
  compressing: boolean;
  compressionTimer: number;
  launchHigh: boolean;
  controlledCompression: boolean;
}

interface AchievementState {
  openingAirborneActive: boolean;
  openingAirborneUnlocked: boolean;
  bannerText: string;
  bannerUntil: number;
}

interface SeekRailBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

function approach(current: number, target: number, maxDelta: number): number {
  if (current < target) {
    return Math.min(current + maxDelta, target);
  }

  return Math.max(current - maxDelta, target);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseCssColor(
  value: string
): { r: number; g: number; b: number; a: number } | null {
  const match = value.match(/rgba?\(([^)]+)\)/i);
  if (!match) {
    return null;
  }

  const channels = match[1];
  if (!channels) {
    return null;
  }

  const parts = channels
    .split(",")
    .map((part) => Number.parseFloat(part.trim()))
    .filter((part) => Number.isFinite(part));
  if (parts.length < 3) {
    return null;
  }

  return {
    r: parts[0] ?? 0,
    g: parts[1] ?? 0,
    b: parts[2] ?? 0,
    a: parts[3] ?? 1
  };
}

function getColorLuminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const normalize = (channel: number): number => {
    const value = Math.min(Math.max(channel / 255, 0), 1);
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };

  return 0.2126 * normalize(r) + 0.7152 * normalize(g) + 0.0722 * normalize(b);
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  );
}

function isVisibleVideo(video: HTMLVideoElement): boolean {
  const rect = video.getBoundingClientRect();
  return rect.width >= 240 && rect.height >= 135 && rect.bottom > 0 && rect.right > 0;
}

function findActiveVideo(): HTMLVideoElement | null {
  const videos = Array.from(document.querySelectorAll("video")).filter(
    (node): node is HTMLVideoElement => node instanceof HTMLVideoElement && isVisibleVideo(node)
  );

  if (videos.length === 0) {
    return null;
  }

  videos.sort((a, b) => {
    const rectA = a.getBoundingClientRect();
    const rectB = b.getBoundingClientRect();
    return rectB.width * rectB.height - rectA.width * rectA.height;
  });

  return videos[0] ?? null;
}

function createOverlay(): {
  root: HTMLDivElement;
  canvas: HTMLCanvasElement;
  seekRail: HTMLDivElement;
  hudDock: HTMLDivElement;
  hud: HTMLDivElement;
  scoreValue: HTMLSpanElement;
  startPrompt: HTMLDivElement;
  hint: HTMLDivElement;
} {
  const root = document.createElement("div");
  root.id = OVERLAY_ID;
  root.className = "twotwo-girl-danmaku-adventure-root";
  root.hidden = true;

  const canvas = document.createElement("canvas");
  canvas.className = "twotwo-girl-danmaku-adventure-canvas";

  const seekRail = document.createElement("div");
  seekRail.className = "twotwo-girl-danmaku-adventure-seek-rail";
  seekRail.setAttribute("aria-hidden", "true");

  const hudDock = document.createElement("div");
  hudDock.className = "twotwo-girl-danmaku-adventure-hud-dock";
  hudDock.setAttribute("aria-hidden", "true");

  const hud = document.createElement("div");
  hud.className = "twotwo-girl-danmaku-adventure-hud";
  hud.setAttribute("aria-hidden", "true");

  const score = document.createElement("div");
  score.className = "twotwo-girl-danmaku-adventure-score";

  const scoreLabel = document.createElement("span");
  scoreLabel.className = "twotwo-girl-danmaku-adventure-score-label";
  scoreLabel.textContent = "SCORE";

  const scoreValue = document.createElement("span");
  scoreValue.className = "twotwo-girl-danmaku-adventure-score-value";
  scoreValue.textContent = "0";

  score.append(scoreLabel, scoreValue);

  const startPrompt = document.createElement("div");
  startPrompt.className = "twotwo-girl-danmaku-adventure-start";
  startPrompt.textContent = START_PROMPT_TEXT;

  const hint = document.createElement("div");
  hint.className = "twotwo-girl-danmaku-adventure-hint";

  hud.append(score, startPrompt, hint);
  hudDock.append(hud);

  root.append(canvas);
  root.append(seekRail);
  document.documentElement.append(root);
  document.documentElement.append(hudDock);

  return { root, canvas, seekRail, hudDock, hud, scoreValue, startPrompt, hint };
}

function resizeCanvas(canvas: HTMLCanvasElement, width: number, height: number): void {
  const dpr = window.devicePixelRatio || 1;
  const nextWidth = Math.max(1, Math.round(width * dpr));
  const nextHeight = Math.max(1, Math.round(height * dpr));

  if (canvas.width !== nextWidth || canvas.height !== nextHeight) {
    canvas.width = nextWidth;
    canvas.height = nextHeight;
  }
}

function drawSpring(ctx: CanvasRenderingContext2D, spring: SpringState): void {
  const springScale = Math.max(spring.height / BASE_SPRING_HEIGHT, 1);
  const compressionOffset = spring.compression * BASE_SPRING_COMPRESS_DISTANCE * springScale;
  const topY = compressionOffset;
  const plateHeight = Math.max(3, Math.round(4 * springScale));
  const plateInset = 0;
  const plateInnerInset = Math.max(1, Math.round(springScale));
  const bottomY = spring.height - plateHeight;
  const topPlateBottom = topY + plateHeight;
  const bottomPlateTop = bottomY;
  const topApexY = topPlateBottom + Math.max(1, Math.round(springScale));
  const bottomApexY = bottomPlateTop - Math.max(1, Math.round(springScale));
  const coilMidY = (topApexY + bottomApexY) * 0.5;
  const sideAnchorOffset = Math.max(4, Math.round(6 * springScale));
  const leftAnchor = sideAnchorOffset;
  const rightAnchor = spring.width - sideAnchorOffset;
  const centerX = spring.width * 0.5;
  const shineWidth = Math.max(1, Math.round(2 * springScale));
  const linkWidth = Math.max(1, Math.round(2 * springScale));
  const linkHeight = Math.max(3, Math.round(4 * springScale));

  ctx.save();
  ctx.translate(spring.x, spring.y);

  ctx.fillStyle = "#33df33";
  ctx.fillRect(
    plateInset,
    topY,
    spring.width - plateInset * 2,
    plateHeight
  );
  ctx.fillRect(
    plateInset,
    bottomY,
    spring.width - plateInset * 2,
    plateHeight
  );

  ctx.fillStyle = "#9cff9c";
  ctx.fillRect(plateInnerInset + 2, topY + 1, spring.width - plateInnerInset * 2 - 4, 1);
  ctx.fillRect(
    plateInnerInset + 2,
    bottomY + 1,
    spring.width - plateInnerInset * 2 - 4,
    1
  );

  ctx.fillStyle = "#18a918";
  ctx.fillRect(
    plateInnerInset + 2,
    topY + plateHeight - 1,
    spring.width - plateInnerInset * 2 - 4,
    1
  );
  ctx.fillRect(
    plateInnerInset + 2,
    bottomY + plateHeight - 1,
    spring.width - plateInnerInset * 2 - 4,
    1
  );

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(plateInnerInset + 4, topY + Math.max(1, Math.round(2 * springScale)), shineWidth, 1);
  ctx.fillRect(
    spring.width - plateInnerInset - 4 - shineWidth,
    topY + Math.max(1, Math.round(2 * springScale)),
    shineWidth,
    1
  );
  ctx.fillRect(plateInnerInset + 4, bottomY + 1, shineWidth, 1);
  ctx.fillRect(
    spring.width - plateInnerInset - 4 - shineWidth,
    bottomY + 1,
    shineWidth,
    1
  );

  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = Math.max(1, 1.5 * springScale);
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(leftAnchor, coilMidY);
  ctx.lineTo(centerX, topApexY);
  ctx.lineTo(rightAnchor, coilMidY);
  ctx.moveTo(leftAnchor, coilMidY);
  ctx.lineTo(centerX, bottomApexY);
  ctx.lineTo(rightAnchor, coilMidY);
  ctx.stroke();

  ctx.strokeStyle = "#f4fff4";
  ctx.lineWidth = Math.max(1, springScale);
  ctx.beginPath();
  ctx.moveTo(leftAnchor, coilMidY);
  ctx.lineTo(centerX, topApexY);
  ctx.lineTo(rightAnchor, coilMidY);
  ctx.moveTo(leftAnchor, coilMidY);
  ctx.lineTo(centerX, bottomApexY);
  ctx.lineTo(rightAnchor, coilMidY);
  ctx.stroke();

  ctx.fillStyle = "#ff8c1a";
  ctx.fillRect(leftAnchor - linkWidth - 1, coilMidY - linkHeight * 0.5, linkWidth, linkHeight);
  ctx.fillRect(rightAnchor + 1, coilMidY - linkHeight * 0.5, linkWidth, linkHeight);

  ctx.restore();
}

function isLeftKey(key: string): boolean {
  return key === "a" || key === "A" || key === "ArrowLeft";
}

function isRightKey(key: string): boolean {
  return key === "d" || key === "D" || key === "ArrowRight";
}

function isJumpKey(key: string): boolean {
  return key === "w" || key === "W" || key === "k" || key === "K" || key === "ArrowUp" || key === " ";
}

function isStartJumpKey(key: string): boolean {
  return key === "k" || key === "K";
}

function isStartRunKey(key: string): boolean {
  return key === "j" || key === "J";
}

function isRunKey(key: string): boolean {
  return key === "Shift" || key === "j" || key === "J";
}

function hasAnyControlInput(input: InputState): boolean {
  return input.left || input.right || input.run || input.jumpHeld || input.jumpPressed;
}

function getVideoProgress(video: HTMLVideoElement): number {
  if (!Number.isFinite(video.duration) || video.duration <= 0) {
    return 0;
  }

  return Math.min(Math.max(video.currentTime / video.duration, 0), 1);
}

export function createGameController(): { start(): void } {
  const { root, canvas, seekRail, hudDock, hud, scoreValue, startPrompt, hint } = createOverlay();
  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Failed to create 2D context for 22娘弹幕大冒险.");
  }

  const ctx = context;

  const hero: HeroState = {
    x: 60,
    y: 60,
    vx: 0,
    vy: 0,
    runCycle: 0,
    skidding: false,
    facing: 1,
    grounded: false,
    jumpHoldRemaining: 0,
    visible: false
  };

  const input: InputState = {
    left: false,
    right: false,
    run: false,
    jumpHeld: false,
    jumpPressed: false
  };

  let activeVideo: HTMLVideoElement | null = null;
  let activeRect = new DOMRect();
  let platforms: Platform[] = [];
  let platformMap = new Map<string, Platform>();
  let previousPlatformMap = new Map<string, Platform>();
  let platformVelocityXMap = new Map<string, number>();
  const spring: SpringState = {
    active: false,
    progress: 0,
    x: 0,
    prevX: 0,
    y: 0,
    width: BASE_SPRING_WIDTH,
    height: BASE_SPRING_HEIGHT,
    compression: 0,
    compressing: false,
    compressionTimer: 0,
    launchHigh: false,
    controlledCompression: false
  };
  let lastTimestamp = 0;
  let lastPlatformProbeAt = 0;
  let lastVideoRefreshAt = 0;
  let videoRefreshRequested = true;
  let spawnPending = true;
  let currentSurface: SurfaceKind = null;
  let idleGroundSeconds = 0;
  let springBouncesWithoutInput = 0;
  let controlsCaptured = false;
  let draggingSeekRail = false;
  let draggingSeekPointerId: number | null = null;
  let lastPointerClientX: number | null = null;
  let lastPointerClientY: number | null = null;
  let appliedCursor: string | null = null;
  let score = 0;
  let currentPlatformId: string | null = null;
  let currentVideoSessionKey = location.pathname;
  let lastObservedVideoTime = 0;
  let lastObservedVideoEnded = false;
  const scoredPlatformIds = new Set<string>();
  const achievement: AchievementState = {
    openingAirborneActive: false,
    openingAirborneUnlocked: false,
    bannerText: "",
    bannerUntil: 0
  };

  const mutationObserver = new MutationObserver(() => {
    videoRefreshRequested = true;
  });

  function isFullscreenSuppressed(): boolean {
    return document.fullscreenElement instanceof HTMLElement;
  }

  function getOverlayHost(): HTMLElement {
    return document.documentElement;
  }

  function ensureOverlayHost(): void {
    const host = getOverlayHost();
    if (root.parentElement !== host) {
      host.append(root);
    }
  }

  function getHudTheme(): HudTheme {
    const probeElements = [
      getHudInlineAnchor(),
      activeVideo?.parentElement,
      activeVideo,
      document.body,
      document.documentElement
    ];

    for (const element of probeElements) {
      if (!(element instanceof HTMLElement)) {
        continue;
      }

      const backgroundColor = parseCssColor(window.getComputedStyle(element).backgroundColor);
      if (!backgroundColor || backgroundColor.a < 0.45) {
        continue;
      }

      return getColorLuminance(backgroundColor) >= 0.34 ? "light" : "dark";
    }

    return window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  function getHudInlineAnchor(): HTMLElement | null {
    if (!activeVideo) {
      return null;
    }

    const selectors = [
      "#bilibili-player-wrap",
      "#playerWrap",
      "#bilibili-player",
      ".bpx-player-container",
      ".bpx-player-video-area",
      ".bpx-player-video-wrap",
      ".player-wrap",
      ".player-container"
    ] as const;

    for (const selector of selectors) {
      const host = activeVideo.closest<HTMLElement>(selector);
      if (host) {
        return host;
      }
    }

    return activeVideo.parentElement instanceof HTMLElement ? activeVideo.parentElement : null;
  }

  function syncHudDockHost(): void {
    if (!activeVideo || isFullscreenSuppressed()) {
      hudDock.style.display = "none";
      return;
    }

    const rect = activeVideo.getBoundingClientRect();
    if (hudDock.parentElement !== document.documentElement) {
      document.documentElement.append(hudDock);
    }

    hudDock.dataset.mode = "inline";
    hudDock.style.left = `${rect.left}px`;
    hudDock.style.top = `${rect.top}px`;
    hudDock.style.width = `${rect.width}px`;
  }

  function resetScore(nextSessionKey?: string): void {
    score = 0;
    currentPlatformId = null;
    scoredPlatformIds.clear();
    achievement.openingAirborneActive = false;
    achievement.openingAirborneUnlocked = false;
    achievement.bannerText = "";
    achievement.bannerUntil = 0;
    if (nextSessionKey) {
      currentVideoSessionKey = nextSessionKey;
    }
  }

  function clearOpeningAirborneAttempt(): void {
    achievement.openingAirborneActive = false;
  }

  function showAchievementBanner(text: string, now: number): void {
    achievement.bannerText = text;
    achievement.bannerUntil = now + ACHIEVEMENT_BANNER_DURATION_MS;
  }

  function isAchievementBannerVisible(now = performance.now()): boolean {
    if (!achievement.bannerText) {
      return false;
    }

    if (now >= achievement.bannerUntil) {
      achievement.bannerText = "";
      achievement.bannerUntil = 0;
      return false;
    }

    return true;
  }

  function updateOpeningAirborneAchievement(now: number): void {
    if (!activeVideo || achievement.openingAirborneUnlocked || !achievement.openingAirborneActive) {
      return;
    }

    if (hasVideoReachedEnd(activeVideo)) {
      achievement.openingAirborneActive = false;
      achievement.openingAirborneUnlocked = true;
      showAchievementBanner(OPENING_AIRBORNE_MESSAGE, now);
    }
  }

  function hasVideoReachedEnd(video: HTMLVideoElement): boolean {
    if (video.ended) {
      return true;
    }

    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      return false;
    }

    return video.currentTime >= Math.max(video.duration - VIDEO_END_EPSILON_SECONDS, 0);
  }

  function getVideoSessionKey(): string {
    return location.pathname;
  }

  function syncPlaybackRun(): void {
    if (!activeVideo || !hasSeekableDuration(activeVideo)) {
      lastObservedVideoTime = 0;
      lastObservedVideoEnded = false;
      return;
    }

    const currentTime = activeVideo.currentTime;
    const restartedNearBeginning = currentTime <= VIDEO_REPLAY_RESET_THRESHOLD_SECONDS;
    const restartedAfterFinish =
      restartedNearBeginning &&
      (lastObservedVideoEnded || lastObservedVideoTime >= activeVideo.duration - 1.2);

    if (restartedAfterFinish) {
      resetScore();
    }

    lastObservedVideoTime = activeVideo.currentTime;
    lastObservedVideoEnded = hasVideoReachedEnd(activeVideo);
  }

  function getWorldScaleForHeight(videoHeight: number): number {
    if (!Number.isFinite(videoHeight) || videoHeight <= 0) {
      return 1;
    }

    return Math.max(1, Math.min(videoHeight / BASE_WORLD_HEIGHT, MAX_WORLD_SCALE));
  }

  function getWorldScale(): number {
    return getWorldScaleForHeight(activeRect.height);
  }

  function scaleWorld(value: number): number {
    return value * getWorldScale();
  }

  function scaleWorldForHeight(value: number, videoHeight: number): number {
    return value * getWorldScaleForHeight(videoHeight);
  }

  function getHeroWidth(): number {
    return scaleWorld(BASE_HERO_WIDTH);
  }

  function getHeroHeight(): number {
    return scaleWorld(BASE_HERO_HEIGHT);
  }

  function getWalkSpeed(): number {
    return scaleWorld(BASE_WALK_SPEED);
  }

  function getRunSpeed(): number {
    return scaleWorld(BASE_RUN_SPEED);
  }

  function getGroundAcceleration(): number {
    return scaleWorld(BASE_GROUND_ACCELERATION);
  }

  function getRunAcceleration(): number {
    return scaleWorld(BASE_RUN_ACCELERATION);
  }

  function getAirAcceleration(): number {
    return scaleWorld(BASE_AIR_ACCELERATION);
  }

  function getGroundDeceleration(): number {
    return scaleWorld(BASE_GROUND_DECELERATION);
  }

  function getSkidDeceleration(): number {
    return scaleWorld(BASE_SKID_DECELERATION);
  }

  function getAirDeceleration(): number {
    return scaleWorld(BASE_AIR_DECELERATION);
  }

  function getJumpSpeed(): number {
    return scaleWorld(BASE_JUMP_SPEED);
  }

  function getRunJumpBonus(): number {
    return scaleWorld(BASE_RUN_JUMP_BONUS);
  }

  function getGravityAscend(): number {
    return scaleWorld(BASE_GRAVITY_ASCEND);
  }

  function getGravityRelease(): number {
    return scaleWorld(BASE_GRAVITY_RELEASE);
  }

  function getGravityFall(): number {
    return scaleWorld(BASE_GRAVITY_FALL);
  }

  function getSpringWidth(): number {
    return scaleWorld(BASE_SPRING_WIDTH);
  }

  function getSpringHeight(): number {
    return scaleWorld(BASE_SPRING_HEIGHT);
  }

  function getSpringCompressDistance(): number {
    return scaleWorld(BASE_SPRING_COMPRESS_DISTANCE);
  }

  function getSpringEjectionSpeed(): number {
    return scaleWorld(BASE_SPRING_EJECTION_SPEED);
  }

  function getSpringLaunchSpeed(): number {
    return scaleWorld(BASE_SPRING_LAUNCH_SPEED);
  }

  function getSpringHighLaunchSpeed(): number {
    return scaleWorld(BASE_SPRING_HIGH_LAUNCH_SPEED);
  }

  function getSeekRailVisualHeight(): number {
    return scaleWorld(BASE_SEEK_RAIL_VISUAL_HEIGHT);
  }

  function getSeekRailHitHeight(): number {
    return scaleWorld(BASE_SEEK_RAIL_HIT_HEIGHT);
  }

  function getSeekRailCenterOffset(): number {
    return scaleWorld(BASE_SEEK_RAIL_CENTER_OFFSET);
  }

  function getSeekRailVisualCenterOffset(): number {
    return scaleWorld(BASE_SEEK_RAIL_VISUAL_CENTER_OFFSET);
  }

  function getSeekRailFallbackLeftInset(): number {
    return clamp(activeRect.width * 0.12, SEEK_RAIL_FALLBACK_LEFT_INSET_MIN, SEEK_RAIL_FALLBACK_LEFT_INSET_MAX);
  }

  function getSeekRailFallbackRightInset(): number {
    return clamp(activeRect.width * 0.18, SEEK_RAIL_FALLBACK_RIGHT_INSET_MIN, SEEK_RAIL_FALLBACK_RIGHT_INSET_MAX);
  }

  function getNativeSeekRailRect(): DOMRect | null {
    const host = getHudInlineAnchor();
    if (!host) {
      return null;
    }

    const minWidth = Math.max(activeRect.width * 0.35, 120);
    const maxHeight = Math.max(24, activeRect.height * 0.14);
    const searchTop = activeRect.bottom - Math.max(88, activeRect.height * 0.28);
    const searchBottom = activeRect.bottom + 16;

    for (const selector of SEEK_RAIL_SELECTOR_CANDIDATES) {
      const candidates = host.querySelectorAll<HTMLElement>(selector);
      for (const candidate of candidates) {
        const rect = candidate.getBoundingClientRect();
        if (rect.width < minWidth || rect.height <= 0 || rect.height > maxHeight) {
          continue;
        }

        if (rect.bottom < searchTop || rect.top > searchBottom) {
          continue;
        }

        const left = clamp(rect.left, activeRect.left, activeRect.right);
        const right = clamp(rect.right, activeRect.left, activeRect.right);
        if (right - left < minWidth) {
          continue;
        }

        return new DOMRect(left, rect.top, right - left, rect.height);
      }
    }

    return null;
  }

  function getSeekRailBounds(): SeekRailBounds {
    const hitHeight = getSeekRailHitHeight();
    const nativeRect = getNativeSeekRailRect();

    let left = activeRect.left;
    let width = activeRect.width;
    let centerY = activeRect.top + getSeekRailCenterY();

    if (nativeRect) {
      left = nativeRect.left;
      width = nativeRect.width;
      centerY = nativeRect.top + nativeRect.height * 0.5;
    } else {
      const leftInset = getSeekRailFallbackLeftInset();
      const rightInset = getSeekRailFallbackRightInset();
      left = activeRect.left + leftInset;
      width = Math.max(activeRect.width - leftInset - rightInset, Math.min(activeRect.width * 0.28, 160));
    }

    const top = clamp(
      centerY - hitHeight * 0.5,
      activeRect.top,
      Math.max(activeRect.top, activeRect.bottom - hitHeight)
    );

    return {
      left,
      top,
      width: Math.max(width, 1),
      height: hitHeight
    };
  }

  function isPointInsideBounds(clientX: number, clientY: number, bounds: SeekRailBounds): boolean {
    return (
      clientX >= bounds.left &&
      clientX <= bounds.left + bounds.width &&
      clientY >= bounds.top &&
      clientY <= bounds.top + bounds.height
    );
  }

  function getSeekTargetPadding(): number {
    return Math.max(scaleWorld(BASE_SEEK_TARGET_PADDING), 6);
  }

  function getSpringDragBounds(): SeekRailBounds {
    const padding = getSeekTargetPadding();
    return {
      left: activeRect.left + spring.x - padding,
      top: activeRect.top + spring.y - padding,
      width: spring.width + padding * 2,
      height: spring.height + padding * 2
    };
  }

  function getHeroDragBounds(): SeekRailBounds {
    const padding = getSeekTargetPadding();
    const heroWidth = getHeroWidth();
    const heroHeight = getHeroHeight();
    return {
      left: activeRect.left + hero.x - padding,
      top: activeRect.top + hero.y - padding,
      width: heroWidth + padding * 2,
      height: heroHeight + padding * 2
    };
  }

  function isPointInsideSeekRail(clientX: number, clientY: number): boolean {
    return isPointInsideBounds(clientX, clientY, getSeekRailBounds());
  }

  function isPointInsideSeekDragTarget(clientX: number, clientY: number): boolean {
    if (isPointInsideSeekRail(clientX, clientY)) {
      return true;
    }

    if (spring.active && isPointInsideBounds(clientX, clientY, getSpringDragBounds())) {
      return true;
    }

    return hero.visible && isPointInsideBounds(clientX, clientY, getHeroDragBounds());
  }

  function getRunFrameDistance(): number {
    return scaleWorld(24);
  }

  function getCollisionPadding(): number {
    return scaleWorld(4);
  }

  function getSpringLandingTolerance(): number {
    return scaleWorld(8);
  }

  function getOverlayWidth(): number {
    return activeRect.width;
  }

  function getOverlayTop(): number {
    return 0;
  }

  function getOverlayHeight(): number {
    return Math.max(activeRect.bottom - getOverlayTop(), 1);
  }

  function getHeroMinX(): number {
    return 0;
  }

  function getHeroMaxX(): number {
    return activeRect.width - getHeroWidth();
  }

  function getSpringSurfaceY(): number {
    return spring.y + spring.compression * getSpringCompressDistance();
  }

  function getSeekRailCenterY(): number {
    return spring.y + spring.height - getSeekRailCenterOffset();
  }

  function getPlatformById(id: string | null): Platform | null {
    if (!id) {
      return null;
    }

    return platformMap.get(id) ?? null;
  }

  function getPlatformVelocityX(id: string | null): number {
    if (!id) {
      return 0;
    }

    return platformVelocityXMap.get(id) ?? 0;
  }

  function hasSeekableDuration(video: HTMLVideoElement | null): video is HTMLVideoElement {
    return Boolean(video && Number.isFinite(video.duration) && video.duration > 0);
  }

  function canDragSeekRail(): boolean {
    return (
      hasSeekableDuration(activeVideo) &&
      spring.active &&
      hero.visible &&
      !controlsCaptured &&
      currentSurface === "spring" &&
      hero.grounded &&
      !spring.compressing
    );
  }

  function hideOverlay(): void {
    root.hidden = true;
    hudDock.style.display = "none";
    hud.dataset.visible = "false";
    startPrompt.dataset.visible = "false";
    seekRail.style.display = "none";
    syncSeekCursor(true);
    releaseControls();
  }

  function syncSeekRailInteractivity(): void {
    if (!canDragSeekRail()) {
      seekRail.style.display = "none";
      seekRail.dataset.dragging = "false";
      return;
    }

    const seekBounds = getSeekRailBounds();
    seekRail.style.display = "block";
    seekRail.style.left = `${seekBounds.left - activeRect.left}px`;
    seekRail.style.top = `${seekBounds.top}px`;
    seekRail.style.width = `${seekBounds.width}px`;
    seekRail.style.height = `${seekBounds.height}px`;
    seekRail.dataset.dragging = String(draggingSeekRail);
  }

  function syncHud(): void {
    const hudVisible = hero.visible && Boolean(activeVideo) && !isFullscreenSuppressed();
    const achievementVisible = isAchievementBannerVisible();

    syncHudDockHost();
    hudDock.dataset.theme = getHudTheme();
    hudDock.style.display = hudVisible ? "block" : "none";
    hud.dataset.visible = String(hudVisible);
    scoreValue.textContent = String(score);
    startPrompt.dataset.visible = String(hudVisible && (achievementVisible || !controlsCaptured));
    startPrompt.dataset.mode = achievementVisible ? "achievement" : "start";
    startPrompt.textContent = achievementVisible ? achievement.bannerText : START_PROMPT_TEXT;
    hint.textContent = "MOVE: A/D or \u2190/\u2192   RUN: SHIFT/J   JUMP: SPACE/K";
  }

  function stopSeekDragging(): void {
    draggingSeekRail = false;
    draggingSeekPointerId = null;
    seekRail.dataset.dragging = "false";
  }

  function applyDocumentCursor(nextCursor: string | null): void {
    if (appliedCursor === nextCursor) {
      return;
    }

    appliedCursor = nextCursor;
    document.documentElement.style.cursor = nextCursor ?? "";
  }

  function syncSeekCursor(forceReset = false): void {
    if (forceReset || root.hidden || isFullscreenSuppressed()) {
      applyDocumentCursor(null);
      return;
    }

    if (draggingSeekRail) {
      applyDocumentCursor("grabbing");
      return;
    }

    if (
      !canDragSeekRail() ||
      lastPointerClientX === null ||
      lastPointerClientY === null ||
      !isPointInsideSeekDragTarget(lastPointerClientX, lastPointerClientY)
    ) {
      applyDocumentCursor(null);
      return;
    }

    applyDocumentCursor("grab");
  }

  function applySeekFromClientX(clientX: number): void {
    if (!hasSeekableDuration(activeVideo)) {
      return;
    }

    const seekBounds = getSeekRailBounds();
    const progress = Math.min(
      Math.max((clientX - seekBounds.left) / Math.max(seekBounds.width, 1), 0),
      1
    );
    const nextTime = progress * activeVideo.duration;
    activeVideo.currentTime = nextTime;

    spring.progress = progress;
    spring.x = progress * Math.max(activeRect.width - spring.width, 0);
    spring.prevX = spring.x;

    if (currentSurface === "spring" && hero.grounded) {
      mountHeroOnSpring();
      hero.vx = 0;
    }
  }

  function resetSpringBounceCounter(): void {
    springBouncesWithoutInput = 0;
  }

  function releaseControls(): void {
    controlsCaptured = false;
    stopSeekDragging();
    input.left = false;
    input.right = false;
    input.run = false;
    input.jumpHeld = false;
    input.jumpPressed = false;
  }

  function mountHeroOnSpring(): void {
    if (!spring.active) {
      return;
    }

    const heroWidth = getHeroWidth();
    const heroHeight = getHeroHeight();
    const centeredX = spring.x + (spring.width - heroWidth) * 0.5;
    hero.x = Math.max(getHeroMinX(), Math.min(centeredX, getHeroMaxX()));
    hero.y = getSpringSurfaceY() - heroHeight;
    hero.vy = 0;
    hero.runCycle = 0;
    hero.skidding = false;
    hero.grounded = true;
    hero.visible = true;
    hero.jumpHoldRemaining = 0;
    currentSurface = "spring";
    currentPlatformId = null;
    idleGroundSeconds = 0;
  }

  function placeHeroOnSpring(): void {
    clearOpeningAirborneAttempt();
    spring.compressing = false;
    spring.compression = 0;
    spring.compressionTimer = 0;
    spring.launchHigh = false;
    spring.controlledCompression = false;
    spring.prevX = spring.x;

    mountHeroOnSpring();
    hero.vx = 0;
    releaseControls();
    spawnPending = false;
    resetSpringBounceCounter();
  }

  function startSpringCompression(forceHighLaunch: boolean, controlled: boolean): void {
    if (!spring.active) {
      return;
    }

    spring.compressing = true;
    spring.compressionTimer = 0;
    spring.launchHigh = forceHighLaunch;
    spring.controlledCompression = controlled;
    mountHeroOnSpring();
  }

  function launchFromSpring(): void {
    if (spring.controlledCompression) {
      resetSpringBounceCounter();
    } else {
      springBouncesWithoutInput += 1;
      if (springBouncesWithoutInput >= SPRING_IDLE_BOUNCE_RESET_COUNT) {
        placeHeroOnSpring();
        return;
      }
    }

    const heroHeight = getHeroHeight();
    const runJumpRatio = Math.min(Math.abs(hero.vx) / getRunSpeed(), 1);
    const launchSpeed =
      getSpringEjectionSpeed() +
      (spring.launchHigh ? getSpringHighLaunchSpeed() : getSpringLaunchSpeed()) +
      getRunJumpBonus() * runJumpRatio * 0.5;

    hero.y = getSpringSurfaceY() - heroHeight;
    hero.vy = -launchSpeed;
    hero.grounded = false;
    hero.visible = true;
    hero.jumpHoldRemaining = spring.launchHigh ? JUMP_HOLD_TIME : JUMP_HOLD_TIME * 0.45;
    currentSurface = null;
    idleGroundSeconds = 0;
    if (
      activeVideo &&
      activeVideo.currentTime <= OPENING_AIRBORNE_TARGET_SECONDS &&
      !achievement.openingAirborneUnlocked
    ) {
      achievement.openingAirborneActive = true;
    }
    spring.compressing = false;
    spring.compression = 0;
    spring.compressionTimer = 0;
    spring.launchHigh = false;
    spring.controlledCompression = false;
    input.jumpPressed = false;
  }

  function resetHero(width: number, height: number): void {
    const heroHeight = scaleWorldForHeight(BASE_HERO_HEIGHT, height);
    hero.x = Math.max(scaleWorldForHeight(24, height), width * 0.2);
    hero.y = Math.max(0, height - heroHeight - scaleWorldForHeight(8, height));
    hero.vx = 0;
    hero.vy = 0;
    hero.runCycle = 0;
    hero.skidding = false;
    hero.grounded = true;
    hero.jumpHoldRemaining = 0;
    hero.visible = false;
    clearOpeningAirborneAttempt();
    currentSurface = null;
    idleGroundSeconds = 0;
    spring.compressing = false;
    spring.compression = 0;
    spring.compressionTimer = 0;
    spring.launchHigh = false;
    spring.controlledCompression = false;
    spawnPending = true;
    releaseControls();
    resetSpringBounceCounter();
  }

  function syncActiveVideo(now: number): void {
    ensureOverlayHost();
    syncHudDockHost();

    const nextSessionKey = getVideoSessionKey();
    const sessionChanged = nextSessionKey !== currentVideoSessionKey;
    if (sessionChanged) {
      resetScore(nextSessionKey);
    }

    const shouldRefresh =
      videoRefreshRequested || !activeVideo || now - lastVideoRefreshAt >= VIDEO_REFRESH_INTERVAL;

    if (!shouldRefresh) {
      return;
    }

    const nextVideo = findActiveVideo();
    const changed = nextVideo !== activeVideo;

    activeVideo = nextVideo;
    lastVideoRefreshAt = now;
    videoRefreshRequested = false;

    if (!activeVideo) {
      root.hidden = true;
      hudDock.style.display = "none";
      platforms = [];
      platformMap.clear();
      previousPlatformMap.clear();
      platformVelocityXMap.clear();
      spring.active = false;
      currentSurface = null;
      idleGroundSeconds = 0;
      spawnPending = true;
      releaseControls();
      lastObservedVideoTime = 0;
      lastObservedVideoEnded = false;
      return;
    }

    if (changed || sessionChanged) {
      lastObservedVideoTime = activeVideo.currentTime;
      lastObservedVideoEnded = hasVideoReachedEnd(activeVideo);
    } else {
      syncPlaybackRun();
    }

    if (isFullscreenSuppressed()) {
      hideOverlay();
      return;
    }

    const nextRect = activeVideo.getBoundingClientRect();
    if (changed || nextRect.width !== activeRect.width || nextRect.height !== activeRect.height) {
      platforms = [];
      platformMap.clear();
      previousPlatformMap.clear();
      platformVelocityXMap.clear();
      lastPlatformProbeAt = 0;
      activeRect = nextRect;
      resetHero(nextRect.width, nextRect.height);
    }
  }

  function updateOverlayGeometry(): boolean {
    if (!activeVideo || isFullscreenSuppressed()) {
      hideOverlay();
      return false;
    }

    activeRect = activeVideo.getBoundingClientRect();
    if (activeRect.width < 240 || activeRect.height < 135) {
      hideOverlay();
      return false;
    }

    root.hidden = false;
    root.style.left = `${activeRect.left}px`;
    root.style.top = `${getOverlayTop()}px`;
    root.style.width = `${getOverlayWidth()}px`;
    root.style.height = `${getOverlayHeight()}px`;
    resizeCanvas(canvas, getOverlayWidth(), getOverlayHeight());
    return true;
  }

  function updateSpring(dt: number): void {
    spring.prevX = spring.x;

    if (!activeVideo) {
      spring.active = false;
      return;
    }

    spring.progress = getVideoProgress(activeVideo);
    spring.width = getSpringWidth();
    spring.height = getSpringHeight();
    spring.y = Math.max(0, activeRect.height - spring.height - SPRING_BOTTOM_MARGIN);
    spring.x = spring.progress * Math.max(activeRect.width - spring.width, 0);
    spring.active = true;

    if (spring.compressing) {
      spring.compressionTimer = Math.min(spring.compressionTimer + dt, SPRING_COMPRESS_TIME);
      spring.compression = spring.compressionTimer / SPRING_COMPRESS_TIME;
      mountHeroOnSpring();

      if (spring.compressionTimer >= SPRING_COMPRESS_TIME) {
        launchFromSpring();
      }
    } else {
      spring.compression = 0;
      spring.compressionTimer = 0;
    }

    if (spawnPending) {
      placeHeroOnSpring();
    }
  }

  function updatePlatforms(now: number): void {
    if (!activeVideo) {
      platforms = [];
      platformMap.clear();
      previousPlatformMap.clear();
      platformVelocityXMap.clear();
      return;
    }

    if (now - lastPlatformProbeAt >= PLATFORM_PROBE_INTERVAL) {
      const probeDeltaSeconds =
        lastPlatformProbeAt > 0 ? Math.max((now - lastPlatformProbeAt) / 1000, 1 / 240) : PLATFORM_PROBE_INTERVAL / 1000;

      previousPlatformMap = platformMap;
      platforms = sampleDanmakuPlatforms(activeRect);
      platformMap = new Map(platforms.map((platform) => [platform.id, platform]));
      platformVelocityXMap = new Map(
        platforms.map((platform) => {
          const previousPlatform = previousPlatformMap.get(platform.id);
          const velocityX = previousPlatform ? (platform.x - previousPlatform.x) / probeDeltaSeconds : 0;
          return [platform.id, velocityX];
        })
      );
      lastPlatformProbeAt = now;
    }
  }

  function syncDebugDataset(): void {
    root.dataset.platformCount = String(platforms.length);
    root.dataset.heroX = hero.x.toFixed(1);
    root.dataset.heroY = hero.y.toFixed(1);
    root.dataset.heroVx = hero.vx.toFixed(1);
    root.dataset.heroVy = hero.vy.toFixed(1);
    root.dataset.grounded = String(hero.grounded);
    root.dataset.heroVisible = String(hero.visible);
    root.dataset.videoWidth = activeRect.width.toFixed(1);
    root.dataset.videoHeight = activeRect.height.toFixed(1);
    root.dataset.run = String(input.run);
    root.dataset.springX = spring.x.toFixed(1);
    root.dataset.springY = spring.y.toFixed(1);
    root.dataset.springCompression = spring.compression.toFixed(2);
    root.dataset.surface = currentSurface ?? "";
    root.dataset.overlayWidth = getOverlayWidth().toFixed(1);
    root.dataset.overlayHeight = getOverlayHeight().toFixed(1);
    root.dataset.seekDragEnabled = String(canDragSeekRail());
  }

  function updateHero(dt: number): void {
    if (!hero.visible) {
      input.jumpPressed = false;
      return;
    }

    const heroWidth = getHeroWidth();
    const heroHeight = getHeroHeight();
    const walkSpeed = getWalkSpeed();
    const runSpeed = getRunSpeed();
    const runJumpBonus = getRunJumpBonus();
    const collisionPadding = getCollisionPadding();
    const springLandingTolerance = getSpringLandingTolerance();
    const springHorizontalPadding = Math.max(collisionPadding, scaleWorld(8));

    if (
      currentSurface === "spring" &&
      hero.grounded &&
      spring.active &&
      !spring.compressing
    ) {
      hero.x += spring.x - spring.prevX;
      hero.y = getSpringSurfaceY() - heroHeight;
    } else if (currentSurface === "platform" && hero.grounded && currentPlatformId) {
      const currentPlatform = getPlatformById(currentPlatformId);
      if (currentPlatform) {
        hero.x += getPlatformVelocityX(currentPlatformId) * dt;
        hero.y = currentPlatform.y - heroHeight;
      }
    }

    const moveDirection = Number(input.right) - Number(input.left);
    const maxSpeed = input.run ? runSpeed : walkSpeed;
    const targetVelocity = moveDirection * maxSpeed;
    const reversingDirection =
      moveDirection !== 0 &&
      Math.sign(hero.vx) !== moveDirection &&
      Math.abs(hero.vx) > scaleWorld(8);

    if (moveDirection === 0) {
      hero.vx = approach(hero.vx, 0, (hero.grounded ? getGroundDeceleration() : getAirDeceleration()) * dt);
    } else {
      const acceleration = hero.grounded
        ? (reversingDirection ? getSkidDeceleration() : (input.run ? getRunAcceleration() : getGroundAcceleration()))
        : getAirAcceleration();
      hero.vx = approach(hero.vx, targetVelocity, acceleration * dt);
    }

    if (hero.vx > scaleWorld(5)) {
      hero.facing = 1;
    } else if (hero.vx < -scaleWorld(5)) {
      hero.facing = -1;
    }

    hero.skidding =
      hero.grounded &&
      currentSurface !== "spring" &&
      moveDirection !== 0 &&
      reversingDirection &&
      Math.abs(hero.vx) > walkSpeed * 0.55;

    if (hero.grounded && currentSurface !== "spring" && Math.abs(hero.vx) >= scaleWorld(18)) {
      hero.runCycle = (hero.runCycle + (Math.abs(hero.vx) * dt) / getRunFrameDistance()) % 3;
    } else if (hero.grounded) {
      hero.runCycle = 0;
    }

    if (input.jumpPressed && hero.grounded && currentSurface === "spring") {
      startSpringCompression(input.jumpHeld || input.run, true);
      input.jumpPressed = false;
      return;
    }

    if (input.jumpPressed && hero.grounded) {
      const runJumpRatio = Math.min(Math.abs(hero.vx) / runSpeed, 1);
      hero.vy = -(getJumpSpeed() + runJumpBonus * runJumpRatio);
      hero.grounded = false;
      hero.jumpHoldRemaining = JUMP_HOLD_TIME;
      currentSurface = null;
      idleGroundSeconds = 0;
    }

    const gravity = hero.grounded
      ? 0
      : hero.vy < 0
        ? (input.jumpHeld && hero.jumpHoldRemaining > 0 ? getGravityAscend() : getGravityRelease())
        : getGravityFall();
    hero.vy += gravity * dt;
    hero.jumpHoldRemaining = Math.max(0, hero.jumpHoldRemaining - dt);

    const previousBottom = hero.y + heroHeight;

    hero.x += hero.vx * dt;
    hero.y += hero.vy * dt;

    hero.x = Math.max(getHeroMinX(), Math.min(hero.x, getHeroMaxX()));

    let grounded = false;
    let landingY = activeRect.height - heroHeight;
    let landingSurface: SurfaceKind = "ground";
    let landingPlatformId: string | null = null;

    const isStandingOnSpring =
      currentSurface === "spring" &&
      spring.active &&
      !spring.compressing &&
      hero.x + heroWidth > spring.x - springHorizontalPadding &&
      hero.x < spring.x + spring.width + springHorizontalPadding &&
      Math.abs(hero.y + heroHeight - getSpringSurfaceY()) <= springLandingTolerance &&
      hero.vy >= 0;

    if (isStandingOnSpring) {
      grounded = true;
      landingY = getSpringSurfaceY() - heroHeight;
      landingSurface = "spring";
    }

    if (!grounded && hero.vy >= 0) {
      const nextBottom = hero.y + heroHeight;

      if (
        spring.active &&
        !spring.compressing &&
        previousBottom < spring.y - scaleWorld(1) &&
        nextBottom >= getSpringSurfaceY() &&
        hero.x + heroWidth > spring.x - springHorizontalPadding &&
        hero.x < spring.x + spring.width + springHorizontalPadding
      ) {
        clearOpeningAirborneAttempt();
        mountHeroOnSpring();
        startSpringCompression(input.jumpHeld || input.run, hasAnyControlInput(input));
        input.jumpPressed = false;
        return;
      }

      let bestLandingY = Number.POSITIVE_INFINITY;

      for (const platform of platforms) {
        const withinHorizontalRange =
          hero.x + heroWidth > platform.x - collisionPadding &&
          hero.x < platform.x + platform.width + collisionPadding;
        const crossedPlatformTop =
          previousBottom <= platform.y + scaleWorld(6) && nextBottom >= platform.y;

        if (!withinHorizontalRange || !crossedPlatformTop) {
          continue;
        }

        const candidateLandingY = platform.y - heroHeight;
        if (candidateLandingY < bestLandingY) {
          bestLandingY = candidateLandingY;
          landingPlatformId = platform.id;
        }
      }

      if (bestLandingY !== Number.POSITIVE_INFINITY) {
        grounded = true;
        landingY = bestLandingY;
        landingSurface = "platform";
      } else if (nextBottom >= activeRect.height) {
        grounded = true;
        landingY = activeRect.height - heroHeight;
        landingSurface = "ground";
      }
    }

    if (grounded) {
      if (landingSurface === "ground" || landingSurface === "spring") {
        clearOpeningAirborneAttempt();
      }

      hero.y = landingY;
      hero.vy = 0;
      hero.grounded = true;
      hero.jumpHoldRemaining = 0;
      currentSurface = landingSurface;
      if (landingSurface === "platform") {
        if (landingPlatformId && landingPlatformId !== currentPlatformId) {
          currentPlatformId = landingPlatformId;
          if (!scoredPlatformIds.has(landingPlatformId)) {
            scoredPlatformIds.add(landingPlatformId);
            score += 1;
          }
        }
      } else {
        currentPlatformId = null;
      }
      if (landingSurface !== "spring") {
        resetSpringBounceCounter();
      }
    } else {
      hero.grounded = false;
      currentSurface = null;
      currentPlatformId = null;
    }

    if (hero.x <= getHeroMinX() || hero.x >= getHeroMaxX()) {
      hero.vx = 0;
    }

    if (hero.y > activeRect.height + scaleWorld(100)) {
      resetHero(activeRect.width, activeRect.height);
    }

    if (
      hero.grounded &&
      currentSurface === "ground" &&
      !hasAnyControlInput(input) &&
      Math.abs(hero.vx) <= 1
    ) {
      idleGroundSeconds += dt;
      if (idleGroundSeconds >= GROUND_IDLE_RETURN_SECONDS && spring.active) {
        placeHeroOnSpring();
      }
    } else {
      idleGroundSeconds = 0;
    }

    input.jumpPressed = false;
  }

  function render(): void {
    syncDebugDataset();
    syncSeekRailInteractivity();
    syncHud();
    syncSeekCursor();

    const dpr = window.devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, getOverlayWidth(), getOverlayHeight());

    ctx.save();
    ctx.translate(0, activeRect.top - getOverlayTop());
    if (canDragSeekRail()) {
      const railHeight = getSeekRailVisualHeight();
      const railCenterY = spring.y + spring.height - getSeekRailVisualCenterOffset();
      const railY = Math.round(railCenterY - railHeight * 0.5) + SEEK_RAIL_VISUAL_Y_NUDGE_PX;
      ctx.fillStyle = "rgba(15, 23, 42, 0.18)";
      ctx.fillRect(0, railY, activeRect.width, railHeight);
      ctx.fillStyle = "rgba(248, 250, 252, 0.34)";
      ctx.fillRect(0, railY, spring.x + spring.width * 0.5, railHeight);
    }
    if (spring.active) {
      drawSpring(ctx, spring);
    }
    if (hero.visible) {
      drawHero(ctx, hero.x, hero.y, getHeroWidth(), getHeroHeight(), {
        facing: hero.facing,
        grounded: hero.grounded,
        vx: hero.vx / getWorldScale(),
        runCycle: hero.runCycle,
        onSpring: currentSurface === "spring",
        skidding: hero.skidding
      });
    }
    ctx.restore();
  }

  function tick(now: number): void {
    if (lastTimestamp === 0) {
      lastTimestamp = now;
    }

    const dt = Math.min((now - lastTimestamp) / 1000, 1 / 24);
    lastTimestamp = now;

    syncActiveVideo(now);
    updateOpeningAirborneAchievement(now);

    if (updateOverlayGeometry()) {
      updateSpring(dt);
      updatePlatforms(now);
      updateHero(dt);
      render();
    }

    window.requestAnimationFrame(tick);
  }

  function handleKeyDown(event: KeyboardEvent): void {
    if (root.hidden || isFullscreenSuppressed() || isEditableTarget(event.target)) {
      return;
    }

    let handled = false;
    if (isJumpKey(event.key)) {
      if (!hero.visible) {
        return;
      }

      if (!controlsCaptured && !isStartJumpKey(event.key)) {
        return;
      }

      controlsCaptured = true;
      if (!event.repeat && !input.jumpHeld) {
        input.jumpPressed = true;
      }
      input.jumpHeld = true;
      handled = true;
    } else if (isRunKey(event.key)) {
      if (!hero.visible) {
        return;
      }

      const startingFromRunKey = !controlsCaptured && isStartRunKey(event.key);
      if (!controlsCaptured && !startingFromRunKey) {
        return;
      }

      controlsCaptured = true;
      input.run = true;
      if (startingFromRunKey && !event.repeat) {
        input.jumpPressed = true;
      }
      handled = true;
    } else if (isLeftKey(event.key)) {
      if (!controlsCaptured) {
        return;
      }

      input.left = true;
      handled = true;
    } else if (isRightKey(event.key)) {
      if (!controlsCaptured) {
        return;
      }

      input.right = true;
      handled = true;
    } else if (!controlsCaptured) {
      return;
    }

    if (handled) {
      resetSpringBounceCounter();
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleKeyUp(event: KeyboardEvent): void {
    if (root.hidden || isFullscreenSuppressed()) {
      return;
    }

    let handled = false;
    if (isJumpKey(event.key)) {
      if (!controlsCaptured) {
        return;
      }

      input.jumpHeld = false;
      handled = true;
    } else if (!controlsCaptured) {
      return;
    } else if (isLeftKey(event.key)) {
      input.left = false;
      handled = true;
    } else if (isRightKey(event.key)) {
      input.right = false;
      handled = true;
    } else if (isRunKey(event.key)) {
      input.run = false;
      handled = true;
    }

    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function handleSeekPointerDown(event: PointerEvent): void {
    lastPointerClientX = event.clientX;
    lastPointerClientY = event.clientY;

    if (!canDragSeekRail() || event.button !== 0) {
      syncSeekCursor();
      return;
    }

    if (!isPointInsideSeekDragTarget(event.clientX, event.clientY)) {
      syncSeekCursor();
      return;
    }

    draggingSeekRail = true;
    draggingSeekPointerId = event.pointerId;
    applySeekFromClientX(event.clientX);
    syncSeekRailInteractivity();
    syncSeekCursor();
    event.preventDefault();
    event.stopPropagation();
  }

  function handleSeekPointerMove(event: PointerEvent): void {
    lastPointerClientX = event.clientX;
    lastPointerClientY = event.clientY;

    if (!draggingSeekRail || draggingSeekPointerId !== event.pointerId) {
      syncSeekCursor();
      return;
    }

    applySeekFromClientX(event.clientX);
    syncSeekRailInteractivity();
    syncSeekCursor();
    event.preventDefault();
    event.stopPropagation();
  }

  function handleSeekPointerUp(event: PointerEvent): void {
    lastPointerClientX = event.clientX;
    lastPointerClientY = event.clientY;

    if (!draggingSeekRail || draggingSeekPointerId !== event.pointerId) {
      syncSeekCursor();
      return;
    }

    applySeekFromClientX(event.clientX);
    stopSeekDragging();
    syncSeekRailInteractivity();
    syncSeekCursor();
    event.preventDefault();
    event.stopPropagation();
  }

  function start(): void {
    document.addEventListener("fullscreenchange", () => {
      if (isFullscreenSuppressed()) {
        hideOverlay();
      }
      videoRefreshRequested = true;
    });
    window.addEventListener("keydown", handleKeyDown, { capture: true });
    window.addEventListener("keyup", handleKeyUp, { capture: true });
    window.addEventListener("pointerdown", handleSeekPointerDown, { capture: true });
    window.addEventListener("pointermove", handleSeekPointerMove, { capture: true });
    window.addEventListener("pointerup", handleSeekPointerUp, { capture: true });
    window.addEventListener("pointercancel", handleSeekPointerUp, { capture: true });
    mutationObserver.observe(document.documentElement, {
      childList: true,
      subtree: true
    });
    window.requestAnimationFrame(tick);
  }

  return { start };
}
