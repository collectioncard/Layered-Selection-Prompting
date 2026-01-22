import {
  FeatureGenerator,
  completedSection,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const MIN_CASTLE_WIDTH = 3;
const MIN_CASTLE_HEIGHT = 3;
const DEFAULT_CASTLE_WIDTH = 5;
const DEFAULT_CASTLE_HEIGHT = 5;
const BORDER_PADDING = 1;

// Castle tile IDs for detection
const CASTLE_TILE_IDS = new Set([
  // Roof tiles
  96, 97, 98, 99, 100, 101, 102, 103, 108, 109, 110, 120, 121, 122,
  // Wall tiles
  108, 109, 110, 126,
  // Gate/Door tiles
  111, 112, 123, 124,
  // Window
  125,
]);

/**
 * Detects if there are any castle tiles in the given grid area.
 * Returns info about existing castles if found.
 */
function detectExistingCastles(grid: number[][]): {
  hasCastle: boolean;
  castleTileCount: number;
  occupiedTiles: Set<string>; // Set of "x,y" strings for quick lookup
} {
  let castleTileCount = 0;
  const occupiedTiles = new Set<string>();

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      const tileId = grid[y][x];
      if (tileId >= 0 && CASTLE_TILE_IDS.has(tileId)) {
        castleTileCount++;
        occupiedTiles.add(`${x},${y}`);
      }
    }
  }

  return { hasCastle: castleTileCount > 0, castleTileCount, occupiedTiles };
}

/**
 * Checks if a castle of given dimensions can be placed at position (x, y)
 * without overlapping existing castles or going out of bounds.
 */
function canPlaceCastleAt(
  x: number,
  y: number,
  width: number,
  height: number,
  gridWidth: number,
  gridHeight: number,
  occupiedTiles: Set<string>,
): boolean {
  // Check bounds
  if (x < BORDER_PADDING || y < BORDER_PADDING) return false;
  if (x + width > gridWidth - BORDER_PADDING) return false;
  if (y + height > gridHeight - BORDER_PADDING) return false;

  // Check for overlap with existing castles
  for (let dy = 0; dy < height; dy++) {
    for (let dx = 0; dx < width; dx++) {
      if (occupiedTiles.has(`${x + dx},${y + dy}`)) {
        return false;
      }
    }
  }

  return true;
}

/**
 * Finds a valid position to place a castle of given dimensions.
 * Returns null if no valid position exists.
 */
function findValidCastlePosition(
  width: number,
  height: number,
  gridWidth: number,
  gridHeight: number,
  occupiedTiles: Set<string>,
  preferredX?: number,
  preferredY?: number,
): { x: number; y: number } | null {
  // If preferred position is specified and valid, use it
  if (preferredX !== undefined && preferredY !== undefined) {
    if (
      canPlaceCastleAt(
        preferredX,
        preferredY,
        width,
        height,
        gridWidth,
        gridHeight,
        occupiedTiles,
      )
    ) {
      return { x: preferredX, y: preferredY };
    }
    // Preferred position is not valid, will try to find another
  }

  // Collect all valid positions
  const validPositions: { x: number; y: number }[] = [];

  for (let y = BORDER_PADDING; y <= gridHeight - height - BORDER_PADDING; y++) {
    for (let x = BORDER_PADDING; x <= gridWidth - width - BORDER_PADDING; x++) {
      if (
        canPlaceCastleAt(
          x,
          y,
          width,
          height,
          gridWidth,
          gridHeight,
          occupiedTiles,
        )
      ) {
        validPositions.push({ x, y });
      }
    }
  }

  if (validPositions.length === 0) {
    return null;
  }

  // Pick a random valid position
  return validPositions[Math.floor(Math.random() * validPositions.length)];
}

// Extended result type that includes castle placement details
interface CastleGenerationResult extends completedSection {
  castleDetails: {
    x: number;
    y: number;
    width: number;
    height: number;
    gateCount: number;
    windowCount: number;
  };
}

