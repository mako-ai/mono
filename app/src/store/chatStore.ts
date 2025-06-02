import { create } from "zustand";
import { persist } from "zustand/middleware";
import { Message, AttachedContext } from "../components/Chat/types";

export interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: Date;
  lastMessageAt?: Date;
}

interface ChatState {
  // Chat sessions
  chatSessions: ChatSession[];
  currentChatId: string | null;

  // Actions for chat sessions
  createNewChat: () => string; // Returns the new chat ID
  setCurrentChat: (chatId: string) => void;
  deleteChat: (chatId: string) => void;

  // Messages - these now operate on the current chat
  addMessage: (message: Message) => void;
  updateMessage: (id: string, content: string) => void;
  clearCurrentMessages: () => void;

  // Get current chat helper
  getCurrentChat: () => ChatSession | null;
  getCurrentMessages: () => Message[];

  // Attached context (persists across chats for convenience)
  attachedContext: AttachedContext[];
  addContextItem: (item: AttachedContext) => void;
  removeContextItem: (id: string) => void;
  clearAttachedContext: () => void;
  updateContextItem: (id: string, updates: Partial<AttachedContext>) => void;

  // Conditional context attach
  ensureContextItems: (items: AttachedContext[]) => void;

  // Model selection
  selectedModel: string;
  setSelectedModel: (model: string) => void;

  // Error state
  error: string | null;
  setError: (error: string | null) => void;
}

// Helper to generate chat title from first message
const generateChatTitle = (messages: Message[]): string => {
  if (messages.length === 0) return "New Chat";
  const firstUserMessage = messages.find((m) => m.role === "user");
  if (!firstUserMessage) return "New Chat";

  // Take first 50 characters of the first user message
  const title = firstUserMessage.content.substring(0, 50);
  return title.length < firstUserMessage.content.length ? title + "..." : title;
};

export const useChatStore = create<ChatState>()(
  persist(
    (set, get) => ({
      // Chat sessions
      chatSessions: [],
      currentChatId: null,

      // Actions for chat sessions
      createNewChat: () => {
        const state = get();
        const currentChat = state.getCurrentChat();

        // If current chat is empty and no context, just reuse it and clear context
        if (
          currentChat &&
          currentChat.messages.length === 0 &&
          state.attachedContext.length === 0
        ) {
          // Reset any error state and clear attached context
          set({
            error: null,
            attachedContext: [],
          });
          return currentChat.id;
        }

        // Otherwise create a new chat
        const id = Date.now().toString() + Math.random();
        const newChat: ChatSession = {
          id,
          title: "New Chat",
          messages: [],
          createdAt: new Date(),
        };

        set((state) => ({
          chatSessions: [...state.chatSessions, newChat],
          currentChatId: id,
          error: null,
          attachedContext: [], // Clear attached context for new chat
        }));

        return id;
      },

      setCurrentChat: (chatId) => set({ currentChatId: chatId }),

      deleteChat: (chatId) =>
        set((state) => {
          const filtered = state.chatSessions.filter(
            (chat) => chat.id !== chatId
          );
          const newCurrentId =
            state.currentChatId === chatId
              ? filtered.length > 0
                ? filtered[filtered.length - 1].id
                : null
              : state.currentChatId;

          // If no chats left, create a new empty one
          if (filtered.length === 0) {
            const newChat: ChatSession = {
              id: Date.now().toString() + Math.random(),
              title: "New Chat",
              messages: [],
              createdAt: new Date(),
            };
            return {
              chatSessions: [newChat],
              currentChatId: newChat.id,
            };
          }

          return {
            chatSessions: filtered,
            currentChatId: newCurrentId,
          };
        }),

      // Get current chat helpers
      getCurrentChat: () => {
        const state = get();
        return (
          state.chatSessions.find((chat) => chat.id === state.currentChatId) ||
          null
        );
      },

      getCurrentMessages: () => {
        const currentChat = get().getCurrentChat();
        return currentChat ? currentChat.messages : [];
      },

      // Messages - operate on current chat
      addMessage: (message) =>
        set((state) => {
          if (!state.currentChatId) {
            // Create a new chat if none exists
            const newChatId = get().createNewChat();
            state = get(); // Re-get state after creating chat
          }

          return {
            chatSessions: state.chatSessions.map((chat) => {
              if (chat.id === state.currentChatId) {
                const updatedMessages = [...chat.messages, message];
                return {
                  ...chat,
                  messages: updatedMessages,
                  title: generateChatTitle(updatedMessages),
                  lastMessageAt: new Date(),
                };
              }
              return chat;
            }),
          };
        }),

      updateMessage: (id, content) =>
        set((state) => ({
          chatSessions: state.chatSessions.map((chat) => {
            if (chat.id === state.currentChatId) {
              return {
                ...chat,
                messages: chat.messages.map((msg) =>
                  msg.id === id
                    ? { ...msg, content: msg.content + content }
                    : msg
                ),
                lastMessageAt: new Date(),
              };
            }
            return chat;
          }),
        })),

      clearCurrentMessages: () =>
        set((state) => ({
          chatSessions: state.chatSessions.map((chat) => {
            if (chat.id === state.currentChatId) {
              return {
                ...chat,
                messages: [],
                title: "New Chat",
              };
            }
            return chat;
          }),
        })),

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
      updateContextItem: (id, updates) =>
        set((state) => ({
          attachedContext: state.attachedContext.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        })),

      // Conditional context attach
      ensureContextItems: (items) => {
        const state = get();
        const isVirgin = state.getCurrentMessages().length === 0;
        if (!isVirgin) return; // preserve existing context once chat has messages

        // Replace context entirely with the provided items
        set({ attachedContext: items });
      },

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
        // Only persist non-empty chats
        chatSessions: state.chatSessions.filter(
          (chat) => chat.messages.length > 0
        ),
        currentChatId: state.currentChatId,
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
          if (data.state?.chatSessions) {
            data.state.chatSessions = data.state.chatSessions.map(
              (chat: any) => ({
                ...chat,
                createdAt: new Date(chat.createdAt),
                lastMessageAt: chat.lastMessageAt
                  ? new Date(chat.lastMessageAt)
                  : undefined,
                messages: chat.messages.map((msg: any) => ({
                  ...msg,
                  timestamp: new Date(msg.timestamp),
                })),
              })
            );
          }

          // If no chats exist after loading, ensure we have at least one empty chat
          if (
            !data.state?.chatSessions ||
            data.state.chatSessions.length === 0
          ) {
            const newChat: ChatSession = {
              id: Date.now().toString() + Math.random(),
              title: "New Chat",
              messages: [],
              createdAt: new Date(),
            };
            data.state = {
              ...data.state,
              chatSessions: [newChat],
              currentChatId: newChat.id,
            };
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
