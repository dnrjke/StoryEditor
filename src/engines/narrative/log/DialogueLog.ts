/**
 * DialogueLog - 대화 기록 UI
 *
 * Blue Archive / 붕괴 스타레일 스타일
 * 마법 공학 인터페이스 테마
 *
 * - 반투명 오버레이 + 중앙 정렬 콘텐츠
 * - 키네틱 스크롤 (네이티브 앱 수준, 전역 터치 영역)
 * - 스크롤 인디케이터 (스크롤 중에만 표시)
 * - 페이드 인/아웃 애니메이션
 * - 항목 클릭 시 해당 스텝으로 점프 (onEntryClicked)
 */

import * as GUI from '@babylonjs/gui';
import * as BABYLON from '@babylonjs/core';
import { COLORS, FONT, ANIM } from '../../../shared/design';
import type { DialogueScaleInfo } from '../../../shared/design';
import type { DialogueLogEntry } from '../types';
import { DialogueLogger } from '../services/DialogueLogger';
import { KineticScroller } from './KineticScroller';
import { computeDialogueLogDimensions, type DialogueLogDimensions } from './DialogueLogScale';

export class DialogueLog {
    // 메인 컨테이너
    private overlay: GUI.Rectangle;
    private contentBox: GUI.Rectangle;
    private scrollViewport: GUI.Rectangle;
    private scrollContent: GUI.Rectangle;

    // UI 요소
    private closeButton: GUI.Ellipse;
    private closeBtnX!: GUI.TextBlock;
    private scrollIndicator: GUI.Rectangle;

    // 서비스
    private scroller: KineticScroller;
    private logger: DialogueLogger;

    // 상태
    private _isVisible: boolean = false;
    private isAnimating: boolean = false;
    private currentDims: DialogueLogDimensions | null = null;
    private entryControls: GUI.Container[] = [];

    // 콜백
    private onCloseCallback: (() => void) | null = null;

    /** 항목 클릭 시 호출되는 콜백 (stepIndex 전달) */
    public onEntryClicked: ((stepIndex: number) => void) | null = null;

    // 텍스트 측정
    private measureCanvas: HTMLCanvasElement;
    private measureCtx: CanvasRenderingContext2D;

    // 애니메이션
    private fadeAnimationId: number | null = null;
    private indicatorTimeoutId: number | null = null;
    private indicatorFadeId: number | null = null;

    // Observable 구독
    private scaleObserver: BABYLON.Observer<DialogueScaleInfo> | null = null;
    private entryObserver: BABYLON.Observer<DialogueLogEntry> | null = null;

    constructor(
        private parentLayer: GUI.Rectangle,
        logger: DialogueLogger,
        private scaleObservable: BABYLON.Observable<DialogueScaleInfo>,
        initialScaleInfo: DialogueScaleInfo
    ) {
        this.logger = logger;
        this.scroller = new KineticScroller();

        // 텍스트 측정용 캔버스
        this.measureCanvas = document.createElement('canvas');
        this.measureCtx = this.measureCanvas.getContext('2d')!;

        // UI 생성
        this.overlay = this.createOverlay();
        this.contentBox = this.createContentBox();
        this.scrollViewport = this.createScrollViewport();
        this.scrollContent = this.createScrollContent();
        this.closeButton = this.createCloseButton();
        this.scrollIndicator = this.createScrollIndicator();

        // 계층 구조 조립
        this.scrollViewport.addControl(this.scrollContent);
        this.contentBox.addControl(this.scrollViewport);
        this.contentBox.addControl(this.scrollIndicator);
        this.overlay.addControl(this.contentBox);
        this.overlay.addControl(this.closeButton);
        this.parentLayer.addControl(this.overlay);

        // 스크롤 입력 설정
        this.setupScrollInput();

        // 스크롤 콜백 연결
        this.scroller.setOnScrollChange((offset) => this.updateScrollPosition(offset));
        this.scroller.setOnScrollStateChange((isScrolling) => this.updateScrollIndicator(isScrolling));

        // 초기 스케일 적용
        this.handleScaleChange(initialScaleInfo);

        // 스케일 변경 구독
        this.scaleObserver = this.scaleObservable.add((info) => this.handleScaleChange(info));

        // 새 항목 추가 구독 (열려있을 때 자동 업데이트)
        this.entryObserver = this.logger.onEntryAdded.add(() => {
            if (this._isVisible) {
                this.renderEntries();
                // 새 항목 추가 시 즉시 스냅 (관성 없이 부드럽게 안착)
                requestAnimationFrame(() => {
                    this.updateScrollerDimensions();
                    this.scroller.snapToBottom();
                });
            }
        });

        console.log('[DialogueLog] Initialized');
    }

