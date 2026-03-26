/**
 * DialogueBox - 스케일 기반 대화창 시스템
 *
 * 가로/세로 완전 분리 정책:
 * - 가로 모드: LANDSCAPE_BASE 사용 (PC 황금비 800×240)
 * - 세로 모드: PORTRAIT_BASE 사용 (모바일 최적화 480×220)
 * - 각 모드 내에서 globalScale로 비례 축소
 *
 * 모든 수치 = BASE 값 × globalScale → Math.floor() 정수
 * 텍스트-테두리 간격 비율 항상 일정
 *
 * 지능적 줄바꿈:
 * - 단어 단위 래핑 (measureText 활용)
 * - 단어 중간 잘림 방지
 * - 초과 단어는 글자 단위 강제 절단
 *
 * Visual-only component. isHitTestVisible = false.
 * Part of Narrative Engine - internal module
 */

import * as GUI from '@babylonjs/gui';
import { COLORS, FONT, ANIM, computeDialogueDimensions, type DialogueScaleInfo, type DialogueDimensions } from '../../../shared/design';
import { LAYOUT, RUNTIME_SAFE_AREA } from '../../../shared/design/Layout';
import { NarrativeAnimator } from './NarrativeAnimator';

export class DialogueBox {
    private container: GUI.Rectangle;
    private nameTag: GUI.TextBlock;
    private textBlock: GUI.TextBlock;
    private backgroundPanel: GUI.Rectangle;

    private animator: NarrativeAnimator;
    private isShowing: boolean = false;

    // 현재 적용된 치수 (디버그용)
    private currentDims: DialogueDimensions | null = null;

    // Typing state
    private displayedLength: number = 0;
    private typingInterval: number | null = null;
    private isTyping: boolean = false;

    // 줄바꿈된 텍스트 캐시
    private wrappedLines: string[] = [];
    private measureCanvas: HTMLCanvasElement | null = null;
    private measureCtx: CanvasRenderingContext2D | null = null;

    private onTypingComplete: (() => void) | null = null;

    constructor(parentLayer: GUI.Rectangle, initialScaleInfo?: DialogueScaleInfo) {
        this.animator = new NarrativeAnimator();

        // 측정용 캔버스 (줄바꿈 계산용)
        this.measureCanvas = document.createElement('canvas');
        this.measureCtx = this.measureCanvas.getContext('2d');

        // ========================================
        // Main container - BOTTOM 앵커, 하단 중앙
        // ========================================
        this.container = new GUI.Rectangle('DialogueBox');
        this.container.thickness = 0;
        this.container.isHitTestVisible = false;  // HEBS compliance
        this.container.zIndex = LAYOUT.DISPLAY_ORDER.DIALOGUE_Z;
        this.container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        this.container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;

        // Background panel
        this.backgroundPanel = new GUI.Rectangle('DialogueBg');
        this.backgroundPanel.width = '100%';
        this.backgroundPanel.height = '100%';
        this.backgroundPanel.background = COLORS.DIALOGUE_BG;
        this.backgroundPanel.isHitTestVisible = false;
        this.container.addControl(this.backgroundPanel);

        // Speaker name tag
        this.nameTag = new GUI.TextBlock('NameTag');
        this.nameTag.text = '';
        this.nameTag.color = COLORS.TEXT_GOLD;
        this.nameTag.fontWeight = FONT.WEIGHT.BOLD;
        this.nameTag.fontFamily = FONT.FAMILY.BODY;
        this.nameTag.isHitTestVisible = false;
        this.nameTag.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.nameTag.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.nameTag.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.nameTag.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.addControl(this.nameTag);

        // Dialogue text
        this.textBlock = new GUI.TextBlock('DialogueText');
        this.textBlock.text = '';
        this.textBlock.color = COLORS.TEXT_WHITE;
        this.textBlock.fontFamily = FONT.FAMILY.BODY;
        this.textBlock.textWrapping = false; // 수동 줄바꿈 사용
        this.textBlock.isHitTestVisible = false;
        this.textBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.textBlock.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.textBlock.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.container.addControl(this.textBlock);

        parentLayer.addControl(this.container);
        this.hide();

        // 초기 스케일 적용
        if (initialScaleInfo) {
            this.applyScale(initialScaleInfo);
        }

        console.log('[DialogueBox] Initialized with Scale-based UI');
    }

