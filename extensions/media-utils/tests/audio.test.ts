import { assert, near, run, sine, test, zeroCrossFreq } from './harness';
import { AudioDocument, shiftPosition } from '../source/shared/audio/document';
import { amplify, audibleBounds, fade, fadeGain, matchFormat, noiseGate, normalize, peakOf, removeDc, reverse, runEffect, silenceTrimRange, toMono, toStereo } from '../source/shared/audio/effects';
import { resample, resampleRatio } from '../source/shared/audio/resample';
import { changePitch, changeTempo, timeStretch } from '../source/shared/audio/stretch';
import { buildPeaks, probeMp3, probeOgg, probeSampleRate, rangeMinMax, snapToZeroCrossing } from '../source/shared/audio/analysis';
import { formatTime, parseTime } from '../source/shared/audio/types';

function ramp(n: number, offset = 0): Float32Array {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = offset + i;
    return a;
}

function doc(n = 10, channels = 2): AudioDocument {
    const ch: Float32Array[] = [];
    for (let c = 0; c < channels; c++) ch.push(ramp(n, c * 100));
    return new AudioDocument({ sampleRate: 1000, channels: ch });
}

const arr = (x: Float32Array) => Array.from(x);

// ------------------------------------------------------------ edits + history

test('cut removes the selection and copy returns it', () => {
    const d = doc();
    d.selection = { start: 2, end: 5 };
    const clip = d.cut()!;
    assert.deepStrictEqual(arr(clip.channels[0]), [2, 3, 4]);
    assert.deepStrictEqual(arr(clip.channels[1]), [102, 103, 104]);
    assert.deepStrictEqual(arr(d.data.channels[0]), [0, 1, 5, 6, 7, 8, 9]);
    assert.deepStrictEqual(d.selection, { start: 2, end: 2 });
});

test('paste inserts at the cursor and replaces a selection', () => {
    const d = doc();
    d.selection = { start: 1, end: 3 };
    const clip = d.copy()!;
    d.selection = { start: 8, end: 8 };
    d.paste(clip);
    assert.deepStrictEqual(arr(d.data.channels[0]), [0, 1, 2, 3, 4, 5, 6, 7, 1, 2, 8, 9]);
    d.selection = { start: 0, end: 4 };
    d.paste(clip);
    assert.deepStrictEqual(arr(d.data.channels[0]), [1, 2, 4, 5, 6, 7, 1, 2, 8, 9]);
});

test('undo / redo walk back and forth over many steps', () => {
    const d = doc();
    const snap = () => arr(d.data.channels[0]).join(',') + '|' + arr(d.data.channels[1]).join(',');
    const states = [snap()];
    d.selection = { start: 2, end: 4 };
    d.deleteSelection();
    states.push(snap());
    d.selection = { start: 1, end: 1 };
    d.insertSilence(3);
    states.push(snap());
    d.selection = { start: 0, end: 2 };
    d.duplicate();
    states.push(snap());
    d.selection = { start: 1, end: 5 };
    d.trimToSelection();
    states.push(snap());
    for (let i = states.length - 1; i > 0; i--) {
        assert.strictEqual(snap(), states[i]);
        assert.ok(d.undo());
    }
    assert.strictEqual(snap(), states[0]);
    assert.ok(!d.undo());
    for (let i = 1; i < states.length; i++) {
        assert.ok(d.redo());
        assert.strictEqual(snap(), states[i]);
    }
    assert.ok(!d.redo());
});

test('a new edit clears redo; undo restores the selection', () => {
    const d = doc();
    d.selection = { start: 3, end: 6 };
    d.deleteSelection();
    d.undo();
    assert.deepStrictEqual(d.selection, { start: 3, end: 6 });
    d.selection = { start: 0, end: 1 };
    d.deleteSelection();
    assert.ok(!d.canRedo());
});

