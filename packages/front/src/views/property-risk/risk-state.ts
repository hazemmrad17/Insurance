/**
 * RiskState — Shared session state for the Risk Hub
 * ===================================================
 *
 * Holds the current assessment result so all 4 tabs (Locate, Expert,
 * Inspect, Evaluate) can access it without a full state management lib.
 *
 * Usage:
 *   import { RiskState } from './risk-state.js';
 *   RiskState.setAssessment(data);
 *   const data = RiskState.getAssessment();
 *   RiskState.subscribe((key, value) => { ... });
 */

import type { RiskAssessmentInput } from '../../risk-assessment/schema.js';

/* ═══════════════════════════════════════════════════════════════
   Peril Scores
   ═══════════════════════════════════════════════════════════════ */

export interface PerilScores {
  inondation: number;
  rga: number;
  tempete: number;
  incendie: number;
  seisme: number;
  global: number;
}

/* ═══════════════════════════════════════════════════════════════
   State Shape
   ═══════════════════════════════════════════════════════════════ */

interface RiskStateData {
  currentAssessment: RiskAssessmentInput | null;
  currentCoords: { lat: number; lon: number } | null;
  currentAddress: string | null;
  currentBanId: string | null;
  scores: PerilScores | null;
  isLoading: boolean;
  loadingProgress: { message: string; done: number; total: number } | null;
}

type Subscriber = (key: keyof RiskStateData, value: any) => void;

/* ═══════════════════════════════════════════════════════════════
   Singleton
   ═══════════════════════════════════════════════════════════════ */

class RiskStateSingleton {
  private state: RiskStateData = {
    currentAssessment: null,
    currentCoords: null,
    currentAddress: null,
    currentBanId: null,
    scores: null,
    isLoading: false,
    loadingProgress: null,
  };

  private subscribers = new Set<Subscriber>();

  /* ── Getters ── */

  getAssessment(): RiskAssessmentInput | null {
    return this.state.currentAssessment;
  }

  getCoords(): { lat: number; lon: number } | null {
    return this.state.currentCoords;
  }

  getAddress(): string | null {
    return this.state.currentAddress;
  }

  getBanId(): string | null {
    return this.state.currentBanId;
  }

  getScores(): PerilScores | null {
    return this.state.scores;
  }

  getIsLoading(): boolean {
    return this.state.isLoading;
  }

  getLoadingProgress(): { message: string; done: number; total: number } | null {
    return this.state.loadingProgress;
  }

  /* ── Setters ── */

  setAssessment(value: RiskAssessmentInput | null): void {
    this.state.currentAssessment = value;
    this.notify('currentAssessment', value);
  }

  setCoords(value: { lat: number; lon: number } | null): void {
    this.state.currentCoords = value;
    this.notify('currentCoords', value);
  }

  setAddress(value: string | null): void {
    this.state.currentAddress = value;
    this.notify('currentAddress', value);
  }

  setBanId(value: string | null): void {
    this.state.currentBanId = value;
    this.notify('currentBanId', value);
  }

  setScores(value: PerilScores | null): void {
    this.state.scores = value;
    this.notify('scores', value);
  }

  setLoading(value: boolean): void {
    this.state.isLoading = value;
    this.notify('isLoading', value);
  }

  setLoadingProgress(value: { message: string; done: number; total: number } | null): void {
    this.state.loadingProgress = value;
    this.notify('loadingProgress', value);
  }

  /* ── Actions ── */

  /** Clear all state (for reset / new search) */
  clear(): void {
    this.state.currentAssessment = null;
    this.state.currentCoords = null;
    this.state.currentAddress = null;
    this.state.currentBanId = null;
    this.state.scores = null;
    this.state.isLoading = false;
    this.state.loadingProgress = null;
    // Notify all
    for (const key of Object.keys(this.state) as (keyof RiskStateData)[]) {
      this.notify(key, this.state[key]);
    }
  }

  /** Subscribe to state changes. Returns an unsubscribe function. */
  subscribe(callback: Subscriber): () => void {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  private notify(key: keyof RiskStateData, value: any): void {
    for (const cb of this.subscribers) {
      try { cb(key, value); } catch { /* ignore subscriber errors */ }
    }
  }
}

/** Singleton instance */
export const RiskState = new RiskStateSingleton();
