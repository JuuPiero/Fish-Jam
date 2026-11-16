import * as fs from 'fs';
import * as path from 'path';
import { assert, near, run, sine, test } from './harness';
import { decodeWav, encodeWav } from '../source/shared/audio/wav';
import { encodeAudio, DEFAULT_EXPORT, exportFormat, mp3SampleRate, prepareExport } from '../source/shared/audio/export';
import { probeMp3, probeOgg } from '../source/shared/audio/analysis';
import { AudioData } from '../source/shared/audio/types';

const root = path.join(__dirname, '..', '..');
const wasmDir = path.join(root, 'node_modules', 'wasm-media-encoders', 'wasm');

function stereo(seconds: number, sr = 44100): AudioData {
    return { sampleRate: sr, channels: [sine(440, sr, seconds, 0.5), sine(660, sr, seconds, 0.25)] };
}

test('WAV 16-bit round trip (samples, rate, channels)', () => {
    const data = stereo(0.1);
    const bytes = encodeWav(data, { bitDepth: 16 });
    assert.strictEqual(bytes.length, 44 + data.channels[0].length * 4);
    const back = decodeWav(bytes);
    assert.strictEqual(back.sampleRate, 44100);
    assert.strictEqual(back.channels.length, 2);
    assert.strictEqual(back.channels[0].length, data.channels[0].length);
    let maxErr = 0;
    for (let c = 0; c < 2; c++) for (let i = 0; i < data.channels[c].length; i++) maxErr = Math.max(maxErr, Math.abs(back.channels[c][i] - data.channels[c][i]));
    assert.ok(maxErr < 1 / 32000, `16-bit error ${maxErr}`);
});

test('WAV 24-bit and 32-bit float round trip', () => {
    const data = { sampleRate: 22050, channels: [new Float32Array([0, 0.5, -0.5, 0.999, -1, 0.123456])] };
    const b24 = decodeWav(encodeWav(data, { bitDepth: 24 }));
    for (let i = 0; i < 6; i++) near(b24.channels[0][i], data.channels[0][i], 2 / 8388608);
    const b32 = decodeWav(encodeWav(data, { bitDepth: 32 }));
    assert.ok(b32.float);
    for (let i = 0; i < 6; i++) assert.strictEqual(b32.channels[0][i], data.channels[0][i]);
});

test('WAV markers (cue + labl) and loop (smpl) survive a round trip', () => {
    const data = stereo(0.05, 8000);
    const bytes = encodeWav(data, {
        markers: [{ id: 1, name: 'Hit', position: 100 }, { id: 2, name: 'Tail ünï', position: 300 }],
        loop: { start: 50, end: 350 },
    });
    const back = decodeWav(bytes);
    assert.deepStrictEqual(back.markers.map((m) => [m.name, m.position]), [['Hit', 100], ['Tail ünï', 300]]);
    assert.deepStrictEqual(back.loop, { start: 50, end: 350 });
    assert.strictEqual(back.channels[0].length, 400);
});

test('export format rules (MP3 rates, channel limits)', () => {
    assert.strictEqual(mp3SampleRate(44100), 44100);
    assert.strictEqual(mp3SampleRate(96000), 48000);
    assert.strictEqual(mp3SampleRate(30000), 32000);
    const six = { sampleRate: 96000, channels: [1, 2, 3, 4, 5, 6].map(() => new Float32Array(10)) };
    assert.deepStrictEqual(exportFormat(six, { ...DEFAULT_EXPORT, format: 'mp3' }), { sampleRate: 48000, channels: 2 });
    assert.deepStrictEqual(exportFormat(six, { ...DEFAULT_EXPORT, format: 'wav' }), { sampleRate: 96000, channels: 6 });
    const p = prepareExport(stereo(0.1), { ...DEFAULT_EXPORT, format: 'wav', channels: 1, sampleRate: 22050 });
    assert.strictEqual(p.channels.length, 1);
    assert.strictEqual(p.channels[0].length, 2205);
});

const wasm = fs.existsSync(wasmDir) ? { mp3: fs.readFileSync(path.join(wasmDir, 'mp3.wasm')), ogg: fs.readFileSync(path.join(wasmDir, 'ogg.wasm')) } : null;

test('MP3 export (LAME wasm): valid frames at the requested rate', async () => {
    assert.ok(wasm, 'wasm-media-encoders is installed');
    let progress = 0;
    const bytes = await encodeAudio(stereo(1), { ...DEFAULT_EXPORT, format: 'mp3', mp3Bitrate: 128, sampleRate: 22050 }, wasm!, {}, (f) => (progress = f));
    const info = probeMp3(bytes);
    assert.deepStrictEqual(info, { sampleRate: 22050, channels: 2 });
    near(bytes.length, 128000 / 8, 3000, 'about 16 KB for one second at 128 kbps');
    assert.strictEqual(progress, 1);
});

test('MP3 VBR mono export', async () => {
    const bytes = await encodeAudio({ sampleRate: 44100, channels: [sine(440, 44100, 0.5)] }, { ...DEFAULT_EXPORT, format: 'mp3', mp3Mode: 'vbr', mp3Quality: 6 }, wasm!);
    assert.deepStrictEqual(probeMp3(bytes), { sampleRate: 44100, channels: 1 });
});

test('Ogg Vorbis export (libvorbis wasm): valid identification header', async () => {
    const bytes = await encodeAudio(stereo(1, 48000), { ...DEFAULT_EXPORT, format: 'ogg', oggQuality: 3 }, wasm!);
    assert.deepStrictEqual(probeOgg(bytes), { sampleRate: 48000, channels: 2 });
    assert.ok(bytes.length > 4000 && bytes.length < 40000, `size ${bytes.length}`);
});

test('WAV export through encodeAudio scales markers when resampling', async () => {
    const bytes = await encodeAudio(stereo(0.2, 44100), { ...DEFAULT_EXPORT, format: 'wav', sampleRate: 22050 }, {}, { markers: [{ id: 1, name: 'M', position: 4410 }], loop: { start: 0, end: 8820 } });
    const back = decodeWav(bytes);
    assert.strictEqual(back.sampleRate, 22050);
    assert.strictEqual(back.markers[0].position, 2205);
    assert.deepStrictEqual(back.loop, { start: 0, end: 4410 });
});

run();
