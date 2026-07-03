"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import {
  answerQuery,
  addSessionFeedback,
  distillSession,
  listServerConversations,
  getServerConversation,
  saveServerConversation,
  deleteServerConversation,
} from "@/lib/api";
import type { ChatMessage, GuidanceResult } from "@/lib/types";

export interface ConversationMeta {
  id: string;
  title: string;
  updatedAt: string;
  messageCount: number;
}

interface ChatContextType {
  messages: ChatMessage[];
  setMessages: React.Dispatch<React.SetStateAction<ChatMessage[]>>;
  input: string;
  setInput: (val: string) => void;
  isProcessing: boolean;
  showHistory: boolean;
  setShowHistory: React.Dispatch<React.SetStateAction<boolean>>;
  convIndex: ConversationMeta[];
  activeConvId: string | null;
  handleSubmit: (query?: string) => Promise<void>;
  newConversation: () => void;
  switchToConversation: (convId: string) => void;
  deleteConversation: (convId: string) => void;
  feedbackState: Record<string, "up" | "down">;
  setFeedback: (msgId: string, qaId: string | undefined, score: 1 | -1) => void;
  guidanceDocs: string[];
  guidanceDismissed: boolean;
  dismissGuidance: () => void;
}

const ChatContext = createContext<ChatContextType | undefined>(undefined);

const CONV_INDEX_KEY = "ask-conv-index";
const ACTIVE_CONV_KEY = "ask-active-conv-id";
const OLD_CUR_KEY = "ask-messages";

