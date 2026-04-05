from __future__ import annotations

import argparse
import math
from collections import Counter
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw

TARGET_WIDTH = 8
TARGET_HEIGHT = 16
UPSCALE_DEBUG = 24

FRAME_FILES = {
    "idle": "原版静态站立帧.jpg",
    "run1": "原版跑步帧1.jpg",
    "run2": "原版跑步帧2.jpg",
    "run3": "原版跑步帧3.jpg",
    "jump": "原版起跳中帧.jpg",
    "skid": "原版助跑或急刹帧.jpg",
}

FINAL_COLORS = {
    ".": None,
    "H": (201, 75, 50),
    "O": (47, 105, 201),
    "B": (111, 74, 22),
    "S": (240, 178, 74),
}


def luminance(rgb: tuple[int, int, int]) -> float:
    r, g, b = rgb
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def quantize_image(image: Image.Image) -> Image.Image:
    return image.convert("RGB").quantize(colors=8).convert("RGB")


def border_pixels(image: Image.Image) -> Iterable[tuple[int, int, int]]:
    width, height = image.size
    for x in range(width):
        yield image.getpixel((x, 0))
        yield image.getpixel((x, height - 1))
    for y in range(1, height - 1):
        yield image.getpixel((0, y))
        yield image.getpixel((width - 1, y))


def dominant_border_colors(image: Image.Image) -> tuple[tuple[int, int, int], tuple[int, int, int]]:
    width, height = image.size
    inset = 8
    corner_samples = [
        image.getpixel((inset, inset)),
        image.getpixel((width - inset - 1, inset)),
        image.getpixel((inset, height - inset - 1)),
        image.getpixel((width - inset - 1, height - inset - 1)),
    ]
    background = Counter(corner_samples).most_common(1)[0][0]
    counts = Counter(border_pixels(image)).most_common()
    grid = next(color for color, _ in counts if color != background and luminance(color) < 120)
    return background, grid


