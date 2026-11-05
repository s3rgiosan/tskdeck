import { create } from "zustand";
import type { UpdateInfo } from "../api/types";

interface UpdateState {
  /** The newer release the last successful check found. */
  update: UpdateInfo | null;
  /** The version that Later hid; its card stays hidden until the app quits. */
  postponed: string | null;
  setUpdate: (update: UpdateInfo | null) => void;
  /** Hides the card for the current release until the app quits. */
  postpone: () => void;
  /** Shows the card again, for a release that a check started by the user found. */
  reveal: () => void;
}

export const useUpdates = create<UpdateState>()((set, get) => ({
  update: null,
  postponed: null,
  setUpdate: (update) => set({ update }),
  postpone: () => set({ postponed: get().update?.version ?? null }),
  reveal: () => set({ postponed: null }),
}));
