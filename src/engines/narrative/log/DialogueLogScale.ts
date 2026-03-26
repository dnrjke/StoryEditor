/**
 * DialogueLogScale - 대화 로그 스케일 시스템
 *
 * GUIManager.globalScale 기반 통합 스케일링
 * 모든 치수는 Math.floor()로 정수 픽셀 처리
 */

import { LAYOUT, fontFloor } from '../../../shared/design';
import type { DialogueScaleInfo } from '../../../shared/design';

/**
 * 대화 로그 기준값 (1080p)
 */
export const DIALOGUE_LOG_BASE = {
    LANDSCAPE: {
        IDEAL_HEIGHT: 1080,
        CONTENT_MAX_WIDTH: 920,
    },
    PORTRAIT: {
        IDEAL_WIDTH: 540,
        CONTENT_MAX_WIDTH: 480,
    },
    SCALE_LIMITS: {
        MIN: 0.65,
        MAX: 1.0,
    },
} as const;

/**
 * 계산된 대화 로그 치수
 */
export interface DialogueLogDimensions {
    globalScale: number;

    // 콘텐츠 박스
    contentMaxWidth: number;
    contentPaddingH: number;
    contentPaddingTop: number;
    contentPaddingBottom: number;
    contentCornerRadius: number;
    contentBorderThickness: number;

    // 로그 항목
    entrySpeakerFontSize: number;
    entrySpeakerHeight: number;
    entryTextFontSize: number;
    entryTextLineHeight: number;
    entryMarginBottom: number;

    // 닫기 버튼
    closeBtnSize: number;
    closeBtnOffsetTop: number;
    closeBtnOffsetRight: number;

    // 스크롤 인디케이터
    scrollIndicatorWidth: number;
    scrollIndicatorMinHeight: number;
    scrollIndicatorMargin: number;

    // LOG 버튼
    logBtnWidth: number;
    logBtnHeight: number;

    // 텍스트 영역 실제 너비 (콘텐츠 - 패딩)
    textAreaWidth: number;
}

/**
 * 대화 로그 치수 계산
 */
export function computeDialogueLogDimensions(
    scaleInfo: DialogueScaleInfo
): DialogueLogDimensions {
    const { globalScale, rootScale, scalerWidth, isPortrait } = scaleInfo;

    // 스케일 제한
    const clampedScale = Math.max(
        DIALOGUE_LOG_BASE.SCALE_LIMITS.MIN,
        Math.min(DIALOGUE_LOG_BASE.SCALE_LIMITS.MAX, globalScale)
    );

    const L = LAYOUT.DIALOGUE_LOG;

    // 콘텐츠 최대 너비 (화면 너비의 90% 또는 기준값 중 작은 것)
    const baseMaxWidth = isPortrait
        ? DIALOGUE_LOG_BASE.PORTRAIT.CONTENT_MAX_WIDTH
        : DIALOGUE_LOG_BASE.LANDSCAPE.CONTENT_MAX_WIDTH;
    const screenBasedMax = Math.floor(scalerWidth * 0.92);
    const contentMaxWidth = Math.min(
        Math.floor(baseMaxWidth * clampedScale),
        screenBasedMax
    );

    const contentPaddingH = Math.floor(L.CONTENT_PADDING_H * clampedScale);

    return {
        globalScale: clampedScale,

        // 콘텐츠 박스
        contentMaxWidth,
        contentPaddingH,
        contentPaddingTop: Math.floor(L.CONTENT_PADDING_TOP * clampedScale),
        contentPaddingBottom: Math.floor(L.CONTENT_PADDING_BOTTOM * clampedScale),
        contentCornerRadius: Math.floor(L.CONTENT_CORNER_RADIUS * clampedScale),
        contentBorderThickness: L.CONTENT_BORDER_THICKNESS,

        // 로그 항목 (최소 물리 폰트 보정 + 컨테이너 적응)
        entrySpeakerFontSize: fontFloor(Math.floor(L.ENTRY_SPEAKER_FONT_SIZE * clampedScale), rootScale),
        entrySpeakerHeight: Math.max(
            Math.floor(L.ENTRY_SPEAKER_HEIGHT * clampedScale),
            fontFloor(Math.floor(L.ENTRY_SPEAKER_FONT_SIZE * clampedScale), rootScale) + 8
        ),
        entryTextFontSize: fontFloor(Math.floor(L.ENTRY_TEXT_FONT_SIZE * clampedScale), rootScale),
        entryTextLineHeight: Math.max(
            Math.floor(L.ENTRY_TEXT_LINE_HEIGHT * clampedScale),
            fontFloor(Math.floor(L.ENTRY_TEXT_FONT_SIZE * clampedScale), rootScale) + 8
        ),
        entryMarginBottom: Math.floor(L.ENTRY_MARGIN_BOTTOM * clampedScale),

        // 닫기 버튼
        closeBtnSize: Math.floor(L.CLOSE_BTN_SIZE * clampedScale),
        closeBtnOffsetTop: Math.floor(L.CLOSE_BTN_OFFSET_TOP * clampedScale),
        closeBtnOffsetRight: Math.floor(L.CLOSE_BTN_OFFSET_RIGHT * clampedScale),

        // 스크롤 인디케이터
        scrollIndicatorWidth: Math.floor(L.SCROLL_INDICATOR_WIDTH * clampedScale),
        scrollIndicatorMinHeight: Math.floor(L.SCROLL_INDICATOR_MIN_HEIGHT * clampedScale),
        scrollIndicatorMargin: Math.floor(L.SCROLL_INDICATOR_MARGIN * clampedScale),

        // LOG 버튼
        logBtnWidth: Math.floor(L.LOG_BTN_WIDTH * clampedScale),
        logBtnHeight: Math.floor(L.LOG_BTN_HEIGHT * clampedScale),

        // 텍스트 영역 실제 너비
        textAreaWidth: contentMaxWidth - contentPaddingH * 2,
    };
}
