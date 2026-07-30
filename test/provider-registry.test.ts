import * as assert from 'assert';
import { getAllPresets, getPreset, getLocalPresets, getCloudPresets } from '../src/providers/provider-registry';

describe('Provider Registry', () => {
  it('should list all built-in provider presets', () => {
    const presets = getAllPresets();
    assert.strictEqual(presets.length >= 11, true, 'Should have at least 11 provider presets');
  });

  it('should find preset by ID', () => {
    const groq = getPreset('groq');
    assert.ok(groq);
    assert.strictEqual(groq?.id, 'groq');
    assert.strictEqual(groq?.requiresApiKey, true);

    const ollama = getPreset('ollama-local');
    assert.ok(ollama);
    assert.strictEqual(ollama?.isLocal, true);
    assert.strictEqual(ollama?.requiresApiKey, false);
  });

  it('should filter local and cloud presets correctly', () => {
    const local = getLocalPresets();
    const cloud = getCloudPresets();

    assert.strictEqual(local.every(p => p.isLocal), true);
    assert.strictEqual(cloud.every(p => !p.isLocal), true);
    assert.strictEqual(local.length + cloud.length, getAllPresets().length);
  });
});