    /**
     * 스케일 적용 (해상도 변경 시 1회만 호출)
     * 모든 치수를 BASE × globalScale → Math.floor()로 계산
     */
    applyScale(scaleInfo: DialogueScaleInfo): void {
        const dims = computeDialogueDimensions(scaleInfo);
        this.currentDims = dims;

        // 컨테이너
        this.container.widthInPixels = dims.width;
        this.container.heightInPixels = dims.height;
        this.container.topInPixels = -dims.bottomOffset - RUNTIME_SAFE_AREA.BOTTOM;

        // 배경 패널
        this.backgroundPanel.cornerRadius = dims.cornerRadius;
        this.backgroundPanel.thickness = dims.borderThickness;
        this.backgroundPanel.color = COLORS.DIALOGUE_BORDER;

        // 화자 이름
        this.nameTag.fontSizeInPixels = dims.speakerFontSize;
        this.nameTag.widthInPixels = dims.textAreaWidth;
        this.nameTag.heightInPixels = dims.speakerHeight;
        this.nameTag.topInPixels = dims.speakerOffset;
        this.nameTag.leftInPixels = dims.paddingH;

        // 본문 텍스트
        this.textBlock.fontSizeInPixels = dims.textFontSize;
        this.textBlock.widthInPixels = dims.textAreaWidth;
        this.textBlock.heightInPixels = dims.textHeight;
        this.textBlock.topInPixels = dims.textOffset;
        this.textBlock.leftInPixels = dims.paddingH;
        this.textBlock.lineSpacing = `${dims.textLineSpacing}px`;

        console.log(
            `[DialogueBox] ScaleApplied: mode=${dims.isPortrait ? 'PORTRAIT' : 'LANDSCAPE'}`,
            `scale=${dims.globalScale.toFixed(3)}`,
            `size=${dims.width}x${dims.height}`,
            `font=${dims.textFontSize}px`
        );
    }

    /**
     * 텍스트 표시 시작
     */
    showText(text: string, speaker?: string): void {
        this.onTypingComplete = null;
        this.displayedLength = 0;

        // 줄바꿈 계산 (단어 단위)
        this.wrappedLines = this.wrapText(text);
        this.textBlock.text = '';

        if (speaker) {
            this.nameTag.text = speaker;
            this.nameTag.isVisible = true;
        } else {
            this.nameTag.text = '';
            this.nameTag.isVisible = false;
        }

        if (this.isShowing) {
            this.startTyping();
            return;
        }

        this.showWithAnimation(() => {
            this.startTyping();
        });
    }

    /**
     * 단어 단위 줄바꿈 (measureText 활용)
     *
     * 규칙:
     * 1. 공백 기준 토큰화
     * 2. 다음 단어 추가 시 너비 초과하면 줄바꿈
     * 3. 단일 단어가 너비 초과 시 글자 단위 강제 절단
     */
    private wrapText(text: string): string[] {
        if (!this.currentDims || !this.measureCtx) {
            return [text];
        }

        const maxWidth = this.currentDims.textAreaWidth;
        const fontSize = this.currentDims.textFontSize;
        const fontFamily = FONT.FAMILY.BODY;

        // 측정 컨텍스트 설정
        this.measureCtx.font = `${fontSize}px ${fontFamily}`;

        const lines: string[] = [];
        const paragraphs = text.split('\n');

        for (const paragraph of paragraphs) {
            if (paragraph.trim() === '') {
                lines.push('');
                continue;
            }

            const words = paragraph.split(/(\s+)/); // 공백 포함 분리
            let currentLine = '';

            for (const word of words) {
                if (word === '') continue;

                const testLine = currentLine + word;
                const metrics = this.measureCtx.measureText(testLine);
                const testWidth = metrics.width;

                if (testWidth <= maxWidth) {
                    // 현재 줄에 추가 가능
                    currentLine = testLine;
                } else if (currentLine === '') {
                    // 첫 단어가 너비 초과 → 글자 단위 강제 절단
                    const forceBroken = this.forceBreakWord(word, maxWidth);
                    for (let i = 0; i < forceBroken.length - 1; i++) {
                        lines.push(forceBroken[i]);
                    }
                    currentLine = forceBroken[forceBroken.length - 1] || '';
                } else {
                    // 현재 줄 마감, 새 줄 시작
                    lines.push(currentLine.trimEnd());
                    // 새 줄에서 단어 시작 (공백이면 무시)
                    if (word.trim() !== '') {
                        // 이 단어도 너비 초과할 수 있음
                        const wordMetrics = this.measureCtx.measureText(word);
                        if (wordMetrics.width > maxWidth) {
                            const forceBroken = this.forceBreakWord(word, maxWidth);
                            for (let i = 0; i < forceBroken.length - 1; i++) {
                                lines.push(forceBroken[i]);
                            }
                            currentLine = forceBroken[forceBroken.length - 1] || '';
                        } else {
                            currentLine = word;
                        }
                    } else {
                        currentLine = '';
                    }
                }
            }

            // 남은 텍스트 추가
            if (currentLine !== '') {
                lines.push(currentLine.trimEnd());
            }
        }

        return lines.length > 0 ? lines : [''];
    }

