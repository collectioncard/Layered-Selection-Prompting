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
    async ({
      x,
      y,
      width,
      height,
    }: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => {
      console.log("clear at:", x, y, width, height);

      const scene = this.sceneGetter();
      if (!scene) {
        console.error("Scene getter returned null");
        return "Tool Failed: no scene.";
      }

      const selection = scene.getSelection();
      if (!selection) {
        console.error("No selection found");
        return "Tool Failed: no selection.";
      }

      try {
        await scene.putFeatureAtSelection(
          this.generate(selection, { x, y, width, height }),
          false,
          true,
        );
        return `Cleared at (${x}, ${y}) size ${width}x${height}`;
      } catch (err) {
        console.error("putFeatureAtSelection failed:", err);
        return `Failed to clear`;
      }
    },
    {
      name: "ClearBox",
      schema: z.object({
        x: z.number().min(0).describe("Top-left X coordinate"),
        y: z.number().min(0).describe("Top-left Y coordinate"),
        width: z.number().min(1).describe("Width of rectangle"),
        height: z.number().min(1).describe("Height of rectangle"),
      }),
      description:
        "Clears a rectangular local area at (x,y) with width and height, deleting contents",
    },
  );

  generate(
    mapSection: generatorInput,
    args: { x: number; y: number; width: number; height: number },
  ): completedSection {
    const { x, y, width, height } = args;
    const grid = mapSection.grid;

    // clamp to selection bounds
    const maxY = Math.min(y + height, grid.length);
    const maxX = Math.min(x + width, grid[0]?.length ?? 0);

    console.log("Before clear:", grid);

    for (let row = y; row < maxY; row++) {
      for (let col = x; col < maxX; col++) {
        grid[row][col] = -2;
      }
    }

    console.log("After clear:", grid);

    return {
      name: "ClearBox",
      description: `Cleared area at (${x}, ${y}) width=${width} height=${height}`,
      grid,
      points_of_interest: new Map(),
    };
  }
}
