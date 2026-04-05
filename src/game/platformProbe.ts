import type { Platform } from "./types";

const DANMAKU_SELECTORS = [
  '[role="comment"]',
  ".bili-dm",
  ".danmaku-item",
  ".bpx-player-row-dm-wrap > *",
  ".bpx-player-dm-wrap > *"
] as const;

const MAX_PLATFORM_COUNT = 60;

interface PlatformIdentity {
  id: string;
  label: string;
  lastLeft: number;
  lastTop: number;
  lastSeenAt: number;
}

const platformIdentities = new WeakMap<HTMLElement, PlatformIdentity>();
let nextPlatformId = 1;

function createPlatformId(): string {
  return `danmaku-${nextPlatformId++}`;
}

function intersects(a: DOMRect, b: DOMRect): boolean {
  return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
}

function clampRectToPlayer(rect: DOMRect, playerRect: DOMRect): DOMRect | null {
  const left = Math.max(rect.left, playerRect.left);
  const top = Math.max(rect.top, playerRect.top);
  const right = Math.min(rect.right, playerRect.right);
  const bottom = Math.min(rect.bottom, playerRect.bottom);

  if (right <= left || bottom <= top) {
    return null;
  }

  return new DOMRect(left, top, right - left, bottom - top);
}

function isVisibleDanmaku(node: HTMLElement): boolean {
  const text = node.textContent?.trim();
  if (!text) {
    return false;
  }

  const style = window.getComputedStyle(node);
  if (
    style.display === "none" ||
    style.visibility === "hidden" ||
    Number.parseFloat(style.opacity || "1") <= 0
  ) {
    return false;
  }

  const rect = node.getBoundingClientRect();
  return rect.width >= 12 && rect.height >= 8;
}

function getPlatformIdentity(
  node: HTMLElement,
  label: string,
  rect: DOMRect,
  playerRect: DOMRect
): string {
  const now = performance.now();
  const existing = platformIdentities.get(node);

  if (!existing) {
    const nextIdentity: PlatformIdentity = {
      id: createPlatformId(),
      label,
      lastLeft: rect.left,
      lastTop: rect.top,
      lastSeenAt: now
    };
    platformIdentities.set(node, nextIdentity);
    return nextIdentity.id;
  }

  const largeRightJump = rect.left - existing.lastLeft > Math.max(playerRect.width * 0.18, 96);
  const laneChanged = Math.abs(rect.top - existing.lastTop) > Math.max(rect.height * 1.2, 18);
  const wasFarOffscreenLeft = existing.lastLeft + rect.width < playerRect.left - 24;
  const reenteredFromRight = rect.left > playerRect.left + playerRect.width * 0.62;
  const labelChanged = label !== existing.label;
  const recycled =
    largeRightJump ||
    (wasFarOffscreenLeft && reenteredFromRight) ||
    (labelChanged && (laneChanged || reenteredFromRight || now - existing.lastSeenAt > 240));

  if (recycled) {
    existing.id = createPlatformId();
  }

  existing.label = label;
  existing.lastLeft = rect.left;
  existing.lastTop = rect.top;
  existing.lastSeenAt = now;
  return existing.id;
}

export function sampleDanmakuPlatforms(playerRect: DOMRect): Platform[] {
  const seen = new Set<HTMLElement>();
  const platforms: Platform[] = [];

  for (const selector of DANMAKU_SELECTORS) {
    const nodes = document.querySelectorAll<HTMLElement>(selector);
    for (const node of nodes) {
      if (seen.has(node) || !isVisibleDanmaku(node)) {
        continue;
      }

      seen.add(node);

      const rect = node.getBoundingClientRect();
      if (!intersects(rect, playerRect)) {
        continue;
      }

      const clipped = clampRectToPlayer(rect, playerRect);
      if (!clipped) {
        continue;
      }

      const label = node.textContent?.trim() ?? "";
      const stableId = getPlatformIdentity(node, label, rect, playerRect);

      platforms.push({
        id: stableId,
        x: clipped.left - playerRect.left,
        y: clipped.top - playerRect.top,
        width: clipped.width,
        height: clipped.height,
        label
      });
    }
  }

  platforms.sort((a, b) => a.y - b.y || a.x - b.x);
  return platforms.slice(0, MAX_PLATFORM_COUNT);
}
