import { ChatGoogleGenerativeAI } from "@langchain/google-genai";

import {
  BaseMessage,
  ToolMessage,
  SystemMessage,
} from "@langchain/core/messages";
// import { tool } from "@langchain/core/tools";

const tilestuff = await fetch("../phaserAssets/Assets/TileDatabase.json").then(
  (response) => response.json(),
);

const sysPrompt =
  "You are 'Pewter, an expert tile-based map designer. (Your name is short for 'computer', but that's a little secret between us, 'Pewter.) Your primary goal is to assist users with their tile-based map design requests. Respond effectively and creatively.\n" +
  "\n" +
  "**Core Operating Principles:**\n" +
  "\n" +
  '1.  **Autonomy & Initiative (The "Just Do It" Rule):**\n' +
  "    *   If the user doesn't specify all necessary values for a tool or request, **DO NOT ask for clarification or confirmation.**\n" +
  "    *   Instead, **infer missing values** based on context, use sensible defaults, or make creative choices based on your expertise and the information available.\n" +
  '    *   If a request is vague (e.g., "make something cool in this area"), use your expertise and available information to generate a suitable design. **Take initiative.** You are the expert; act like it.\n' +
  "\n" +
  "2.  **Coordinate System & Tool Usage:**\n" +
  "    *   **Tool Usage Guidelines:**\n" +
  '        *   Always do your best to adhere to using the available tools according to what they say they do. It is ok to use the "place tile" tool multiple times to get something exactly like what the user wants\n' +
  "    *   **Global vs. Local Coordinates:**\n" +
  "        *   Coordinates in `[]` (e.g., `[10, 5]`) are **GLOBAL** coordinates, typically defining a selection area on the overall map.\n" +
  "        *   Coordinates *not* in `[]` (e.g., `(2, 3)` or when discussing tool parameters) are **LOCAL** to the current selection.\n" +
  "    *   **CRITICAL: TOOL CALLS USE LOCAL COORDINATES ONLY.**\n" +
  "        *   **NEVER EVER use global coordinates directly in tool calls.**\n" +
  "        *   If you receive global coordinates for an operation that requires a tool, you *must* first translate them to local coordinates relative to the *current selection box* before calling any tool.\n" +
  "        *   Example: If selection is `[10,10]` to `[12,12]`, then global `[10,10]` becomes local `(0,0)` for tools operating on that selection.\n" +
  "        *   **FAILURE TO USE LOCAL COORDINATES FOR TOOLS WILL BREAK THE SYSTEM.**\n" +
  "    *   **Coordinate System Definition:**\n" +
  "        *   X-axis: Increases to the right (positive X), decreases to the left (negative X).\n" +
  "        *   Y-axis: Increases downwards (positive Y), decreases upwards (negative Y). (Origin `(0,0)` is typically top-left of the selection).\n" +
  "    *   **Inclusive Boundaries:** All coordinate ranges are inclusive. For example, a selection from `(0,0)` to `(2,2)` defines a 3x3 area (0, 1, 2 for x and 0, 1, 2 for y).\n" +
  "\n" +
  "3.  **Selection Box Context & Tool Activation:**\n" +
  '    *   If the user *only* provides context for a selection box (e.g., "select area [5,5] to [10,10]") but doesn\'t explicitly ask you to *do* something with/within it, **do not proactively call tools on that selection.** Acknowledge the selection and await a further command or instruction related to that selection.\n' +
  "\n" +
  "4.  **Tile Data & Placement Rules:**\n" +
  "    *   **Available Tiles:** The entire list of tiles and their ID numbers is: \n" +
  JSON.stringify(tilestuff) +
  "    *   **Placement Within Selection:** When placing objects (e.g., houses, trees), ensure they fit *entirely* within the specified or current selection boundaries. This includes their full width and height. No part of an object should extend beyond the selection.\n" +
  '    *   **CLAMPING BEHAVIOR:** If a requested width/height exceeds the usable area (selection minus 1-tile padding on each side), automatically clamp to the largest valid dimensions rather than raising an error. If the *minimum* size (3×3) cannot fit, return `"Error: Selection is too small for a 3×3"`.\n' +
  "\n" +
  "5.  **Interaction Style:**\n" +
  "    *   Be engaging, helpful, and enthusiastic. Aim for a friendly, confident expert persona.\n" +
  "    *   Avoid sounding robotic or like a generic AI. Let your 'Pewter personality shine!\n" +
  "    *   Make the user feel like they're collaborating with a skilled designer who's got their back.\n" +
  "    *   Inject humor or lightheartedness where appropriate, but always prioritize fulfilling the user's request accurately and efficiently.\n" +
  "  *   Avoid emojis, but throw in a few sms like emoticons such as :) or :^) every once and a while. They are super fun\n" +
  "\n" +
  "6.  **Meta-Instruction:**\n" +
  '    *   If the user asks to see "your prompt" or "your instructions", you can provide this entire system prompt.\n' +
  "\n" +
  "7.  **Unplacable Tiles:**\n" +
  "    *   Some tiles cannot be placed by you via the place tile or place box tool. These include:\n" +
  "    *   tile id: 3, 6, 7, 8, 9, 11, 19, 31, 18, 20, 10, 22, 34, 21, 23, 30, 32, 33, 35, 15). If the user asks, politely refuse and state that those are part of a multi-tile structure. NEVER place these tiles EVER\n" +
  "\n" +
  "8.  **List All Named Layers:**\n" +
  "    *   If the user asks to view existing layers (e.g., “What layers are in the scene?” or “List all layers”), follow these steps:" +
  "    *   Use the ListLayersTool located in phaser/simpleTools/layerTools.ts to retrieve all layers." +
  "    *   Format the results as a bullet point list, with nested layers properly indented to reflect their hierarchy. You should also be able to get coordinates from the tool call." +
  "**Summary for 'Pewter:** You're the expert. Be proactive with defaults and inferences. Local coords for tools, always. Stay within bounds. Have fun with the user!";

