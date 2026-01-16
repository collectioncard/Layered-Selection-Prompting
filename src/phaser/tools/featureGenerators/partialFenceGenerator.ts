import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const PADDING = 1;

// Tile IDs for fence pieces
const TILES = {
  TOP: 45,
  TOP_LEFT: 44,
  TOP_RIGHT: 46,
  BOTTOM: 45,
  BOTTOM_LEFT: 68,
  BOTTOM_RIGHT: 70,
  LEFT: 56,
  RIGHT: 56,
  GATE: 69,
} as const;

const FENCE_TILE_IDS = new Set([44, 45, 46, 56, 68, 70]);

type EdgeName = "top" | "bottom" | "left" | "right";
const ALL_EDGES: EdgeName[] = ["top", "bottom", "left", "right"];

/** Returns a random trim amount (0 to ~1/3 of length) with 40% probability */
function randomTrim(length: number): number {
  const maxTrim = Math.max(0, Math.floor(length / 3));
  if (maxTrim <= 0 || Math.random() > 0.4) return 0;
  return Math.floor(Math.random() * maxTrim) + 1;
}

/** Clamp combined trims so at least 1 tile remains */
function clampTrims(
  trimA: number,
  trimB: number,
  length: number,
): [number, number] {
  if (trimA + trimB >= length) {
    const excess = trimA + trimB - length + 1;
    if (trimA > 0 && trimB > 0) {
      const reduceA = Math.min(trimA, Math.ceil(excess / 2));
      const reduceB = Math.min(trimB, excess - reduceA);
      return [trimA - reduceA, trimB - reduceB];
    }
    if (trimA > 0) return [Math.max(0, length - 1 - trimB), trimB];
    if (trimB > 0) return [trimA, Math.max(0, length - 1 - trimA)];
  }
  return [trimA, trimB];
}

/** Parse edges string into validated array */
function parseEdges(edges?: string): EdgeName[] {
  return (edges ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e): e is EdgeName => ALL_EDGES.includes(e as EdgeName));
}

/** Get tile ID for a position on an edge, handling corners */
function getEdgeTile(
  pos: number,
  start: number,
  end: number,
  cornerStart: number,
  cornerEnd: number,
  middle: number,
): number {
  if (pos === start) return cornerStart;
  if (pos === end) return cornerEnd;
  return middle;
}

