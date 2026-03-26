/**
 * StoryControls - Skip / Auto / Log / Edit / Nav system buttons (Layer 3: SKIP)
 *
 * Spec:
 * - Skip (right-top): long press to fill circular gauge (Ellipse.arc 0..1).
 *   Hold >= 1s triggers fast-forward mode.
 * - Auto (left-top): toggle on/off. When enabled, ScenarioManager auto-advances
 *   from uiState==='waiting' after delay.
 * - Log: toggle dialogue log overlay.
 * - Edit: toggle editor mode.
 * - Nav (◀ ▶): step back / step forward.
 *
 * Input priority:
 * - These controls sit above InteractionLayer (zIndex=1100).
 * - isPointerBlocker=true to prevent underlying InteractionLayer tap.
 *
 * Layout order right-to-left: [SKIP] [AUTO] [LOG] [EDIT] [▶] [◀]
 */
import * as GUI from '@babylonjs/gui';
import { ANIM, COLORS, FONT, LAYOUT, RUNTIME_SAFE_AREA } from '../../../shared/design';

const NAV_SIZE = 48;

export interface StoryControlsCallbacks {
    onToggleAuto: (enabled: boolean) => void;
    onHoldSkipTriggered: () => void;
    onSkipCancelled: () => void;
    /** 홀드 완료 시 시나리오 끝까지 완전 스킵 */
    onCompleteSkip?: () => void;
    getAutoEnabled: () => boolean;
    getFastForwardEnabled: () => boolean;
    /** 로그 열기/닫기 토글 */
    onToggleLog?: () => void;
    /** 로그 현재 상태 조회 */
    getLogVisible?: () => boolean;
    /** 이전 스텝으로 이동 */
    onStepBack?: () => void;
    /** 다음 스텝으로 이동 */
    onStepForward?: () => void;
    /** 에디터 모드 토글 */
    onToggleEdit?: () => void;
    /** 에디터 모드 현재 상태 조회 */
    getEditVisible?: () => boolean;
}

export class StoryControls {
    private parentLayer: GUI.Rectangle;
    private callbacks: StoryControlsCallbacks;

    private logButton: GUI.Rectangle;
    private logLabel: GUI.TextBlock;

    private editButton: GUI.Rectangle;
    private editLabel: GUI.TextBlock;

    private prevButton: GUI.Ellipse;
    private prevLabel: GUI.TextBlock;

    private nextButton: GUI.Ellipse;
    private nextLabel: GUI.TextBlock;

    private autoButton: GUI.Rectangle;
    private autoLabel: GUI.TextBlock;
    private autoIcon: GUI.TextBlock;

    private skipButton: GUI.Ellipse;
    private skipRingBase: GUI.Ellipse;
    private skipRingFill: GUI.Ellipse;
    private skipPrefixLabel: GUI.TextBlock;
    private skipLabel: GUI.TextBlock;

    private isVisible: boolean = false;

    // Skip hold state
    private holding: boolean = false;
    private holdStartAt: number = 0;
    private holdTimer: number | null = null;
    private releaseTimer: number | null = null;
    private holdTriggered: boolean = false;
    private progress: number = 0;