function getConvIndex(): ConversationMeta[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(CONV_INDEX_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function persistConvIndex(list: ConversationMeta[]) {
  try { localStorage.setItem(CONV_INDEX_KEY, JSON.stringify(list)); } catch {}
}

function convMsgKey(id: string) {
  return `ask-conv-${id}`;
}

function saveConvMessages(id: string, msgs: ChatMessage[]) {
  try { localStorage.setItem(convMsgKey(id), JSON.stringify(msgs)); } catch {}
}

function loadConvMessages(id: string): ChatMessage[] | null {
  try {
    const raw = localStorage.getItem(convMsgKey(id));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function deleteConvMessages(id: string) {
  try { localStorage.removeItem(convMsgKey(id)); } catch {}
}

function generateTitle(msgs: ChatMessage[]): string {
  if (msgs.length === 0) return "Empty conversation";
  const first = msgs[0].query;
  return first.length > 45 ? first.slice(0, 42) + "..." : first;
}

export function ChatProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [convIndex, setConvIndex] = useState<ConversationMeta[]>([]);
  const [activeConvId, setActiveConvId] = useState<string | null>(null);
  
  const [feedbackState, setFeedbackState] = useState<Record<string, "up" | "down">>({});
  const [guidanceDocs, setGuidanceDocs] = useState<string[]>([]);
  const [guidanceDismissed, setGuidanceDismissed] = useState(false);
  const epochRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  // Initialize and migrate on mount
  useEffect(() => {
    Promise.resolve().then(() => {
      const index = getConvIndex();
      setConvIndex(index);

      const storedActiveId = localStorage.getItem(ACTIVE_CONV_KEY);
      if (storedActiveId) {
        const storedMsgs = loadConvMessages(storedActiveId);
        if (storedMsgs) {
          setMessages(storedMsgs);
          setActiveConvId(storedActiveId);
          return;
        }
      }

      // Migration / Fallback for old schema
      try {
        const oldMsgsRaw = localStorage.getItem(OLD_CUR_KEY);
        if (oldMsgsRaw) {
          const oldMsgs = JSON.parse(oldMsgsRaw) as ChatMessage[];
          if (oldMsgs && oldMsgs.length > 0) {
            const newId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
            saveConvMessages(newId, oldMsgs);
            localStorage.setItem(ACTIVE_CONV_KEY, newId);
            setActiveConvId(newId);
            setMessages(oldMsgs);
            
            // Add to index
            const newMeta: ConversationMeta = {
              id: newId,
              title: generateTitle(oldMsgs),
              updatedAt: new Date().toISOString(),
              messageCount: oldMsgs.length,
            };
            const updatedIndex = [newMeta, ...index];
            persistConvIndex(updatedIndex);
            setConvIndex(updatedIndex);
            
            localStorage.removeItem(OLD_CUR_KEY);
            return;
          }
        }
      } catch (e) {
        console.error("Migration failed:", e);
      }

      setMessages([]);
      setActiveConvId(null);
    });
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      abortRef.current = null;
    };
  }, []);

  // Hydrate the conversation index from the server so past chats appear even on
  // a fresh device or after a browser clear. Merges with local, newest first.
  useEffect(() => {
    let cancelled = false;
    listServerConversations()
      .then((server) => {
        if (cancelled || !server || server.length === 0) return;
        const local = getConvIndex();
        const byId = new Map<string, ConversationMeta>();
        for (const c of local) byId.set(c.id, c);
        for (const s of server) {
          if (!byId.has(s.id)) {
            byId.set(s.id, { id: s.id, title: s.title, updatedAt: s.updatedAt, messageCount: 0 });
          }
        }
        const merged = Array.from(byId.values()).sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        persistConvIndex(merged);
        setConvIndex(merged);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const setFeedback = useCallback(async (msgId: string, qaId: string | undefined, score: 1 | -1) => {
    if (!qaId) return;
    setFeedbackState(prev => ({ ...prev, [msgId]: score === 1 ? "up" : "down" }));
    try {
      await addSessionFeedback("default_session", qaId, score);
    } catch {
      setFeedbackState(prev => {
        const next = { ...prev };
        delete next[msgId];
        return next;
      });
    }
  }, []);

  const dismissGuidance = useCallback(() => {
    setGuidanceDismissed(true);
  }, []);

  // Fetch session guidance after each completed answer
  useEffect(() => {
    if (messages.length > 0 && !isProcessing) {
      const lastMsg = messages[messages.length - 1];
      if (!lastMsg.isError) {
        distillSession().then((result: GuidanceResult) => {
          if (result?.documents?.length > 0) {
            setGuidanceDocs(result.documents);
          }
        }).catch(() => {});
      }
    }
  }, [messages.length, isProcessing]);

  // Reset guidance dismissal when switching conversations
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setGuidanceDismissed(false);
    setGuidanceDocs([]);
  }, [activeConvId]);

  const newConversation = useCallback(() => {
    setMessages([]);
    setActiveConvId(null);
    localStorage.removeItem(ACTIVE_CONV_KEY);
    setShowHistory(false);
  }, []);

  const switchToConversation = useCallback((convId: string) => {
    const stored = loadConvMessages(convId);
    if (stored) {
      setMessages(stored);
      setActiveConvId(convId);
      localStorage.setItem(ACTIVE_CONV_KEY, convId);
      setShowHistory(false);
      return;
    }
    // Not cached locally (e.g. opened on another device): pull from the server.
    getServerConversation(convId)
      .then((res) => {
        if (res?.messages?.length) {
          saveConvMessages(convId, res.messages);
          setMessages(res.messages);
          setActiveConvId(convId);
          localStorage.setItem(ACTIVE_CONV_KEY, convId);
        } else {
          throw new Error("empty");
        }
      })
      .catch(() => {
        const index = getConvIndex();
        const updated = index.filter((c) => c.id !== convId);
        persistConvIndex(updated);
        setConvIndex(updated);
      });
    setShowHistory(false);
  }, []);

  const deleteConversation = useCallback((convId: string) => {
    deleteConvMessages(convId);
    void deleteServerConversation(convId).catch(() => {});
    const index = getConvIndex();
    const updated = index.filter(c => c.id !== convId);
    persistConvIndex(updated);
    setConvIndex(updated);
    
    // If the deleted conversation is the active one, clear active state
    if (activeConvId === convId) {
      setMessages([]);
      setActiveConvId(null);
      localStorage.removeItem(ACTIVE_CONV_KEY);
    }
  }, [activeConvId]);

  const handleSubmit = async (query?: string) => {
    const q = (query || input).trim();
    if (!q || isProcessing) return;

    const epoch = ++epochRef.current;
    setIsProcessing(true);
    setInput("");

    // Abort previous active request if any
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    // Helper to persist conversation and update states purely without react state-updater side-effects
    const handleSaveConversation = (response: ChatMessage) => {
      const next = [...messages, response];
      let currentId = activeConvId;
      const index = getConvIndex();
      
      if (!currentId) {
        // Generate new conversation ID
        currentId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        setActiveConvId(currentId);
        localStorage.setItem(ACTIVE_CONV_KEY, currentId);
        
        const newMeta: ConversationMeta = {
          id: currentId,
          title: generateTitle(next),
          updatedAt: new Date().toISOString(),
          messageCount: next.length,
        };
        const updatedIndex = [newMeta, ...index];
        persistConvIndex(updatedIndex);
        setConvIndex(updatedIndex);
      } else {
        // Update existing conversation in index
        const existingIndex = index.findIndex(c => c.id === currentId);
        let updatedIndex = [...index];
        
        if (existingIndex !== -1) {
          const updatedMeta = {
            ...updatedIndex[existingIndex],
            updatedAt: new Date().toISOString(),
            messageCount: next.length,
            title: updatedIndex[existingIndex].title === "Empty conversation" ? generateTitle(next) : updatedIndex[existingIndex].title
          };
          updatedIndex.splice(existingIndex, 1);
          updatedIndex = [updatedMeta, ...updatedIndex];
        } else {
          // If somehow not in index but has active id
          const newMeta: ConversationMeta = {
            id: currentId,
            title: generateTitle(next),
            updatedAt: new Date().toISOString(),
            messageCount: next.length,
          };
          updatedIndex = [newMeta, ...updatedIndex];
        }
        persistConvIndex(updatedIndex);
        setConvIndex(updatedIndex);
      }
      
      saveConvMessages(currentId, next);
      setMessages(next);

      // Mirror to the server so history is durable and cross-device (best-effort).
      void saveServerConversation(currentId, generateTitle(next), next).catch(() => {});
    };

    try {
      const response = await answerQuery(q, controller.signal);
      if (epoch !== epochRef.current) return;
      handleSaveConversation(response);
      // Note: the turn is persisted into Cognee memory by the backend inside
      // answer_query (with richer context), so we intentionally do NOT call
      // rememberChatTurn here, doing so would double-write and double-cognify.
    } catch (e) {
      if ((e as Error)?.name === "AbortError") return;
      if (epoch !== epochRef.current) return;
      
      const msg = e instanceof Error ? e.message : "Failed to get answer";
      const isAuthError = msg.includes("401") || msg.includes("403") || msg.includes("required");
      
      const cleanMsg = isAuthError
        ? "Access denied. Configure a personal API key in Settings to use AI features."
        : `Error: ${msg}. Make sure the backend is running.`;

      const errorMsg: ChatMessage = {
        id: Math.random().toString(36).slice(2),
        query: q,
        intent: null,
        answer: cleanMsg,
        sources: [],
        diffCard: null,
        timeline: null,
        timestamp: new Date().toISOString(),
        isError: true,
      };

      handleSaveConversation(errorMsg);
    } finally {
      if (epoch === epochRef.current) {
        setIsProcessing(false);
      }
    }
  };

  return (
    <ChatContext.Provider
      value={{
        messages,
        setMessages,
        input,
        setInput,
        isProcessing,
        showHistory,
        setShowHistory,
        convIndex,
        activeConvId,
        handleSubmit,
        newConversation,
        switchToConversation,
        deleteConversation,
        feedbackState,
        setFeedback,
        guidanceDocs,
        guidanceDismissed,
        dismissGuidance,
      }}
    >
      {children}
    </ChatContext.Provider>
  );
}

export function useChat() {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error("useChat must be used within ChatProvider");
  }
  return context;
}
