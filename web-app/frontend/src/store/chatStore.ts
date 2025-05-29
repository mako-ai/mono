import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Message, AttachedContext } from "../components/Chat/types";

interface ChatState {
  // Messages
  messages: Message[];
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  clearMessages: () => void;

  // Attached context
  attachedContext: AttachedContext[];
  addContextItem: (item: AttachedContext) => void;
  removeContextItem: (id: string) => void;
  clearAttachedContext: () => void;

  // Model selection
  selectedModel: string;
  setSelectedModel: (model: string) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      // Messages
      messages: [],
      addMessage: (message) =>
        set((state) => ({
          messages: [...state.messages, message],
        })),
      updateMessage: (id, content) =>
        set((state) => ({
          messages: state.messages.map((msg) =>
            msg.id === id ? { ...msg, content: msg.content + content } : msg
          ),
        })),
      clearMessages: () => set({ messages: [] }),

      // Attached context
      attachedContext: [],
      addContextItem: (item) =>
        set((state) => ({
          attachedContext: [...state.attachedContext, item],
        })),
      removeContextItem: (id) =>
        set((state) => ({
          attachedContext: state.attachedContext.filter(
            (item) => item.id !== id
          ),
        })),
      clearAttachedContext: () => set({ attachedContext: [] }),

      // Model selection
      selectedModel: "gpt-3.5-turbo",
      setSelectedModel: (model) => set({ selectedModel: model }),

      // Error state
      error: null,
      setError: (error) => set({ error }),
    }),
    {
      name: "chat-store", // unique name for localStorage key
      partialize: (state) => ({
        // Only persist what we want
        messages: state.messages,
        attachedContext: state.attachedContext,
        selectedModel: state.selectedModel,
      }),
      // Handle Date serialization/deserialization
      storage: {
        getItem: (name) => {
          const str = localStorage.getItem(name);
          if (!str) return null;

          const data = JSON.parse(str);
          // Convert timestamp strings back to Date objects
          if (data.state?.messages) {
            data.state.messages = data.state.messages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
            }));
          }
          return data;
        },
        setItem: (name, value) => {
          localStorage.setItem(name, JSON.stringify(value));
        },
        removeItem: (name) => {
          localStorage.removeItem(name);
        },
      },
    }
  )
);
