import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const PADDING = 1;
var fenceX = 0;
var fenceY = 0;
var width = 0;
var height = 0;
const tileIDs: Record<number, number> = {
  0b1100: 44, // Top-left
  0b0110: 46, // Top-right
  0b1001: 68, // Bottom-left
  0b0011: 70, // Bottom-right
  0b0100: 45, // Top
  0b0001: 45, // Bottom
  0b1000: 56, // Left
  0b0010: 58, // Right
};

const fenceArgsSchema = z.object({
  width: z.number().min(3).max(50).optional(),
  height: z.number().min(3).max(50).optional(),
});

export class FullFenceGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async (args: z.infer<typeof fenceArgsSchema>) => {
      console.log("Adding full fence with args:", args);
      const scene = this.sceneGetter();
      if (!scene) {
        console.log("getSceneFailed");
        return "Tool Failed: No reference to scene.";
      }

      const selection = scene.getSelection();

      try {
        await scene.putFeatureAtSelection(this.generate(selection, args));
        return (
          "Fence added successfully. It starts at" +
          fenceX +
          "," +
          fenceY +
          ". It has a with width: " +
          width +
          " and height: " +
          height
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Failed to place fence`;
      }
    },
    {
      name: "fence",
      schema: fenceArgsSchema,
      description:
        "Adds a complete fence around an area. Accepts optional width and height.",
    },
  );

  generate(
    mapSection: generatorInput,
    args?: z.infer<typeof fenceArgsSchema>,
  ): completedSection {
    const grid: number[][] = Array.from({ length: mapSection.height }, () =>
      Array(mapSection.width).fill(-1),
    );

    width =
      args?.width ?? Phaser.Math.Between(3, mapSection.width - PADDING * 2);
    height =
      args?.height ?? Phaser.Math.Between(3, mapSection.height - PADDING * 2);

    fenceX = Phaser.Math.Between(PADDING, mapSection.width - width - PADDING);
    fenceY = Phaser.Math.Between(PADDING, mapSection.height - height - PADDING);

    for (let y = fenceY; y < fenceY + height; y++) {
      for (let x = fenceX; x < fenceX + width; x++) {
        const mask =
          (Number(y === fenceY) << 2) |
          (Number(y === fenceY + height - 1) << 0) |
          (Number(x === fenceX) << 3) |
          (Number(x === fenceX + width - 1) << 1);

        if (tileIDs[mask]) {
          grid[y][x] = tileIDs[mask];
        }
      }
    }

    // Add a gate
    const gateX = Phaser.Math.Between(fenceX + 1, fenceX + width - 2);
    const gateY = Math.random() < 0.5 ? fenceY : fenceY + height - 1;
    grid[gateY][gateX] = 69;

    return {
      name: "fence",
      description: `A ${width}x${height} fence`,
      grid,
      points_of_interest: new Map(),
    };
  }
}