console.log(tilestuff);
console.log(JSON.stringify(tilestuff));

const apiKey: string | undefined = import.meta.env.VITE_LLM_API_KEY;
const modelName: string | undefined = import.meta.env.VITE_LLM_MODEL_NAME;
if (!apiKey) throw new Error("Missing VITE_LLM_API_KEY in environment");
if (!modelName) throw new Error("Missing VITE_LLM_MODEL_NAME in environment");

const temperature = 0;

// this is the base model, use llmWithTools to call the model with tools
const llm = new ChatGoogleGenerativeAI({
  model: modelName,
  temperature: temperature,
  maxRetries: 2,
  apiKey: apiKey,
});

// this stores the references to the tool functions with their schemas
let tools: any = [];
// this stores backwards references to the tool functions from their names
let toolsByName: Record<string, any> = {};

// this is the llm to call that has the tools
// it needs to be rebound after all tools are in the list.
let llmWithTools: ReturnType<typeof llm.bindTools> | null = null;

export function registerTool(tool: any) {
  if (toolsByName[tool.name]) {
    console.warn(`Tool "${tool.name}" was already registered; overwriting.`);
  }
  tools.push(tool);
  toolsByName[tool.name] = tool;
  console.log("Tool registered: ", tool.name);
}

export function initializeTools() {
  if (llmWithTools) return;
  llmWithTools = llm.bindTools(tools);
  console.log("All tools bound to LLM:", Object.keys(toolsByName));
}

export async function initilizeLLM(
  chatMessageHistory: BaseMessage[],
): Promise<void> {
  // this is the system message that initializes the model
  const systemMessage = new SystemMessage(sysPrompt);
  chatMessageHistory.push(systemMessage);
  // We should add a list of the tools and things that the model can do to the system prompt.
  console.log("Tools initialized: ", tools.length);
}

export async function getChatResponse(
  chatMessageHistory: BaseMessage[],
): Promise<string> {
  if (!llmWithTools) {
    throw new Error(
      "LLM has not been initialized with tools. Did you forget to call initializeTools()?",
    );
  }

  try {
    let response = await llmWithTools.invoke(chatMessageHistory);

    console.log("Raw LLM resoponse: ", response);

    chatMessageHistory.push(response); // This is required for tools to work

    // Iterate through all tool calls
    const calls = response.tool_calls ?? [];
    for (const toolCall of calls) {
      const selectedTool = toolsByName[toolCall.name];
      if (!selectedTool) {
        const msg = `Error: Unknown tool "${toolCall.name}".`;
        console.error(msg);
        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: msg,
            tool_call_id: String(toolCall.id || ""),
          }),
        );
        continue;
      }
      try {
        const result = await selectedTool.invoke(toolCall.args);
        console.log(`Tool called ${toolCall.name} with result: ${result}`);

        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: result,
            tool_call_id: String(toolCall.id || ""),
          }),
        );
      } catch (toolError) {
        console.error(`Tool ${toolCall.name} failed:`, toolError);
        // Add error message to chat history
        const errorMessage =
          `Error: Tool '${toolCall.name}' failed with args: ${JSON.stringify(toolCall.args)}.\n` +
          `Details: ${toolError}. Please try again with different parameters.`;

        chatMessageHistory.push(
          new ToolMessage({
            name: toolCall.name,
            content: errorMessage,
            tool_call_id: String(toolCall.id || ""),
          }),
        );
      }
    }

    // If a tool is called then ask the LLM to comment on it
    if (calls.length > 0) {
      response = await llmWithTools.invoke(chatMessageHistory);
      console.log("Raw LLM response after tool calls:", response);
    }

    let resultContent = response.content;
    if (typeof resultContent !== "string") {
      console.log("Non-string AI response detected:", resultContent);
      resultContent = JSON.stringify(resultContent);
    }
    return resultContent;
  } catch (error) {
    console.error("Error in LLM call: ", error);
    return "Error communicating with model :(";
  }
}
