import { getChatResponse, initilizeLLM } from "./apiConnector.ts";
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages";

const chatHistoryList: Element = document.querySelector("#chat-history")!;
const chatInputField: HTMLInputElement =
  document.querySelector("#llm-chat-input")!;
const chatSubmitButton: HTMLButtonElement =
  document.querySelector("#llm-chat-submit")!;

export const chatHistory: BaseMessage[] = [];

initilizeLLM(chatHistory).then(() => {
  console.log(chatHistory);
});

document
  .querySelector("#llm-chat-form")!
  .addEventListener("submit", async function (event) {
    event.preventDefault();

    const userInputField: HTMLInputElement =
      document.querySelector("#llm-chat-input")!;
    var userMessage = userInputField.value.trim();
    if (!userMessage) return;
    userInputField.value = "";

    addChatMessage(new HumanMessage(userMessage));

    document.dispatchEvent(new CustomEvent("chatResponseStart"));
    let botResponseEntry: string;

    try {
      botResponseEntry = await getChatResponse(chatHistory);
      if (botResponseEntry.startsWith("Error:")) {
        addChatMessage(
          new AIMessage(
            "Oops, there was a problem" +
              botResponseEntry.replace(/^Error:\s*/, ""),
          ),
        );
      } else {
        addChatMessage(new AIMessage(botResponseEntry));
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
    displayContent = JSON.stringify(displayContent);
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
  chatInputField.disabled = true;
  chatSubmitButton.disabled = true;
  chatInputField.value = "Thinking...";
});

document.addEventListener("chatResponseEnd", () => {
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

    if (botResponseEntry.startsWith("Error:")) {
      addChatMessage(
        new AIMessage(
          "Oops, there was a problem: " +
            botResponseEntry.replace(/^Error:\s*/, ""),
        ),
      );
    } else {
      addChatMessage(new AIMessage(botResponseEntry));
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
