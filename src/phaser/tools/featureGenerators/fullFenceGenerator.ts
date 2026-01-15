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
var gatePosition = 0;
var gateOnTop = false;
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
        return "Error: Tool Failed - No reference to scene.";
      }

      const selection = scene.getSelection();

      // Validate minimum size for fence
      const minRequiredSize = 3 + PADDING * 2;
      if (
        selection.width < minRequiredSize ||
        selection.height < minRequiredSize
      ) {
        return `Error: Selection too small for fence. Minimum required: ${minRequiredSize}x${minRequiredSize} tiles.`;
      }

      try {
        const result = this.generate(selection, args);
        await scene.putFeatureAtSelection(result);

        return (
          `Fence successfully placed!\n` +
          `- Position: starts at local (${fenceX}, ${fenceY})\n` +
          `- Size: ${width}x${height} tiles (width x height)\n` +
          `- Gate: placed on ${gateOnTop ? "top" : "bottom"} edge at x=${gatePosition}\n` +
          `- Corners: top-left (${fenceX}, ${fenceY}), bottom-right (${fenceX + width - 1}, ${fenceY + height - 1})`
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place fence - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "fence",
      schema: fenceArgsSchema,
      description:
        "Adds a complete fence enclosure with a gate. Parameters:\n" +
        "- width: fence width in tiles, min 3 (optional, random if not specified)\n" +
        "- height: fence height in tiles, min 3 (optional, random if not specified)\n" +
        "Gate is automatically placed randomly on top or bottom edge.",
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
    gateOnTop = Math.random() < 0.5;
    const gateY = gateOnTop ? fenceY : fenceY + height - 1;
    gatePosition = gateX;
    grid[gateY][gateX] = 69;

    return {
      name: "fence",
      description: `A ${width}x${height} fence`,
      grid,
      points_of_interest: new Map(),
    };
  }
}
