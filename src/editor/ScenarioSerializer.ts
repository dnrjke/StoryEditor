/**
 * ScenarioSerializer - ScenarioSequence → YAML 단축 문법 변환기
 *
 * parseScenarioYaml의 역변환입니다.
 *
 * 단축 규칙:
 *   - NarrationStep  → `- narration: text`
 *   - DialogueStep   → `- speakerName: text`
 *   - AutoStep        → `- auto: duration` (+ text, speaker 서브키)
 *   - EventStep       → `- event: EVENT_NAME` (+ payload 서브키)
 *
 * 멀티라인 텍스트(\n 포함)는 YAML literal block `|` 사용,
 * 6-space indent로 내용을 들여씁니다.
 */

import type {
    ScenarioSequence,
    ScenarioStep,
    NarrationStep,
    DialogueStep,
    AutoStep,
    EventStep,
} from '../engines/narrative/types';

const CONTENT_INDENT = '      '; // 6 spaces for block content

/**
 * ScenarioSequence를 YAML 단축 문법 문자열로 변환합니다.
 *
 * @param seq - 직렬화할 시나리오 시퀀스
 * @returns YAML 문자열
 */
export function serializeScenarioYaml(seq: ScenarioSequence): string {
    const lines: string[] = [];

    lines.push(`id: ${yamlScalar(seq.id)}`);
    lines.push(`name: ${yamlScalar(seq.name)}`);
    lines.push('steps:');

    for (const step of seq.steps) {
        lines.push(serializeStep(step));
    }

    return lines.join('\n') + '\n';
}

function serializeStep(step: ScenarioStep): string {
    switch (step.type) {
        case 'narration':
            return serializeNarration(step);
        case 'dialogue':
            return serializeDialogue(step);
        case 'auto':
            return serializeAuto(step);
        case 'event':
            return serializeEvent(step);
        default:
            throw new Error(`[ScenarioSerializer] Unknown step type: ${(step as ScenarioStep).type}`);
    }
}

function serializeNarration(step: NarrationStep): string {
    return `  - narration: ${yamlTextValue(step.text)}`;
}

/**
 * 대화 스텝 직렬화.
 *
 * 화자 이름이 예약어(narration, event, auto 등)와 충돌하면
 * parseScenarioYaml의 단축 문법으로는 구분 불가하므로
 * 명시적 dialogue 장형 문법을 사용합니다:
 *   - dialogue:
 *       speaker: "narration"
 *       text: "대사"
 *
 * 일반 이름은 기존 단축 문법 유지:
 *   - 아리아: "대사"
 */
const SERIALIZER_RESERVED_KEYS = new Set([
    'narration', 'event', 'auto', 'payload', 'text', 'speaker', 'duration', 'dialogue',
]);

function serializeDialogue(step: DialogueStep): string {
    if (SERIALIZER_RESERVED_KEYS.has(step.speaker)) {
        // 장형 문법: 예약어 충돌 방지
        const lines: string[] = [];
        lines.push('  - dialogue:');
        lines.push(`    speaker: ${yamlScalar(step.speaker)}`);
        lines.push(`    text: ${yamlTextValue(step.text)}`);
        return lines.join('\n');
    }
    return `  - ${yamlScalar(step.speaker)}: ${yamlTextValue(step.text)}`;
}

function serializeAuto(step: AutoStep): string {
    const lines: string[] = [];
    lines.push(`  - auto: ${step.duration}`);

    if (step.speaker !== undefined) {
        lines.push(`    speaker: ${yamlScalar(step.speaker)}`);
    }
    if (step.text !== undefined) {
        lines.push(`    text: ${yamlTextValue(step.text)}`);
    }

    return lines.join('\n');
}

function serializeEvent(step: EventStep): string {
    const lines: string[] = [];
    lines.push(`  - event: ${step.event}`);

    if (step.payload !== undefined) {
        lines.push(`    payload:`);
        const payloadLines = serializePayloadObject(step.payload, 6);
        lines.push(payloadLines);
    }

    return lines.join('\n');
}

/**
 * 페이로드 객체를 YAML 표기로 변환합니다.
 * 단순한 key-value 구조 및 중첩 객체를 지원합니다.
 *
 * @param value - 직렬화할 값
 * @param indentLevel - 현재 들여쓰기 수준 (스페이스 수)
 * @returns YAML 표기 문자열
 */
function serializePayloadObject(value: unknown, indentLevel: number): string {
    const indent = ' '.repeat(indentLevel);

    if (value === null || value === undefined) {
        return `${indent}null`;
    }

    if (typeof value === 'string') {
        return `${indent}${yamlScalar(value)}`;
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
        return `${indent}${String(value)}`;
    }

    if (Array.isArray(value)) {
        if (value.length === 0) return `${indent}[]`;
        const items = value.map((item) => {
            if (typeof item === 'object' && item !== null && !Array.isArray(item)) {
                const objLines = serializePayloadObject(item, indentLevel + 2);
                return `${indent}- \n${objLines}`;
            }
            const scalar = serializePayloadScalar(item);
            return `${indent}- ${scalar}`;
        });
        return items.join('\n');
    }

    if (typeof value === 'object') {
        const obj = value as Record<string, unknown>;
        const keys = Object.keys(obj);
        if (keys.length === 0) return `${indent}{}`;

        const entries = keys.map((key) => {
            const val = obj[key];
            if (typeof val === 'object' && val !== null && !Array.isArray(val)) {
                const nested = serializePayloadObject(val, indentLevel + 2);
                return `${indent}${key}:\n${nested}`;
            }
            const scalar = serializePayloadScalar(val);
            return `${indent}${key}: ${scalar}`;
        });
        return entries.join('\n');
    }

    return `${indent}${String(value)}`;
}

function serializePayloadScalar(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value === 'string') return yamlScalar(value);
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return String(value);
}

/**
 * 문자열을 YAML 스칼라로 변환합니다.
 * 특수 문자가 포함되면 따옴표로 감쌉니다.
 */
function yamlScalar(s: string): string {
    // 따옴표가 필요한 경우: 특수 문자, 선행/후행 공백, 빈 문자열
    if (
        s === '' ||
        s.includes(':') ||
        s.includes('#') ||
        s.includes('"') ||
        s.includes("'") ||
        s.includes('\n') ||
        s.startsWith(' ') ||
        s.endsWith(' ') ||
        s.startsWith('{') ||
        s.startsWith('[') ||
        s === 'true' ||
        s === 'false' ||
        s === 'null' ||
        /^\d/.test(s)
    ) {
        // 큰따옴표 이스케이프
        const escaped = s.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
        return `"${escaped}"`;
    }
    return s;
}

/**
 * 텍스트 값을 YAML 표기로 변환합니다.
 * 멀티라인(\n 포함)이면 literal block `|` 사용.
 */
function yamlTextValue(text: string): string {
    if (text.includes('\n')) {
        const contentLines = text.split('\n');
        const indented = contentLines.map((line) => CONTENT_INDENT + line).join('\n');
        return `|\n${indented}`;
    }
    return yamlScalar(text);
}
