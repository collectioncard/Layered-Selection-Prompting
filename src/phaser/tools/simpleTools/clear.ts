import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

export class boxClear implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({ x, y, width, height }) => {
      console.log("clear: ", x, y, width, height);
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

      // Check if area fits within selection
      if (x + width > selection.width || y + height > selection.height) {
        return `Error: Clear area from (${x}, ${y}) with size ${width}x${height} exceeds selection bounds (${selection.width}x${selection.height}).`;
      }

      console.log(selection);
      try {
        const result = this.generate(selection, [x, y, width, height]);
        const placementResult = await scene.putFeatureAtSelection(
          result,
          false,
          true,
        );

        const tilesCleared = width * height;

        return (
          `Area cleared successfully!\n` +
          `- Position: (${x}, ${y}) to (${x + width - 1}, ${y + height - 1}) in local coordinates\n` +
          `- Size: ${width}x${height} tiles\n` +
          `- Total tiles cleared: ${placementResult.placed > 0 ? placementResult.placed : tilesCleared}`
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to clear area - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "ClearBox",
      schema: z.object({
        x: z
          .number()
          .describe("X coordinate of top-left corner to start clearing"),
        y: z
          .number()
          .describe("Y coordinate of top-left corner to start clearing"),
        width: z.number().min(1).describe("Width of area to clear in tiles"),
        height: z.number().min(1).describe("Height of area to clear in tiles"),
      }),
      description:
        "Clears a rectangular area by removing all tiles within the specified bounds. " +
        "Coordinates are in local selection space. Use this to erase mistakes or prepare areas for new features.",
    },
  );

  /** args [x, y, width, height] */
  generate(mapSection: generatorInput, _args?: any): completedSection {
    let grid: number[][] = mapSection.grid;
    //Why are we using the args instead of just getting the selection dimensions?
    // IDK, but lets just force args 2 and 3 to not be bigger than the array
    // _args[2] = Math.min(_args[2], mapSection.width );
    // _args[3] = Math.min(_args[3], mapSection.height );

    console.log(grid);
    for (let i = _args[1]; i < _args[1] + _args[3]; i++) {
      for (let j = _args[0]; j < _args[0] + _args[2]; j++) {
        grid[i][j] = -2;
      }
    }
    console.log("cleared grid: ", grid);
    let feedback =
      "cleared " +
      _args[0] +
      ", " +
      _args[1] +
      " in local space with width " +
      _args[2] +
      " and height " +
      _args[3];

    return {
      name: "ClearBox",
      description: feedback,
      grid: grid,
      points_of_interest: new Map(),
    };
  }
}