export class CastleGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  static readonly castleArgsSchema = z.object({
    x: z.number().optional(),
    y: z.number().optional(),
    width: z
      .number()
      .min(MIN_CASTLE_WIDTH)
      .max(20)
      .default(DEFAULT_CASTLE_WIDTH),
    height: z
      .number()
      .min(MIN_CASTLE_HEIGHT)
      .max(20)
      .default(DEFAULT_CASTLE_HEIGHT),
    gateCount: z.number().min(1).max(4).optional(),
    windowCount: z.number().min(0).max(20).default(2),
  });

  toolCall = tool(
    async (args: z.infer<typeof CastleGenerator.castleArgsSchema>) => {
      console.log("Generating castle with args:", args);
      const scene = this.sceneGetter();
      if (!scene) return "Error: Tool Failed - No reference to scene.";

      // Use getCurrentTileState to get the LIVE state of tiles (including recently placed castles)
      const currentState = scene.getCurrentTileState();
      const selection = scene.getSelection();

      // Determine castle dimensions (default to 5x5)
      const castleWidth = args?.width ?? DEFAULT_CASTLE_WIDTH;
      const castleHeight = args?.height ?? DEFAULT_CASTLE_HEIGHT;

      // Validate selection size can fit at least one castle
      if (
        currentState.width < castleWidth + BORDER_PADDING * 2 ||
        currentState.height < castleHeight + BORDER_PADDING * 2
      ) {
        return (
          `Error: Selection is too small for a ${castleWidth}x${castleHeight} castle. ` +
          `Minimum required: ${castleWidth + BORDER_PADDING * 2}x${castleHeight + BORDER_PADDING * 2} tiles.`
        );
      }

      // Detect existing castles and find occupied tiles
      const existingCastles = detectExistingCastles(currentState.grid);

      // Find a valid position that doesn't overlap with existing castles
      const validPosition = findValidCastlePosition(
        castleWidth,
        castleHeight,
        currentState.width,
        currentState.height,
        existingCastles.occupiedTiles,
        args?.x,
        args?.y,
      );

      if (!validPosition) {
        return (
          `Error: Cannot place a ${castleWidth}x${castleHeight} castle - no valid space available!\n` +
          `- Selection size: ${currentState.width}x${currentState.height}\n` +
          `- Existing castle tiles: ${existingCastles.castleTileCount}\n` +
          `- Try a smaller castle size, or select a larger/different area.`
        );
      }

      // Override the position with the valid one we found
      const adjustedArgs = {
        ...args,
        x: validPosition.x,
        y: validPosition.y,
        width: castleWidth,
        height: castleHeight,
      };

      try {
        const result = this.generate(selection, adjustedArgs);
        const castleInfo = result.castleDetails;

        const placementResult = await scene.putFeatureAtSelection(result);

        const gateX = castleInfo.x + Math.floor(castleInfo.width / 2);
        const gateY = castleInfo.y + castleInfo.height - 1;

        const positionNote =
          args?.x !== undefined &&
          args?.y !== undefined &&
          (args.x !== validPosition.x || args.y !== validPosition.y)
            ? `\n- Note: Position adjusted from (${args.x}, ${args.y}) to avoid overlap`
            : "";

        // Check if placement was fully successful, partially successful, or failed
        if (placementResult.placed === 0 && placementResult.total > 0) {
          return (
            `Castle placement failed!\n` +
            `- Position: (${castleInfo.x}, ${castleInfo.y}) in local coordinates\n` +
            `- Size: ${castleInfo.width}x${castleInfo.height} tiles\n` +
            `- Reason: All ${placementResult.total} tiles were blocked by higher-priority existing tiles.\n` +
            `- Suggestion: Use the clear tool first or choose a different location.`
          );
        } else if (placementResult.skipped > 0) {
          return (
            `Castle partially placed.\n` +
            `- Position: (${castleInfo.x}, ${castleInfo.y}) in local coordinates\n` +
            `- Size: ${castleInfo.width}x${castleInfo.height} tiles\n` +
            `- Tiles placed: ${placementResult.placed}/${placementResult.total}\n` +
            `- Tiles blocked: ${placementResult.skipped} (by higher-priority tiles)\n` +
            `- Gates: ${castleInfo.gateCount}\n` +
            `- Windows: ${castleInfo.windowCount}\n` +
            `- Warning: Castle may be incomplete or damaged` +
            positionNote
          );
        }

        return (
          `Castle successfully placed!\n` +
          `- Position: (${castleInfo.x}, ${castleInfo.y}) in local coordinates\n` +
          `- Size: ${castleInfo.width}x${castleInfo.height} tiles (width x height)\n` +
          `- Tiles placed: ${placementResult.placed}\n` +
          `- Gates: ${castleInfo.gateCount}\n` +
          `- Windows: ${castleInfo.windowCount}\n` +
          `- Gate/connection point: (${gateX}, ${gateY})` +
          positionNote
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place castle - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "castle",
      schema: CastleGenerator.castleArgsSchema,
      description:
        "Adds a castle to the map. Multiple castles can be placed in the same selection - " +
        "they will automatically be positioned to avoid overlapping.\n\n" +
        "Parameters:\n" +
        "- x, y: preferred local position (optional, will auto-adjust if overlapping)\n" +
        "- width, height: castle dimensions in tiles, min 3 (optional, default 5x5)\n" +
        "- gateCount: number of gates 1-4 (optional, default 1)\n" +
        "- windowCount: number of windows 0-20 (optional, default 2)",
    },
  );

  generate(
    mapSection: generatorInput,
    args?: z.infer<typeof CastleGenerator.castleArgsSchema>,
  ): CastleGenerationResult {
    const grid = mapSection.grid;
    const points_of_interest = new Map<string, { x: number; y: number }>();
    console.log(grid);

    // Use provided dimensions or default to 5x5
    const castleWidth = args?.width ?? DEFAULT_CASTLE_WIDTH;
    const castleHeight = args?.height ?? DEFAULT_CASTLE_HEIGHT;

    // Use provided position or random (toolCall already ensures valid position)
    const castleX =
      args?.x ??
      Phaser.Math.Between(
        BORDER_PADDING,
        Math.max(
          BORDER_PADDING,
          mapSection.width - castleWidth - BORDER_PADDING,
        ),
      );
    const castleY =
      args?.y ??
      Phaser.Math.Between(
        BORDER_PADDING,
        Math.max(
          BORDER_PADDING,
          mapSection.height - castleHeight - BORDER_PADDING,
        ),
      );

    // --- Roof Tiles ---
    // Top row: corners and edges
    let y = castleY;
    grid[y][castleX] = 96; // Top-left corner
    if (castleWidth > 2) {
      // Fill middle with roof tiles (97 for center, or 109 for extended)
      for (let x = castleX + 1; x < castleX + castleWidth - 1; x++) {
        grid[y][x] = 97; // Top center/edge
      }
    }
    grid[y][castleX + castleWidth - 1] = 98; // Top-right corner

    // Second row: bottom of roof
    y = castleY + 1;
    grid[y][castleX] = 120; // Bottom-left corner of roof
    if (castleWidth > 2) {
      for (let x = castleX + 1; x < castleX + castleWidth - 1; x++) {
        grid[y][x] = 121; // Bottom center of roof
      }
    }
    grid[y][castleX + castleWidth - 1] = 122; // Bottom-right corner of roof

    // --- Wall Tiles ---
    const windowCount = args?.windowCount ?? 2;
    const wallTiles: { x: number; y: number }[] = [];

    // Left and right walls
    for (y = castleY + 2; y < castleY + castleHeight - 1; y++) {
      grid[y][castleX] = 108; // Left wall
      grid[y][castleX + castleWidth - 1] = 110; // Right wall

      // Collect middle wall tiles for windows
      for (let x = castleX + 1; x < castleX + castleWidth - 1; x++) {
        wallTiles.push({ x, y });
      }
    }

    // Place stone walls (126) in middle sections
    const shuffledWallTiles = Phaser.Utils.Array.Shuffle(wallTiles);
    const windowTiles = shuffledWallTiles.slice(0, windowCount);

    // Fill wall tiles
    for (const { x, y } of wallTiles) {
      const isWindow = windowTiles.some((tile) => tile.x === x && tile.y === y);
      grid[y][x] = isWindow ? 125 : 109; // Window (125) or center wall (109)
    }

    // Bottom row: gates and walls
    const gateCount = args?.gateCount ?? 1;
    const bottomY = castleY + castleHeight - 1;
    const possibleGateXPositions = [];
    for (let x = castleX + 1; x < castleX + castleWidth - 1; x++) {
      possibleGateXPositions.push(x);
    }

    const shuffledGates = Phaser.Utils.Array.Shuffle(
      possibleGateXPositions,
    ).slice(0, gateCount);

    // Place gates (2x2 gate tiles: 111, 112 on top, 123, 124 on bottom)
    shuffledGates.forEach((gateX, index) => {
      // Top of gate
      grid[bottomY - 1][gateX] = 111; // Top-left gate
      if (gateX + 1 < castleX + castleWidth - 1) {
        grid[bottomY - 1][gateX + 1] = 112; // Top-right gate
      } else {
        // If gate is at edge, just use single gate tile
        grid[bottomY - 1][gateX] = 111;
      }

      // Bottom of gate
      grid[bottomY][gateX] = 123; // Bottom-left gate
      if (gateX + 1 < castleX + castleWidth - 1) {
        grid[bottomY][gateX + 1] = 124; // Bottom-right gate
      } else {
        grid[bottomY][gateX] = 123;
      }

      points_of_interest.set(`gate${index + 1}`, {
        x: gateX,
        y: bottomY,
      });
    });

    // Fill remaining bottom row with stone walls (126)
    for (let x = castleX; x < castleX + castleWidth; x++) {
      // Skip gate positions
      const isGatePosition = shuffledGates.some(
        (gx) => x === gx || x === gx + 1,
      );
      if (!isGatePosition) {
        if (x === castleX || x === castleX + castleWidth - 1) {
          grid[bottomY][x] = 108; // Left/right wall
        } else {
          grid[bottomY][x] = 126; // Stone wall
        }
      }
    }

    return {
      name: "Castle",
      description: `A castle with ${gateCount} gate(s) and ${windowCount} window(s)`,
      grid,
      points_of_interest,
      castleDetails: {
        x: castleX,
        y: castleY,
        width: castleWidth,
        height: castleHeight,
        gateCount,
        windowCount,
      },
    };
  }
}
