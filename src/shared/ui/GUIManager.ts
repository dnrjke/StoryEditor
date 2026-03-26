/**
 * GUIManager - Babylon GUI Layer Manager
 *
 * 게임 엔진형 스케일 기반 UI 시스템:
 * - 가로/세로 완전 분리 정책
 * - 각 모드별 독립적인 BASE 기준값 사용
 * - 해상도 변경 시 1회 계산, 프레임 단위 재계산 금지
 *
 * HEBS (Hierarchical Event Blocking System) 준수:
 * - InteractionLayer: 유일한 입력 수신 지점
 * - 모든 상위 레이어: isHitTestVisible = false (시각 전용)
 * - 팝업 활성화 시: InteractionLayer.isEnabled = false
 *
 * Layer Hierarchy (zIndex 순서):
 * - INTERACTION (100): 입력 전담
 * - DISPLAY (500): 배경, 캐릭터, 대화창
 * - EFFECT (800): 연출 이펙트
 * - SYSTEM (1000): 팝업, 선택지
 * - SKIP (1100): 시스템 버튼 (Skip, Settings)
 */

import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';
import { Z_INDEX, LANDSCAPE_BASE, PORTRAIT_BASE, SCALE_LIMITS, type DialogueScaleInfo } from '../design';

// Re-export for external use
export type { DialogueScaleInfo };

export class GUIManager {
    private texture: GUI.AdvancedDynamicTexture;
    private rootScaler: GUI.Rectangle;
    private initialScaleApplied: boolean = false;

    // Layer containers (HEBS 계층 구조)
    private interactionLayer: GUI.Rectangle;
    private displayLayer: GUI.Rectangle;
    private effectLayer: GUI.Rectangle;
    private systemLayer: GUI.Rectangle;
    private skipLayer: GUI.Rectangle;

    // Scale-based UI: 해상도 변경 시 1회만 통지
    public readonly onScaleChanged: BABYLON.Observable<DialogueScaleInfo> = new BABYLON.Observable();
    private currentScaleInfo: DialogueScaleInfo = {
        globalScale: 1.0,
        rootScale: 1.0,
        scalerWidth: 1080,
        scalerHeight: 1920,
        isPortrait: false,
    };

    constructor(scene: BABYLON.Scene) {
        this.texture = GUI.AdvancedDynamicTexture.CreateFullscreenUI('MainUI', true, scene);

        // Native Resolution UI (Crisp Text)
        this.texture.renderAtIdealSize = false;

        console.log('[GUIManager] Initialized with Mode-Separated Scale System');

        // Root Scaler: 캔버스 → 논리 좌표계 변환
        this.rootScaler = new GUI.Rectangle('RootScaler');
        this.rootScaler.thickness = 0;
        this.rootScaler.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.rootScaler.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.rootScaler.alpha = 0;
        this.texture.addControl(this.rootScaler);

        // Create layers in zIndex order (HEBS)
        this.interactionLayer = this.createLayer('InteractionLayer', Z_INDEX.INTERACTION);
        this.displayLayer = this.createLayer('DisplayLayer', Z_INDEX.DISPLAY);
        this.effectLayer = this.createLayer('EffectLayer', Z_INDEX.EFFECT);
        this.systemLayer = this.createLayer('SystemLayer', Z_INDEX.SYSTEM);
        this.skipLayer = this.createLayer('SkipLayer', Z_INDEX.SKIP);

        // HEBS: 상위 레이어는 클릭 관통
        this.displayLayer.isHitTestVisible = false;
        this.effectLayer.isHitTestVisible = false;
        this.systemLayer.isHitTestVisible = false;
        this.skipLayer.isHitTestVisible = true;
        this.skipLayer.delegatePickingToChildren = true;

        // Apply scale policy (1회, 해상도 변경 시만)
        const engine = scene.getEngine();
        engine.onResizeObservable.add(() => {
            this.computeScaleOnce(engine);
        });
        this.computeScaleOnce(engine);

        scene.executeWhenReady(() => {
            this.computeScaleOnce(engine);
        });

        console.log('[GUIManager] HEBS layer hierarchy created');
    }

    private createLayer(name: string, zIndex: number): GUI.Rectangle {
        const layer = new GUI.Rectangle(name);
        layer.width = '100%';
        layer.height = '100%';
        layer.thickness = 0;
        layer.zIndex = zIndex;
        layer.isPointerBlocker = false;
        this.rootScaler.addControl(layer);
        return layer;
    }

    getInteractionLayer(): GUI.Rectangle {
        return this.interactionLayer;
    }

    getDisplayLayer(): GUI.Rectangle {
        return this.displayLayer;
    }

    getSystemLayer(): GUI.Rectangle {
        return this.systemLayer;
    }

    getEffectLayer(): GUI.Rectangle {
        return this.effectLayer;
    }

