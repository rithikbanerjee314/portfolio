"use client";

import { create } from "zustand";

export type DeviceTier = "low" | "mid" | "high";

interface UIState {
  deviceTier: DeviceTier;
  webglSupported: boolean;
  reducedMotion: boolean;
  /** True once the main world Canvas has rendered its first real frame — drives the initial-load splash/reveal crossfade in Overlay/page. */
  sceneReady: boolean;
  /** Whether live Rapier physics sims should run (false = procedural fallback on low-end devices) */
  physicsEnabled: boolean;
  /** Normalized 0-1 progress along the mountain-climb path, throttled updates */
  progress: number;
  /** id of the nearest station to current progress */
  currentStationId: string;
  /** true when the camera is settled at a station (low scroll velocity, close to its t) */
  isParked: boolean;
  /** which station's info pane is open (DOM side panel), null = closed */
  openPaneId: string | null;
  /**
   * Station whose pane should open once the camera actually ARRIVES there,
   * set by any "travel there and show me its info" control (quick-nav,
   * StationLabel, the summit overlook's beacon labels). Same
   * pending-until-parked idiom as `mapPending`/`vaultPending` below.
   *
   * These controls used to call `setOpenPaneId` directly, which opened the
   * panel instantly while the camera was still travelling — barely noticeable
   * when travel was a ~0.3s snap, clearly wrong now that it's a deliberate
   * 1.1-5.3s climb (see CameraRig's travel tween). `StationPane` owns the
   * watcher that consumes this.
   */
  pendingPaneId: string | null;
  /**
   * Manually-projected screen-space position (CSS px) of each station's
   * beacon, written every frame from inside the Canvas (`Beacons.tsx`) and
   * read by the DOM overlay to draw "click to travel" labels next to them
   * from the summit overlook. Deliberately NOT drei's `<Html>` — that
   * mechanism was found unreliable specifically from the overlook camera
   * (see CLAUDE.md lessons 26-28), so this reimplements the same
   * world-to-screen projection directly and renders as plain DOM instead.
   */
  beaconLabels: Record<string, { x: number; y: number; visible: boolean }>;
  /** true once the visitor is parked at the trailmap station and the fullscreen overlay is showing */
  mapOpen: boolean;
  /** true from the moment the trailmap sign is clicked until the camera finishes parking there (or gives up) */
  mapPending: boolean;
  /** true once the visitor is parked at the vault station and the fullscreen vault room is showing */
  vaultOpen: boolean;
  /** true from the moment the treasure chest is clicked until the camera finishes parking there (or gives up) — also drives the chest's lid-open tween */
  vaultPending: boolean;
  /** which vault project's detail sheet is showing (id into stations.data.ts), null = none selected */
  vaultSelectedId: string | null;
  setDeviceTier: (t: DeviceTier) => void;
  setWebglSupported: (v: boolean) => void;
  setReducedMotion: (v: boolean) => void;
  setSceneReady: (v: boolean) => void;
  setProgress: (p: number) => void;
  setCurrentStationId: (id: string) => void;
  setIsParked: (v: boolean) => void;
  /**
   * Single batched write for the three fields CameraRig updates together
   * every throttled tick. Three separate setters meant three synchronous
   * subscriber notifications — i.e. up to three full DOM-overlay re-renders
   * — for what is one logical change. Also skips the write entirely when
   * nothing actually differs, which is the common case while the visitor is
   * standing still at a station.
   */
  setCameraState: (progress: number, stationId: string, parked: boolean) => void;
  setOpenPaneId: (id: string | null) => void;
  setPendingPaneId: (id: string | null) => void;
  /**
   * The single entry point for every "travel to this station and open its
   * info pane" control. Starts the camera's eased travel and defers the pane
   * until arrival, rather than opening it on top of a camera that's still
   * moving. Falls back to opening immediately when there's no camera rig to
   * travel (no WebGL, or the world canvas hasn't mounted yet), since in that
   * case there is no arrival to wait for.
   */
  travelToStation: (stationId: string, t: number) => void;
  setBeaconLabels: (labels: Record<string, { x: number; y: number; visible: boolean }>) => void;
  setMapOpen: (v: boolean) => void;
  setMapPending: (v: boolean) => void;
  setVaultOpen: (v: boolean) => void;
  setVaultPending: (v: boolean) => void;
  setVaultSelectedId: (id: string | null) => void;
  /**
   * Travel the camera to progress `t` along the climb. Eased over a real,
   * distance-scaled duration by default (see CameraRig's tween) — pass
   * `{ immediate: true }` only where there is no journey worth showing, i.e.
   * restoring a deep-linked position on page load.
   */
  requestScrollTo: ((t: number, opts?: { immediate?: boolean }) => void) | null;
  setScrollHandler: (fn: ((t: number, opts?: { immediate?: boolean }) => void) | null) => void;
}

export const useUIStore = create<UIState>((set, get) => ({
  deviceTier: "mid",
  webglSupported: true,
  reducedMotion: false,
  sceneReady: false,
  physicsEnabled: true,
  progress: 0,
  currentStationId: "base",
  isParked: false,
  openPaneId: null,
  pendingPaneId: null,
  beaconLabels: {},
  mapOpen: false,
  mapPending: false,
  vaultOpen: false,
  vaultPending: false,
  vaultSelectedId: null,
  setDeviceTier: (deviceTier) =>
    set({ deviceTier, physicsEnabled: deviceTier !== "low" }),
  setWebglSupported: (webglSupported) => set({ webglSupported }),
  setReducedMotion: (reducedMotion) => set({ reducedMotion }),
  setSceneReady: (sceneReady) => set({ sceneReady }),
  setProgress: (progress) => set({ progress }),
  setCurrentStationId: (currentStationId) => set({ currentStationId }),
  setIsParked: (isParked) => set({ isParked }),
  setCameraState: (progress, currentStationId, isParked) => {
    const s = get();
    if (
      s.progress === progress &&
      s.currentStationId === currentStationId &&
      s.isParked === isParked
    ) {
      return;
    }
    set({ progress, currentStationId, isParked });
  },
  setOpenPaneId: (openPaneId) => set({ openPaneId }),
  setPendingPaneId: (pendingPaneId) => set({ pendingPaneId }),
  travelToStation: (stationId, t) => {
    const { requestScrollTo } = get();
    if (!requestScrollTo) {
      set({ openPaneId: stationId, pendingPaneId: null });
      return;
    }
    requestScrollTo(t);
    set({ pendingPaneId: stationId });
  },
  setBeaconLabels: (beaconLabels) => set({ beaconLabels }),
  setMapOpen: (mapOpen) => set({ mapOpen }),
  setMapPending: (mapPending) => set({ mapPending }),
  setVaultOpen: (vaultOpen) => set({ vaultOpen }),
  setVaultPending: (vaultPending) => set({ vaultPending }),
  setVaultSelectedId: (vaultSelectedId) => set({ vaultSelectedId }),
  requestScrollTo: null,
  setScrollHandler: (fn) => set({ requestScrollTo: fn }),
}));
