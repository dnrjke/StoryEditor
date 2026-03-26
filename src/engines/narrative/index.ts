/**
 * Narrative Engine - Public API (Facade)
 *
 * 이 파일은 Narrative Engine의 유일한 진입점입니다.
 * 외부 코드는 이 파일에서 export된 API만 사용해야 합니다.
 *
 * ========================================
 * 사용 규칙 (Usage Rules)
 * ========================================
 *
 * [허용]
 * - import { NarrativeEngine, ScenarioSequence } from './engines/narrative';
 * - engine.startNarrative(sequence);
 * - engine.isPlaying();
 *
 * [금지]
 * - import { ScenarioManager } from './engines/narrative/scenario/ScenarioManager';
 * - import { DialogueBox } from './engines/narrative/ui/DialogueBox';
 * - 내부 모듈 직접 import
 *
 * ========================================
 */

import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { DialogueBox } from './ui/DialogueBox';
import { InteractionLayer } from './ui/InteractionLayer';
import { ScenarioManager } from './scenario/ScenarioManager';
import { StoryControls } from './ui/StoryControls';
import { DialogueLogger } from './services/DialogueLogger';
import { DialogueLog } from './log/DialogueLog';
import { computeDialogueDimensions, RUNTIME_SAFE_AREA } from '../../shared/design';
import type { DialogueScaleInfo } from '../../shared/ui/GUIManager';
import type { ScenarioStep, ScenarioSequence } from './types';

// Re-export types needed by external code
export type {
    ScenarioSequence,
    ScenarioStep,
    NarrationStep,
    DialogueStep,
    AutoStep,
    EventStep,
    NarrativeCallbacks,
    UIState,
} from './types';

// Z_INDEX는 shared/design/ZIndex.ts로 이동됨
// Narrative Engine 사용자는 shared/design에서 직접 import할 것
export { Z_INDEX } from '../../shared/design';

/**
 * NarrativeEngine - Narrative System Facade
 *
 * 외부에서 Narrative 시스템을 제어하는 유일한 인터페이스입니다.
 * 내부 구성요소(DialogueBox, InteractionLayer, ScenarioManager)를 캡슐화합니다.
 *
 * Scale-based UI:
 * - 해상도 변경 시 1회만 스케일 재계산
 * - globalScale로 모든 요소 동기화
 */
export class NarrativeEngine {
    private dialogueBox: DialogueBox;
    private interactionLayer: InteractionLayer;
    private scenarioManager: ScenarioManager;
    private storyControls: StoryControls | null = null;
    private dialogueLogger: DialogueLogger;
    private dialogueLog: DialogueLog | null = null;

    private userCallbacks: import('./types').NarrativeCallbacks = {};
    private scaleObserver: BABYLON.Nullable<BABYLON.Observer<DialogueScaleInfo>> = null;

    /**
     * NarrativeEngine 생성
     *
     * @param interactionLayer - 입력을 받을 GUI 레이어 (Z_INDEX.INTERACTION)
     * @param displayLayer - 대화창을 표시할 GUI 레이어 (Z_INDEX.DISPLAY)
     * @param skipLayer - 스킵/시스템 버튼을 표시할 GUI 레이어 (Z_INDEX.SKIP)
     * @param onScaleChanged - 스케일 변경 이벤트 (해상도 변경 시 1회)
     * @param initialScaleInfo - 초기 스케일 정보
     * @param systemLayer - 시스템 오버레이 레이어 (Z_INDEX.SYSTEM) - 대화 로그용
     */
    constructor(
        interactionLayer: GUI.Rectangle,
        displayLayer: GUI.Rectangle,
        skipLayer?: GUI.Rectangle,
        onScaleChanged?: BABYLON.Observable<DialogueScaleInfo>,
        initialScaleInfo?: DialogueScaleInfo,
        systemLayer?: GUI.Rectangle
    ) {
        // Create DialogueLogger first (shared by ScenarioManager and DialogueLog)
        this.dialogueLogger = new DialogueLogger();

        // Create internal components
        this.interactionLayer = new InteractionLayer(interactionLayer);
        this.dialogueBox = new DialogueBox(displayLayer, initialScaleInfo);

        // Create scenario manager with internal components and logger
        this.scenarioManager = new ScenarioManager(
            this.dialogueBox,
            this.interactionLayer,
            this.dialogueLogger
        );

        if (skipLayer) {
            this.storyControls = new StoryControls(skipLayer, {
                onToggleAuto: (enabled) => this.scenarioManager.setAutoEnabled(enabled),
                onHoldSkipTriggered: () => {
                    this.scenarioManager.enterFastForward();
                    this.storyControls?.syncSkipLabel();
                },
                onSkipCancelled: () => {
                    this.scenarioManager.exitFastForward();
                    this.storyControls?.syncSkipLabel();
                },
                onCompleteSkip: () => {
                    // 홀드 완료: 시나리오 즉시 종료 (다이얼로그 숨김)
                    this.scenarioManager.skipToEnd();
                },
                getAutoEnabled: () => this.scenarioManager.isAutoEnabled(),
                getFastForwardEnabled: () => this.scenarioManager.isFastForwardEnabled(),
                onToggleLog: () => this.toggleLog(),
                getLogVisible: () => this.isLogOpen(),
            });
        }

        // Create DialogueLog if system layer and scale observable provided
        if (systemLayer && onScaleChanged && initialScaleInfo) {
            this.dialogueLog = new DialogueLog(
                systemLayer,
                this.dialogueLogger,
                onScaleChanged,
                initialScaleInfo
            );
        }

        // Subscribe to scale changes (해상도 변경 시 1회만 호출됨)
        if (onScaleChanged) {
            this.scaleObserver = onScaleChanged.add((scaleInfo) => {
                this.dialogueBox.applyScale(scaleInfo);
                this.updateNavLayout(scaleInfo);
            });
        }

        // Initial nav layout
        if (initialScaleInfo) {
            this.updateNavLayout(initialScaleInfo);
        }

        console.log('[NarrativeEngine] Initialized with Scale-based UI and DialogueLog');
    }

