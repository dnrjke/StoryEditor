/**
 * EditorFlowController - 에디터용 간소화 FlowController
 *
 * 2Test1의 FlowController에서 splash/touchToStart/celestial 단계를 제거하고
 * 내러티브 이벤트 처리 + 시각 상태 적용만 담당합니다.
 *
 * NarrativeEngine의 onEvent 콜백으로 handleEvent를 연결하여 사용합니다.
 */

import type { BackgroundLayer } from '../shared/ui/BackgroundLayer';
import type { BottomVignetteLayer } from '../shared/ui/BottomVignetteLayer';
import type { CharacterLayer } from '../shared/ui/CharacterLayer';
import type { VisualState } from '../editor/StateReconstructor';
import { resolveImageUrl } from './data/img/ImageRegistry';

export interface EditorFlowDeps {
    backgroundLayer: BackgroundLayer;
    bottomVignetteLayer: BottomVignetteLayer;
    characterLayer: CharacterLayer;
}

/** 배경 미지정 시 기본 색상 */
const DEFAULT_BG_COLOR = '#0a0a14';

export class EditorFlowController {
    private readonly bg: BackgroundLayer;
    private readonly vignette: BottomVignetteLayer;
    private readonly chars: CharacterLayer;

    constructor(deps: EditorFlowDeps) {
        this.bg = deps.backgroundLayer;
        this.vignette = deps.bottomVignetteLayer;
        this.chars = deps.characterLayer;
    }

    /**
     * 단일 내러티브 이벤트를 처리합니다.
     * NarrativeEngine의 onEvent 콜백으로 연결하여 사용합니다.
     *
     * @param eventName - 이벤트 이름 (CHANGE_BG, SHOW_CHARACTER, HIDE_CHARACTER 등)
     * @param payload - 이벤트 페이로드
     */
    handleEvent(eventName: string, payload?: unknown): void {
        const data = payload as Record<string, unknown> | undefined;

        switch (eventName) {
            case 'CHANGE_BG': {
                if (data && typeof data.color === 'string') {
                    this.bg.setColor(data.color);
                    this.bg.show();
                    this.vignette.show();
                    console.log(`[EditorFlow] BG changed: ${data.color}`);
                }
                break;
            }

            case 'SHOW_CHARACTER': {
                if (data && typeof data.id === 'string') {
                    const position = (data.position as 'left' | 'center' | 'right') || 'center';
                    const rawImage = typeof data.image === 'string' ? data.image : undefined;
                    const image = rawImage ? (resolveImageUrl(rawImage) ?? rawImage) : undefined;
                    this.chars.showCharacter(data.id, position, image);
                    console.log(`[EditorFlow] Show character: ${data.id} at ${position}${image ? ` img=${rawImage}` : ''}`);
                }
                break;
            }

            case 'HIDE_CHARACTER': {
                if (data && typeof data.id === 'string') {
                    this.chars.hideCharacter(data.id);
                    console.log(`[EditorFlow] Hide character: ${data.id}`);
                }
                break;
            }

            case 'FLOW_COMPLETE': {
                console.warn('[EditorFlow] FLOW_COMPLETE event ignored in editor mode');
                break;
            }

            default: {
                console.log(`[EditorFlow] Unhandled event: ${eventName}`, payload);
                break;
            }
        }
    }

    /**
     * 복원된 시각 상태를 즉시 적용합니다.
     * 점프/네비게이션 시 StateReconstructor가 산출한 상태를 적용합니다.
     *
     * @param state - 복원된 시각 상태
     */
    applyVisualState(state: VisualState): void {
        // 1. 모든 캐릭터 제거
        this.chars.hideAll();

        // 2. 배경 설정
        const bgColor = state.backgroundColor ?? DEFAULT_BG_COLOR;
        this.bg.setColor(bgColor);
        this.bg.show();
        this.vignette.show();

        // 3. 캐릭터 배치
        for (const [id, info] of state.characters) {
            const image = info.image ? (resolveImageUrl(info.image) ?? info.image) : undefined;
            this.chars.showCharacter(id, info.position, image);
        }

        console.log(
            `[EditorFlow] Visual state applied — bg: ${bgColor}, characters: ${state.characters.size}`
        );
    }
}
