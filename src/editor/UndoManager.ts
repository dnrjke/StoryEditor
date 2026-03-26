/**
 * UndoManager - 시나리오 편집 Undo/Redo 관리
 *
 * ScenarioStep[] 스냅샷 기반 히스토리.
 * 편집 작업 전에 pushState()로 현재 상태를 저장하고,
 * undo()/redo()로 상태를 복원합니다.
 */

import type { ScenarioStep } from '../engines/narrative/types';

/** 히스토리 최대 크기 */
const MAX_HISTORY = 100;

export class UndoManager {
    private undoStack: ReadonlyArray<ScenarioStep>[] = [];
    private redoStack: ReadonlyArray<ScenarioStep>[] = [];

    /**
     * 현재 상태를 undo 스택에 저장합니다.
     * 편집 작업 실행 **전에** 호출해야 합니다.
     */
    pushState(steps: ReadonlyArray<ScenarioStep>): void {
        // Deep copy
        const snapshot = steps.map(s => ({ ...s }));
        this.undoStack.push(snapshot);
        // 새 작업 시 redo 스택 클리어
        this.redoStack.length = 0;
        // 최대 크기 제한
        if (this.undoStack.length > MAX_HISTORY) {
            this.undoStack.shift();
        }
    }

    /**
     * Undo: 이전 상태를 반환합니다.
     * 현재 상태를 currentSteps로 전달하면 redo 스택에 보관됩니다.
     */
    undo(currentSteps: ReadonlyArray<ScenarioStep>): ReadonlyArray<ScenarioStep> | null {
        if (this.undoStack.length === 0) return null;
        // 현재 상태를 redo에 보관
        this.redoStack.push(currentSteps.map(s => ({ ...s })));
        return this.undoStack.pop()!;
    }

    /**
     * Redo: 다음 상태를 반환합니다.
     * 현재 상태를 currentSteps로 전달하면 undo 스택에 보관됩니다.
     */
    redo(currentSteps: ReadonlyArray<ScenarioStep>): ReadonlyArray<ScenarioStep> | null {
        if (this.redoStack.length === 0) return null;
        // 현재 상태를 undo에 보관
        this.undoStack.push(currentSteps.map(s => ({ ...s })));
        return this.redoStack.pop()!;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }

    clear(): void {
        this.undoStack.length = 0;
        this.redoStack.length = 0;
    }
}
