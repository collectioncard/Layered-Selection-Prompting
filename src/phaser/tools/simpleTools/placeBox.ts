import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

export class boxPlacer implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({ x, y, width, height, tileID, filled = false }) => {
      console.log("Adding box at: ", x, y, tileID);
      const scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Error: Tool Failed - No reference to scene.";
      }

      const selection = scene.getSelection();

      // Validate parameters
      if (x < 0 || y < 0) {
        return `Error: Starting position (${x}, ${y}) cannot be negative.`;
      }

      if (width < 1 || height < 1) {
        return `Error: Width (${width}) and height (${height}) must be at least 1.`;
      }

      // Check if box fits within selection
      if (x + width > selection.width || y + height > selection.height) {
        return `Error: Box from (${x}, ${y}) with size ${width}x${height} exceeds selection bounds (${selection.width}x${selection.height}).`;
      }

      const tileNum = Number(tileID);
      if (isNaN(tileNum) || tileNum < 0) {
        return `Error: Invalid tile ID "${tileID}". Must be a positive number.`;
      }

      try {
        const result = this.generate(selection, [
          x,
          y,
          width,
          height,
          tileID,
          filled,
        ]);
        await scene.putFeatureAtSelection(result);

        const tileName = scene.tileDictionary?.[tileNum] ?? `tile #${tileNum}`;
        const tilesPlaced = filled
          ? width * height
          : width * 2 + height * 2 - 4;
        const boxType = filled
          ? "filled rectangle"
          : "hollow rectangle (outline)";

        return (
          `Box placed successfully!\n` +
          `- Position: (${x}, ${y}) to (${x + width - 1}, ${y + height - 1}) in local coordinates\n` +
          `- Size: ${width}x${height} tiles\n` +
          `- Type: ${boxType}\n` +
          `- Tile: ${tileName} (ID: ${tileID})\n` +
          `- Tiles placed: ${tilesPlaced}`
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place box - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "box",
      schema: z.object({
        x: z
          .number()
          .describe("X coordinate of top-left corner in local space"),
        y: z
          .number()
          .describe("Y coordinate of top-left corner in local space"),
        width: z.number().min(1).describe("Width of the box in tiles"),
        height: z.number().min(1).describe("Height of the box in tiles"),
        tileID: z.string().describe("The tile ID number to use (as string)"),
        filled: z
          .boolean()
          .optional()
          .describe(
            "If true, fill the entire box. If false/omitted, draw only the outline.",
          ),
      }),
      description:
        "Draws a rectangle of tiles. Can be filled or just an outline. " +
        "For a horizontal line: use height=1. For a vertical line: use width=1. " +
        "Set filled=true for solid rectangle, or omit/false for outline only.",
    },
  );

  /** args correlate to [x, y, width, height, tileID, filled] */
  generate(mapSection: generatorInput, _args?: any): completedSection {
    let grid: number[][] = mapSection.grid;

    if (!_args || _args.length < 6) {
      throw new Error("Invalid arguments passed to generate method.");
    }

    const [x, y, width, height, tileID, filled] = _args;

    if (
      typeof tileID !== "string" ||
      typeof x !== "number" ||
      typeof y !== "number" ||
      typeof width !== "number" ||
      typeof height !== "number" ||
      (filled !== undefined && typeof filled !== "boolean")
    ) {
      throw new Error("Invalid argument types passed to generate method.");
    }

    for (let i = 0; i < height; i++) {
      for (let j = 0; j < width; j++) {
        const gridX = x + j;
        const gridY = y + i;

        if (
          gridY >= 0 &&
          gridY < grid.length &&
          gridX >= 0 &&
          gridX < grid[gridY].length
        ) {
          if (filled) {
            grid[gridY][gridX] = Number(tileID);
          } else if (
            i === 0 ||
            i === height - 1 ||
            j === 0 ||
            j === width - 1
          ) {
            grid[gridY][gridX] = Number(tileID);
          }
        }
      }
    }

    return {
      name: "PlaceBox",
      description: "places a box at the specified location",
      grid: grid,
      points_of_interest: new Map(),
    };
  }
}
