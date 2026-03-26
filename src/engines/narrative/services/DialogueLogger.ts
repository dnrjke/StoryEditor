/**
 * DialogueLogger - 대화 텍스트 캡처 서비스
 *
 * ScenarioManager에서 출력되는 모든 텍스트를 자동으로 기록
 * DialogueLog UI에서 이 데이터를 표시
 */

import * as BABYLON from '@babylonjs/core';
import type { DialogueLogEntry } from '../types';

export class DialogueLogger {
    private entries: DialogueLogEntry[] = [];
    private nextId: number = 0;
    private maxEntries: number = 500;

    /** 새 항목 추가 시 발행 */
    public readonly onEntryAdded: BABYLON.Observable<DialogueLogEntry>;

    constructor() {
        this.onEntryAdded = new BABYLON.Observable();
        console.log('[DialogueLogger] Initialized');
    }

    /**
     * 대화/나레이션 텍스트 캡처
     * ScenarioManager.handleTextStep()에서 호출
     */
    capture(
        text: string,
        speaker?: string,
        stepType: 'narration' | 'dialogue' | 'auto' = 'dialogue',
        stepIndex: number = 0
    ): void {
        const entry: DialogueLogEntry = {
            id: this.nextId++,
            timestamp: performance.now(),
            speaker,
            text,
            stepType,
            stepIndex,
        };

        this.entries.push(entry);

        // 메모리 제한 (오래된 항목 제거)
        if (this.entries.length > this.maxEntries) {
            this.entries.shift();
        }

        this.onEntryAdded.notifyObservers(entry);
    }

    /**
     * 모든 로그 항목 반환 (읽기 전용)
     */
    getEntries(): ReadonlyArray<DialogueLogEntry> {
        return this.entries;
    }

    /**
     * 항목 개수
     */
    getCount(): number {
        return this.entries.length;
    }

    /**
     * 로그 초기화
     */
    clear(): void {
        this.entries = [];
        this.nextId = 0;
        console.log('[DialogueLogger] Cleared');
    }

    dispose(): void {
        this.onEntryAdded.clear();
        this.entries = [];
        console.log('[DialogueLogger] Disposed');
    }
}