def group_positions(mask: list[bool]) -> list[int]:
    positions: list[int] = []
    start: int | None = None
    for index, is_line in enumerate(mask):
        if is_line and start is None:
            start = index
        elif not is_line and start is not None:
            positions.append((start + index - 1) // 2)
            start = None

    if start is not None:
        positions.append((start + len(mask) - 1) // 2)

    return positions


def detect_grid_lines(image: Image.Image, grid_color: tuple[int, int, int]) -> tuple[list[int], list[int]]:
    width, height = image.size
    def darkness_scores(axis: str) -> list[float]:
        if axis == "x":
            scores = []
            for x in range(width):
                total = 0.0
                for y in range(height):
                    total += 255 - luminance(image.getpixel((x, y)))
                scores.append(total / height)
            return scores

        scores = []
        for y in range(height):
            total = 0.0
            for x in range(width):
                total += 255 - luminance(image.getpixel((x, y)))
            scores.append(total / width)
        return scores

    def periodic_lines(scores: list[float]) -> list[int]:
        best_score = float("-inf")
        best_spacing = 0
        best_offset = 0
        for spacing in range(12, 42):
            for offset in range(spacing):
                indices = range(offset, len(scores), spacing)
                values = [scores[index] for index in indices]
                if not values:
                    continue
                score = sum(values) / len(values)
                if score > best_score:
                    best_score = score
                    best_spacing = spacing
                    best_offset = offset

        positions: list[int] = []
        start = best_offset
        while start - best_spacing >= 0:
            start -= best_spacing

        candidate = start
        while candidate < len(scores):
            left = max(0, candidate - 3)
            right = min(len(scores) - 1, candidate + 3)
            refined = max(range(left, right + 1), key=lambda index: scores[index])
            if not positions or refined - positions[-1] > best_spacing * 0.5:
                positions.append(refined)
            candidate += best_spacing
        return positions

    columns = periodic_lines(darkness_scores("x"))
    rows = periodic_lines(darkness_scores("y"))
    if len(columns) < 3 or len(rows) < 3:
        raise RuntimeError("Failed to detect enough grid lines from screenshot.")
    return columns, rows


def sample_cells(
    image: Image.Image,
    columns: list[int],
    rows: list[int],
    background: tuple[int, int, int],
    grid_color: tuple[int, int, int],
) -> list[list[tuple[int, int, int]]]:
    cells: list[list[tuple[int, int, int]]] = []
    for row_index in range(len(rows) - 1):
        row: list[tuple[int, int, int]] = []
        y0 = rows[row_index] + 1
        y1 = rows[row_index + 1]
        for column_index in range(len(columns) - 1):
            x0 = columns[column_index] + 1
            x1 = columns[column_index + 1]
            counts: Counter[tuple[int, int, int]] = Counter()
            for y in range(y0, y1):
                for x in range(x0, x1):
                    color = image.getpixel((x, y))
                    if color == grid_color:
                        continue
                    counts[color] += 1
            row.append(counts.most_common(1)[0][0] if counts else background)
        cells.append(row)
    return cells


def trim_bbox(cells: list[list[tuple[int, int, int]]], background: tuple[int, int, int]) -> tuple[list[list[tuple[int, int, int]]], tuple[int, int]]:
    non_bg = [
        (x, y)
        for y, row in enumerate(cells)
        for x, color in enumerate(row)
        if color != background
    ]
    left = min(x for x, _ in non_bg)
    right = max(x for x, _ in non_bg)
    top = min(y for _, y in non_bg)
    bottom = max(y for _, y in non_bg)
    cropped = [row[left : right + 1] for row in cells[top : bottom + 1]]
    return cropped, (left, top)


def upper_anchor_x(cells: list[list[tuple[int, int, int]]], background: tuple[int, int, int]) -> float:
    height = len(cells)
    upper_limit = max(1, math.ceil(height * 0.6))
    xs = [
        x
        for y, row in enumerate(cells[:upper_limit])
        for x, color in enumerate(row)
        if color != background
    ]
    return sum(xs) / len(xs)


def normalize_canvas(
    cells: list[list[tuple[int, int, int]]],
    background: tuple[int, int, int],
    global_anchor_x: float,
    canvas_width: int,
    canvas_height: int,
) -> list[list[tuple[int, int, int]]]:
    height = len(cells)
    width = len(cells[0])
    canvas = [[background for _ in range(canvas_width)] for _ in range(canvas_height)]
    anchor_x = upper_anchor_x(cells, background)
    x_offset = round(global_anchor_x - anchor_x)
    y_offset = canvas_height - height
    for y, row in enumerate(cells):
        for x, color in enumerate(row):
            target_x = x + x_offset
            target_y = y + y_offset
            if 0 <= target_x < canvas_width and 0 <= target_y < canvas_height:
                canvas[target_y][target_x] = color
    return canvas


def area_downsample(cells: list[list[tuple[int, int, int]]]) -> list[list[tuple[int, int, int]]]:
    source_height = len(cells)
    source_width = len(cells[0])
    output: list[list[tuple[int, int, int]]] = []
    for target_y in range(TARGET_HEIGHT):
        row: list[tuple[int, int, int]] = []
        y0 = target_y * source_height / TARGET_HEIGHT
        y1 = (target_y + 1) * source_height / TARGET_HEIGHT
        for target_x in range(TARGET_WIDTH):
            x0 = target_x * source_width / TARGET_WIDTH
            x1 = (target_x + 1) * source_width / TARGET_WIDTH
            weights: Counter[tuple[int, int, int]] = Counter()
            for source_y in range(math.floor(y0), math.ceil(y1)):
                overlap_y = max(0.0, min(y1, source_y + 1) - max(y0, source_y))
                if overlap_y <= 0:
                    continue
                for source_x in range(math.floor(x0), math.ceil(x1)):
                    overlap_x = max(0.0, min(x1, source_x + 1) - max(x0, source_x))
                    if overlap_x <= 0:
                        continue
                    weight = overlap_x * overlap_y
                    weights[cells[source_y][source_x]] += int(weight * 1000)
            row.append(weights.most_common(1)[0][0])
        output.append(row)
    return output


def classify_color(
    color: tuple[int, int, int], background: tuple[int, int, int]
) -> str:
    if color == background:
        return "."

    r, g, b = color
    if r > 185 and g > 130 and b < 120:
        return "S"
    if r > g * 1.25 and r > b * 1.2:
        return "R"
    return "B"


def recolor_frame(classes: list[list[str]]) -> list[str]:
    rows: list[str] = []
    for y, row in enumerate(classes):
        chars = []
        for x, cell in enumerate(row):
            if cell == ".":
                chars.append(".")
            elif cell == "S":
                chars.append("S")
            elif cell == "R":
                chars.append("H" if y <= 3 else "O")
            else:
                chars.append("B")
        rows.append("".join(chars))
    return rows


def write_debug_image(rows: list[str], output_path: Path) -> None:
    image = Image.new("RGBA", (TARGET_WIDTH * UPSCALE_DEBUG, TARGET_HEIGHT * UPSCALE_DEBUG), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)
    for y, row in enumerate(rows):
        for x, cell in enumerate(row):
            rgb = FINAL_COLORS[cell]
            if rgb is None:
                continue
            draw.rectangle(
                (
                    x * UPSCALE_DEBUG,
                    y * UPSCALE_DEBUG,
                    (x + 1) * UPSCALE_DEBUG - 1,
                    (y + 1) * UPSCALE_DEBUG - 1,
                ),
                fill=rgb,
            )
    image.save(output_path)


def write_typescript(frames: dict[str, list[str]], output_path: Path) -> None:
    lines = [
        "export const SPRITE_WIDTH = 8;",
        "export const SPRITE_HEIGHT = 16;",
        "",
        "export const FRAMES = {",
    ]
    for name, rows in frames.items():
        lines.append(f"  {name}: [")
        for row in rows:
            lines.append(f'    "{row}",')
        lines.append("  ],")
    lines.extend(
        [
            "} as const;",
            "",
            "export type FrameName = keyof typeof FRAMES;",
        ]
    )
    output_path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input_dir", type=Path)
    parser.add_argument("output_dir", type=Path)
    args = parser.parse_args()

    args.output_dir.mkdir(parents=True, exist_ok=True)

    frame_data = {}
    processed = []
    anchor_values = []
    backgrounds = {}
    max_width = 0
    max_height = 0

    for frame_name, filename in FRAME_FILES.items():
        image = quantize_image(Image.open(args.input_dir / filename))
        background, grid_color = dominant_border_colors(image)
        columns, rows = detect_grid_lines(image, grid_color)
        cells = sample_cells(image, columns, rows, background, grid_color)
        cropped, _ = trim_bbox(cells, background)
        frame_data[frame_name] = cropped
        anchor_values.append(upper_anchor_x(cropped, background))
        backgrounds[frame_name] = background
        processed.append((frame_name, cropped))
        max_width = max(max_width, len(cropped[0]))
        max_height = max(max_height, len(cropped))

    global_anchor_x = sum(anchor_values) / len(anchor_values)
    output_frames = {}
    canvas_width = max_width
    canvas_height = max_height

    for frame_name, cropped in processed:
        background = backgrounds[frame_name]
        normalized = normalize_canvas(
            cropped,
            background,
            global_anchor_x,
            canvas_width,
            canvas_height,
        )
        downsampled = area_downsample(normalized)
        classes = [
            [classify_color(color, background) for color in row]
            for row in downsampled
        ]
        rows = recolor_frame(classes)
        output_frames[frame_name] = rows
        write_debug_image(rows, args.output_dir / f"{frame_name}.png")

    write_typescript(output_frames, args.output_dir / "heroFrames.ts")


if __name__ == "__main__":
    main()
