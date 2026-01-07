import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const DEFAULT_DENSITY: number = 0.05;

const DECOR_TILES = {
  27: "orange tree",
  28: "green tree",
  29: "mushroom",
  57: "wheelbarrow",
  94: "beehive",
  95: "target",
  106: "log",
  107: "bag",
  130: "bucket empty",
  131: "bucket full",
};

export class DecorGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  static DecorArgsSchema = z.object({
    density: z.number().min(0).max(1), // unfortunately the .default() parameter does not seem to be supported.
    x: z.number().min(0).max(40).optional(),
    y: z.number().min(0).max(25).optional(),
    width: z.number().min(1).max(50).optional(),
    height: z.number().min(1).max(50).optional(),
  });

  toolCall = tool(
    async (args: z.infer<typeof DecorGenerator.DecorArgsSchema>) => {
      //override the default density with the one provided in args, if it exists.
      let density = DEFAULT_DENSITY;
      if (
        args.density !== undefined &&
        args.density >= 0 &&
        args.density <= 1
      ) {
        density = args.density;
      }

      console.log("Adding decor with args: ", args);
      let scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Tool Failed, no reference to scene.";
      }
      let selection = scene.getSelection();
      try {
        const result = this.generate(selection, { density });
        await scene.putFeatureAtSelection(result);
        return result.description;
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Failed to place decor: ${e}`;
      }
    },
    {
      name: "randomDecor",
      schema: DecorGenerator.DecorArgsSchema,
      description: `Adds decor to the map with a specified density (default is 0.05). Optional args: x, y, width, height. The placed decor is randomly selected from the following tiles:  ${Object.keys(DECOR_TILES).join(", ")}. \n The type of decor cannot be specified, it is randomly chosen from the available decor tiles. If the user asks for specific decor, place it manually using the add tool`,
    },
  );

  generate(mapSection: generatorInput, _args?: any): completedSection {
    let grid: number[][] = mapSection.grid;

    let decorCounts = new Map<string, number>();
    let totalPlaced = 0;

    const width = _args?.width ?? mapSection.width;
    const height = _args?.height ?? mapSection.height;
    const xstrt = _args?.x ?? 0;
    const ystrt = _args?.y ?? 0;
    for (let y = ystrt; y < height + ystrt; y++) {
      for (let x = xstrt; x < width + xstrt; x++) {
        if (Math.random() < _args.density) {
          const decorKey = Phaser.Math.RND.pick(Object.keys(DECOR_TILES));
          grid[y][x] = Number(decorKey);
          decorCounts.set(decorKey, (decorCounts.get(decorKey) ?? 0) + 1);
          totalPlaced++;
        }
      }
    }

    return {
      name: "randomDecor",
      description: `Added ${totalPlaced} decor tiles. Placed tiles: ${JSON.stringify(Object.fromEntries(decorCounts))}`,
      grid: grid,
      points_of_interest: new Map(),
    };
  }
}