    constructor(parentLayer: GUI.Rectangle, callbacks: StoryControlsCallbacks) {
        this.parentLayer = parentLayer;
        this.callbacks = callbacks;

        const topY = RUNTIME_SAFE_AREA.TOP + LAYOUT.STORY_CONTROLS.TOP_OFFSET;

        // Cumulative right offset tracking (right to left)
        // Top bar: [SKIP] [AUTO] [LOG] [EDIT]  (nav buttons moved to dialogue box area)
        const skipRight = RUNTIME_SAFE_AREA.RIGHT;
        const autoRight = skipRight + LAYOUT.STORY_CONTROLS.SKIP_SIZE + LAYOUT.STORY_CONTROLS.GAP;
        const logRight = autoRight + LAYOUT.STORY_CONTROLS.AUTO_WIDTH + LAYOUT.STORY_CONTROLS.GAP;
        const editRight = logRight + LAYOUT.DIALOGUE_LOG.LOG_BTN_WIDTH + LAYOUT.STORY_CONTROLS.GAP;

        // =========================
        // LOG (Left of Auto)
        // =========================
        this.logButton = new GUI.Rectangle('LogButton');
        this.logButton.widthInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_WIDTH;
        this.logButton.heightInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_HEIGHT;
        this.logButton.cornerRadius = LAYOUT.STORY_CONTROLS.AUTO_CORNER_RADIUS;
        this.logButton.thickness = 2;
        this.logButton.color = COLORS.SYSTEM_BTN_BORDER;
        this.logButton.background = COLORS.SYSTEM_BTN_BG;
        this.logButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.logButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.logButton.leftInPixels = -logRight;
        this.logButton.topInPixels = topY;
        this.logButton.isHitTestVisible = true;
        this.logButton.isPointerBlocker = true;

        this.logLabel = new GUI.TextBlock('LogLabel');
        this.logLabel.text = 'LOG';
        this.logLabel.fontFamily = FONT.FAMILY.BODY;
        this.logLabel.fontSizeInPixels = FONT.SIZE.SYSTEM_BUTTON;
        this.logLabel.fontWeight = FONT.WEIGHT.BOLD;
        this.logLabel.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        this.logLabel.widthInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_WIDTH;
        this.logLabel.heightInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_HEIGHT;
        this.logLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.logLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.logLabel.isHitTestVisible = false;
        this.logButton.addControl(this.logLabel);

        this.logButton.onPointerClickObservable.add(() => {
            this.callbacks.onToggleLog?.();
        });

        // =========================
        // EDIT (Left of LOG)
        // =========================
        this.editButton = new GUI.Rectangle('EditButton');
        this.editButton.widthInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_WIDTH;
        this.editButton.heightInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_HEIGHT;
        this.editButton.cornerRadius = LAYOUT.STORY_CONTROLS.AUTO_CORNER_RADIUS;
        this.editButton.thickness = 2;
        this.editButton.color = COLORS.SYSTEM_BTN_BORDER;
        this.editButton.background = COLORS.SYSTEM_BTN_BG;
        this.editButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.editButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.editButton.leftInPixels = -editRight;
        this.editButton.topInPixels = topY;
        this.editButton.isHitTestVisible = true;
        this.editButton.isPointerBlocker = true;

        this.editLabel = new GUI.TextBlock('EditLabel');
        this.editLabel.text = 'EDIT';
        this.editLabel.fontFamily = FONT.FAMILY.BODY;
        this.editLabel.fontSizeInPixels = FONT.SIZE.SYSTEM_BUTTON;
        this.editLabel.fontWeight = FONT.WEIGHT.BOLD;
        this.editLabel.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        this.editLabel.widthInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_WIDTH;
        this.editLabel.heightInPixels = LAYOUT.DIALOGUE_LOG.LOG_BTN_HEIGHT;
        this.editLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.editLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.editLabel.isHitTestVisible = false;
        this.editButton.addControl(this.editLabel);

        this.editButton.onPointerClickObservable.add(() => {
            this.callbacks.onToggleEdit?.();
        });

        // =========================
        // ▶ Next — dialogue box upper-right area (positioned via updateNavLayout)
        // =========================
        this.nextButton = new GUI.Ellipse('NextButton');
        this.nextButton.widthInPixels = NAV_SIZE;
        this.nextButton.heightInPixels = NAV_SIZE;
        this.nextButton.thickness = 2;
        this.nextButton.color = COLORS.SYSTEM_BTN_BORDER;
        this.nextButton.background = COLORS.SYSTEM_BTN_BG;
        this.nextButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.nextButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.nextButton.isHitTestVisible = true;
        this.nextButton.isPointerBlocker = true;

        this.nextLabel = new GUI.TextBlock('NextLabel');
        this.nextLabel.text = '\u25B6'; // ▶
        this.nextLabel.fontFamily = FONT.FAMILY.BODY;
        this.nextLabel.fontSizeInPixels = FONT.SIZE.SYSTEM_BUTTON;
        this.nextLabel.fontWeight = FONT.WEIGHT.BOLD;
        this.nextLabel.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        this.nextLabel.width = '100%';
        this.nextLabel.height = '100%';
        this.nextLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.nextLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.nextLabel.isHitTestVisible = false;
        this.nextButton.addControl(this.nextLabel);

        this.nextButton.onPointerClickObservable.add(() => {
            this.callbacks.onStepForward?.();
        });

        // =========================
        // ◀ Prev — dialogue box upper-right area (positioned via updateNavLayout)
        // =========================
        this.prevButton = new GUI.Ellipse('PrevButton');
        this.prevButton.widthInPixels = NAV_SIZE;
        this.prevButton.heightInPixels = NAV_SIZE;
        this.prevButton.thickness = 2;
        this.prevButton.color = COLORS.SYSTEM_BTN_BORDER;
        this.prevButton.background = COLORS.SYSTEM_BTN_BG;
        this.prevButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.prevButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.prevButton.isHitTestVisible = true;
        this.prevButton.isPointerBlocker = true;

        this.prevLabel = new GUI.TextBlock('PrevLabel');
        this.prevLabel.text = '\u25C0'; // ◀
        this.prevLabel.fontFamily = FONT.FAMILY.BODY;
        this.prevLabel.fontSizeInPixels = FONT.SIZE.SYSTEM_BUTTON;
        this.prevLabel.fontWeight = FONT.WEIGHT.BOLD;
        this.prevLabel.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        this.prevLabel.width = '100%';
        this.prevLabel.height = '100%';
        this.prevLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.prevLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.prevLabel.isHitTestVisible = false;
        this.prevButton.addControl(this.prevLabel);

        this.prevButton.onPointerClickObservable.add(() => {
            this.callbacks.onStepBack?.();
        });

        // =========================
        // Auto (Left of Skip)
        // =========================
        this.autoButton = new GUI.Rectangle('AutoButton');
        this.autoButton.widthInPixels = LAYOUT.STORY_CONTROLS.AUTO_WIDTH;
        this.autoButton.heightInPixels = LAYOUT.STORY_CONTROLS.AUTO_HEIGHT;
        this.autoButton.cornerRadius = LAYOUT.STORY_CONTROLS.AUTO_CORNER_RADIUS;
        this.autoButton.thickness = 2;
        this.autoButton.color = COLORS.SYSTEM_BTN_BORDER;
        this.autoButton.background = COLORS.SYSTEM_BTN_BG;
        this.autoButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.autoButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.autoButton.leftInPixels = -autoRight;
        this.autoButton.topInPixels = topY;
        this.autoButton.isHitTestVisible = true;
        this.autoButton.isPointerBlocker = true;

        // icon (play triangle)
        this.autoIcon = new GUI.TextBlock('AutoIcon');
        this.autoIcon.text = '\u25B6'; // ▶
        this.autoIcon.fontFamily = FONT.FAMILY.BODY;
        this.autoIcon.fontSizeInPixels = FONT.SIZE.SYSTEM_BUTTON;
        this.autoIcon.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        this.autoIcon.widthInPixels = 32;
        this.autoIcon.heightInPixels = LAYOUT.STORY_CONTROLS.AUTO_HEIGHT;
        this.autoIcon.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.autoIcon.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.autoIcon.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.autoIcon.leftInPixels = 14;
        this.autoIcon.isHitTestVisible = false;
        this.autoButton.addControl(this.autoIcon);

        this.autoLabel = new GUI.TextBlock('AutoLabel');
        this.autoLabel.text = 'AUTO';
        this.autoLabel.fontFamily = FONT.FAMILY.BODY;
        this.autoLabel.fontSizeInPixels = FONT.SIZE.SYSTEM_BUTTON;
        this.autoLabel.fontWeight = FONT.WEIGHT.BOLD;
        this.autoLabel.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        this.autoLabel.widthInPixels = LAYOUT.STORY_CONTROLS.AUTO_WIDTH;
        this.autoLabel.heightInPixels = LAYOUT.STORY_CONTROLS.AUTO_HEIGHT;
        this.autoLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.autoLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.autoLabel.isHitTestVisible = false;
        this.autoButton.addControl(this.autoLabel);

        this.autoButton.onPointerClickObservable.add(() => {
            // Toggle
            const next = !this.callbacks.getAutoEnabled();
            this.callbacks.onToggleAuto(next);
            this.syncVisualState();
        });

        // =========================
        // Skip (Right Top, Long Press)
        // =========================
        this.skipButton = new GUI.Ellipse('SkipButton');
        this.skipButton.widthInPixels = LAYOUT.STORY_CONTROLS.SKIP_SIZE;
        this.skipButton.heightInPixels = LAYOUT.STORY_CONTROLS.SKIP_SIZE;
        this.skipButton.thickness = 0;
        this.skipButton.background = COLORS.SYSTEM_BTN_BG;
        this.skipButton.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        this.skipButton.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.skipButton.leftInPixels = -skipRight;
        this.skipButton.topInPixels = topY;
        this.skipButton.isHitTestVisible = true;
        this.skipButton.isPointerBlocker = true;
        this.skipButton.transformCenterX = 0.5;
        this.skipButton.transformCenterY = 0.5;

        // base ring
        this.skipRingBase = new GUI.Ellipse('SkipRingBase');
        this.skipRingBase.width = '100%';
        this.skipRingBase.height = '100%';
        this.skipRingBase.thickness = LAYOUT.STORY_CONTROLS.SKIP_RING_THICKNESS;
        this.skipRingBase.color = COLORS.SYSTEM_BTN_BORDER;
        this.skipRingBase.background = '';
        this.skipRingBase.arc = 1;
        this.skipRingBase.isHitTestVisible = false;
        this.skipButton.addControl(this.skipRingBase);

        // fill ring (progress)
        this.skipRingFill = new GUI.Ellipse('SkipRingFill');
        this.skipRingFill.width = '100%';
        this.skipRingFill.height = '100%';
        this.skipRingFill.thickness = LAYOUT.STORY_CONTROLS.SKIP_RING_THICKNESS;
        this.skipRingFill.color = COLORS.SYSTEM_ACCENT;
        this.skipRingFill.background = '';
        this.skipRingFill.arc = 0;
        this.skipRingFill.rotation = -Math.PI / 2; // start at top
        this.skipRingFill.isHitTestVisible = false;
        this.skipButton.addControl(this.skipRingFill);

        // "editor" prefix (small, upper)
        this.skipPrefixLabel = new GUI.TextBlock('SkipPrefixLabel');
        this.skipPrefixLabel.text = 'editor';
        this.skipPrefixLabel.fontFamily = FONT.FAMILY.BODY;
        this.skipPrefixLabel.fontSizeInPixels = 16;
        this.skipPrefixLabel.color = COLORS.TEXT_MUTED;
        this.skipPrefixLabel.width = '100%';
        this.skipPrefixLabel.heightInPixels = 14;
        this.skipPrefixLabel.topInPixels = -10;
        this.skipPrefixLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.skipPrefixLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.skipPrefixLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.skipPrefixLabel.isHitTestVisible = false;
        this.skipButton.addControl(this.skipPrefixLabel);

        // Main label (SKIP / FAST)
        this.skipLabel = new GUI.TextBlock('SkipLabel');
        this.skipLabel.text = 'SKIP';
        this.skipLabel.fontFamily = FONT.FAMILY.BODY;
        this.skipLabel.fontSizeInPixels = 20;
        this.skipLabel.fontWeight = FONT.WEIGHT.BOLD;
        this.skipLabel.color = COLORS.TEXT_WHITE;
        this.skipLabel.width = '100%';
        this.skipLabel.heightInPixels = 24;
        this.skipLabel.topInPixels = 10;
        this.skipLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.skipLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.skipLabel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.skipLabel.isHitTestVisible = false;
        this.skipButton.addControl(this.skipLabel);

        this.skipButton.onPointerDownObservable.add(() => this.startHold());
        this.skipButton.onPointerUpObservable.add(() => this.endHold(true));
        this.skipButton.onPointerOutObservable.add(() => this.endHold(false));

        // Add to layer
        this.parentLayer.addControl(this.prevButton);
        this.parentLayer.addControl(this.nextButton);
        this.parentLayer.addControl(this.editButton);
        this.parentLayer.addControl(this.logButton);
        this.parentLayer.addControl(this.autoButton);
        this.parentLayer.addControl(this.skipButton);

        this.setVisible(false);
        this.syncVisualState();
    }

