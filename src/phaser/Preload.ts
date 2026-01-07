import Phaser from "phaser";

export class Preload extends Phaser.Scene {
  tileDictionary: { [key: number]: string } = {};

  constructor() {
    super("Preload");
  }

  preload() {
    this.load.json("tileDatabase", "phaserAssets/Assets/TileDatabase.json");
  }

  create() {
    this.createTileDictionary();
    this.scene.start("TinyTown", { dict: this.tileDictionary });
  }

  createTileDictionary() {
    const database = this.cache.json.get("tileDatabase");

    if (!database || !database.Tilemap_Packed_Tileset) {
      console.error("Tile database not found or improperly formatted.");
      return;
    }

    this.tileDictionary = {};
    for (const tile of database.Tilemap_Packed_Tileset) {
      this.tileDictionary[tile.TileID] = tile.Description;
    }

    console.log("Tile Dictionary:", this.tileDictionary);
  }
}