    // ========================================
    // Public API
    // ========================================

    get isVisible(): boolean {
        return this._isVisible;
    }

    /**
     * 로그 열기
     */
    show(onClose?: () => void): void {
        if (this._isVisible || this.isAnimating) return;

        this.onCloseCallback = onClose || null;
        this.isAnimating = true;

        // 항목 렌더링
        this.renderEntries();

        // 맨 아래로 스크롤 (애니메이션 없이)
        requestAnimationFrame(() => {
            this.updateScrollerDimensions();
            this.scroller.scrollToBottom(false);
        });

        // 페이드 인
        this.overlay.isVisible = true;
        this.fadeIn(() => {
            this.isAnimating = false;
            this._isVisible = true;
        });

        console.log('[DialogueLog] Opened');
    }

    /**
     * 로그 닫기
     */
    hide(): void {
        if (!this._isVisible || this.isAnimating) return;

        this.isAnimating = true;

        // 페이드 아웃
        this.fadeOut(() => {
            this.overlay.isVisible = false;
            this.isAnimating = false;
            this._isVisible = false;
            this.onCloseCallback?.();
            this.onCloseCallback = null;
        });

        console.log('[DialogueLog] Closed');
    }

    // ========================================
    // UI Creation
    // ========================================

    private createOverlay(): GUI.Rectangle {
        const overlay = new GUI.Rectangle('DialogueLogOverlay');
        overlay.width = '100%';
        overlay.height = '100%';
        overlay.thickness = 0;
        overlay.background = COLORS.LOG_OVERLAY_BG;
        overlay.zIndex = 1000;
        overlay.isVisible = false;
        overlay.alpha = 0;
        overlay.isHitTestVisible = true;
        overlay.isPointerBlocker = true;
        return overlay;
    }

    private createContentBox(): GUI.Rectangle {
        const box = new GUI.Rectangle('DialogueLogContent');
        box.thickness = 1;
        box.color = COLORS.LOG_CONTENT_BORDER;
        box.background = COLORS.LOG_CONTENT_BG;
        box.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        box.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        box.isHitTestVisible = true;
        return box;
    }

    private createScrollViewport(): GUI.Rectangle {
        const viewport = new GUI.Rectangle('ScrollViewport');
        viewport.thickness = 0;
        viewport.clipChildren = true;
        viewport.clipContent = true;
        viewport.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        viewport.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        viewport.isHitTestVisible = true;
        return viewport;
    }

    private createScrollContent(): GUI.Rectangle {
        const content = new GUI.Rectangle('ScrollContent');
        content.thickness = 0;
        content.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        content.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        content.isHitTestVisible = false;
        return content;
    }

    private createCloseButton(): GUI.Ellipse {
        const btn = new GUI.Ellipse('CloseButton');
        btn.background = COLORS.LOG_CLOSE_BTN_BG;
        btn.thickness = 0;
        btn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        btn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        btn.isHitTestVisible = true;
        btn.isPointerBlocker = true;

        // X 마크
        this.closeBtnX = new GUI.TextBlock('CloseBtnX');
        this.closeBtnX.text = '\u00D7'; // × 기호
        this.closeBtnX.color = COLORS.LOG_CLOSE_BTN_X;
        this.closeBtnX.fontFamily = FONT.FAMILY.BODY;
        this.closeBtnX.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.closeBtnX.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.closeBtnX.isHitTestVisible = false;
        btn.addControl(this.closeBtnX);

        // 클릭 이벤트
        btn.onPointerClickObservable.add(() => this.hide());

        // 호버 효과
        btn.onPointerEnterObservable.add(() => {
            btn.background = COLORS.LOG_CLOSE_BTN_HOVER;
        });
        btn.onPointerOutObservable.add(() => {
            btn.background = COLORS.LOG_CLOSE_BTN_BG;
        });

        return btn;
    }

