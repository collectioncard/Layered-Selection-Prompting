import { getChatResponse } from "./apiConnector.ts";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

const chatHistoryList: Element = document.querySelector("#chat-history")!;
const chatInputField: HTMLInputElement =
  document.querySelector("#llm-chat-input")!;
const chatSubmitButton: HTMLButtonElement =
  document.querySelector("#llm-chat-submit")!;

export const chatHistory: BaseMessage[] = [];

// Track whether the model is currently responding
export let isModelResponding: boolean = false;

// Function to mark new turn in the scene (will be set by main.ts)
let markNewTurnCallback: (() => void) | null = null;

export function setMarkNewTurnCallback(callback: () => void): void {
  markNewTurnCallback = callback;
}

document
  .querySelector("#llm-chat-form")!
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const userInputField: HTMLInputElement =
      document.querySelector("#llm-chat-input")!;
    var userMessage = userInputField.value.trim();
    if (!userMessage) return;
    userInputField.value = "";

    // Mark the start of a new turn before processing the message
    if (markNewTurnCallback) {
      markNewTurnCallback();
    }

    addChatMessage(new HumanMessage(userMessage));

    document.dispatchEvent(new CustomEvent("chatResponseStart"));
    let botResponseEntry;

    try {
      botResponseEntry = await getChatResponse(chatHistory);

      //Add all of the new responses from the bot to the chat
      for (const message of botResponseEntry.messages.slice(
        chatHistory.length,
      )) {
        addChatMessage(message);
      }
    } catch (exception) {
      const errorMessage =
        exception instanceof Error ? exception.message : "Unknown error";
      addChatMessage(new AIMessage("Error: " + errorMessage));
    } finally {
      document.dispatchEvent(new CustomEvent("chatResponseEnd"));
    }
  });

export function addChatMessage(chatMessage: BaseMessage): HTMLLIElement {
  //Add message to history
  chatHistory.push(chatMessage);

  // Prepare safe message content for display.
  let displayContent = chatMessage.content;
  if (typeof displayContent === "object") {
    console.log("Detected object message in addChatMessage:", displayContent);
    //I think we can just assume that the first element is the message?
    if (displayContent[0].type === "text") {
      displayContent =
        displayContent[0].text +
        "(+" +
        (displayContent.length - 1) +
        " tool call(s))";
    } else {
      displayContent = JSON.stringify(displayContent);
    }
  }

  //display message in chat box
  const messageItem = document.createElement("li");
  messageItem.innerHTML = `<strong>${chatMessage.getType().toString().toLocaleUpperCase()}:</strong> ${displayContent}`;
  messageItem.style.marginBottom = "10px";
  chatHistoryList.appendChild(messageItem);
  return messageItem;
}

//Detect if something modified the chat box and scroll to the bottom
const observer = new MutationObserver(() => {
  chatHistoryList.scrollTop = chatHistoryList.scrollHeight;
});

observer.observe(chatHistoryList, {
  childList: true,
  subtree: true,
  attributes: true,
  characterData: true,
});

// don't allow users to send messages while the bot is responding
document.addEventListener("chatResponseStart", () => {
  isModelResponding = true;
  chatInputField.disabled = true;
  chatSubmitButton.disabled = true;
  chatInputField.value = "Thinking...";
});

document.addEventListener("chatResponseEnd", () => {
  isModelResponding = false;
  chatInputField.disabled = false;
  chatSubmitButton.disabled = false;
  chatInputField.value = "";
  chatInputField.focus();
});

export async function sendSystemMessage(message: string): Promise<void> {
  const systemMessage = new HumanMessage(message);

  document.dispatchEvent(new CustomEvent("chatResponseStart"));

  try {
    const botResponseEntry = await getChatResponse([
      ...chatHistory,
      systemMessage,
    ]);

    //Add all of the new responses from the bot to the chat
    for (const message of botResponseEntry.messages.slice(chatHistory.length)) {
      addChatMessage(message);
    }
  } catch (exception) {
    const errorMessage =
      exception instanceof Error ? exception.message : "Unknown error";
    addChatMessage(new AIMessage("Error: " + errorMessage));
  } finally {
    document.dispatchEvent(new CustomEvent("chatResponseEnd"));
  }
}

export function clearChatHistory(): void {
  chatHistoryList.innerHTML = "";
  chatHistory.length = 1; // Clear the chat history array
  console.log(chatHistory);
}
