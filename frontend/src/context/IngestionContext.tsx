"use client";

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { getIngestionJob } from "@/lib/api";
import type { IngestionStep } from "@/lib/types";

interface IngestionContextType {
  jobId: string | null;
  jobStatus: "idle" | "running" | "completed" | "failed";
  currentStep: IngestionStep;
  progress: number;
  error: string | null;
  startSync: (jobId: string) => void;
  resetSync: () => void;
}

const IngestionContext = createContext<IngestionContextType | undefined>(undefined);

export function IngestionProvider({ children }: { children: React.ReactNode }) {
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<"idle" | "running" | "completed" | "failed">("idle");
  const [currentStep, setCurrentStep] = useState<IngestionStep>("fetching");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Track consecutive failures to stop polling after threshold
  const failCountRef = useRef(0);
  const MAX_FAILURES = 5;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  // Helper function to start polling
  const startPolling = useCallback((id: string) => {
    if (pollRef.current) clearInterval(pollRef.current);
    failCountRef.current = 0;
    
    pollRef.current = setInterval(async () => {
      try {
        const job = await getIngestionJob(id);
        failCountRef.current = 0;
        setCurrentStep(job.currentStep as IngestionStep);
        setProgress(job.progress);
        
        if (job.status === "completed") {
          setJobStatus("completed");
          setProgress(100);
          localStorage.setItem("active_ingestion_job_status", "completed");
          stopPolling();
        } else if (job.status === "failed") {
          setJobStatus("failed");
          setError(job.error || "Ingestion failed");
          localStorage.setItem("active_ingestion_job_status", "failed");
          stopPolling();
        }
      } catch {
        failCountRef.current += 1;
        // Job not found (stale localStorage from previous session) or too many failures — give up
        if (failCountRef.current >= MAX_FAILURES) {
          setJobStatus("idle");
          setError(null);
          localStorage.removeItem("active_ingestion_job_id");
          localStorage.removeItem("active_ingestion_job_status");
          stopPolling();
        }
      }
    }, 1000);
  }, [stopPolling]);

  // Read initial job state from localStorage to persist across navigation and reloads
  useEffect(() => {
    const savedJobId = localStorage.getItem("active_ingestion_job_id");
    const savedStatus = localStorage.getItem("active_ingestion_job_status");
    if (savedJobId && savedStatus === "running") {
      // Check if the job still exists before starting the poll loop
      getIngestionJob(savedJobId).then((job) => {
        if (job.status === "running") {
          setJobId(savedJobId);
          setJobStatus("running");
          setCurrentStep("fetching");
          setProgress(0);
          startPolling(savedJobId);
        } else {
          // Job already finished while we were away — adopt its terminal state
          setJobStatus(job.status);
          setProgress(job.status === "completed" ? 100 : job.progress);
          localStorage.setItem("active_ingestion_job_status", job.status);
        }
      }).catch(() => {
        // Stale entry from a previous server lifetime — clean up
        localStorage.removeItem("active_ingestion_job_id");
        localStorage.removeItem("active_ingestion_job_status");
      });
    }
  }, [startPolling]);

  const startSync = (id: string) => {
    setJobId(id);
    setJobStatus("running");
    setCurrentStep("fetching");
    setProgress(0);
    setError(null);
    localStorage.setItem("active_ingestion_job_id", id);
    localStorage.setItem("active_ingestion_job_status", "running");
    startPolling(id);
  };

  const resetSync = () => {
    setJobId(null);
    setJobStatus("idle");
    setProgress(0);
    setError(null);
    localStorage.removeItem("active_ingestion_job_id");
    localStorage.removeItem("active_ingestion_job_status");
    stopPolling();
  };

  useEffect(() => {
    return stopPolling;
  }, [stopPolling]);

  return (
    <IngestionContext.Provider value={{ jobId, jobStatus, currentStep, progress, error, startSync, resetSync }}>
      {children}
    </IngestionContext.Provider>
  );
}

export function useIngestion() {
  const context = useContext(IngestionContext);
  if (!context) {
    throw new Error("useIngestion must be used within IngestionProvider");
  }
  return context;
}
