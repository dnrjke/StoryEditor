/**
 * StoryRegistry — YAML 시나리오 자동 탐색 레지스트리
 *
 * import.meta.glob으로 stories/ 하위 모든 *.story.yaml을 탐색.
 * 파일 이동/리네임 시 코드 수정 불필요 — YAML의 id 필드만 유지하면 됨.
 */

import { parseScenarioYaml } from '../../../engines/narrative/scenario/parseScenarioYaml';
import type { ScenarioSequence } from '../../../engines/narrative/types';

const modules = import.meta.glob('./**/*.story.yaml', { eager: true });

const registry = new Map<string, ScenarioSequence>();

for (const [path, mod] of Object.entries(modules)) {
    const raw = (mod as { default: unknown }).default;
    const seq = parseScenarioYaml(raw, path);
    registry.set(seq.id, seq);
}

export function getStory(id: string): ScenarioSequence {
    const s = registry.get(id);
    if (!s) {
        const available = [...registry.keys()].join(', ');
        throw new Error(
            `[StoryRegistry] Story not found: "${id}". Available: [${available}]`
        );
    }
    return s;
}

export function getAllStoryIds(): string[] {
    return [...registry.keys()];
}