test('duplicate selects the copy; insert silence is zeros', () => {
    const d = doc(6, 1);
    d.selection = { start: 1, end: 3 };
    d.duplicate();
    assert.deepStrictEqual(arr(d.data.channels[0]), [0, 1, 2, 1, 2, 3, 4, 5]);
    assert.deepStrictEqual(d.selection, { start: 3, end: 5 });
    d.selection = { start: 0, end: 0 };
    d.insertSilence(2);
    assert.deepStrictEqual(arr(d.data.channels[0]).slice(0, 3), [0, 0, 0]);
});

test('markers and loop follow splices and undo', () => {
    const d = doc(20, 1);
    d.addMarker(5, 'A');
    d.addMarker(15, 'B');
    d.setLoop({ start: 10, end: 18 });
    d.selection = { start: 0, end: 4 };
    d.deleteSelection();
    assert.deepStrictEqual(d.markers.map((m) => m.position), [1, 11]);
    assert.deepStrictEqual(d.loop, { start: 6, end: 14 });
    d.undo();
    assert.deepStrictEqual(d.markers.map((m) => m.position), [5, 15]);
    assert.deepStrictEqual(d.loop, { start: 10, end: 18 });
    assert.strictEqual(shiftPosition(7, 5, 10, 2), 7);
    assert.strictEqual(shiftPosition(12, 5, 10, 2), 9);
    assert.strictEqual(shiftPosition(3, 5, 10, 2), 3);
});

test('dirty flag tracks saves', () => {
    const d = doc();
    assert.ok(!d.dirty);
    d.selection = { start: 0, end: 1 };
    d.deleteSelection();
    assert.ok(d.dirty);
    d.markSaved();
    assert.ok(!d.dirty);
    d.undo();
    assert.ok(d.dirty);
});

test('replaceAll (format change) is undoable', () => {
    const d = doc(10, 2);
    d.replaceAll('To Mono', { sampleRate: 1000, channels: toMono(d.data.channels) });
    assert.strictEqual(d.channelCount, 1);
    d.undo();
    assert.strictEqual(d.channelCount, 2);
    d.redo();
    assert.strictEqual(d.channelCount, 1);
});

// ------------------------------------------------------------ effects

test('amplify +6 dB doubles, -6 dB halves', () => {
    const x = [new Float32Array([0.1, -0.2, 0.25])];
    near(amplify(x, 6.0206)[0][1], -0.4, 1e-4);
    near(amplify(x, -6.0206)[0][2], 0.125, 1e-4);
    near(x[0][1], -0.2, 1e-7, 'input untouched');
    assert.strictEqual(amplify([new Float32Array([0.8])], 6, false)[0][0], 1, 'clamped');
});

test('normalize brings the peak to the target (linked and independent)', () => {
    const x = [new Float32Array([0.1, -0.25]), new Float32Array([0.05, 0.02])];
    const y = normalize(x, 0);
    near(peakOf(y), 1, 1e-6);
    near(y[1][0], 0.2, 1e-6, 'channels keep their balance');
    const z = normalize(x, -6.0206, { independent: true });
    near(peakOf([z[1]]), 0.5, 1e-4);
    near(peakOf([z[0]]), 0.5, 1e-4);
});

test('fades: linear and exponential end points and shape', () => {
    const one = [new Float32Array(101).fill(1)];
    const fi = fade(one, 'in', 'linear')[0];
    near(fi[0], 0, 1e-9);
    near(fi[50], 0.5, 1e-6);
    near(fi[100], 1, 1e-9);
    const fo = fade(one, 'out', 'exponential')[0];
    near(fo[0], 1, 1e-9);
    near(fo[100], 0, 1e-9);
    assert.ok(fo[50] < 0.5, 'exponential fade-out drops faster than linear');
    near(fadeGain(0.5, 'scurve'), 0.5, 1e-9);
});

test('reverse', () => {
    assert.deepStrictEqual(arr(reverse([new Float32Array([1, 2, 3])])[0]), [3, 2, 1]);
});

