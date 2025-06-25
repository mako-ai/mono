import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import { apiClient } from "../lib/api-client";

export interface SyncJob {
  _id: string;
  workspaceId: string;
  name: string;
  dataSourceId: {
    _id: string;
    name: string;
    type: string;
  };
  destinationDatabaseId: {
    _id: string;
    name: string;
    type: string;
  };
  schedule: {
    cron: string;
    timezone: string;
  };
  entityFilter?: string[];
  syncMode: "full" | "incremental";
  enabled: boolean;
  lastRunAt?: string;
  lastSuccessAt?: string;
  lastError?: string;
  nextRunAt?: string;
  runCount: number;
  avgDurationMs?: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface SyncJobExecutionHistory {
  executedAt: string;
  success: boolean;
  error?: string;
  duration?: number;
}

interface SyncJobStore {
  jobs: SyncJob[];
  selectedJobId: string | null;
  isLoading: boolean;
  error: string | null;
  executionHistory: Record<string, SyncJobExecutionHistory[]>;
  hasLoadedOnce: boolean;

  // Actions
  fetchJobs: (workspaceId: string) => Promise<void>;
  createJob: (workspaceId: string, data: Partial<SyncJob>) => Promise<SyncJob>;
  updateJob: (
    workspaceId: string,
    jobId: string,
    data: Partial<SyncJob>,
  ) => Promise<void>;
  deleteJob: (workspaceId: string, jobId: string) => Promise<void>;
  toggleJob: (workspaceId: string, jobId: string) => Promise<void>;
  runJob: (workspaceId: string, jobId: string) => Promise<void>;
  fetchJobHistory: (workspaceId: string, jobId: string) => Promise<void>;
  selectJob: (jobId: string | null) => void;
  clearError: () => void;
  resetLoadedState: () => void;
}

export const useSyncJobStore = create<SyncJobStore>()(
  immer((set, get) => ({
    jobs: [],
    selectedJobId: null,
    isLoading: false,
    error: null,
    executionHistory: {},
    hasLoadedOnce: false,

    fetchJobs: async (workspaceId: string) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.get<{
          success: boolean;
          data: SyncJob[];
          error?: string;
        }>(`/workspaces/${workspaceId}/sync-jobs`);

        if (response.success) {
          set(state => {
            state.jobs = response.data || [];
            state.hasLoadedOnce = true;
            state.error = null;
          });
        } else {
          throw new Error(response.error || "Failed to fetch sync jobs");
        }
      } catch (error: any) {
        set(state => {
          state.error = error.message || "Failed to fetch sync jobs";
        });
      } finally {
        set(state => {
          state.isLoading = false;
        });
      }
    },

    createJob: async (workspaceId: string, data: Partial<SyncJob>) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.post<{
          success: boolean;
          data: SyncJob;
          error?: string;
        }>(`/workspaces/${workspaceId}/sync-jobs`, data);

        if (response.success) {
          const newJob = response.data;
          set(state => {
            state.jobs.push(newJob);
          });
          return newJob;
        } else {
          throw new Error(response.error || "Failed to create sync job");
        }
      } catch (error: any) {
        set(state => {
          state.error = error.message || "Failed to create sync job";
        });
        throw error;
      } finally {
        set(state => {
          state.isLoading = false;
        });
      }
    },

    updateJob: async (
      workspaceId: string,
      jobId: string,
      data: Partial<SyncJob>,
    ) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.put<{
          success: boolean;
          data: SyncJob;
          error?: string;
        }>(`/workspaces/${workspaceId}/sync-jobs/${jobId}`, data);

        if (response.success) {
          set(state => {
            const index = state.jobs.findIndex(job => job._id === jobId);
            if (index !== -1) {
              state.jobs[index] = response.data;
            }
          });
        } else {
          throw new Error(response.error || "Failed to update sync job");
        }
      } catch (error: any) {
        set(state => {
          state.error = error.message || "Failed to update sync job";
        });
        throw error;
      } finally {
        set(state => {
          state.isLoading = false;
        });
      }
    },

    deleteJob: async (workspaceId: string, jobId: string) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.delete<{
          success: boolean;
          error?: string;
          message?: string;
        }>(`/workspaces/${workspaceId}/sync-jobs/${jobId}`);

        if (response.success) {
          set(state => {
            state.jobs = state.jobs.filter(job => job._id !== jobId);
            if (state.selectedJobId === jobId) {
              state.selectedJobId = null;
            }
          });
        } else {
          throw new Error(response.error || "Failed to delete sync job");
        }
      } catch (error: any) {
        set(state => {
          state.error = error.message || "Failed to delete sync job";
        });
        throw error;
      } finally {
        set(state => {
          state.isLoading = false;
        });
      }
    },

    toggleJob: async (workspaceId: string, jobId: string) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.post<{
          success: boolean;
          data: { enabled: boolean; message: string };
          error?: string;
        }>(`/workspaces/${workspaceId}/sync-jobs/${jobId}/toggle`);

        if (response.success) {
          set(state => {
            const index = state.jobs.findIndex(job => job._id === jobId);
            if (index !== -1) {
              state.jobs[index].enabled = response.data.enabled;
            }
          });
        } else {
          throw new Error(response.error || "Failed to toggle sync job");
        }
      } catch (error: any) {
        set(state => {
          state.error = error.message || "Failed to toggle sync job";
        });
      } finally {
        set(state => {
          state.isLoading = false;
        });
      }
    },

    runJob: async (workspaceId: string, jobId: string) => {
      set(state => {
        state.isLoading = true;
        state.error = null;
      });

      try {
        const response = await apiClient.post<{
          success: boolean;
          message?: string;
          data?: any;
          error?: string;
        }>(`/workspaces/${workspaceId}/sync-jobs/${jobId}/run`);

        if (response.success) {
          // Refresh job data to get updated status
          await get().fetchJobs(workspaceId);
        } else {
          throw new Error(response.error || "Failed to run sync job");
        }
      } catch (error: any) {
        set(state => {
          state.error = error.message || "Failed to run sync job";
        });
      } finally {
        set(state => {
          state.isLoading = false;
        });
      }
    },

    fetchJobHistory: async (workspaceId: string, jobId: string) => {
      try {
        const response = await apiClient.get<{
          success: boolean;
          data: { history: SyncJobExecutionHistory[] };
          error?: string;
        }>(`/workspaces/${workspaceId}/sync-jobs/${jobId}/history`);

        if (response.success) {
          set(state => {
            state.executionHistory[jobId] = response.data.history;
          });
        }
      } catch (error: any) {
        console.error("Failed to fetch job history:", error);
      }
    },

    selectJob: (jobId: string | null) => {
      set(state => {
        state.selectedJobId = jobId;
      });
    },

    clearError: () => {
      set(state => {
        state.error = null;
      });
    },

    resetLoadedState: () => {
      set(state => {
        state.hasLoadedOnce = false;
        state.jobs = [];
        state.error = null;
      });
    },
  })),
);