    private createScrollIndicator(): GUI.Rectangle {
        const indicator = new GUI.Rectangle('ScrollIndicator');
        indicator.thickness = 0;
        indicator.background = COLORS.LOG_SCROLL_INDICATOR;
        indicator.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        indicator.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        indicator.alpha = 0;
        indicator.isHitTestVisible = false;
        indicator.cornerRadius = 2;
        return indicator;
    }

    // ========================================
    // Scale Handling
    // ========================================

    private handleScaleChange(scaleInfo: DialogueScaleInfo): void {
        this.currentDims = computeDialogueLogDimensions(scaleInfo);
        this.applyDimensions(scaleInfo);

        if (this._isVisible) {
            this.renderEntries();
            requestAnimationFrame(() => this.updateScrollerDimensions());
        }
    }

    private applyDimensions(scaleInfo: DialogueScaleInfo): void {
        if (!this.currentDims) return;
        const d = this.currentDims;

        // 콘텐츠 박스
        this.contentBox.widthInPixels = d.contentMaxWidth;
        this.contentBox.heightInPixels = Math.floor(scaleInfo.scalerHeight * 0.85);
        this.contentBox.cornerRadius = d.contentCornerRadius;

        // 스크롤 뷰포트 (패딩 적용)
        this.scrollViewport.widthInPixels = d.contentMaxWidth - d.contentPaddingH * 2;
        this.scrollViewport.heightInPixels = this.contentBox.heightInPixels - d.contentPaddingTop - d.contentPaddingBottom;
        this.scrollViewport.topInPixels = d.contentPaddingTop;

        // 스크롤 콘텐츠 (뷰포트와 동일 너비)
        this.scrollContent.widthInPixels = this.scrollViewport.widthInPixels;

        // 닫기 버튼
        this.closeButton.widthInPixels = d.closeBtnSize;
        this.closeButton.heightInPixels = d.closeBtnSize;
        this.closeButton.topInPixels = d.closeBtnOffsetTop;
        this.closeButton.leftInPixels = -d.closeBtnOffsetRight;
        this.closeBtnX.fontSizeInPixels = Math.floor(d.closeBtnSize * 0.6);

        // 스크롤 인디케이터
        this.scrollIndicator.widthInPixels = d.scrollIndicatorWidth;
        this.scrollIndicator.leftInPixels = -d.scrollIndicatorMargin;
    }

    // ========================================
    // Entry Rendering
    // ========================================

    private renderEntries(): void {
        if (!this.currentDims) return;

        // 기존 항목 제거
        for (const ctrl of this.entryControls) {
            this.scrollContent.removeControl(ctrl);
            ctrl.dispose();
        }
        this.entryControls = [];

        const entries = this.logger.getEntries();
        let totalHeight = 0;

        for (const entry of entries) {
            const entryControl = this.createEntryControl(entry, totalHeight);
            this.scrollContent.addControl(entryControl);
            this.entryControls.push(entryControl);
            totalHeight += entryControl.heightInPixels;
        }

        // 스크롤 콘텐츠 높이 설정
        this.scrollContent.heightInPixels = Math.max(totalHeight, this.scrollViewport.heightInPixels);
    }

    private createEntryControl(entry: DialogueLogEntry, topOffset: number): GUI.Rectangle {
        if (!this.currentDims) throw new Error('Dimensions not set');
        const d = this.currentDims;

        const container = new GUI.Rectangle(`LogEntry_${entry.id}`);
        container.thickness = 0;
        container.widthInPixels = d.textAreaWidth;
        container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        container.isHitTestVisible = true;

        // Click-to-jump: track pointerDown position to distinguish click from drag
        let pointerDownX = 0;
        let pointerDownY = 0;

        container.onPointerDownObservable.add((info) => {
            pointerDownX = info.x;
            pointerDownY = info.y;
        });

        container.onPointerUpObservable.add((info) => {
            const dx = info.x - pointerDownX;
            const dy = info.y - pointerDownY;
            const dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < 5) {
                // This is a click, not a drag
                this.onEntryClicked?.(entry.stepIndex);
            }
        });

