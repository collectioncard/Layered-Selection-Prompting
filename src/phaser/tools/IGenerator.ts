import { TinyTownScene } from "../TinyTownScene.ts";

export interface mapCoords {
  x: number;
  y: number;
  pointType?: string;
}

/**
 * Represents the input to a feature generator, containing the grid data and dimensions of the map section.
 */
export interface generatorInput {
  grid: number[][];
  width: number;
  height: number;
}

/**
 * Represents the finished output of a feature generator in the form of a 2D tile ID array.
 * @property name - The name of the generated section.
 * @property description - A brief description of the section.
 * @property grid - A 2D array representing the generated grid data.
 * @property points_of_interest - A map of unique identifiers to coordinates and types of points of interest.
 */
export interface completedSection {
  name: string;
  description: string;
  grid: number[][];
  points_of_interest: Map<string, mapCoords>;
}

/**
 * Interface for feature generators that can be used to create and manipulate sections of a map in a TinyTown scene.
 * All feature generators should implement the `generate` method to produce a completed section based on the provided map section and optional arguments.
 */
export interface FeatureGenerator {
  sceneGetter: () => TinyTownScene;
  toolCall?: any;
  generate(mapSection: generatorInput, args?: any): completedSection;
}

//TODO: This shouldn't exist
export interface AsyncFeatureGenerator {
  generate(mapSection: generatorInput, args?: any): Promise<completedSection>;
}
