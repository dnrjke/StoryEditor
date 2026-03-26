/**
 * EditorController - 에디터 중앙 제어기
 *
 * 에디터 UI ↔ NarrativeEngine ↔ FlowController를 연결하는 코디네이터입니다.
 *
 * 기능:
 * - 스텝 네비게이션 (앞/뒤/점프)
 * - 시나리오 CRUD (삽입/수정/삭제/이동)
 * - 파일 임포트 (YAML → ScenarioSequence)
 * - 새 시나리오 생성
 * - 저장 (수동 YAML 다운로드 + 자동 localStorage)
 */

import * as jsYaml from 'js-yaml';
import type { ScenarioSequence, ScenarioStep } from '../engines/narrative/types';
import { parseScenarioYaml } from '../engines/narrative/scenario/parseScenarioYaml';
import { EditorFlowController } from '../app/EditorFlowController';
import { SaveManager } from './SaveManager';
import { UndoManager } from './UndoManager';
import { reconstructVisualState } from './StateReconstructor';

// ============================================
// NarrativeEngine 인터페이스 (에디터가 요구하는 최소 API)
// ============================================

/**
 * NarrativeEngine이 제공해야 하는 에디터용 API.
 * 실제 NarrativeEngine 클래스가 이 인터페이스를 구현합니다.
 */
export interface INarrativeEngine {
    startNarrative(sequence: ScenarioSequence): void;
    goToStep(index: number): void;
    resumeCurrentStep(): void;
    getCurrentIndex(): number;
    getStepCount(): number;
    getSteps(): ReadonlyArray<ScenarioStep>;
    getCurrentSequence(): ScenarioSequence | null;
    replaceSequence(sequence: ScenarioSequence): void;
    setCallbacks(callbacks: {
        onSequenceEnd?: () => void;
        onEvent?: (eventName: string, payload?: unknown) => void;
    }): void;
    getLogger(): IDialogueLogger;
    isPlaying(): boolean;
    setEditorMode(enabled: boolean): void;
}

/**
 * DialogueLogger 최소 인터페이스 (에디터용)
 */
export interface IDialogueLogger {
    capture(
        text: string,
        speaker?: string,
        stepType?: 'narration' | 'dialogue' | 'auto',
        stepIndex?: number
    ): void;
    clear(): void;
    getEntries(): ReadonlyArray<{
        id: number;
        speaker?: string;
        text: string;
        stepType: 'narration' | 'dialogue' | 'auto';
        stepIndex: number;
    }>;
}

// ============================================
// EditorController
// ============================================

export class EditorController {
    private readonly engine: INarrativeEngine;
    private readonly flow: EditorFlowController;
    private readonly saveManager: SaveManager;
    private readonly undoManager: UndoManager = new UndoManager();

    constructor(
        engine: INarrativeEngine,
        flow: EditorFlowController,
        saveManager?: SaveManager
    ) {
        this.engine = engine;
        this.flow = flow;
        this.saveManager = saveManager ?? new SaveManager();

        // NarrativeEngine 이벤트를 FlowController로 연결
        this.engine.setCallbacks({
            onEvent: (eventName, payload) => {
                this.flow.handleEvent(eventName, payload);
            },
            onSequenceEnd: () => {
                console.log('[EditorController] Sequence ended');
            },
        });
    }

    // ============================================
    // Navigation
    // ============================================

    /**
     * 한 스텝 뒤로 이동합니다.
     */
    stepBack(): void {
        const currentIndex = this.engine.getCurrentIndex();
        if (currentIndex > 0) {
            this.jumpToStep(currentIndex - 1);
        } else {
            console.warn('[EditorController] Already at first step');
        }
    }

    /**
     * 한 스텝 앞으로 이동합니다.
     */
    stepForward(): void {
        const currentIndex = this.engine.getCurrentIndex();
        const stepCount = this.engine.getStepCount();
        if (currentIndex < stepCount - 1) {
            this.jumpToStep(currentIndex + 1);
        } else {
            console.warn('[EditorController] Already at last step');
        }
    }

