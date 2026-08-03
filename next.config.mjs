/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack(config, { isServer }) {
    // In dev mode, Next disables splitChunks entirely for the client config
    // (config.optimization.splitChunks is literally `false`, not an object)
    // — spreading into `.cacheGroups` on that crashes `next dev` outright.
    // Skip in that case: dev mode doesn't do the eager-chunk-hoisting this
    // override exists to prevent in the first place (each route is one
    // per-page bundle, not split into shared vendor chunks), so there's
    // nothing to fix there anyway — this is a production-build-only concern.
    if (!isServer && config.optimization.splitChunks) {
      // three.js/@react-three/*/@dimforge (fiber, drei, rapier, rapier's wasm
      // loader, three-stdlib) are only ever imported from inside components
      // loaded via next/dynamic({ ssr: false }) — the whole 3D world, the
      // trail map canvas, and the vault canvas. Without this override, a
      // production build still hoists these packages into a chunk that gets
      // an eager `<script async>` tag on every page load, unconditionally —
      // confirmed directly against a production build's HTML output, a
      // ~680KB three.js chunk was being fetched before the visitor ever
      // scrolled or the dynamic import was ever triggered. That happens
      // because Next's default "lib"/"commons" splitChunks cache groups use
      // `chunks: "all"`, which merges a package's usage across BOTH sync and
      // async import boundaries — since three.js is imported from three
      // separate dynamic() chunks, the default heuristic decides it's
      // "shared enough" to hoist into a chunk referenced by the main entry
      // too. Scoping a dedicated cache group to `chunks: "async"` keeps
      // three.js confined to the dynamic-import chunks that actually need
      // it, so it only downloads once one of those features is actually
      // requested.
      config.optimization.splitChunks.cacheGroups = {
        ...config.optimization.splitChunks.cacheGroups,
        threeVendor: {
          test: /[\\/]node_modules[\\/](three|@react-three|@dimforge|three-stdlib)[\\/]/,
          name: "three-vendor",
          chunks: "async",
          priority: 40,
          enforce: true,
          reuseExistingChunk: true,
        },
      };
    }
    return config;
  },
};

export default nextConfig;
