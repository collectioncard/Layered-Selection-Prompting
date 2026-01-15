import {
  completedSection,
  FeatureGenerator,
  generatorInput,
} from "../IGenerator.ts";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { TinyTownScene } from "../../TinyTownScene.ts";

export class FullUndo implements FeatureGenerator {
  sceneGetter: () => TinyTownScene;

  constructor(sceneGetter: () => TinyTownScene) {
    this.sceneGetter = sceneGetter;
  }

  toolCall = tool(
    async ({}) => {
      console.log("undoing all tool calls from this turn");
      const scene = this.sceneGetter();
      if (scene == null) {
        console.log("getSceneFailed");
        return "Error: Tool Failed - No reference to scene.";
      }

      // Use TurnStartData to undo ALL tool calls made in the turn
      console.log("TurnStartData:", scene.TurnStartData);

      if (!scene.TurnStartData || scene.TurnStartData.grid.length === 0) {
        return "Error: Nothing to undo. No previous state available.";
      }

      // Restore to the state at the start of the turn
      try {
        await scene.putFeatureAtSelection(
          scene.TurnStartData,
          true,
          true,
          true,
        );

        // Mark that we're starting fresh (next tool call should save new turn start)
        scene.markNewTurn();

        return (
          `Undo successful!\n` +
          `- All changes from this turn have been reverted.\n` +
          `- The map has been restored to its state before any tool calls were made.`
        );
      } catch (e) {
        console.error("putFeatureAtSelection failed:", e);
        return `Error: Failed to undo - ${e instanceof Error ? e.message : "Unknown error"}`;
      }
    },
    {
      name: "undo",
      schema: z.object({}),
      description:
        "Reverts ALL modifications made during the current turn. " +
        "This undoes every tool call made since the user's last message, " +
        "restoring the map to its state before any changes were made.",
    },
  );

  // this is not used.
  generate(mapSection: generatorInput, _args?: any): completedSection {
    let grid: number[][] = mapSection.grid;

    return {
      name: "Undo - None",
      description: "",
      grid: grid,
      points_of_interest: new Map(),
    };
  }
}