    /**
     * 대사창 위치 기준으로 ◀▶ 네비게이션 버튼을 배치합니다.
     * NarrativeEngine이 스케일 변경 시 호출합니다.
     *
     * @param dialogueWidth  대사창 너비 (논리 좌표)
     * @param dialogueHeight 대사창 높이 (논리 좌표)
     * @param bottomOffset   대사창 하단 여백 + SAFE_AREA.BOTTOM (논리 좌표)
     */
    updateNavLayout(dialogueWidth: number, dialogueHeight: number, bottomOffset: number): void {
        const gap = 8;
        const aboveDialogue = bottomOffset + dialogueHeight + gap;

        // ▶ Next: 대사창 우측 상단 바깥
        this.nextButton.topInPixels = -aboveDialogue;
        this.nextButton.leftInPixels = dialogueWidth / 2 - NAV_SIZE / 2;

        // ◀ Prev: Next 왼쪽
        this.prevButton.topInPixels = -aboveDialogue;
        this.prevButton.leftInPixels = dialogueWidth / 2 - NAV_SIZE / 2 - NAV_SIZE - gap;
    }

    show(): void {
        this.setVisible(true);
        this.syncVisualState();
    }

    hide(): void {
        this.setVisible(false);
        this.resetSkipVisual();
    }