test('resample keeps duration and frequency', () => {
    const x = sine(440, 44100, 0.5);
    const y = resample([x], 44100, 22050)[0];
    assert.strictEqual(y.length, Math.round(x.length / 2));
    near(zeroCrossFreq(y, 22050), 440, 4, 'frequency after downsampling');
    const z = resample([x], 44100, 48000)[0];
    assert.strictEqual(z.length, Math.round((x.length * 48000) / 44100));
    near(zeroCrossFreq(z, 48000), 440, 4);
    near(peakOf([z.subarray(1000, z.length - 1000)]), 0.5, 0.02, 'amplitude kept');
});

test('downsampling removes content above the new Nyquist (no aliasing)', () => {
    const x = sine(15000, 44100, 0.25, 0.5);
    const y = resample([x], 44100, 22050)[0];
    assert.ok(peakOf([y.subarray(500, y.length - 500)]) < 0.02, 'a 15 kHz tone vanishes at 22.05 kHz');
});

test('speed 2x halves the length and doubles the pitch', () => {
    const x = sine(300, 8000, 1);
    const r = runEffect({ name: 'speed', params: { speed: 2 }, sampleRate: 8000, channels: [x] });
    near(r.channels[0].length, 4000, 1);
    near(zeroCrossFreq(r.channels[0], 8000), 600, 6);
    const y = resampleRatio([x], 1.5)[0];
    assert.strictEqual(y.length, 12000);
});

test('tempo changes length, keeps pitch (WSOLA)', () => {
    const sr = 16000;
    const x = sine(220, sr, 1);
    const y = changeTempo([x], sr, 1.25)[0];
    near(y.length, sr / 1.25, 1);
    near(zeroCrossFreq(y.subarray(1000, y.length - 1000), sr), 220, 6);
    const z = timeStretch([x], sr, 1.5)[0];
    near(z.length, sr * 1.5, 1);
    near(zeroCrossFreq(z.subarray(1000, z.length - 1000), sr), 220, 6);
});

test('pitch shift keeps the length and moves the frequency', () => {
    const sr = 16000;
    const x = sine(220, sr, 1);
    const y = changePitch([x], sr, 12)[0];
    assert.strictEqual(y.length, x.length);
    near(zeroCrossFreq(y.subarray(1000, y.length - 1000), sr), 440, 12);
    const z = changePitch([x], sr, -5)[0];
    near(zeroCrossFreq(z.subarray(1000, z.length - 1000), sr), 220 * Math.pow(2, -5 / 12), 8);
});

test('mono / stereo conversion and clipboard format matching', () => {
    const l = new Float32Array([1, 0]);
    const r = new Float32Array([0, 1]);
    assert.deepStrictEqual(arr(toMono([l, r])[0]), [0.5, 0.5]);
    const s = toStereo([new Float32Array([0.3])]);
    assert.strictEqual(s.length, 2);
    near(s[1][0], 0.3, 1e-7);
    const m = matchFormat({ sampleRate: 8000, channels: [sine(100, 8000, 0.1)] }, 16000, 2);
    assert.strictEqual(m.length, 2);
    assert.strictEqual(m[0].length, 1600);
});

test('remove DC offset', () => {
    const y = removeDc([new Float32Array([0.6, 0.4, 0.5, 0.5])])[0];
    near(y[0], 0.1, 1e-6);
    near(y[1], -0.1, 1e-6);
});

test('noise gate silences quiet parts and keeps loud parts', () => {
    const sr = 8000;
    const x = new Float32Array(sr);
    for (let i = 0; i < sr; i++) x[i] = (i < sr / 2 ? 0.002 : 0.5) * Math.sin(i * 0.3);
    const y = noiseGate([x], sr, { thresholdDb: -30, reductionDb: -100, attackMs: 2, holdMs: 10, releaseMs: 20 })[0];
    assert.ok(peakOf([y.subarray(200, sr / 2 - 200)]) < 1e-6, 'quiet half gated');
    near(peakOf([y.subarray(sr / 2 + 200)]), 0.5, 0.01, 'loud half kept');
});

