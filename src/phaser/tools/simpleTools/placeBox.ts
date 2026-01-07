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
      let scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Tool Failed, no reference to scene.";
      }
      let selection = scene.getSelection();
      try {
        await scene.putFeatureAtSelection(
          this.generate(selection, [x, y, width, height, tileID, filled]),
        );
        return `placed box of ${tileID} at: ${[x, y]} with width: ${width} and height: ${height}`;
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Failed to place box`;
      }
    },
    {
      name: "box",
      schema: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
        tileID: z.string(),
        filled: z.boolean().optional(),
      }),
      description:
        "Adds box to the map at x,y with width and height, optionally filled. \n Can also be used to draw a vertical or horizontal line by setting width or height to 1.",
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
