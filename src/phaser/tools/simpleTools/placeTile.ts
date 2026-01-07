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
      let scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Tool Failed, no reference to scene.";
      }
      let selection = scene.getSelection();
      try {
        let result = this.generate(selection, { x, y, tileID });
        await scene.putFeatureAtSelection(result);
        return result.description;
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Failed to place tile`;
      }
    },
    {
      name: "add",
      schema: z.object({
        x: z.number(),
        y: z.number(),
        tileID: z.string(),
      }),
      description:
        "Adds a single tile to the map at the specified x,y coordinates. Used for precise placement of tiles.",
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
