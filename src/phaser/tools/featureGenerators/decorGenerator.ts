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

  static readonly DecorArgsSchema = z.object({
    density: z.number().min(0).max(1).default(0.03),
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
      const scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Error: Tool Failed - No reference to scene.";
      }

      const selection = scene.getSelection();

      if (selection.width === 0 || selection.height === 0) {
        return "Error: No valid selection. Please select an area first.";
      }

      try {
        const result = this.generate(selection, {
          density,
          x: args.x,
          y: args.y,
          width: args.width,
          height: args.height,
        });
        const placementResult = await scene.putFeatureAtSelection(result);

        const areaWidth = args.width ?? selection.width;
        const areaHeight = args.height ?? selection.height;
        const startX = args.x ?? 0;
        const startY = args.y ?? 0;

        // Check if placement was fully successful, partially successful, or failed
        if (placementResult.placed === 0 && placementResult.total > 0) {
          return (
            `Decor placement failed!\n` +
            `- Area: ${areaWidth}x${areaHeight} tiles starting at local (${startX}, ${startY})\n` +
            `- Reason: All ${placementResult.total} tiles were blocked by higher-priority existing tiles.\n` +
            `- Suggestion: Use the clear tool first or choose a different location.`
          );
        } else if (placementResult.skipped > 0) {
          return (
            `Decor partially placed.\n` +
            `- Area: ${areaWidth}x${areaHeight} tiles starting at local (${startX}, ${startY})\n` +
            `- Density: ${(density * 100).toFixed(1)}%\n` +
            `- Tiles placed: ${placementResult.placed}/${placementResult.total}\n` +
            `- Tiles blocked: ${placementResult.skipped} (by higher-priority tiles)\n` +
            `- ${result.description}`
          );
        }

        return (
          `Decor placed successfully!\n` +
          `- Area: ${areaWidth}x${areaHeight} tiles starting at local (${startX}, ${startY})\n` +
          `- Density: ${(density * 100).toFixed(1)}%\n` +
          `- Tiles placed: ${placementResult.placed}\n` +
          `- ${result.description}`
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place decor - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "randomDecor",
      schema: DecorGenerator.DecorArgsSchema,
      description:
        "Adds random decorative items (trees, bushes, mushrooms, objects) to the map. Parameters:\n" +
        "- density: probability (0-1) of placing a decor on each tile (required)\n" +
        "- x, y: local start position (optional, default 0,0)\n" +
        "- width, height: area size (optional, uses selection size)\n" +
        `Available decor types: ${Object.values(DECOR_TILES).join(", ")}`,
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
