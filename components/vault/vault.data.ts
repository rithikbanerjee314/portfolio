import type { ComponentType } from "react";
import FishObject from "./objects/FishObject";

/**
 * Ordered list of project ids (each a real entry in
 * `components/stations/stations.data.ts`) shown inside the vault room.
 * This is the whole "add a new vault exhibit" workflow: write a
 * `StationContent` entry in `stations.data.ts` (it no longer needs a
 * `STATION_ORDER` slot — the vault isn't a main-stage station), add its 3D
 * object to `VAULT_OBJECTS` below, and push its id here.
 */
export const VAULT_PROJECT_IDS: string[] = ["fish"];

/** Each vault project's 3D exhibit — receives no props beyond an optional click handler; the room places it on a pedestal. */
export const VAULT_OBJECTS: Record<string, ComponentType<{ onClick?: () => void }>> = {
  fish: FishObject,
};
