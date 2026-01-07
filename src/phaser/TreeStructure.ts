import { BaseMessage } from "@langchain/core/messages";

class Node {
  Name: string;
  Coordinates: [number[], number[]];
  Width: number;
  Height: number;
  Children: Node[];

  constructor(
    Name: string = "",
    Coordinates: [number[], number[]] = [[], []],
    Width: number = 0,
    Height: number = 0,
    Children: Node[] = [],
  ) {
    this.Name = Name;
    this.Coordinates = Coordinates;
    this.Width = Width;
    this.Height = Height;
    this.Children = Children;
  }
}

export class Tree {
  private Root: Node;
  constructor(
    Name: string = "",
    Coordinates: [number[], number[]] = [[], []],
    Width: number = 0,
    Height: number = 0,
  ) {
    this.Root = new Node(Name, Coordinates, Width, Height);
  }

  static async createLayerName(
    chatHistory: BaseMessage[],
    Width: number,
    Height: number,
  ): Promise<string> {
    const apiKey: string = import.meta.env.VITE_LLM_API_KEY;
    const modelName: string = import.meta.env.VITE_LLM_MODEL_NAME;

    console.log("API Key available:", !!apiKey);
    console.log("Model Name:", modelName);

    // (1) Pull the latest message(s) from the user
    const recentUserMessages = chatHistory
      .filter((msg) => msg._getType() === "human")
      .slice(-1)
      .map((msg) => msg.content)
      .join(" ");

    console.log("Recent User Messages:", recentUserMessages);
    const prompt = `Given this user instruction: "${recentUserMessages}", suggest a short, creative name for a tile-based layer that spans ${Width} tiles wide and ${Height} tiles tall. Provide only one name.`;

    // console.log("Sending prompt to Gemini:", prompt);

    // (2) Gemini API call - Updated endpoint and request format
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const body = {
      contents: [
        {
          role: "user",
          parts: [{ text: prompt }],
        },
      ],
      generationConfig: {
        temperature: 0.7,
        topK: 40,
        topP: 0.95,
        maxOutputTokens: 100,
      },
    };

    try {
      console.log("Making API call to Gemini...");
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();
      console.log("Gemini API Response:", data);

      if (!response.ok || !data.candidates?.[0]?.content?.parts?.[0]?.text) {
        throw new Error(JSON.stringify(data));
      }

      const layerName = data.candidates[0].content.parts[0].text.trim();
      console.log("Generated layer name:", layerName);
      return layerName;
    } catch (error) {
      console.error("Gemini API Error:", error);
      return `Unnamed Area (${Width}x${Height})`;
    }
  }

  // function: add()
  // parameters:
  //      layerName: name of new layer
  //      Coordinates: coordinates in reference to parent layer
  //      Width: width of layer
  //      Height: height of layer
  //      parentName: name of the parent layer
  // returns nothing
  add(
    layerName: string = "",
    Coordinates: [number[], number[]] = [[], []],
    Width: number,
    Height: number,
  ) {
    let newNode = new Node(layerName, Coordinates, Width, Height);
    let parentNode = this.suitableParentFind(Coordinates);
    if (parentNode != null) {
      parentNode.Children.push(newNode);
    }
  }

  // function: delete()
  // parameters:
  //      layerName: name of the layer you are searching for
  //      parentName: name of the parent layer
  // returns nothing
  delete(layerName: string = "", parentName: string = "") {
    const parent = parentName
      ? this.findNode(parentName)
      : this.findNodeOfChild(layerName, this.Root);
    const node = this.findNode(layerName);
    if (parent && node) {
      const index = parent.Children.indexOf(node);
      if (index !== -1) {
        parent.Children.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  rename(oldName: string = "", newName: string = ""): boolean {
    const node = this.findNode(oldName);
    if (!node) return false;
    node.Name = newName;
    return true;
  }

  // function: find()
  // parameters:
  //      layerName: name of the layer you are searching for
  //      currentNode: starts at the root node of the tree
  // returns the coordinates (index 0), width (index 1), and height(index 2).
  public find(
    layerName: string = "",
    currentNode: Node = this.Root,
  ): [[number[], number[]], number, number] | null {
    if (currentNode.Name === layerName) {
      return [currentNode.Coordinates, currentNode.Width, currentNode.Height];
    }
    for (const child of currentNode.Children) {
      const found: [[number[], number[]], number, number] | null = this.find(
        layerName,
        child,
      );
      if (found) return found;
    }
    return null;
  }

  private findNode(
    layerName: string = "",
    current: Node = this.Root,
  ): Node | null {
    if (current.Name === layerName) return current;
    for (const child of current.Children) {
      const found = this.findNode(layerName, child);
      if (found) return found;
    }
    return null;
  }

  private findNodeOfChild(childName: string, current: Node): Node | null {
    for (const child of current.Children) {
      if (child.Name === childName) return current;
      const deeper = this.findNodeOfChild(childName, child);
      if (deeper) return deeper;
    }
    return null;
  }

  private suitableParentFind(
    Coordinates: [number[], number[]],
    currentNode: Node = this.Root,
  ): Node | null {
    // Check if the new node can fit within currentNode
    const isWithin =
      Coordinates[0][0] >= currentNode.Coordinates[0][0] &&
      Coordinates[0][1] >= currentNode.Coordinates[0][1] &&
      Coordinates[1][0] <= currentNode.Coordinates[1][0] &&
      Coordinates[1][1] <= currentNode.Coordinates[1][1];

    if (!isWithin) {
      return null;
    }

    for (let childNode of currentNode.Children) {
      const result = this.suitableParentFind(Coordinates, childNode);
      if (result !== null) {
        return result;
      }
    }

    return currentNode;
  }

  printTree(currentNode: Node = this.Root) {
    let currentChildNameString = "";
    for (let childNode of currentNode.Children) {
      currentChildNameString += childNode.Name + ", ";
    }
    console.log(
      "Parent: " +
        currentNode.Name +
        "        Children: " +
        currentChildNameString,
    );
    for (let childNode of currentNode.Children) {
      this.printTree(childNode);
    }
  }

  getRoot() {
    return this.Root;
  }

  getChildren(currNode: Node) {
    return currNode.Children;
  }

  // Expose private findNode so callers can grab a Node object.
  public getNode(layerName: string): Node | null {
    return this.findNode(layerName, this.Root);
  }

  public deleteNode(layerName: string): boolean {
    return this.delete(layerName);
  }

  move(layerName: string, newParentName: string) {
    console.log(
      "called move on " + newParentName + " to be the parent of " + layerName,
    );
    let currentNode = this.findNode(layerName);
    let newParent = this.findNode(newParentName);
    let oldParent = this.findParent(layerName);
    if (newParent && currentNode && oldParent) {
      newParent.Children.push(currentNode);
      let index = oldParent.Children.indexOf(currentNode);
      oldParent.Children.splice(index, 1);
    }

    this.printTree();
  }

  moveToRoot(layerName: string) {
    console.log("called move on root to be the parent of " + layerName);
    let currentNode = this.findNode(layerName);
    let oldParent = this.findParent(layerName);
    if (currentNode && oldParent) {
      this.Root.Children.push(currentNode);
      let index = oldParent.Children.indexOf(currentNode);
      oldParent.Children.splice(index, 1);
    }

    this.printTree();
  }

  findParent(
    layerName: string = "",
    currentNode: Node = this.Root,
  ): Node | undefined {
    for (let childNode of currentNode.Children) {
      if (childNode.Name === layerName) {
        return currentNode;
      }
      const result = this.findParent(layerName, childNode);
      if (result) return result;
    }
    return undefined;
  }
}