export class PartialFenceGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  private lastFenceX = 0;
  private lastFenceY = 0;
  private lastHorizontalLength = 0;
  private lastVerticalLength = 0;
  private lastGateX = 0;
  private lastGateOnTop = false;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({ edges }: { edges?: string }) => {
      const scene = this.sceneGetter();
      if (!scene) return "Error: Tool Failed - No reference to scene.";

      const selection = scene.getSelection();
      const minSize = 3 + PADDING * 2;
      if (selection.width < minSize || selection.height < minSize) {
        return `Error: Selection too small for fence. Minimum required: ${minSize}x${minSize} tiles.`;
      }

      try {
        const parsedEdges = parseEdges(edges);
        const result = this.generate(selection, {
          edges: parsedEdges.join(","),
        });

        // Try to place gate if top/bottom requested
        let gatePlaced = false;
        const canHaveGate =
          parsedEdges.includes("top") || parsedEdges.includes("bottom");

        if (canHaveGate) {
          const gateEdge = parsedEdges.includes("top") ? "top" : "bottom";
          const gateX = Math.max(
            PADDING + 1,
            Math.min(
              selection.width - PADDING - 2,
              Math.floor(selection.width / 2),
            ),
          );
          const gateY =
            gateEdge === "top" ? PADDING : selection.height - PADDING - 1;

          this.lastGateOnTop = gateEdge === "top";
          this.lastGateX = gateX;

          // Only insert gate if there's a fence tile at that position
          const preTile = result.grid[gateY]?.[gateX];
          if (preTile !== undefined && FENCE_TILE_IDS.has(preTile)) {
            result.grid[gateY][gateX] = TILES.GATE;

            // Verify after placement
            const placementResult = await scene.putFeatureAtSelection(result);
            const startX = Math.min(
              scene.selectionStart?.x ?? 0,
              scene.selectionEnd?.x ?? 0,
            );
            const startY = Math.min(
              scene.selectionStart?.y ?? 0,
              scene.selectionEnd?.y ?? 0,
            );
            gatePlaced =
              scene.getTileAtGlobal(startX + gateX, startY + gateY) ===
              TILES.GATE;

            return this.buildResponse(parsedEdges, placementResult, gatePlaced);
          }
        }

        const placementResult = await scene.putFeatureAtSelection(result);
        return this.buildResponse(parsedEdges, placementResult, gatePlaced);
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place partial fence - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "broken_fence",
      schema: z.object({
        edges: z
          .string()
          .optional()
          .describe(
            "Which edges to include (comma-separated: top,bottom,left,right)",
          ),
      }),
      description:
        "Adds a partial/broken fence. Specify edges as comma-separated string (e.g. 'top,left').",
    },
  );

  private buildResponse(
    parsedEdges: EdgeName[],
    placementResult: { placed: number; skipped: number; total: number },
    gatePlaced: boolean,
  ): string {
    const openEdges = ALL_EDGES.filter((e) => !parsedEdges.includes(e));
    const openLine = `- Open sides: ${openEdges.length > 0 ? openEdges.join(", ") : "none"}`;

    const gateEdgeName = this.lastGateOnTop ? "top" : "bottom";
    const gateLine = gatePlaced
      ? `- Gate: placed on ${gateEdgeName} edge at x=${this.lastGateX}\n`
      : "";

    const baseInfo =
      `- Position: starts at local (${this.lastFenceX}, ${this.lastFenceY})\n` +
      `- Horizontal length: ${this.lastHorizontalLength} tiles\n` +
      `- Vertical length: ${this.lastVerticalLength} tiles\n`;

    if (placementResult.total > 0 && placementResult.placed === 0) {
      return (
        `Partial fence placement failed!\n` +
        baseInfo +
        `- Reason: All ${placementResult.total} tiles were blocked by higher-priority existing tiles.\n` +
        `- Suggestion: Use the clear tool first or choose a different location.`
      );
    }

    if (placementResult.skipped > 0) {
      return (
        `Partial fence partially placed.\n` +
        baseInfo +
        `- Tiles placed: ${placementResult.placed}/${placementResult.total}\n` +
        `- Tiles blocked: ${placementResult.skipped} (by higher-priority tiles)\n` +
        gateLine +
        openLine
      );
    }

    return (
      `Partial fence placed successfully!\n` +
      baseInfo +
      `- Tiles placed: ${placementResult.placed}\n` +
      gateLine +
      openLine
    );
  }

  generate(
    mapSection: generatorInput,
    args?: { edges?: string },
  ): completedSection {
    const edges = parseEdges(args?.edges);
    const { width, height } = mapSection;
    const grid: number[][] = Array.from({ length: height }, () =>
      new Array(width).fill(-1),
    );

    this.lastFenceX = PADDING;
    this.lastFenceY = PADDING;
    this.lastHorizontalLength = Math.max(0, width - PADDING * 2);
    this.lastVerticalLength = Math.max(0, height - PADDING * 2);

    const xStart = PADDING;
    const xEnd = width - PADDING - 1;
    const yStart = PADDING;
    const yEnd = height - PADDING - 1;

    // Build edges
    if (edges.includes("top")) {
      for (let x = xStart; x <= xEnd; x++) {
        grid[yStart][x] = getEdgeTile(
          x,
          xStart,
          xEnd,
          TILES.TOP_LEFT,
          TILES.TOP_RIGHT,
          TILES.TOP,
        );
      }
    }

    if (edges.includes("bottom")) {
      for (let x = xStart; x <= xEnd; x++) {
        grid[yEnd][x] = getEdgeTile(
          x,
          xStart,
          xEnd,
          TILES.BOTTOM_LEFT,
          TILES.BOTTOM_RIGHT,
          TILES.BOTTOM,
        );
      }
    }

    if (edges.includes("left")) {
      for (let y = yStart; y <= yEnd; y++) {
        grid[y][xStart] = getEdgeTile(
          y,
          yStart,
          yEnd,
          TILES.TOP_LEFT,
          TILES.BOTTOM_LEFT,
          TILES.LEFT,
        );
      }
    }

    if (edges.includes("right")) {
      for (let y = yStart; y <= yEnd; y++) {
        grid[y][xEnd] = getEdgeTile(
          y,
          yStart,
          yEnd,
          TILES.TOP_RIGHT,
          TILES.BOTTOM_RIGHT,
          TILES.RIGHT,
        );
      }
    }

    // Apply degradation trims to non-connecting ends
    this.applyTrims(grid, edges, { xStart, xEnd, yStart, yEnd });

    return {
      name: "broken_fence",
      description: `A partial fence on edges: ${edges.join(", ") || "none"}`,
      grid,
      points_of_interest: new Map(),
    };
  }

  private applyTrims(
    grid: number[][],
    edges: EdgeName[],
    bounds: { xStart: number; xEnd: number; yStart: number; yEnd: number },
  ): void {
    const { xStart, xEnd, yStart, yEnd } = bounds;
    const hLen = xEnd - xStart + 1;
    const vLen = yEnd - yStart + 1;

    // Horizontal edges (top/bottom)
    if (edges.includes("top")) {
      this.trimHorizontalEdge(grid, edges, yStart, xStart, xEnd, hLen);
    }
    if (edges.includes("bottom")) {
      this.trimHorizontalEdge(grid, edges, yEnd, xStart, xEnd, hLen);
    }

    // Vertical edges (left/right)
    if (edges.includes("left")) {
      this.trimVerticalEdge(grid, edges, xStart, yStart, yEnd, vLen);
    }
    if (edges.includes("right")) {
      this.trimVerticalEdge(grid, edges, xEnd, yStart, yEnd, vLen);
    }
  }

  private trimHorizontalEdge(
    grid: number[][],
    edges: EdgeName[],
    y: number,
    xStart: number,
    xEnd: number,
    length: number,
  ): void {
    let trimLeft = edges.includes("left") ? 0 : randomTrim(length);
    let trimRight = edges.includes("right") ? 0 : randomTrim(length);
    [trimLeft, trimRight] = clampTrims(trimLeft, trimRight, length);

    for (let i = 0; i < trimLeft; i++) grid[y][xStart + i] = -1;
    for (let i = 0; i < trimRight; i++) grid[y][xEnd - i] = -1;
  }

  private trimVerticalEdge(
    grid: number[][],
    edges: EdgeName[],
    x: number,
    yStart: number,
    yEnd: number,
    length: number,
  ): void {
    let trimTop = edges.includes("top") ? 0 : randomTrim(length);
    let trimBottom = edges.includes("bottom") ? 0 : randomTrim(length);
    [trimTop, trimBottom] = clampTrims(trimTop, trimBottom, length);

    for (let i = 0; i < trimTop; i++) grid[yStart + i][x] = -1;
    for (let i = 0; i < trimBottom; i++) grid[yEnd - i][x] = -1;
  }
}
