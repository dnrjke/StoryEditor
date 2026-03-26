/**
 * EditorPanelScale - 에디터 패널 스케일 시스템
 *
 * DialogueLogScale.ts 패턴 준수
 * GUIManager.globalScale 기반 통합 스케일링
 * 모든 치수는 Math.floor()로 정수 픽셀 처리
 */

import { fontFloor } from '../shared/design';
import type { DialogueScaleInfo } from '../shared/design';

/**
 * 에디터 패널 기준값 (1080p)
 */
export const EDITOR_PANEL_BASE = {
    LANDSCAPE: {
        IDEAL_HEIGHT: 1080,
        PANEL_WIDTH: 1100,
    },
    PORTRAIT: {
        IDEAL_WIDTH: 540,
        PANEL_WIDTH: 540,
    },
    SCALE_LIMITS: {
        MIN: 0.65,
        MAX: 1.0,
    },
    // Panel
    PANEL_CORNER_RADIUS: 12,
    PANEL_PADDING_H: 24,
    PANEL_PADDING_TOP: 60,
    PANEL_PADDING_BOTTOM: 24,
    // Step list (fills remaining space)
    STEP_LIST_GAP: 8,
    STEP_LIST_ENTRY_HEIGHT: 44,
    STEP_INDEX_WIDTH: 48,
    STEP_BADGE_WIDTH: 56,
    STEP_BADGE_HEIGHT: 24,
    STEP_BADGE_FONT_SIZE: 13,
    STEP_PREVIEW_FONT_SIZE: 16,
    // Action panel (fixed width, right-aligned)
    ACTION_PANEL_PADDING: 16,
    ACTION_BTN_WIDTH: 140,
    ACTION_BTN_HEIGHT: 38,
    ACTION_BTN_FONT_SIZE: 15,
    ACTION_BTN_GAP: 10,
    // Close button
    CLOSE_BTN_SIZE: 44,
    CLOSE_BTN_OFFSET_TOP: 12,
    CLOSE_BTN_OFFSET_RIGHT: 12,
    // Fonts
    INDEX_FONT_SIZE: 14,
    // Scroll indicator
    SCROLL_INDICATOR_WIDTH: 3,
    SCROLL_INDICATOR_MIN_HEIGHT: 30,
} as const;

/**
 * 계산된 에디터 패널 치수
 */
export interface EditorPanelDimensions {
    globalScale: number;
    // Main panel
    panelWidth: number;
    panelHeight: number;
    panelCornerRadius: number;
    panelPaddingH: number;
    panelPaddingTop: number;
    panelPaddingBottom: number;
    // Step list (fills remaining space)
    stepListWidth: number;
    stepListEntryHeight: number;
    stepIndexWidth: number;
    stepBadgeWidth: number;
    stepBadgeHeight: number;
    stepBadgeFontSize: number;
    stepPreviewFontSize: number;
    // Action panel (fixed width, right-aligned)
    actionPanelWidth: number;
    actionBtnWidth: number;
    actionBtnHeight: number;
    actionBtnFontSize: number;
    actionBtnGap: number;
    // Close button
    closeBtnSize: number;
    closeBtnOffsetTop: number;
    closeBtnOffsetRight: number;
    // Fonts
    indexFontSize: number;
    // Scroll
    scrollIndicatorWidth: number;
    scrollIndicatorMinHeight: number;
}

/**
 * 에디터 패널 치수 계산
 */
