import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

const PADDING = 1; // minimum distance from the edge of the section

const tileIDs: Record<number, number> = {
  0b1100: 44, // Top-left
  0b0110: 46, // Top-right
  0b1001: 68, // Bottom-left
  0b0011: 70, // Bottom-right
  0b0100: 45, // Top
  0b0001: 45, // Bottom
  0b1000: 56, // Left
  0b0010: -1, // Right
};

//TODO: This one is not finished yet. Will maybe get to it soon
export class PartialFenceGenerator implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  // Track last generated fence details
  private lastFenceX = 0;
  private lastFenceY = 0;
  private lastHorizontalLength = 0;
  private lastVerticalLength = 0;
  private lastGateX = 0;
  private lastGateOnTop = false;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({ edges }: { edges?: string }) => {
      console.log("Adding partial fence with edges:", edges);
      const scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Error: Tool Failed - No reference to scene.";
      }

      const selection = scene.getSelection();

      // Validate minimum size
      const minSize = 3 + PADDING * 2;
      if (selection.width < minSize || selection.height < minSize) {
        return `Error: Selection too small for fence. Minimum required: ${minSize}x${minSize} tiles.`;
      }

      try {
        const result = this.generate(selection, { edges });
        await scene.putFeatureAtSelection(result);

        return (
          `Partial fence placed successfully!\n` +
          `- Position: starts at local (${this.lastFenceX}, ${this.lastFenceY})\n` +
          `- Horizontal length: ${this.lastHorizontalLength} tiles\n` +
          `- Vertical length: ${this.lastVerticalLength} tiles\n` +
          `- Gate: placed on ${this.lastGateOnTop ? "top" : "bottom"} edge at x=${this.lastGateX}\n` +
          `- Note: This fence has an open right side.`
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to place partial fence - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "broken_fence",
      schema: z.object({
        edges: z
          .string()
          .optional()
          .describe("Which edges to include (not fully implemented yet)"),
      }),
      description:
        "Adds a partial/broken fence with an open side. " +
        "Creates an L-shaped or U-shaped fence enclosure. " +
        "Gate is automatically placed on top or bottom edge.",
    },
  );

  generate(mapSection: generatorInput, _args?: any): completedSection {
    const horizontalLength = Phaser.Math.Between(
      3,
      mapSection.width - PADDING * 2,
    );
    const verticalLength = Phaser.Math.Between(
      3,
      mapSection.height - PADDING * 2,
    );

    const fenceX = Phaser.Math.Between(
      PADDING,
      mapSection.width - horizontalLength - PADDING,
    );
    const fenceY: number = Phaser.Math.Between(
      PADDING,
      mapSection.height - verticalLength - PADDING,
    );

    // Store for feedback
    this.lastFenceX = fenceX;
    this.lastFenceY = fenceY;
    this.lastHorizontalLength = horizontalLength;
    this.lastVerticalLength = verticalLength;

    let grid: number[][] = Array.from({ length: mapSection.height }, () =>
      Array(mapSection.width).fill(-1),
    );

    // decide which edges of the fence to generate.

    for (let y: number = fenceY; y < fenceY + verticalLength; y++) {
      for (let x = fenceX; x < fenceX + horizontalLength; x++) {
        const mask =
          (Number(y === fenceY) << 2) |
          (Number(y === fenceY + verticalLength - 1) << 0) |
          (Number(x === fenceX) << 3) |
          (Number(x === fenceX + horizontalLength - 1) << 1);

        if (tileIDs[mask]) {
          grid[y][x] = tileIDs[mask];
        }
      }
    }

    //randomly choose a fence tile on the top or bottom and place a gate
    const gateX = Phaser.Math.Between(
      fenceX + 1,
      fenceX + horizontalLength - 2,
    );
    this.lastGateOnTop = Math.random() < 0.5;
    const gateY = this.lastGateOnTop ? fenceY : fenceY + verticalLength - 1;
    this.lastGateX = gateX;
    grid[gateY][gateX] = 69;

    return {
      name: "broken_fence",
      description: "A partially completed fence",
      grid,
      points_of_interest: new Map(),
    };
  }
}