    /**
     * 지정 인덱스로 점프합니다.
     *
     * 1. 시각 상태를 재구성하여 즉시 적용
     * 2. 로거를 클리어 후 [0..index) 텍스트 스텝의 로그를 재구축
     * 3. 해당 스텝으로 이동하여 재생
     *
     * @param index - 목표 스텝 인덱스
     */
    jumpToStep(index: number): void {
        const steps = this.engine.getSteps();
        const stepCount = this.engine.getStepCount();

        if (index < 0 || index >= stepCount) {
            console.warn(`[EditorController] Invalid step index: ${index} (total: ${stepCount})`);
            return;
        }

        // 1. 시각 상태 복원
        const visualState = reconstructVisualState(steps, index);
        this.flow.applyVisualState(visualState);

        // 2. 로거 재구축
        const logger = this.engine.getLogger();
        logger.clear();

        for (let i = 0; i < index; i++) {
            const step = steps[i];
            if (step.type === 'narration') {
                logger.capture(step.text, undefined, 'narration', i);
            } else if (step.type === 'dialogue') {
                logger.capture(step.text, step.speaker, 'dialogue', i);
            } else if (step.type === 'auto' && step.text) {
                logger.capture(step.text, step.speaker, 'auto', i);
            }
        }

        // 3. 엔진 점프
        this.engine.goToStep(index);
        this.engine.resumeCurrentStep();

        console.log(`[EditorController] Jumped to step ${index}`);
    }

    // ============================================
    // Scenario Lifecycle
    // ============================================

    /**
     * 시나리오를 로드하고 재생을 시작합니다.
     *
     * @param sequence - 로드할 시나리오 시퀀스
     */
    loadScenario(sequence: ScenarioSequence): void {
        this.engine.setEditorMode(true);
        this.engine.startNarrative(sequence);
        this.saveManager.startAutoSave(() => this.getCurrentSequence());
        console.log(`[EditorController] Loaded scenario: ${sequence.name}`);
    }

    /**
     * 현재 시나리오 시퀀스를 반환합니다.
     */
    getCurrentSequence(): ScenarioSequence | null {
        return this.engine.getCurrentSequence();
    }

    // ============================================
    // Step CRUD
    // ============================================

    /**
     * 지정 인덱스 뒤에 새 스텝을 삽입합니다.
     *
     * @param afterIndex - 이 인덱스 뒤에 삽입 (-1이면 맨 앞에 삽입)
     * @param step - 삽입할 스텝
     */
    insertStep(afterIndex: number, step: ScenarioStep): void {
        const seq = this.engine.getCurrentSequence();
        if (!seq) {
            console.warn('[EditorController] No sequence loaded');
            return;
        }

        this.undoManager.pushState(seq.steps);
        const insertAt = afterIndex + 1;
        seq.steps.splice(insertAt, 0, step);
        this.engine.replaceSequence({ ...seq, steps: [...seq.steps] });

        console.log(`[EditorController] Inserted step at ${insertAt}: ${step.type}`);
    }

    /**
     * 지정 인덱스의 스텝을 교체합니다.
     *
     * @param index - 교체할 스텝 인덱스
     * @param step - 새 스텝
     */
    updateStep(index: number, step: ScenarioStep): void {
        const seq = this.engine.getCurrentSequence();
        if (!seq) {
            console.warn('[EditorController] No sequence loaded');
            return;
        }

        if (index < 0 || index >= seq.steps.length) {
            console.warn(`[EditorController] Invalid index for update: ${index}`);
            return;
        }

        this.undoManager.pushState(seq.steps);
        seq.steps[index] = step;
        this.engine.replaceSequence({ ...seq, steps: [...seq.steps] });

        console.log(`[EditorController] Updated step ${index}: ${step.type}`);
    }

    /**
     * 지정 인덱스의 스텝을 삭제합니다.
     *
     * @param index - 삭제할 스텝 인덱스
     */
    deleteStep(index: number): void {
        const seq = this.engine.getCurrentSequence();
        if (!seq) {
            console.warn('[EditorController] No sequence loaded');
            return;
        }

        if (index < 0 || index >= seq.steps.length) {
            console.warn(`[EditorController] Invalid index for delete: ${index}`);
            return;
        }

        this.undoManager.pushState(seq.steps);
        seq.steps.splice(index, 1);
        this.engine.replaceSequence({ ...seq, steps: [...seq.steps] });

        console.log(`[EditorController] Deleted step ${index}`);
    }