test('silence trimming finds the audible range with padding', () => {
    const x = new Float32Array(1000);
    x.fill(0.5, 300, 700);
    assert.deepStrictEqual(audibleBounds([x], -40), { start: 300, end: 700 });
    assert.deepStrictEqual(silenceTrimRange([x], 1000, { thresholdDb: -40, paddingMs: 10 }), { start: 290, end: 710 });
    assert.deepStrictEqual(silenceTrimRange([x], 1000, { thresholdDb: -40, leading: false }), { start: 0, end: 700 });
    const r = runEffect({ name: 'trimSilence', params: { thresholdDb: -40 }, sampleRate: 1000, channels: [x] });
    assert.strictEqual(r.channels[0].length, 400);
});

// ------------------------------------------------------------ analysis

test('zero-crossing snap finds the nearest sign change', () => {
    const x = new Float32Array([0.5, 0.4, 0.2, -0.1, -0.3, -0.2, 0.1, 0.3]);
    assert.strictEqual(snapToZeroCrossing([x], 4, 5), 3);
    assert.strictEqual(snapToZeroCrossing([x], 5, 5), 6);
    assert.strictEqual(snapToZeroCrossing([x], 1, 0), 1, 'no crossing within radius 0');
    // Uses the channel sum: here the sum crosses at 2.
    const l = new Float32Array([0.3, 0.2, -0.5, -0.5]);
    const r = new Float32Array([0.1, 0.1, 0.1, 0.1]);
    assert.strictEqual(snapToZeroCrossing([l, r], 1, 3), 2);
});

test('peak cache min/max matches a direct scan', () => {
    const x = sine(37, 1000, 3, 0.8);
    const peaks = buildPeaks([x], 64);
    for (const [a, b] of [[0, 3000], [10, 500], [123, 2777], [5, 60]]) {
        let lo = Infinity;
        let hi = -Infinity;
        for (let i = a; i < b; i++) {
            lo = Math.min(lo, x[i]);
            hi = Math.max(hi, x[i]);
        }
        const [l2, h2] = rangeMinMax(x, peaks.channels[0], 64, a, b);
        near(l2, lo, 1e-7);
        near(h2, hi, 1e-7);
    }
});

test('sample-rate probing: MP3 frame header and Ogg Vorbis header', () => {
    // MPEG1 layer III, 128 kbps, 44.1 kHz, joint stereo
    const mp3 = new Uint8Array([0xff, 0xfb, 0x90, 0x64, 0, 0, 0, 0]);
    assert.deepStrictEqual(probeMp3(mp3), { sampleRate: 44100, channels: 2 });
    // MPEG2 layer III, 22.05 kHz, mono
    assert.deepStrictEqual(probeMp3(new Uint8Array([0xff, 0xf3, 0x90, 0xc4, 0, 0])), { sampleRate: 22050, channels: 1 });
    const ogg = new Uint8Array(80);
    ogg.set([0x4f, 0x67, 0x67, 0x53]);
    ogg[26] = 1;
    const at = 28;
    ogg.set([1, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73], at);
    ogg[at + 11] = 2;
    new DataView(ogg.buffer).setUint32(at + 12, 32000, true);
    assert.deepStrictEqual(probeOgg(ogg), { sampleRate: 32000, channels: 2 });
    assert.strictEqual(probeSampleRate(ogg), 32000);
});

test('time formatting and parsing', () => {
    assert.strictEqual(formatTime(62.5), '1:02.500');
    assert.strictEqual(formatTime(3725.004), '1:02:05.004');
    near(parseTime('1:02.5'), 62.5, 1e-9);
    near(parseTime('0:01:02.500'), 62.5, 1e-9);
    near(parseTime('7.25'), 7.25, 1e-9);
    assert.ok(isNaN(parseTime('abc')));
});

run();
