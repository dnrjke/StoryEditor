/**
 * StateReconstructor - 시각 상태 복원기
 *
 * 시나리오의 임의 지점에서 시각 상태(배경, 캐릭터)를 복원합니다.
 * step 0부터 targetIndex 직전까지 이벤트를 스캔하여
 * 해당 시점의 화면 상태를 재구성합니다.
 */

import type { ScenarioStep } from '../engines/narrative/types';

export interface VisualState {
    backgroundColor: string | null;
    characters: Map<string, { position: 'left' | 'center' | 'right'; image?: string }>;
}

/**
 * steps[0..upToIndex) 범위의 이벤트를 스캔하여 시각 상태를 재구성합니다.
 *
 * 처리하는 이벤트:
 * - CHANGE_BG: backgroundColor 갱신
 * - SHOW_CHARACTER: characters 맵에 추가/갱신
 * - HIDE_CHARACTER: characters 맵에서 제거
 * - 그 외 이벤트(FLOW_COMPLETE 등): 무시
 *
 * @param steps - 전체 시나리오 스텝 배열
 * @param upToIndex - 이 인덱스 직전까지 스캔 (exclusive)
 * @returns 복원된 시각 상태
 */
export function reconstructVisualState(
    steps: ReadonlyArray<ScenarioStep>,
    upToIndex: number
): VisualState {
    const state: VisualState = {
        backgroundColor: null,
        characters: new Map(),
    };

    const end = Math.min(upToIndex, steps.length);

    for (let i = 0; i < end; i++) {
        const step = steps[i];
        if (step.type !== 'event') continue;

        const eventName = step.event;
        const payload = step.payload as Record<string, unknown> | undefined;

        switch (eventName) {
            case 'CHANGE_BG': {
                if (payload && typeof payload.color === 'string') {
                    state.backgroundColor = payload.color;
                }
                break;
            }

            case 'SHOW_CHARACTER': {
                if (payload && typeof payload.id === 'string') {
                    const id = payload.id;
                    const position = (payload.position as 'left' | 'center' | 'right') || 'center';
                    const entry: { position: 'left' | 'center' | 'right'; image?: string } = { position };
                    if (typeof payload.image === 'string') {
                        entry.image = payload.image;
                    }
                    state.characters.set(id, entry);
                }
                break;
            }

            case 'HIDE_CHARACTER': {
                if (payload && typeof payload.id === 'string') {
                    state.characters.delete(payload.id);
                }
                break;
            }

            // FLOW_COMPLETE and other events are ignored
            default:
                break;
        }
    }

    return state;
}