    /**
     * 스텝을 다른 위치로 이동합니다.
     *
     * @param from - 이동할 스텝의 현재 인덱스
     * @param to - 이동할 목표 인덱스
     */
    moveStep(from: number, to: number): void {
        const seq = this.engine.getCurrentSequence();
        if (!seq) {
            console.warn('[EditorController] No sequence loaded');
            return;
        }

        if (
            from < 0 || from >= seq.steps.length ||
            to < 0 || to >= seq.steps.length
        ) {
            console.warn(`[EditorController] Invalid move: ${from} → ${to}`);
            return;
        }

        this.undoManager.pushState(seq.steps);
        const [removed] = seq.steps.splice(from, 1);
        seq.steps.splice(to, 0, removed);
        this.engine.replaceSequence({ ...seq, steps: [...seq.steps] });

        console.log(`[EditorController] Moved step ${from} → ${to}`);
    }

    // ============================================
    // Undo / Redo
    // ============================================

    /**
     * 마지막 편집을 되돌립니다.
     * @returns 성공 시 true
     */
    undo(): boolean {
        const seq = this.engine.getCurrentSequence();
        if (!seq) return false;
        const prev = this.undoManager.undo(seq.steps);
        if (!prev) return false;
        this.engine.replaceSequence({ ...seq, steps: [...prev] });
        console.log('[EditorController] Undo');
        return true;
    }

    /**
     * 되돌린 편집을 다시 적용합니다.
     * @returns 성공 시 true
     */
    redo(): boolean {
        const seq = this.engine.getCurrentSequence();
        if (!seq) return false;
        const next = this.undoManager.redo(seq.steps);
        if (!next) return false;
        this.engine.replaceSequence({ ...seq, steps: [...next] });
        console.log('[EditorController] Redo');
        return true;
    }

    canUndo(): boolean { return this.undoManager.canUndo(); }
    canRedo(): boolean { return this.undoManager.canRedo(); }

    // ============================================
    // Save / Export
    // ============================================

    /**
     * 현재 시나리오를 YAML 파일로 수동 저장합니다.
     */
    saveScenario(): void {
        const seq = this.engine.getCurrentSequence();
        if (!seq) {
            console.warn('[EditorController] No sequence to save');
            return;
        }
        this.saveManager.manualSave(seq);
    }

    /**
     * SaveManager를 반환합니다 (외부에서 auto-save 제어용).
     */
    getSaveManager(): SaveManager {
        return this.saveManager;
    }

    // ============================================
    // Import / New
    // ============================================

    /**
     * 파일 선택 다이얼로그를 열어 YAML 파일을 임포트합니다.
     * 파싱에 성공하면 loadScenario를 호출합니다.
     */
    importFile(onComplete?: () => void): void {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.yaml,.yml';
        input.style.display = 'none';

        input.addEventListener('change', () => {
            const file = input.files?.[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = () => {
                try {
                    const yamlText = reader.result as string;
                    const rawObj = jsYaml.load(yamlText);
                    const sequence = parseScenarioYaml(rawObj, file.name);
                    this.engine.replaceSequence(sequence);
                    this.saveManager.startAutoSave(() => this.getCurrentSequence());
                    this.jumpToStep(0);
                    console.log(`[EditorController] Imported: ${file.name}`);
                    onComplete?.();
                } catch (e) {
                    console.error('[EditorController] Import failed:', e);
                    alert(`Import failed: ${e instanceof Error ? e.message : String(e)}`);
                }
            };
            reader.readAsText(file, 'utf-8');

            // cleanup
            document.body.removeChild(input);
        });

        document.body.appendChild(input);
        input.click();
    }

    /**
     * 새 빈 시나리오를 생성합니다.
     * 사용자에게 ID와 이름을 입력받습니다.
     */
    newScenario(onComplete?: () => void): void {
        const id = prompt('Scenario ID:', `scenario_${Date.now()}`);
        if (!id) return;

        const name = prompt('Scenario Name:', 'New Scenario');
        if (!name) return;

        const sequence: ScenarioSequence = {
            id,
            name,
            steps: [],
        };

        this.loadScenario(sequence);
        console.log(`[EditorController] New scenario created: ${name} (${id})`);
        onComplete?.();
    }

    // ============================================
    // Dispose
    // ============================================

    dispose(): void {
        this.saveManager.dispose();
        console.log('[EditorController] Disposed');
    }
}
