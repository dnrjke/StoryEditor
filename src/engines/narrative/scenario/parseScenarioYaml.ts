/**
 * parseScenarioYaml — YAML 단축 문법 → ScenarioSequence 변환기
 *
 * 단축 규칙:
 *   - narration: "text"           → NarrationStep
 *   - event: "EVENT_NAME"         → EventStep (+ payload)
 *   - auto: 2000                  → AutoStep  (+ text, speaker)
 *   - 화자이름: "대사"             → DialogueStep
 *
 * 예약어가 아닌 key는 speaker name으로 취급.
 */

import type { ScenarioSequence, ScenarioStep } from '../types';

const RESERVED_KEYS = new Set([
    'narration', 'event', 'auto', 'payload', 'text', 'speaker', 'duration', 'dialogue',
]);

function fail(msg: string, source?: string): never {
    const prefix = source ? `[parseScenarioYaml ${source}]` : '[parseScenarioYaml]';
    throw new Error(`${prefix} ${msg}`);
}

function trimBlock(s: string): string {
    // YAML literal block (|) appends trailing \n — strip it
    return typeof s === 'string' ? s.replace(/\n$/, '') : String(s);
}

function parseStep(raw: unknown, index: number, source?: string): ScenarioStep {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        fail(`Step ${index}: expected object, got ${typeof raw}`, source);
    }

    const obj = raw as Record<string, unknown>;
    const keys = Object.keys(obj);

    // --- dialogue (explicit long-form: { dialogue: ..., speaker: ..., text: ... }) ---
    // Must be checked before narration/event/auto to handle reserved-name speakers.
    if ('dialogue' in obj && ('speaker' in obj || typeof obj.dialogue === 'object')) {
        // Long form: { dialogue: null/true, speaker: "name", text: "..." }
        // or { dialogue: { speaker: "name", text: "..." } }
        if (typeof obj.dialogue === 'object' && obj.dialogue !== null) {
            const d = obj.dialogue as Record<string, unknown>;
            return {
                type: 'dialogue',
                speaker: String(d.speaker ?? ''),
                text: trimBlock(d.text as string),
            };
        }
        // Flat form: { dialogue: null, speaker: "name", text: "..." }
        return {
            type: 'dialogue',
            speaker: String(obj.speaker ?? ''),
            text: trimBlock(obj.text as string),
        };
    }

    // --- narration ---
    if ('narration' in obj) {
        return { type: 'narration', text: trimBlock(obj.narration as string) };
    }

    // --- event ---
    if ('event' in obj) {
        const step: ScenarioStep = { type: 'event', event: String(obj.event) };
        if ('payload' in obj) {
            (step as { payload?: unknown }).payload = obj.payload;
        }
        return step;
    }

    // --- auto ---
    if ('auto' in obj) {
        const step: ScenarioStep = {
            type: 'auto',
            duration: Number(obj.auto),
        };
        const a = step as { text?: string; speaker?: string; duration: number; type: 'auto' };
        if ('text' in obj) a.text = trimBlock(obj.text as string);
        if ('speaker' in obj) a.speaker = String(obj.speaker);
        return step;
    }

    // --- dialogue: first non-reserved key = speaker ---
    const speakerKey = keys.find(k => !RESERVED_KEYS.has(k));
    if (speakerKey) {
        return {
            type: 'dialogue',
            speaker: speakerKey,
            text: trimBlock(obj[speakerKey] as string),
        };
    }

    fail(`Step ${index}: cannot determine step type from keys [${keys.join(', ')}]`, source);
}

export function parseScenarioYaml(raw: unknown, source?: string): ScenarioSequence {
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
        fail('root must be an object', source);
    }

    const root = raw as Record<string, unknown>;

    if (typeof root.id !== 'string' || !root.id) {
        fail('missing or invalid "id" field', source);
    }
    if (typeof root.name !== 'string' || !root.name) {
        fail('missing or invalid "name" field', source);
    }
    if (!Array.isArray(root.steps)) {
        fail('"steps" must be an array', source);
    }

    const steps: ScenarioStep[] = root.steps.map((s, i) => parseStep(s, i, source));

    return { id: root.id, name: root.name, steps };
}