    getSkipLayer(): GUI.Rectangle {
        return this.skipLayer;
    }

    getTexture(): GUI.AdvancedDynamicTexture {
        return this.texture;
    }

    /**
     * 현재 스케일 정보 반환
     */
    getScaleInfo(): DialogueScaleInfo {
        return this.currentScaleInfo;
    }

    /**
     * HEBS §1.1: 팝업 활성화 시 InteractionLayer 비활성화
     */
    disableInteraction(): void {
        this.interactionLayer.isEnabled = false;
        console.log('[GUIManager] HEBS: Interaction disabled (popup active)');
    }

    /**
     * HEBS §1.1: 팝업 종료 시 InteractionLayer 재활성화
     */
    enableInteraction(): void {
        this.interactionLayer.isEnabled = true;
        console.log('[GUIManager] HEBS: Interaction enabled');
    }

    dispose(): void {
        this.onScaleChanged.clear();
        this.texture.dispose();
    }

    /**
     * 스케일 계산 (해상도 변경 시 1회만 실행)
     *
     * 가로/세로 완전 분리:
     * - 세로 모드: PORTRAIT_BASE 사용, 360px 폰 가독성 최우선
     * - 가로 모드: LANDSCAPE_BASE 사용, PC 황금비 유지
     */
    private computeScaleOnce(engine: BABYLON.AbstractEngine): void {
        const renderW = engine.getRenderWidth();
        const renderH = engine.getRenderHeight();

        // Guard: 초기화 전 0x0 방지
        if (renderW < 2 || renderH < 2) {
            return;
        }

        const aspect = renderW / Math.max(renderH, 1);
        const isPortrait = aspect < 1.0;

        let rootScale: number;
        let globalScale: number;
        let scalerW: number;
        let scalerH: number;

        if (isPortrait) {
            // ============================================
            // 세로 모드: PORTRAIT_BASE 전용 로직
            // ============================================

            // 논리 좌표계: PORTRAIT_BASE.IDEAL_WIDTH(540px) 기준
            rootScale = renderW / PORTRAIT_BASE.IDEAL_WIDTH;
            scalerW = Math.floor(renderW / rootScale);  // = 540
            scalerH = Math.floor(renderH / rootScale);

            // globalScale: 논리폭 대비 대화창 기준폭
            // 540px 논리폭에서 480px 대화창 → 여백 확보
            if (scalerW >= PORTRAIT_BASE.WIDTH) {
                globalScale = SCALE_LIMITS.MAX;
            } else {
                globalScale = scalerW / PORTRAIT_BASE.WIDTH;
            }

            console.log(
                `[GUIManager] PORTRAIT mode:`,
                `Render=${renderW}x${renderH}`,
                `Scaler=${scalerW}x${scalerH}`,
                `GlobalScale=${globalScale.toFixed(3)}`
            );

        } else {
            // ============================================
            // 가로 모드: LANDSCAPE_BASE 전용 로직
            // ============================================

            // 논리 좌표계: LANDSCAPE_BASE.IDEAL_HEIGHT(1080px) 기준
            rootScale = renderH / LANDSCAPE_BASE.IDEAL_HEIGHT;
            scalerW = Math.floor(renderW / rootScale);
            scalerH = Math.floor(renderH / rootScale);  // ≈ 1080

            // globalScale: 논리폭 대비 대화창 기준폭
            if (scalerW >= LANDSCAPE_BASE.WIDTH) {
                globalScale = SCALE_LIMITS.MAX;
            } else {
                globalScale = scalerW / LANDSCAPE_BASE.WIDTH;
            }

            console.log(
                `[GUIManager] LANDSCAPE mode:`,
                `Render=${renderW}x${renderH}`,
                `Scaler=${scalerW}x${scalerH}`,
                `GlobalScale=${globalScale.toFixed(3)}`
            );
        }

        // 스케일 제한 적용
        globalScale = Math.max(SCALE_LIMITS.MIN, Math.min(SCALE_LIMITS.MAX, globalScale));

        // rootScaler 적용
        if (this.rootScaler) {
            this.rootScaler.scaleX = rootScale;
            this.rootScaler.scaleY = rootScale;
            this.rootScaler.widthInPixels = scalerW;
            this.rootScaler.heightInPixels = scalerH;

            if (!this.initialScaleApplied) {
                this.rootScaler.alpha = 1;
                this.initialScaleApplied = true;
                console.log(
                    '[GUIManager] InitialScale applied',
                    `Mode=${isPortrait ? 'PORTRAIT' : 'LANDSCAPE'}`
                );
            }
        }

        // 스케일 정보 저장 및 통지
        this.currentScaleInfo = {
            globalScale,
            rootScale,
            scalerWidth: scalerW,
            scalerHeight: scalerH,
            isPortrait,
        };
        this.onScaleChanged.notifyObservers(this.currentScaleInfo);
    }
}
