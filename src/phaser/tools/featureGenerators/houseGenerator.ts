import {
  FeatureGenerator,
  completedSection,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const MIN_HOUSE_WIDTH = 3;
const MIN_HOUSE_HEIGHT = 3;
const DEFAULT_HOUSE_WIDTH = 4;
const DEFAULT_HOUSE_HEIGHT = 4;
const BORDER_PADDING = 1;

// House tile IDs for detection (both brown and grey variants)
const HOUSE_TILE_IDS = new Set([
  // Red roof tiles
  52,
  53,
  54,
  55, // top roof row
  64,
  65,
  66,
  67, // bottom roof row
  // Grey roof tiles
  48,
  49,
  50,
  51, // top roof row
  60,
  61,
  62,
  63, // bottom roof row
  // Grey wall tiles
  76,
  77,
  78,
  79, // walls
  88,
  89, // window, door
  // Brown wall tiles
  72,
  73,
  74,
  75, // walls
  84,
  85, // window, door
]);

/**
 * Detects if there are any house tiles in the given grid area.
 * Returns info about existing houses if found.
 */
function detectExistingHouses(grid: number[][]): {
  hasHouse: boolean;
  houseTileCount: number;
  occupiedTiles: Set<string>; // Set of "x,y" strings for quick lookup
} {
  let houseTileCount = 0;
  const occupiedTiles = new Set<string>();

  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      const tileId = grid[y][x];
      if (tileId >= 0 && HOUSE_TILE_IDS.has(tileId)) {
        houseTileCount++;
        occupiedTiles.add(`${x},${y}`);
      }
    }
  }

  return { hasHouse: houseTileCount > 0, houseTileCount, occupiedTiles };
}

/**
 * Checks if a house of given dimensions can be placed at position (x, y)
 * without overlapping existing houses or going out of bounds.
 */