    /**
     * 시나리오 시퀀스를 시작합니다.
     *
     * @param sequence - 재생할 시나리오 시퀀스
     */
    startNarrative(sequence: import('./types').ScenarioSequence): void {
        console.log(`[NarrativeEngine] Starting narrative: ${sequence.name}`);
        this.storyControls?.show();
        this.scenarioManager.startSequence(sequence);
    }

    /**
     * 현재 시나리오가 재생 중인지 확인합니다.
     *
     * @returns 재생 중이면 true
     */
    isPlaying(): boolean {
        return this.scenarioManager.isPlaying();
    }

    /**
     * 콜백을 설정합니다.
     *
     * @param callbacks - 이벤트 콜백 객체
     */
    setCallbacks(callbacks: import('./types').NarrativeCallbacks): void {
        // Merge user callbacks locally, then install wrapped callbacks so internal hooks always run.
        this.userCallbacks = { ...this.userCallbacks, ...callbacks };
        this.scenarioManager.setCallbacks({
            onSequenceEnd: () => {
                this.storyControls?.hide();
                this.userCallbacks.onSequenceEnd?.();
            },
            onEvent: (eventName, payload) => {
                this.userCallbacks.onEvent?.(eventName, payload);
            },
        });
    }

    /**
     * HEBS 입력 라우팅:
     * 외부(App/Main)에서 흐름(스플래시/터치/팝업)에 따라
     * 최상단 입력 핸들러를 일시적으로 올렸다가(pop) 내릴 수 있다.
     *
     * - key는 충돌 방지를 위해 고유 문자열 사용 권장 (예: 'touchToStart')
     */
    pushInputHandler(key: string, handler: () => void): void {
        this.interactionLayer.pushHandler(key, handler);
    }

    popInputHandler(key: string): void {
        this.interactionLayer.popHandler(key);
    }

    /**
     * 입력을 물리적으로 차단/허용한다.
     * - Phase 1.1 안전장치: Flow 전환 찰나의 "입력 관통" 방지용
     */
    setInputEnabled(enabled: boolean): void {
        this.interactionLayer.setEnabled(enabled);
    }

    /**
     * PointerBlocker를 설정한다.
     * - false: 3D Scene의 카메라 컨트롤 및 mesh picking 가능
     * - true: GUI가 모든 포인터 이벤트를 차단 (기본값)
     * - Navigation 모드에서 카메라 컨트롤을 위해 사용
     */
    setPointerBlockerEnabled(enabled: boolean): void {
        this.interactionLayer.setPointerBlockerEnabled(enabled);
    }

    /**
     * 현재 UI 상태를 반환합니다. (디버그용)
     *
     * @returns 현재 UI 상태 ('idle' | 'typing' | 'waiting' | 'auto')
     */
    getState(): import('./types').UIState {
        return this.scenarioManager.getState();
    }

    // ============================================
    // Editor Navigation API
    // ============================================

    /**
     * 현재 스텝 인덱스 반환
     */
    getCurrentIndex(): number {
        return this.scenarioManager.getCurrentIndex();
    }

    /**
     * 현재 시퀀스의 총 스텝 수 반환
     */
    getStepCount(): number {
        return this.scenarioManager.getStepCount();
    }

    /**
     * 현재 시퀀스의 스텝 배열 반환 (읽기 전용)
     */
    getSteps(): ReadonlyArray<ScenarioStep> {
        return this.scenarioManager.getSteps();
    }

    /**
     * 현재 시퀀스 반환
     */
    getCurrentSequence(): ScenarioSequence | null {
        return this.scenarioManager.getCurrentSequence();
    }

    /**
     * 특정 스텝으로 이동 (재생하지 않음)
     */
    goToStep(index: number): void {
        this.scenarioManager.goToStep(index);
    }

