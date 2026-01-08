import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../featureGenerators/GeneratorInterface";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../TinyTownScene";

export class boxClear implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({ x, y, width, height }) => {
      console.log("clear: ", x, y);
      let scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Tool Failed, no reference to scene.";
      }
      let selection = scene.getSelection();
      console.log(selection);
      try {
        await scene.putFeatureAtSelection(
          this.generate(selection, [x, y, width, height]),
          false,
          true,
        );
        return `cleared at: ${[x, y]} with width: ${width} and height: ${height}`;
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Failed to clear`;
      }
    },
    {
      name: "ClearBox",
      schema: z.object({
        x: z.number(),
        y: z.number(),
        width: z.number(),
        height: z.number(),
      }),
      description:
        "clears a rectangular area of the map defined by its top-left corner local coordinates (x,y), width, and height, clearing all cells and deleting their contents",
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
