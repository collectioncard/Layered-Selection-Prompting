import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const TREE_CHANCE = 0.8;

const TILE_TYPES = {
  mushrooms: [29],
  bushes: {
    green: [5, 17, 28],
    yellow: [27],
  },
  trees: {
    single: {
      green: [4, 16],
      yellow: [3, 15],
    },
    stack1: {
      green: [6, 8, 30, 32],
      yellow: [9, 11, 33, 35],
    },
    stack2: {
      green: [7, 19, 31, 18, 20],
      yellow: [10, 22, 34, 21, 23],
    },
  },
};

export class ForestGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  static forestArgsSchema = z.object({
    x: z.number().min(0).max(40).optional(),
    y: z.number().min(0).max(25).optional(),
    width: z.number().min(1).max(50).optional(),
    height: z.number().min(1).max(50).optional(),
    mushrooms: z.number().min(0).max(100).optional(),
    yellowTrees: z.number().min(0).max(100).optional(),
    greenTrees: z.number().min(0).max(100).optional(),
  });

  toolCall = tool(
    async (args: z.infer<typeof ForestGenerator.forestArgsSchema>) => {
      console.log("Generating forest with args:", args);
      const scene = this.sceneGetter();
      if (!scene) return "Tool Failed: No reference to scene.";

      const selection = scene.getSelection();

      // Resize grid if specified
      // if (args.width && args.height) {
      //   selection.width = args.width;
      //   selection.height = args.height;
      //   selection.grid = Array.from({ length: args.height }, () =>
      //     Array(args.width).fill(-1)
      //   );
      // }

      try {
        await scene.putFeatureAtSelection(this.generate(selection, args));
        return `Forest added`;
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Forest not added`;
      }
    },
    {
      name: "forest",
      schema: ForestGenerator.forestArgsSchema,
      description:
        "Adds a forest to the map. Optional args: x, y, width, height, mushrooms, yellowTrees, greenTrees.",
    },
  );

  generate(
    mapSection: generatorInput,
    args?: z.infer<typeof ForestGenerator.forestArgsSchema>,
  ): completedSection {
    const grid = mapSection.grid;
    const width = args?.width ?? 0;
    const height = args?.height ?? 0;
    const xstrt = args?.x ?? 0;
    const ystrt = args?.y ?? 0;
    console.log(grid);

    // Step 1: Generate base random forest
    for (let y = ystrt; y < height + ystrt; y++) {
      for (let x = xstrt; x < width + xstrt; x++) {
        if (grid[y][x] !== -1 || Math.random() > TREE_CHANCE) continue;

        const plantType = Phaser.Math.Between(0, 100);
        const color: "green" | "yellow" =
          Math.random() < 0.5 ? "green" : "yellow";

        if (plantType < 7) {
          grid[y][x] = Phaser.Utils.Array.GetRandom(TILE_TYPES.mushrooms);
        } else if (plantType < 30) {
          grid[y][x] = Phaser.Utils.Array.GetRandom(TILE_TYPES.bushes[color]);
        } else if (plantType < 60 && y + 1 < height) {
          const tree = TILE_TYPES.trees.single[color];
          if (grid[y + 1][x] === -1) {
            grid[y][x] = tree[0];
            grid[y + 1][x] = tree[1];
          }
        } else if (
          plantType < 85 &&
          y + 1 < height &&
          x + 1 < width &&
          grid[y + 1][x] === -1 &&
          grid[y][x + 1] === -1 &&
          grid[y + 1][x + 1] === -1
        ) {
          const tree = TILE_TYPES.trees.stack1[color];
          grid[y][x] = tree[0];
          grid[y][x + 1] = tree[1];
          grid[y + 1][x] = tree[2];
          grid[y + 1][x + 1] = tree[3];
        } else if (
          y + 2 < height &&
          x - 1 >= 0 &&
          x + 1 < width &&
          grid[y + 1][x] === -1 &&
          grid[y + 2][x] === -1 &&
          grid[y + 1][x - 1] === -1 &&
          grid[y + 1][x + 1] === -1
        ) {
          const tree = TILE_TYPES.trees.stack2[color];
          grid[y][x] = tree[0];
          grid[y + 1][x] = tree[1];
          grid[y + 2][x] = tree[2];
          grid[y + 1][x - 1] = tree[3];
          grid[y + 1][x + 1] = tree[4];
        }
      }
    }

    // Step 2: Add specific elements over the random forest
    const placeables: { x: number; y: number }[] = [];
    for (let y = ystrt; y < height + ystrt; y++) {
      for (let x = xstrt; x < width + xstrt; x++) {
        if (grid[y][x] === -1) {
          placeables.push({ x, y });
        }
      }
    }

    Phaser.Utils.Array.Shuffle(placeables);

    const placeOne = (tileId: number, count: number) => {
      for (let i = 0; i < count && placeables.length; i++) {
        const { x, y } = placeables.pop()!;
        grid[y][x] = tileId;
      }
    };

    placeOne(TILE_TYPES.mushrooms[0], args?.mushrooms ?? 0);
    placeOne(TILE_TYPES.trees.single.yellow[0], args?.yellowTrees ?? 0);
    placeOne(TILE_TYPES.trees.single.green[0], args?.greenTrees ?? 0);

    return {
      name: "forest",
      description: `A ${width}x${height} forest with custom elements`,
      grid,
      points_of_interest: new Map(),
    };
  }
}