    dispose(): void {
        this.clearTimers();
        this.prevButton.dispose();
        this.nextButton.dispose();
        this.editButton.dispose();
        this.logButton.dispose();
        this.autoButton.dispose();
        this.skipButton.dispose();
    }

    private setVisible(visible: boolean): void {
        this.isVisible = visible;
        this.prevButton.isVisible = visible;
        this.nextButton.isVisible = visible;
        this.editButton.isVisible = visible;
        this.logButton.isVisible = visible;
        this.autoButton.isVisible = visible;
        this.skipButton.isVisible = visible;
    }

    /** FF 상태에 따라 스킵 버튼 라벨을 동기화합니다 */
    syncSkipLabel(): void {
        if (!this.holding && !this.holdTriggered) {
            this.skipLabel.text = this.callbacks.getFastForwardEnabled() ? 'FAST' : 'SKIP';
        }
    }

    private syncVisualState(): void {
        const active = this.callbacks.getAutoEnabled();
        if (active) {
            this.autoButton.background = COLORS.SYSTEM_BTN_BG_ACTIVE;
            this.autoButton.color = COLORS.SYSTEM_ACCENT;
            this.autoLabel.color = COLORS.TEXT_WHITE;
            this.autoIcon.color = COLORS.TEXT_WHITE;
        } else {
            this.autoButton.background = COLORS.SYSTEM_BTN_BG;
            this.autoButton.color = COLORS.SYSTEM_BTN_BORDER;
            this.autoLabel.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
            this.autoIcon.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        }
    }

