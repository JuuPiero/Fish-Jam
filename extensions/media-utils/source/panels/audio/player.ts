/**
 * Playback through WebAudio. The AudioBuffer is rebuilt only when the document
 * changed (its version), so play / stop / seek are instant.
 */
export class AudioPlayer {
    private ctx: AudioContext | null = null;
    private buffer: AudioBuffer | null = null;
    private bufferVersion = -1;
    private source: AudioBufferSourceNode | null = null;
    private gain: GainNode | null = null;
    private startedAt = 0;
    private from = 0;
    private to = 0;
    private loop = false;
    private sampleRate = 44100;
    /** Called when playback ends by itself (not on stop()). */
    onEnded: (() => void) | null = null;
    volume = 1;

    get playing(): boolean {
        return !!this.source;
    }

    private context(): AudioContext {
        if (!this.ctx) this.ctx = new AudioContext();
        if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => undefined);
        return this.ctx;
    }

    private ensureBuffer(channels: Float32Array[], sampleRate: number, version: number): AudioBuffer | null {
        if (this.buffer && this.bufferVersion === version) return this.buffer;
        const n = channels.length ? channels[0].length : 0;
        if (!n) return null;
        const ctx = this.context();
        const buf = ctx.createBuffer(channels.length, n, sampleRate);
        for (let c = 0; c < channels.length; c++) buf.copyToChannel(channels[c] as any, c);
        this.buffer = buf;
        this.bufferVersion = version;
        return buf;
    }

    /** Plays frames [from, to); with loop it repeats that range until stopped. */
    play(channels: Float32Array[], sampleRate: number, version: number, from: number, to: number, loop: boolean): boolean {
        this.stop();
        const buf = this.ensureBuffer(channels, sampleRate, version);
        if (!buf) return false;
        const n = buf.length;
        from = Math.max(0, Math.min(n, Math.floor(from)));
        to = Math.max(from, Math.min(n, Math.ceil(to)));
        if (to - from < 2) return false;
        const ctx = this.context();
        const src = ctx.createBufferSource();
        src.buffer = buf;
        const gain = ctx.createGain();
        gain.gain.value = this.volume;
        src.connect(gain).connect(ctx.destination);
        this.sampleRate = sampleRate;
        this.from = from;
        this.to = to;
        this.loop = loop;
        if (loop) {
            src.loop = true;
            src.loopStart = from / sampleRate;
            src.loopEnd = to / sampleRate;
            src.start(0, from / sampleRate);
        } else {
            src.start(0, from / sampleRate, (to - from) / sampleRate);
        }
        src.onended = () => {
            if (this.source !== src) return;
            this.source = null;
            this.gain = null;
            if (this.onEnded) this.onEnded();
        };
        this.source = src;
        this.gain = gain;
        this.startedAt = ctx.currentTime;
        return true;
    }

    /** Current playback position in frames (null when stopped). */
    position(): number | null {
        if (!this.source || !this.ctx) return null;
        const elapsed = (this.ctx.currentTime - this.startedAt) * this.sampleRate;
        if (this.loop) {
            const len = this.to - this.from;
            return this.from + (len > 0 ? elapsed % len : 0);
        }
        return Math.min(this.to, this.from + elapsed);
    }

    setVolume(v: number): void {
        this.volume = v;
        if (this.gain) this.gain.gain.value = v;
    }

    stop(): void {
        const src = this.source;
        this.source = null;
        this.gain = null;
        if (src) {
            try {
                src.stop();
            } catch (e) {
                // already stopped
            }
            src.disconnect();
        }
    }

    /** Drops the cached buffer (after an edit the next play rebuilds it). */
    invalidate(): void {
        this.buffer = null;
        this.bufferVersion = -1;
    }

    dispose(): void {
        this.stop();
        this.buffer = null;
        if (this.ctx) this.ctx.close().catch(() => undefined);
        this.ctx = null;
    }
}

/** Decodes a compressed file at its own sample rate (decodeAudioData resamples to the context's rate). */
export async function decodeCompressed(bytes: ArrayBuffer, sampleRate: number): Promise<{ sampleRate: number; channels: Float32Array[] }> {
    const rate = Math.max(3000, Math.min(384000, Math.round(sampleRate)));
    const ctx = new OfflineAudioContext(1, 1, rate);
    const buf = await ctx.decodeAudioData(bytes);
    const channels: Float32Array[] = [];
    for (let c = 0; c < buf.numberOfChannels; c++) channels.push(new Float32Array(buf.getChannelData(c)));
    return { sampleRate: buf.sampleRate, channels };
}