    /**
     * 너비 초과 단어 강제 절단 (글자 단위)
     */
    private forceBreakWord(word: string, maxWidth: number): string[] {
        if (!this.measureCtx) return [word];

        const result: string[] = [];
        let current = '';

        for (const char of word) {
            const testLine = current + char;
            const metrics = this.measureCtx.measureText(testLine);

            if (metrics.width <= maxWidth) {
                current = testLine;
            } else {
                if (current !== '') {
                    result.push(current);
                }
                current = char;
            }
        }

        if (current !== '') {
            result.push(current);
        }

        return result;
    }

    /**
     * 줄바꿈된 텍스트를 한 줄 문자열로 변환
     */
    private getWrappedText(length: number): string {
        const fullWrapped = this.wrappedLines.join('\n');
        return fullWrapped.substring(0, length);
    }

    private startTyping(): void {
        if (this.typingInterval !== null) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }

        this.isTyping = true;
        this.displayedLength = 0;

        const fullWrapped = this.wrappedLines.join('\n');
        const totalLength = fullWrapped.length;

        this.typingInterval = window.setInterval(() => {
            if (this.displayedLength < totalLength) {
                this.displayedLength++;
                this.textBlock.text = this.getWrappedText(this.displayedLength);
            } else {
                this.completeTyping();
            }
        }, ANIM.DIALOGUE.TYPING_SPEED);
    }

    private completeTyping(): void {
        if (!this.isTyping) {
            return;
        }

        if (this.typingInterval !== null) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }

        this.isTyping = false;
        this.textBlock.text = this.wrappedLines.join('\n');

        if (this.onTypingComplete) {
            const callback = this.onTypingComplete;
            this.onTypingComplete = null;
            callback();
        }
    }

    skipTyping(): void {
        if (!this.isTyping) return;
        console.log('[DialogueBox] Typing skipped');
        this.completeTyping();
    }

    getIsTyping(): boolean {
        return this.isTyping;
    }

    setOnTypingComplete(callback: (() => void) | null): void {
        this.onTypingComplete = callback;
    }

    show(): void {
        this.container.alpha = 1;
        this.container.isVisible = true;
        this.isShowing = true;
    }

    showWithAnimation(onComplete?: () => void): void {
        this.isShowing = true;
        this.animator.fadeIn(this.container, {
            duration: ANIM.DIALOGUE.FADE_IN_DURATION,
            onComplete: () => {
                console.log('[DialogueBox] Fade-In complete');
                onComplete?.();
            },
        });
    }

    hide(): void {
        this.stopTyping();
        this.container.isVisible = false;
        this.container.alpha = 0;
        this.isShowing = false;
    }

    hideWithAnimation(onComplete?: () => void): void {
        this.stopTyping();
        this.animator.fadeOut(this.container, {
            duration: ANIM.DIALOGUE.FADE_OUT_DURATION,
            onComplete: () => {
                this.isShowing = false;
                console.log('[DialogueBox] Fade-Out complete');
                onComplete?.();
            },
        });
    }

    private stopTyping(): void {
        if (this.typingInterval !== null) {
            clearInterval(this.typingInterval);
            this.typingInterval = null;
        }
        this.isTyping = false;
    }

    getIsShowing(): boolean {
        return this.isShowing;
    }

    getIsAnimating(): boolean {
        return this.animator.isAnimating(this.container.name || 'DialogueBox');
    }

    clear(): void {
        this.textBlock.text = '';
        this.nameTag.text = '';
        this.displayedLength = 0;
        this.wrappedLines = [];
    }

    dispose(): void {
        this.hide();
        this.animator.dispose();
        this.container.dispose();
        this.measureCanvas = null;
        this.measureCtx = null;
    }
}
