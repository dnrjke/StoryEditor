/**
 * SaveManager - 자동 저장 + 수동 저장 관리자
 *
 * - Auto-save: localStorage에 30초 간격으로 JSON 저장
 * - Manual save: YAML 파일 다운로드
 * - Load: localStorage에서 복원
 *
 * localStorage 키 형식: `storyeditor_autosave_v1_{id}`
 * Auto-save는 JSON.stringify (빠른 내부 형식),
 * Manual save는 ScenarioSerializer YAML 출력.
 */

import type { ScenarioSequence } from '../engines/narrative/types';
import { serializeScenarioYaml } from './ScenarioSerializer';

const AUTOSAVE_PREFIX = 'storyeditor_autosave_v1_';
const AUTOSAVE_INTERVAL_MS = 30_000; // 30 seconds

export class SaveManager {
    private autoSaveTimer: number | null = null;
    private getSequenceFn: (() => ScenarioSequence | null) | null = null;

    /** 자동 저장 완료 시 호출되는 콜백 */
    public onAutoSaved: (() => void) | null = null;

    /**
     * 자동 저장을 시작합니다.
     * 30초 간격으로 getSequence()를 호출하여 localStorage에 저장합니다.
     *
     * @param getSequence - 현재 시나리오를 반환하는 함수
     */
    startAutoSave(getSequence: () => ScenarioSequence | null): void {
        this.stopAutoSave();
        this.getSequenceFn = getSequence;

        this.autoSaveTimer = window.setInterval(() => {
            this.performAutoSave();
        }, AUTOSAVE_INTERVAL_MS);

        console.log('[SaveManager] Auto-save started (30s interval)');
    }

    /**
     * 자동 저장을 중지합니다.
     */
    stopAutoSave(): void {
        if (this.autoSaveTimer !== null) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
            console.log('[SaveManager] Auto-save stopped');
        }
        this.getSequenceFn = null;
    }

    /**
     * 수동 저장: YAML 파일을 브라우저 다운로드로 내보냅니다.
     *
     * @param sequence - 저장할 시나리오 시퀀스
     */
    async manualSave(sequence: ScenarioSequence): Promise<void> {
        const yaml = serializeScenarioYaml(sequence);
        const fileName = `${sequence.id}.yaml`;
        const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });

        // Try Web Share API first (iOS Safari, mobile browsers)
        if (navigator.share && navigator.canShare) {
            try {
                const file = new File([blob], fileName, { type: 'text/yaml;charset=utf-8' });
                const shareData = { files: [file] };
                if (navigator.canShare(shareData)) {
                    await navigator.share(shareData);
                    console.log(`[SaveManager] Manual save via Share API: ${fileName}`);
                    return;
                }
            } catch (e) {
                // User cancelled or share failed → fall through to download
                if (e instanceof DOMException && e.name === 'AbortError') {
                    console.log('[SaveManager] Share cancelled by user');
                    return;
                }
                console.warn('[SaveManager] Share API failed, falling back to download:', e);
            }
        }

        // Fallback: <a download> link click
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();

        window.setTimeout(() => {
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }, 100);

        console.log(`[SaveManager] Manual save: ${fileName}`);
    }

    /**
     * localStorage에서 자동 저장된 시나리오를 불러옵니다.
     *
     * @param id - 시나리오 ID
     * @returns 복원된 ScenarioSequence 또는 null
     */
    loadAutoSave(id: string): ScenarioSequence | null {
        const key = AUTOSAVE_PREFIX + id;
        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            const parsed = JSON.parse(raw) as ScenarioSequence;
            console.log(`[SaveManager] Auto-save loaded: ${id}`);
            return parsed;
        } catch (e) {
            console.error(`[SaveManager] Failed to load auto-save: ${id}`, e);
            return null;
        }
    }

    /**
     * 해당 ID의 자동 저장 데이터가 존재하는지 확인합니다.
     *
     * @param id - 시나리오 ID
     */
    hasAutoSave(id: string): boolean {
        return localStorage.getItem(AUTOSAVE_PREFIX + id) !== null;
    }

    /**
     * 해당 ID의 자동 저장 데이터를 삭제합니다.
     *
     * @param id - 시나리오 ID
     */
    clearAutoSave(id: string): void {
        localStorage.removeItem(AUTOSAVE_PREFIX + id);
        console.log(`[SaveManager] Auto-save cleared: ${id}`);
    }

    /**
     * 즉시 자동 저장 (beforeunload / visibilitychange 용)
     */
    flushAutoSave(): void {
        this.performAutoSave();
    }

    /**
     * 자동 저장 실행 (내부)
     */
    private performAutoSave(): void {
        if (!this.getSequenceFn) return;

        const sequence = this.getSequenceFn();
        if (!sequence) return;

        const key = AUTOSAVE_PREFIX + sequence.id;
        try {
            localStorage.setItem(key, JSON.stringify(sequence));
            console.log(`[SaveManager] Auto-saved: ${sequence.id}`);
            this.onAutoSaved?.();
        } catch (e) {
            console.error('[SaveManager] Auto-save failed:', e);
        }
    }

    /**
     * 리소스 해제
     */
    dispose(): void {
        this.stopAutoSave();
    }
}
