/**
 * StartScreenScale - 시작 화면용 스케일 시스템
 *
 * SplashScene, TouchToStartScene은 1080p 기준 LAYOUT 값을 사용하지만,
 * 세로 모드에서 rootScaler가 540px 논리폭을 사용하므로 별도 스케일 적용 필요.
 *
 * 설계 원칙:
 * - 콘텐츠가 화면에 맞게 비례 축소
 * - 최소 폰트 크기 보장 (가독성)
 * - 위치 역전/잘림 방지
 */

import { LAYOUT, RUNTIME_SAFE_AREA } from './Layout';
import type { DialogueScaleInfo } from './DialogueScale';

/**
 * 시작 화면 설계 기준값
 * LAYOUT.IDEAL_WIDTH/HEIGHT와 동일 (1080x1920)
 */
export const START_SCREEN_BASE = {
    /** 설계 기준 너비 */
    DESIGN_WIDTH: 1080,
    /** 설계 기준 높이 */
    DESIGN_HEIGHT: 1920,
    /** 최소 스케일 (가독성 하한) - 360px 폰 가독성 확보 */
    MIN_SCALE: 0.55,
    /** 최대 스케일 */
    MAX_SCALE: 1.0,
} as const;

/**
 * 계산된 시작 화면 치수
 */
export interface StartScreenDimensions {
    /** 통합 스케일 팩터 */
    scale: number;

    // Splash 치수
    splash: {
        titleWidth: number;
        titleHeight: number;
        titleFontSize: number;
        titleOffset: number;
        subtitleWidth: number;
        subtitleHeight: number;
        subtitleFontSize: number;
        subtitleOffset: number;
    };

    // TouchToStart 치수
    touchToStart: {
        titleWidth: number;
        titleHeight: number;
        titleFontSize: number;
        titleOffset: number;
        subtitleWidth: number;
        subtitleHeight: number;
        subtitleFontSize: number;
        subtitleOffset: number;
        promptWidth: number;
        promptHeight: number;
        promptFontSize: number;
        promptOffset: number;
    };

    // Safe Area (스케일 적용)
    safeArea: {
        top: number;
        bottom: number;
        left: number;
        right: number;
    };
}

/**
 * 시작 화면 치수 계산
 *
 * 스케일 공식:
 * - 가로/세로 모두 맞추려면 min(widthRatio, heightRatio)
 * - 이렇게 해야 콘텐츠가 화면을 벗어나지 않음
 */
export function computeStartScreenDimensions(
    scaleInfo: DialogueScaleInfo
): StartScreenDimensions {
    const { scalerWidth, scalerHeight } = scaleInfo;

    // 스케일 팩터: 설계 기준 대비 현재 좌표계 비율
    const widthRatio = scalerWidth / START_SCREEN_BASE.DESIGN_WIDTH;
    const heightRatio = scalerHeight / START_SCREEN_BASE.DESIGN_HEIGHT;

    // 작은 쪽에 맞춤 (콘텐츠가 화면을 벗어나지 않도록)
    let scale = Math.min(widthRatio, heightRatio);

    // 스케일 제한
    scale = Math.max(START_SCREEN_BASE.MIN_SCALE, Math.min(START_SCREEN_BASE.MAX_SCALE, scale));

    // Splash 치수 (LAYOUT.SPLASH 기반)
    const splash = {
        titleWidth: Math.floor(LAYOUT.SPLASH.TITLE_WIDTH * scale),
        titleHeight: Math.floor(LAYOUT.SPLASH.TITLE_HEIGHT * scale),
        titleFontSize: Math.floor(72 * scale), // FONT.SIZE.SPLASH_TITLE
        titleOffset: Math.floor(LAYOUT.SPLASH.TITLE_OFFSET * scale),
        subtitleWidth: Math.floor(LAYOUT.SPLASH.SUBTITLE_WIDTH * scale),
        subtitleHeight: Math.floor(LAYOUT.SPLASH.SUBTITLE_HEIGHT * scale),
        subtitleFontSize: Math.floor(36 * scale), // FONT.SIZE.SPLASH_SUBTITLE
        subtitleOffset: Math.floor(LAYOUT.SPLASH.SUBTITLE_OFFSET * scale),
    };

    // TouchToStart 치수 (LAYOUT.TOUCH_TO_START 기반)
    const touchToStart = {
        titleWidth: Math.floor(LAYOUT.TOUCH_TO_START.TITLE_WIDTH * scale),
        titleHeight: Math.floor(LAYOUT.TOUCH_TO_START.TITLE_HEIGHT * scale),
        titleFontSize: Math.floor(80 * scale), // FONT.SIZE.START_TITLE
        titleOffset: Math.floor(LAYOUT.TOUCH_TO_START.TITLE_OFFSET * scale),
        subtitleWidth: Math.floor(LAYOUT.TOUCH_TO_START.SUBTITLE_WIDTH * scale),
        subtitleHeight: Math.floor(LAYOUT.TOUCH_TO_START.SUBTITLE_HEIGHT * scale),
        subtitleFontSize: Math.floor(32 * scale), // FONT.SIZE.START_SUBTITLE
        subtitleOffset: Math.floor(LAYOUT.TOUCH_TO_START.SUBTITLE_OFFSET * scale),
        promptWidth: Math.floor(LAYOUT.TOUCH_TO_START.PROMPT_WIDTH * scale),
        promptHeight: Math.floor(LAYOUT.TOUCH_TO_START.PROMPT_HEIGHT * scale),
        promptFontSize: Math.floor(40 * scale), // FONT.SIZE.START_PROMPT
        promptOffset: Math.floor(LAYOUT.TOUCH_TO_START.PROMPT_OFFSET * scale),
    };

    // Safe Area (스케일 적용)
    const safeArea = {
        top: Math.floor(RUNTIME_SAFE_AREA.TOP * scale),
        bottom: Math.floor(RUNTIME_SAFE_AREA.BOTTOM * scale),
        left: Math.floor(RUNTIME_SAFE_AREA.LEFT * scale),
        right: Math.floor(RUNTIME_SAFE_AREA.RIGHT * scale),
    };

    return {
        scale,
        splash,
        touchToStart,
        safeArea,
    };
}
