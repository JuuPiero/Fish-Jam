/**
 * Profiler for Cocos Creator: import from 'db://profiler/index'.
 *
 *   Profiler.beginSample('AI.Think');
 *   ...
 *   Profiler.endSample();
 */
export { Profiler } from './Profiler';
export { ProfilerConnector } from './ProfilerConnector';
export { FrameCapture } from './FrameCapture';
export type { FrameData, RenderCounters, MemoryCounters, FrameCaptureData, CaptureEvent } from './core/protocol';
