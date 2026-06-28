"use client";

import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getAIConfig, deleteAIConfig, type AIConfig } from "@/lib/api";
import { useToast } from "./ToastContext";

interface AIConfigContextType {
  config: AIConfig | null;
  loading: boolean;
  isModalOpen: boolean;
  openModal: () => void;
  closeModal: () => void;
  refreshConfig: () => Promise<void>;
  disconnectAI: () => Promise<void>;
}

const AIConfigContext = createContext<AIConfigContextType | undefined>(undefined);

export function AIConfigProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<AIConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const { addToast } = useToast();

  const refreshConfig = useCallback(async () => {
    try {
      const data = await getAIConfig();
      setConfig(data);
    } catch (err) {
      console.error("Failed to load AI config", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    Promise.resolve().then(() => {
      refreshConfig();
    });
  }, [refreshConfig]);

  const openModal = useCallback(() => setIsModalOpen(true), []);
  const closeModal = useCallback(() => setIsModalOpen(false), []);

  const disconnectAI = useCallback(async () => {
    try {
      setLoading(true);
      await deleteAIConfig();
      setConfig({ configured: false });
      addToast("AI configuration disconnected successfully", "success");
    } catch (err) {
      addToast("Failed to disconnect AI configuration", "error");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [addToast]);

  return (
    <AIConfigContext.Provider
      value={{
        config,
        loading,
        isModalOpen,
        openModal,
        closeModal,
        refreshConfig,
        disconnectAI,
      }}
    >
      {children}
    </AIConfigContext.Provider>
  );
}

export function useAIConfig() {
  const context = useContext(AIConfigContext);
  if (context === undefined) {
    throw new Error("useAIConfig must be used within an AIConfigProvider");
  }
  return context;
}