        // Hover effect
        const defaultBg = '';
        const hoverBg = 'rgba(255, 255, 255, 0.05)';

        container.background = defaultBg;

        container.onPointerEnterObservable.add(() => {
            container.background = hoverBg;
        });

        container.onPointerOutObservable.add(() => {
            container.background = defaultBg;
        });

        let innerOffset = 0;

        // 화자 (dialogue만)
        if (entry.speaker) {
            const speakerBlock = new GUI.TextBlock(`Speaker_${entry.id}`);
            speakerBlock.text = entry.speaker;
            speakerBlock.color = COLORS.LOG_ENTRY_SPEAKER;
            speakerBlock.fontSizeInPixels = d.entrySpeakerFontSize;
            speakerBlock.fontWeight = 'bold';
            speakerBlock.fontFamily = FONT.FAMILY.BODY;
            speakerBlock.heightInPixels = d.entrySpeakerHeight;
            speakerBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            speakerBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            speakerBlock.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
            speakerBlock.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            speakerBlock.topInPixels = innerOffset;
            speakerBlock.isHitTestVisible = false;
            container.addControl(speakerBlock);
            innerOffset += d.entrySpeakerHeight;
        }

        // 텍스트 (단어 단위 줄바꿈)
        const lines = this.wrapText(entry.text, d.textAreaWidth, d.entryTextFontSize);
        const textColor = entry.speaker ? COLORS.LOG_ENTRY_TEXT : COLORS.LOG_ENTRY_NARRATION;

        for (const line of lines) {
            const lineBlock = new GUI.TextBlock();
            lineBlock.text = line;
            lineBlock.color = textColor;
            lineBlock.fontSizeInPixels = d.entryTextFontSize;
            lineBlock.fontFamily = FONT.FAMILY.BODY;
            lineBlock.heightInPixels = d.entryTextLineHeight;
            lineBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            lineBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            lineBlock.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
            lineBlock.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            lineBlock.topInPixels = innerOffset;
            lineBlock.isHitTestVisible = false;
            container.addControl(lineBlock);
            innerOffset += d.entryTextLineHeight;
        }

        // 구분선
        const divider = new GUI.Rectangle(`Divider_${entry.id}`);
        divider.heightInPixels = 1;
        divider.widthInPixels = d.textAreaWidth;
        divider.background = COLORS.LOG_DIVIDER;
        divider.thickness = 0;
        divider.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        divider.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        divider.topInPixels = innerOffset + Math.floor(d.entryMarginBottom * 0.5);
        divider.isHitTestVisible = false;
        container.addControl(divider);

        container.heightInPixels = innerOffset + d.entryMarginBottom;
        container.topInPixels = topOffset;

