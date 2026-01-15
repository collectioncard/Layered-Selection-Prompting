import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

export class TilePlacer implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({ x, y, tileID }) => {
      console.log("Adding tile at: ", x, y, tileID);
      const scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Error: Tool Failed - No reference to scene.";
      }

      const selection = scene.getSelection();

      // Validate coordinates are within selection
      if (x < 0 || x >= selection.width || y < 0 || y >= selection.height) {
        return `Error: Coordinates (${x}, ${y}) are outside the selection bounds (0,0) to (${selection.width - 1}, ${selection.height - 1}).`;
      }

      // Validate tileID is a valid number
      const tileNum = Number(tileID);
      if (isNaN(tileNum) || tileNum < 0) {
        return `Error: Invalid tile ID "${tileID}". Must be a positive number.`;
      }

      // Get previous tile for feedback
      const previousTileId = selection.grid[y]?.[x] ?? -1;

      try {
        const result = this.generate(selection, { x, y, tileID });
        await scene.putFeatureAtSelection(result);

        const tileName = scene.tileDictionary?.[tileNum] ?? `tile #${tileNum}`;
        const prevTileName =
          previousTileId >= 0
            ? (scene.tileDictionary?.[previousTileId] ??
              `tile #${previousTileId}`)
            : "empty";

        return (
          `Tile placed successfully!\n` +
          `- Position: (${x}, ${y}) in local coordinates\n` +
          `- Tile: ${tileName} (ID: ${tileID})\n` +
          `- Previous tile: ${prevTileName}`
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place tile - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "add",
      schema: z.object({
        x: z.number().describe("X coordinate in local selection space"),
        y: z.number().describe("Y coordinate in local selection space"),
        tileID: z.string().describe("The tile ID number to place (as string)"),
      }),
      description:
        "Places a single tile at the specified local coordinates within the current selection. " +
        "Use this for precise tile-by-tile placement. Coordinates must be within selection bounds.",
    },
  );

  generate(mapSection: generatorInput, _args?: any): completedSection {
    let grid: number[][] = mapSection.grid;
    grid[_args.y][_args.x] = Number(_args.tileID);

    return {
      name: "PlaceTile",
      description: `Placed tile ${_args.tileID} at (${_args.x}, ${_args.y})`,
      grid: grid,
      points_of_interest: new Map(),
    };
  }
}