    /**
     * 현재 스텝을 재생
     */
    resumeCurrentStep(): void {
        this.scenarioManager.resumeCurrentStep();
    }

    /**
     * 시퀀스를 교체 (인덱스 리셋 없이, 재생 없이)
     */
    replaceSequence(seq: ScenarioSequence): void {
        this.scenarioManager.replaceSequence(seq);
    }

    /**
     * 에디터 모드 설정. true이면 이벤트 스텝에서 자동 전진하지 않음.
     */
    setEditorMode(enabled: boolean): void {
        this.scenarioManager.setEditorMode(enabled);
    }

    /**
     * DialogueLogger 인스턴스 반환
     */
    getLogger(): DialogueLogger {
        return this.dialogueLogger;
    }

    /**
     * DialogueLog UI 인스턴스 반환
     */
    getDialogueLog(): DialogueLog | null {
        return this.dialogueLog;
    }

    // ============================================
    // Dialogue Log API
    // ============================================

    /**
     * 대화 로그를 엽니다.
     */
    openLog(): void {
        if (!this.dialogueLog) {
            console.warn('[NarrativeEngine] DialogueLog not initialized');
            return;
        }

        if (this.dialogueLog.isVisible) return;

        // 입력 차단 (HEBS 준수)
        this.interactionLayer.setEnabled(false);

        this.dialogueLog.show(() => {
            // 닫힐 때 입력 복원
            this.interactionLayer.setEnabled(true);
        });
    }

    /**
     * 대화 로그를 닫습니다.
     */
    closeLog(): void {
        this.dialogueLog?.hide();
    }

    /**
     * 대화 로그 토글 (열려있으면 닫고, 닫혀있으면 열기)
     */
    toggleLog(): void {
        if (this.isLogOpen()) {
            this.closeLog();
        } else {
            this.openLog();
        }
    }

    /**
     * 대화 로그가 열려있는지 확인합니다.
     */
    isLogOpen(): boolean {
        return this.dialogueLog?.isVisible ?? false;
    }

    // ============================================
    // Narrative UI Visibility (Editor Mode)
    // ============================================

    /**
     * 내러티브 UI(StoryControls + DialogueBox) 표시/숨김을 전환합니다.
     * 에디터 패널이 열릴 때 숨기고, 닫힐 때 복원합니다.
     */
    setNarrativeUIVisible(visible: boolean): void {
        if (visible) {
            this.storyControls?.show();
            // DialogueBox는 ScenarioManager가 현재 스텝에 따라 제어하므로
            // resumeCurrentStep으로 복원
            this.scenarioManager.resumeCurrentStep();
        } else {
            this.storyControls?.hide();
            this.dialogueBox.hide();
        }
    }

    // ============================================
    // Editor Callbacks (StoryControls wiring)
    // ============================================

    /**
     * StoryControls의 에디터용 콜백을 외부에서 설정합니다.
     * EditorMain에서 nav 버튼, edit 버튼 콜백을 연결할 때 사용.
     */
    setEditorCallbacks(callbacks: {
        onStepBack?: () => void;
        onStepForward?: () => void;
        onToggleEdit?: () => void;
        getEditVisible?: () => boolean;
    }): void {
        if (!this.storyControls) return;
        // StoryControls는 콜백 객체를 참조로 가지므로
        // 직접 속성 할당으로 업데이트
        const sc = this.storyControls as unknown as { callbacks: import('./ui/StoryControls').StoryControlsCallbacks };
        if (callbacks.onStepBack) sc.callbacks.onStepBack = callbacks.onStepBack;
        if (callbacks.onStepForward) sc.callbacks.onStepForward = callbacks.onStepForward;
        if (callbacks.onToggleEdit) sc.callbacks.onToggleEdit = callbacks.onToggleEdit;
        if (callbacks.getEditVisible) sc.callbacks.getEditVisible = callbacks.getEditVisible;
    }

    /**
     * 대사창 위치에 맞춰 ◀▶ 버튼 배치를 갱신합니다.
     */
    private updateNavLayout(scaleInfo: DialogueScaleInfo): void {
        if (!this.storyControls) return;
        const dims = computeDialogueDimensions(scaleInfo);
        const bottomOffset = dims.bottomOffset + RUNTIME_SAFE_AREA.BOTTOM;
        this.storyControls.updateNavLayout(dims.width, dims.height, bottomOffset);
    }

    /**
     * 리소스를 해제합니다.
     */
    dispose(): void {
        console.log('[NarrativeEngine] Disposing');
        if (this.scaleObserver) {
            this.scaleObserver.remove();
            this.scaleObserver = null;
        }
        this.dialogueLog?.dispose();
        this.dialogueLogger.dispose();
        this.scenarioManager.dispose();
        this.storyControls?.dispose();
        this.dialogueBox.dispose();
        this.interactionLayer.dispose();
    }
}