    private startHold(): void {
        if (!this.isVisible) return;
        if (this.holding) return;

        // Cancel release animation if any
        if (this.releaseTimer !== null) {
            clearInterval(this.releaseTimer);
            this.releaseTimer = null;
        }

        this.holding = true;
        this.holdTriggered = false;
        this.holdStartAt = performance.now();
        this.progress = 0;
        this.applySkipVisual(0);

        const holdMs = ANIM.STORY_CONTROLS.SKIP_HOLD_MS;
        this.holdTimer = window.setInterval(() => {
            if (!this.holding) return;
            const elapsed = performance.now() - this.holdStartAt;
            const p = Math.max(0, Math.min(1, elapsed / holdMs));
            this.progress = p;
            this.applySkipVisual(p);

            if (p >= 1 && !this.holdTriggered) {
                this.holdTriggered = true;
                // 홀드 완료 → 완전 스킵 (시나리오 끝까지)
                if (this.callbacks.onCompleteSkip) {
                    this.callbacks.onCompleteSkip();
                } else {
                    this.callbacks.onHoldSkipTriggered();
                }
            }
        }, 16);
    }

    /**
     * @param fromPointerUp true = onPointerUp (can trigger tap-toggle),
     *                      false = onPointerOut (cancel charge only, no tap)
     */
    private endHold(fromPointerUp: boolean): void {
        if (!this.holding) return;
        this.holding = false;

        if (this.holdTimer !== null) {
            clearInterval(this.holdTimer);
            this.holdTimer = null;
        }

        // 탭 토글은 onPointerUp에서만 허용 (onPointerOut은 충전 취소만)
        if (!this.holdTriggered && fromPointerUp) {
            const elapsed = performance.now() - this.holdStartAt;
            if (elapsed < 300) {
                if (this.callbacks.getFastForwardEnabled()) {
                    this.callbacks.onSkipCancelled();
                } else {
                    this.callbacks.onHoldSkipTriggered();
                }
            }
        }

        // 링 원복 애니메이션
        const start = this.progress;
        const duration = ANIM.STORY_CONTROLS.SKIP_RELEASE_RETURN_MS;
        const startedAt = performance.now();

        this.releaseTimer = window.setInterval(() => {
            const t = (performance.now() - startedAt) / Math.max(duration, 1);
            const k = Math.max(0, Math.min(1, t));
            const next = start * (1 - k);
            this.progress = next;
            this.applySkipVisual(next);

            if (k >= 1) {
                if (this.releaseTimer !== null) {
                    clearInterval(this.releaseTimer);
                    this.releaseTimer = null;
                }
                this.resetSkipVisual();
            }
        }, 16);
    }

    private applySkipVisual(progress01: number): void {
        this.skipRingFill.arc = progress01;

        // subtle pop while charging
        const maxScale = ANIM.STORY_CONTROLS.SKIP_SCALE_MAX;
        const s = 1 + (maxScale - 1) * progress01;
        this.skipButton.scaleX = s;
        this.skipButton.scaleY = s;

        // 라벨은 여기서 건드리지 않음 — syncSkipLabel / resetSkipVisual에서만 관리
    }

    private resetSkipVisual(): void {
        this.progress = 0;
        this.skipRingFill.arc = 0;
        this.skipButton.scaleX = 1;
        this.skipButton.scaleY = 1;
        this.holdTriggered = false;
        // FF 활성 상태면 'FAST' 유지, 아니면 'SKIP' 복원
        this.skipLabel.text = this.callbacks.getFastForwardEnabled() ? 'FAST' : 'SKIP';
    }

    private clearTimers(): void {
        if (this.holdTimer !== null) {
            clearInterval(this.holdTimer);
            this.holdTimer = null;
        }
        if (this.releaseTimer !== null) {
            clearInterval(this.releaseTimer);
            this.releaseTimer = null;
        }
    }
}
