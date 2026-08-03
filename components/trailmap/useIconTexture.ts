"use client";

import { createElement, useEffect, useState } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as THREE from "three";
import { getIconMeta } from "./icons";

const TEXTURE_SIZE = 128;

// Module-level cache so every badge sharing an icon (e.g. TypeScript
// appearing in both Skills and an Experience tool badge) rasterizes it once.
const textureCache = new Map<string, THREE.CanvasTexture>();
const inFlight = new Map<string, Promise<THREE.CanvasTexture>>();

function rasterize(iconKey: string, color: string): Promise<THREE.CanvasTexture> {
  const { Icon } = getIconMeta(iconKey);
  const svg = renderToStaticMarkup(createElement(Icon, { color, size: TEXTURE_SIZE }));
  const dataUrl = `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = TEXTURE_SIZE;
      canvas.height = TEXTURE_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("2d context unavailable"));
        return;
      }
      const pad = TEXTURE_SIZE * 0.16;
      ctx.drawImage(img, pad, pad, TEXTURE_SIZE - pad * 2, TEXTURE_SIZE - pad * 2);
      const texture = new THREE.CanvasTexture(canvas);
      texture.needsUpdate = true;
      resolve(texture);
    };
    img.onerror = () => reject(new Error(`failed to rasterize icon "${iconKey}"`));
    img.src = dataUrl;
  });
}

/**
 * Rasterizes a react-icons component (looked up by icon key) into a cached
 * `THREE.CanvasTexture` for use as a plane's material map — the WebGL
 * equivalent of this project's existing procedural canvas-texture pattern
 * (see `components/stations/textures.ts`), applied to brand logos instead
 * of ball/net patterns. Returns null until the (near-instant, but
 * asynchronous) rasterization finishes, and stays null permanently if it
 * fails — callers should render nothing rather than crash on a bad icon.
 */
export function useIconTexture(iconKey: string, color: string): THREE.CanvasTexture | null {
  const cacheKey = `${iconKey}:${color}`;
  const [texture, setTexture] = useState<THREE.CanvasTexture | null>(
    () => textureCache.get(cacheKey) ?? null
  );

  useEffect(() => {
    const cached = textureCache.get(cacheKey);
    if (cached) {
      setTexture(cached);
      return;
    }
    let cancelled = false;
    let promise = inFlight.get(cacheKey);
    if (!promise) {
      promise = rasterize(iconKey, color);
      inFlight.set(cacheKey, promise);
    }
    promise
      .then((tex) => {
        textureCache.set(cacheKey, tex);
        inFlight.delete(cacheKey);
        if (!cancelled) setTexture(tex);
      })
      .catch(() => {
        inFlight.delete(cacheKey);
      });
    return () => {
      cancelled = true;
    };
  }, [cacheKey, iconKey, color]);

  return texture;
}