function canPlaceHouseAt(
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

  // Check for overlap with existing houses
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
 * Finds a valid position to place a house of given dimensions.
 * Returns null if no valid position exists.
 */
function findValidHousePosition(
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
      canPlaceHouseAt(
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
        canPlaceHouseAt(
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

// Extended result type that includes house placement details
interface HouseGenerationResult extends completedSection {
  houseDetails: {
    x: number;
    y: number;
    width: number;
    height: number;
    isRedRoof: boolean;
    wallOffset: number;
    chimneyX: number;
  };
}

let points_of_interest = new Map();

export class HouseGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  static readonly houseArgsSchema = z.object({
    style: z.enum(["brown", "grey"]).optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    width: z.number().min(MIN_HOUSE_WIDTH).max(20).default(DEFAULT_HOUSE_WIDTH),
    height: z
      .number()
      .min(MIN_HOUSE_HEIGHT)
      .max(20)
      .default(DEFAULT_HOUSE_HEIGHT),
    roof: z.enum(["red", "grey"]).optional(),
    doorCount: z.number().min(1).max(4).optional(),
    windowCount: z.number().min(0).max(20).default(3),
  });

  toolCall = tool(
    async (args: z.infer<typeof HouseGenerator.houseArgsSchema>) => {
      console.log("Generating house with args:", args);
      const scene = this.sceneGetter();
      if (!scene) return "Error: Tool Failed - No reference to scene.";

      // Use getCurrentTileState to get the LIVE state of tiles (including recently placed houses)
      const currentState = scene.getCurrentTileState();
      const selection = scene.getSelection();

      // Determine house dimensions (default to 4x4)
      const houseWidth = args?.width ?? DEFAULT_HOUSE_WIDTH;
      const houseHeight = args?.height ?? DEFAULT_HOUSE_HEIGHT;

      // Validate selection size can fit at least one house
      if (
        currentState.width < houseWidth + BORDER_PADDING * 2 ||
        currentState.height < houseHeight + BORDER_PADDING * 2
      ) {
        return (
          `Error: Selection is too small for a ${houseWidth}x${houseHeight} house. ` +
          `Minimum required: ${houseWidth + BORDER_PADDING * 2}x${houseHeight + BORDER_PADDING * 2} tiles.`
        );
      }

      // Detect existing houses and find occupied tiles
      const existingHouses = detectExistingHouses(currentState.grid);

      // Find a valid position that doesn't overlap with existing houses
      const validPosition = findValidHousePosition(
        houseWidth,
        houseHeight,
        currentState.width,
        currentState.height,
        existingHouses.occupiedTiles,
        args?.x,
        args?.y,
      );

      if (!validPosition) {
        return (
          `Error: Cannot place a ${houseWidth}x${houseHeight} house - no valid space available!\n` +
          `- Selection size: ${currentState.width}x${currentState.height}\n` +
          `- Existing house tiles: ${existingHouses.houseTileCount}\n` +
          `- Try a smaller house size, or select a larger/different area.`
        );
      }

      // Override the position with the valid one we found
      const adjustedArgs = {
        ...args,
        x: validPosition.x,
        y: validPosition.y,
        width: houseWidth,
        height: houseHeight,
      };

      try {
        const result = this.generate(selection, adjustedArgs);
        const houseInfo = result.houseDetails;

        await scene.putFeatureAtSelection(result);

        // Use the house details from the result
        const actualStyle =
          args?.style ?? (houseInfo.wallOffset === 0 ? "grey" : "brown");
        const actualRoof = houseInfo.isRedRoof ? "red" : "grey";
        const doorX = houseInfo.x + Math.floor(houseInfo.width / 2);
        const doorY = houseInfo.y + houseInfo.height;

        const positionNote =
          args?.x !== undefined &&
          args?.y !== undefined &&
          (args.x !== validPosition.x || args.y !== validPosition.y)
            ? `\n- Note: Position adjusted from (${args.x}, ${args.y}) to avoid overlap`
            : "";

        return (
          `House successfully placed!\n` +
          `- Position: (${houseInfo.x}, ${houseInfo.y}) in local coordinates\n` +
          `- Size: ${houseInfo.width}x${houseInfo.height} tiles (width x height)\n` +
          `- Style: ${actualStyle} walls with ${actualRoof} roof\n` +
          `- Windows: ${args?.windowCount ?? 0}\n` +
          `- Doors: ${args?.doorCount ?? 1}\n` +
          `- Door/connection point: (${doorX}, ${doorY})\n` +
          `- Chimney: present at x=${houseInfo.chimneyX >= 0 ? houseInfo.x + houseInfo.chimneyX : "none"}` +
          positionNote
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place house - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "house",
      schema: HouseGenerator.houseArgsSchema,
      description:
        "Adds a house to the map. Multiple houses can be placed in the same selection - " +
        "they will automatically be positioned to avoid overlapping.\n\n" +
        "Parameters:\n" +
        "- style: 'brown' or 'grey' wall style (optional, random if not specified)\n" +
        "- roof: 'red' or 'grey' roof color (optional, defaults based on wall style)\n" +
        "- x, y: preferred local position (optional, will auto-adjust if overlapping)\n" +
        "- width, height: house dimensions in tiles, min 3 (optional, default 4x4)\n" +
        "- doorCount: number of doors 1-4 (optional, default 1)\n" +
        "- windowCount: number of windows 0-20 (required)",
    },
  );

  generate(
    mapSection: generatorInput,
    args?: z.infer<typeof HouseGenerator.houseArgsSchema>,
  ): HouseGenerationResult {
    const grid = mapSection.grid;
    console.log(grid);

    // Use provided dimensions or default to 4x4
    const houseWidth = args?.width ?? DEFAULT_HOUSE_WIDTH;
    const houseHeight = args?.height ?? DEFAULT_HOUSE_HEIGHT;

    // Use provided position or random (toolCall already ensures valid position)
    const houseX =
      args?.x ??
      Phaser.Math.Between(
        BORDER_PADDING,
        Math.max(
          BORDER_PADDING,
          mapSection.width - houseWidth - BORDER_PADDING,
        ),
      );
    const houseY =
      args?.y ??
      Phaser.Math.Between(
        BORDER_PADDING,
        Math.max(
          BORDER_PADDING,
          mapSection.height - houseHeight - BORDER_PADDING,
        ),
      );

    // Determine style
    let wallTextureOffset: -4 | 0 = Math.random() < 0.5 ? -4 : 0;
    if (args?.style === "brown") wallTextureOffset = -4;
    if (args?.style === "grey") wallTextureOffset = 0;

    // Determine roof based on style
    let isRedRoof: boolean;
    if (args?.roof) {
      isRedRoof = args.roof === "red";
    } else {
      // Default rule: brown house -> grey roof, grey house -> red roof
      isRedRoof = wallTextureOffset === 0;
    }

    const roofTextureOffset = isRedRoof ? 0 : -4;

    const chimneyX = Phaser.Math.Between(-1, houseWidth - 1);

    // --- Roofs ---
    let y = houseY;
    grid[y][houseX] = 52 + roofTextureOffset;
    grid[y].fill(53 + roofTextureOffset, houseX + 1, houseX + houseWidth - 1);
    grid[y][houseX + houseWidth - 1] = 54 + roofTextureOffset;
    if (chimneyX >= 0) grid[y][houseX + chimneyX] = 55 + roofTextureOffset;

    y = houseY + 1;
    grid[y][houseX] = 64 + roofTextureOffset;
    grid[y].fill(65 + roofTextureOffset, houseX + 1, houseX + houseWidth - 1);
    grid[y][houseX + houseWidth - 1] = 66 + roofTextureOffset;

    // --- Wall + Window Logic ---
    const windowCount = args?.windowCount ?? 0;
    const wallTiles: { x: number; y: number }[] = [];

    for (y = houseY + 2; y < houseY + houseHeight; y++) {
      grid[y][houseX] = 76 + wallTextureOffset;
      grid[y][houseX + houseWidth - 1] = 79 + wallTextureOffset;

      for (let x = houseX + 1; x < houseX + houseWidth - 1; x++) {
        wallTiles.push({ x, y });
      }
    }

    const shuffledWallTiles = Phaser.Utils.Array.Shuffle(wallTiles);
    const windowTiles = shuffledWallTiles.slice(0, windowCount);

    for (const { x, y } of wallTiles) {
      const isWindow = windowTiles.some((tile) => tile.x === x && tile.y === y);
      grid[y][x] = isWindow ? 88 + wallTextureOffset : 77 + wallTextureOffset;
    }

    // --- Door + Awning ---
    const doorCount = args?.doorCount ?? 1;
    const possibleDoorXPositions = [];
    for (let x = houseX + 1; x < houseX + houseWidth - 1; x++) {
      possibleDoorXPositions.push(x);
    }

    const shuffledDoors = Phaser.Utils.Array.Shuffle(
      possibleDoorXPositions,
    ).slice(0, doorCount);

    shuffledDoors.forEach((doorX, index) => {
      grid[houseY + houseHeight - 1][doorX] = 89 + wallTextureOffset;

      const awningY = houseY + 1;
      if (
        ![77 + wallTextureOffset, 79 + wallTextureOffset].includes(
          grid[awningY][doorX],
        )
      ) {
        grid[awningY][doorX] = 67 + roofTextureOffset;
      }

      points_of_interest.set(`door${index + 1}`, {
        x: doorX,
        y: houseY + houseHeight - 1,
      });
    });

    return {
      name: "House",
      description: `${args?.style ?? "A"} house with a ${isRedRoof ? "red" : "grey"} roof, ${doorCount} door(s), and ${windowCount} window(s)`,
      grid,
      points_of_interest,
      houseDetails: {
        x: houseX,
        y: houseY,
        width: houseWidth,
        height: houseHeight,
        isRedRoof,
        wallOffset: wallTextureOffset,
        chimneyX,
      },
    };
  }
}