export function computeEditorPanelDimensions(
    scaleInfo: DialogueScaleInfo
): EditorPanelDimensions {
    const { globalScale, rootScale, scalerWidth, scalerHeight, isPortrait } = scaleInfo;

    const B = EDITOR_PANEL_BASE;

    // 스케일 제한
    const clampedScale = Math.max(
        B.SCALE_LIMITS.MIN,
        Math.min(B.SCALE_LIMITS.MAX, globalScale)
    );

    // 패널 너비 (화면 너비의 94% 또는 기준값 중 작은 것)
    const basePanelWidth = isPortrait
        ? B.PORTRAIT.PANEL_WIDTH
        : B.LANDSCAPE.PANEL_WIDTH;
    const screenBasedMax = Math.floor(scalerWidth * 0.94);
    const panelWidth = Math.min(
        Math.floor(basePanelWidth * clampedScale),
        screenBasedMax
    );

    // 패널 높이 (화면 높이의 90%)
    const panelHeight = Math.floor(scalerHeight * 0.90);

    const panelPaddingH = Math.floor(B.PANEL_PADDING_H * clampedScale);
    const innerWidth = panelWidth - panelPaddingH * 2;

    // Action panel: fixed width based on button width + padding
    const actionBtnWidth = Math.floor(B.ACTION_BTN_WIDTH * clampedScale);
    const actionPanelWidth = actionBtnWidth + Math.floor(B.ACTION_PANEL_PADDING * clampedScale);
    // Step list: fills remaining space
    const stepListWidth = innerWidth - actionPanelWidth - Math.floor(B.STEP_LIST_GAP * clampedScale);

    return {
        globalScale: clampedScale,

        // Main panel
        panelWidth,
        panelHeight,
        panelCornerRadius: Math.floor(B.PANEL_CORNER_RADIUS * clampedScale),
        panelPaddingH,
        panelPaddingTop: Math.floor(B.PANEL_PADDING_TOP * clampedScale),
        panelPaddingBottom: Math.floor(B.PANEL_PADDING_BOTTOM * clampedScale),

        // Step list (최소 물리 폰트 보정 + 컨테이너 적응)
        stepListWidth,
        stepListEntryHeight: (() => {
            const badgeFs = fontFloor(Math.floor(B.STEP_BADGE_FONT_SIZE * clampedScale), rootScale);
            const previewFs = fontFloor(Math.floor(B.STEP_PREVIEW_FONT_SIZE * clampedScale), rootScale);
            const maxFont = Math.max(badgeFs, previewFs);
            return Math.max(Math.floor(B.STEP_LIST_ENTRY_HEIGHT * clampedScale), maxFont + 20);
        })(),
        stepIndexWidth: Math.floor(B.STEP_INDEX_WIDTH * clampedScale),
        stepBadgeWidth: (() => {
            const badgeFs = fontFloor(Math.floor(B.STEP_BADGE_FONT_SIZE * clampedScale), rootScale);
            return Math.max(Math.floor(B.STEP_BADGE_WIDTH * clampedScale), badgeFs * 4);
        })(),
        stepBadgeHeight: (() => {
            const badgeFs = fontFloor(Math.floor(B.STEP_BADGE_FONT_SIZE * clampedScale), rootScale);
            return Math.max(Math.floor(B.STEP_BADGE_HEIGHT * clampedScale), badgeFs + 8);
        })(),
        stepBadgeFontSize: fontFloor(Math.floor(B.STEP_BADGE_FONT_SIZE * clampedScale), rootScale),
        stepPreviewFontSize: fontFloor(Math.floor(B.STEP_PREVIEW_FONT_SIZE * clampedScale), rootScale),

        // Action panel (최소 물리 폰트 보정 + 컨테이너 적응)
        actionPanelWidth,
        actionBtnWidth,
        actionBtnHeight: (() => {
            const btnFs = fontFloor(Math.floor(B.ACTION_BTN_FONT_SIZE * clampedScale), rootScale);
            return Math.max(Math.floor(B.ACTION_BTN_HEIGHT * clampedScale), btnFs + 16);
        })(),
        actionBtnFontSize: fontFloor(Math.floor(B.ACTION_BTN_FONT_SIZE * clampedScale), rootScale),
        actionBtnGap: Math.floor(B.ACTION_BTN_GAP * clampedScale),

        // Close button
        closeBtnSize: Math.floor(B.CLOSE_BTN_SIZE * clampedScale),
        closeBtnOffsetTop: Math.floor(B.CLOSE_BTN_OFFSET_TOP * clampedScale),
        closeBtnOffsetRight: Math.floor(B.CLOSE_BTN_OFFSET_RIGHT * clampedScale),

        // Fonts (최소 물리 폰트 보정)
        indexFontSize: fontFloor(Math.floor(B.INDEX_FONT_SIZE * clampedScale), rootScale),

        // Scroll
        scrollIndicatorWidth: Math.floor(B.SCROLL_INDICATOR_WIDTH * clampedScale),
        scrollIndicatorMinHeight: Math.floor(B.SCROLL_INDICATOR_MIN_HEIGHT * clampedScale),
    };
}
