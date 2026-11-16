// The ESNext entry of wasm-media-encoders (same API as the package root).
declare module 'wasm-media-encoders/esnext' {
    export * from 'wasm-media-encoders';
}

// The audio worker, bundled by scripts/build.js and inlined as source text.
declare module 'virtual:audio-worker' {
    const source: string;
    export default source;
}