        return container;
    }

    // ========================================
    // Text Wrapping (DialogueBox 패턴 재사용)
    // ========================================

    private wrapText(text: string, maxWidth: number, fontSize: number): string[] {
        this.measureCtx.font = `${fontSize}px ${FONT.FAMILY.BODY}`;

        const paragraphs = text.split('\n');
        const result: string[] = [];

        for (const para of paragraphs) {
            if (para.trim() === '') {
                result.push('');
                continue;
            }

            // 공백 포함 분리
            const tokens = para.split(/(\s+)/);
            let currentLine = '';

            for (const token of tokens) {
                if (token.trim() === '' && currentLine === '') continue;

                const testLine = currentLine + token;
                const metrics = this.measureCtx.measureText(testLine);

                if (metrics.width > maxWidth && currentLine.trim() !== '') {
                    result.push(currentLine.trimEnd());
                    currentLine = token.trimStart();
                } else {
                    currentLine = testLine;
                }
            }

            if (currentLine.trim() !== '') {
                result.push(currentLine.trimEnd());
            }
        }

        return result.length > 0 ? result : [''];
    }

    // ========================================
    // Scroll Input
    // ========================================

    private setupScrollInput(): void {
        let isDragging = false;
        let downX = 0;
        let downY = 0;
        let downOnOutside = false;

        // 전역 터치 영역: 오버레이 전체에서 터치 드래그 감지
        this.overlay.onPointerDownObservable.add((info) => {
            if (isDragging) return;
            isDragging = true;
            downX = info.x;
            downY = info.y;
            // 콘텐츠 박스 바깥 터치 여부 판정
            downOnOutside = !this.isInsideContentBox(info.x, info.y);
            this.scroller.onPointerDown(info.y);
        });

        this.overlay.onPointerMoveObservable.add((info) => {
            if (!isDragging) return;
            this.scroller.onPointerMove(info.y);
        });

        this.overlay.onPointerUpObservable.add((info) => {
            if (!isDragging) return;
            isDragging = false;
            this.scroller.onPointerUp();

            // 바깥 영역 탭 판정: down~up 이동 거리 < 10px → 닫기
            if (downOnOutside) {
                const dx = info.x - downX;
                const dy = info.y - downY;
                if (dx * dx + dy * dy < 100) {
                    this.hide();
                }
            }
        });

        // onPointerOut 제거: 모바일에서 자식 컨트롤 경계 넘을 때 오발생
        // → 스크롤 끊김 유발. onPointerUp만으로 충분.

        // 마우스 휠
        this.overlay.onWheelObservable.add((info) => {
            this.scroller.onWheel(info.y * 40);
        });
    }

    /** 포인터 좌표가 contentBox 내부인지 판정 (스케일러 좌표) */
    private isInsideContentBox(x: number, y: number): boolean {
        const boxW = this.contentBox.widthInPixels;
        const boxH = this.contentBox.heightInPixels;
        if (boxW <= 0 || boxH <= 0) return true; // fallback: don't close
        // contentBox is center-aligned in overlay
        const scalerW = this.overlay.widthInPixels;
        const scalerH = this.overlay.heightInPixels;
        const boxLeft = (scalerW - boxW) / 2;
        const boxTop = (scalerH - boxH) / 2;
        return x >= boxLeft && x <= boxLeft + boxW && y >= boxTop && y <= boxTop + boxH;
    }

    private updateScrollPosition(offset: number): void {
        this.scrollContent.topInPixels = -offset;

        // 스크롤 인디케이터 위치
        if (!this.currentDims) return;

        const viewportH = this.scrollViewport.heightInPixels;
        const contentH = this.scrollContent.heightInPixels;

        if (contentH <= viewportH) {
            this.scrollIndicator.alpha = 0;
            return;
        }

        const maxScroll = contentH - viewportH;
        const scrollRatio = Math.max(0, Math.min(1, offset / maxScroll));

        const indicatorH = Math.max(
            this.currentDims.scrollIndicatorMinHeight,
            (viewportH / contentH) * viewportH
        );
        const indicatorTop = this.currentDims.contentPaddingTop +
            scrollRatio * (viewportH - indicatorH);

        this.scrollIndicator.heightInPixels = Math.floor(indicatorH);
        this.scrollIndicator.topInPixels = Math.round(indicatorTop);
    }

    private updateScrollIndicator(isScrolling: boolean): void {
        // 기존 타이머 취소
        if (this.indicatorTimeoutId !== null) {
            clearTimeout(this.indicatorTimeoutId);
            this.indicatorTimeoutId = null;
        }

        if (isScrolling) {
            // 페이드 인 (0 → 0.5)
            this.fadeIndicator(0.5);
        } else {
            // 스크롤 정지 후 1초 대기, 그 후 페이드 아웃
            this.indicatorTimeoutId = window.setTimeout(() => {
                if (!this.scroller.isDragging) {
                    this.fadeIndicator(0);
                }
            }, ANIM.DIALOGUE_LOG.SCROLL_INDICATOR_HIDE_DELAY);
        }
    }

    /**
     * 스크롤 인디케이터 페이드 애니메이션
     *
     * 렌더링 분리:
     * - 이 애니메이션은 KineticScroller의 관성 루프와 독립적으로 실행
     * - scrollIndicator.alpha만 변경 (단일 속성, O(1) 연산)
     * - 콘텐츠 스크롤(topInPixels)과 별도 rAF → 프레임 밀림 없음
     */
    private fadeIndicator(targetAlpha: number): void {
        // 진행 중인 페이드 취소
        if (this.indicatorFadeId !== null) {
            cancelAnimationFrame(this.indicatorFadeId);
            this.indicatorFadeId = null;
        }

        const startAlpha = this.scrollIndicator.alpha;
        if (Math.abs(startAlpha - targetAlpha) < 0.01) {
            this.scrollIndicator.alpha = targetAlpha;
            return;
        }

        const duration = ANIM.DIALOGUE_LOG.SCROLL_INDICATOR_FADE_MS;
        const startTime = performance.now();

        const tick = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            const eased = this.easeOutQuad(progress);

            this.scrollIndicator.alpha = startAlpha + (targetAlpha - startAlpha) * eased;

            if (progress < 1) {
                this.indicatorFadeId = requestAnimationFrame(tick);
            } else {
                this.indicatorFadeId = null;
            }
        };

        this.indicatorFadeId = requestAnimationFrame(tick);
    }

    private updateScrollerDimensions(): void {
        this.scroller.setDimensions(
            this.scrollContent.heightInPixels,
            this.scrollViewport.heightInPixels
        );
    }

    // ========================================
    // Animation
    // ========================================

    private fadeIn(onComplete: () => void): void {
        this.cancelFadeAnimation();

        const duration = ANIM.DIALOGUE_LOG.FADE_IN_DURATION;
        const startTime = performance.now();

        const tick = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            const eased = this.easeOutQuad(progress);

            this.overlay.alpha = eased;

            if (progress < 1) {
                this.fadeAnimationId = requestAnimationFrame(tick);
            } else {
                this.fadeAnimationId = null;
                onComplete();
            }
        };

        this.fadeAnimationId = requestAnimationFrame(tick);
    }

    private fadeOut(onComplete: () => void): void {
        this.cancelFadeAnimation();

        const duration = ANIM.DIALOGUE_LOG.FADE_OUT_DURATION;
        const startTime = performance.now();
        const startAlpha = this.overlay.alpha;

        const tick = () => {
            const elapsed = performance.now() - startTime;
            const progress = Math.min(1, elapsed / duration);
            const eased = this.easeOutQuad(progress);

            this.overlay.alpha = startAlpha * (1 - eased);

            if (progress < 1) {
                this.fadeAnimationId = requestAnimationFrame(tick);
            } else {
                this.fadeAnimationId = null;
                onComplete();
            }
        };

        this.fadeAnimationId = requestAnimationFrame(tick);
    }

    private cancelFadeAnimation(): void {
        if (this.fadeAnimationId !== null) {
            cancelAnimationFrame(this.fadeAnimationId);
            this.fadeAnimationId = null;
        }
    }

    private easeOutQuad(t: number): number {
        return 1 - (1 - t) * (1 - t);
    }

    // ========================================
    // Disposal
    // ========================================

    dispose(): void {
        this.cancelFadeAnimation();

        if (this.indicatorTimeoutId !== null) {
            clearTimeout(this.indicatorTimeoutId);
        }

        if (this.indicatorFadeId !== null) {
            cancelAnimationFrame(this.indicatorFadeId);
        }

        if (this.scaleObserver) {
            this.scaleObservable.remove(this.scaleObserver);
        }

        if (this.entryObserver) {
            this.logger.onEntryAdded.remove(this.entryObserver);
        }

        this.scroller.dispose();

        for (const ctrl of this.entryControls) {
            ctrl.dispose();
        }

        this.overlay.dispose();
        console.log('[DialogueLog] Disposed');
    }
}
