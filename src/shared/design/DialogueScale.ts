/**
 * DialogueScale - 스케일 기반 대화창 시스템
 *
 * 가로/세로 완전 분리 정책:
 * - 가로 모드: LANDSCAPE 기준값 사용 (PC/와이드 스크린)
 * - 세로 모드: PORTRAIT 기준값 사용 (모바일/좁은 스크린)
 * - 각 모드 내에서 globalScale로 비례 축소
 *
 * 세로 모드 설계 원칙:
 * - 360px 폰에서 시원하게 읽히는 것이 최우선
 * - 가독성 확보를 위한 최소 높이/너비 보장
 * - 가로 모드와 다른 BASE 기준점 사용
 */

/**
 * 가로 모드 기준값 (Legacy PC 황금비)
 * 1080p 와이드 스크린 기준 설계
 */
export const LANDSCAPE_BASE = {
    /** 논리 좌표계 기준폭 (rootScale 계산용) */
    IDEAL_HEIGHT: 1080,

    /** 대화창 기준 너비 (클램핑 기준점) */
    WIDTH: 800,
    /** 대화창 기준 높이 */
    HEIGHT: 240,
    /** 하단 여백 */
    BOTTOM_OFFSET: 40,

    /** 좌우 패딩 */
    PADDING_H: 32,
    /** 상하 패딩 */
    PADDING_V: 24,
    /** 모서리 라운드 */
    CORNER_RADIUS: 12,
    /** 테두리 두께 */
    BORDER_THICKNESS: 2,

    /** 화자 폰트 크기 */
    SPEAKER_FONT_SIZE: 26,
    /** 화자 영역 높이 */
    SPEAKER_HEIGHT: 36,
    /** 화자 상단 오프셋 */
    SPEAKER_OFFSET: 20,

    /** 본문 폰트 크기 */
    TEXT_FONT_SIZE: 24,
    /** 본문 줄 간격 */
    TEXT_LINE_SPACING: 8,
    /** 본문 상단 오프셋 */
    TEXT_OFFSET: 56,
    /** 본문 영역 높이 */
    TEXT_HEIGHT: 160,
} as const;

/**
 * 세로 모드 기준값 (모바일 최적화)
 * 360px 폰에서 시원하게 읽히도록 설계
 */
export const PORTRAIT_BASE = {
    /** 논리 좌표계 기준폭 (rootScale 계산용) */
    IDEAL_WIDTH: 540,

    /** 대화창 기준 너비 (540px 논리폭에서 양옆 여백 확보) */
    WIDTH: 480,
    /** 대화창 기준 높이 (세로 화면에서 충분한 존재감) */
    HEIGHT: 220,
    /** 하단 여백 */
    BOTTOM_OFFSET: 24,

    /** 좌우 패딩 */
    PADDING_H: 28,
    /** 상하 패딩 */
    PADDING_V: 20,
    /** 모서리 라운드 */
    CORNER_RADIUS: 12,
    /** 테두리 두께 */
    BORDER_THICKNESS: 2,

    /** 화자 폰트 크기 */
    SPEAKER_FONT_SIZE: 26,
    /** 화자 영역 높이 */
    SPEAKER_HEIGHT: 36,
    /** 화자 상단 오프셋 */
    SPEAKER_OFFSET: 18,

    /** 본문 폰트 크기 (모바일 가독성 확보) */
    TEXT_FONT_SIZE: 24,
    /** 본문 줄 간격 */
    TEXT_LINE_SPACING: 8,
    /** 본문 상단 오프셋 */
    TEXT_OFFSET: 52,
    /** 본문 영역 높이 */
    TEXT_HEIGHT: 145,
} as const;

/**
 * 공통 스케일 제한
 */
export const SCALE_LIMITS = {
    /** 최소 스케일 (가독성 하한) */
    MIN: 0.7,
    /** 최대 스케일 (확대 상한) */
    MAX: 1.0,
} as const;

/**
 * 최소 물리 폰트 크기 (화면 픽셀 기준)
 * rootScale 적용 후 이 값 이하로 내려가지 않도록 보정.
 * 768p 등 저해상도에서 가독성 확보용.
 */
export const MIN_PHYSICAL_FONT_PX = 16;

/**
 * 논리 좌표 폰트 크기에 최소 물리 크기 바닥값을 적용합니다.
 * logicalSize × rootScale >= MIN_PHYSICAL_FONT_PX 를 보장합니다.
 *
 * @param logicalSize - 논리 좌표계 폰트 크기 (Math.floor 적용 후)
 * @param rootScale - rootScaler 배율 (renderH / idealH)
 * @returns 보정된 논리 좌표계 폰트 크기
 */
export function fontFloor(logicalSize: number, rootScale: number): number {
    const minLogical = Math.ceil(MIN_PHYSICAL_FONT_PX / rootScale);
    return Math.max(logicalSize, minLogical);
}

/**
 * 스케일 정보 인터페이스
 */
export interface DialogueScaleInfo {
    /** 통합 배율 */
    globalScale: number;
    /** rootScaler 배율 (논리 → 물리 변환) */
    rootScale: number;
    /** 스케일러 좌표계 너비 */
    scalerWidth: number;
    /** 스케일러 좌표계 높이 */
    scalerHeight: number;
    /** 세로 모드 여부 */
    isPortrait: boolean;
}

/**
 * 기준값 타입 (가로/세로 공통 구조)
 */
export type DialogueBaseValues = typeof LANDSCAPE_BASE | typeof PORTRAIT_BASE;

/**
 * 스케일 적용된 대화창 치수 계산
 */
export function computeDialogueDimensions(scaleInfo: DialogueScaleInfo) {
    const { globalScale, rootScale, isPortrait } = scaleInfo;
    const B = isPortrait ? PORTRAIT_BASE : LANDSCAPE_BASE;

    return {
        // 컨테이너
        width: Math.floor(B.WIDTH * globalScale),
        height: Math.floor(B.HEIGHT * globalScale),
        bottomOffset: Math.floor(B.BOTTOM_OFFSET * globalScale),

        // 테두리/모서리
        paddingH: Math.floor(B.PADDING_H * globalScale),
        paddingV: Math.floor(B.PADDING_V * globalScale),
        cornerRadius: Math.floor(B.CORNER_RADIUS * globalScale),
        borderThickness: Math.max(1, Math.floor(B.BORDER_THICKNESS * globalScale)),

        // 화자 (최소 물리 폰트 보정)
        speakerFontSize: fontFloor(Math.floor(B.SPEAKER_FONT_SIZE * globalScale), rootScale),
        speakerHeight: Math.floor(B.SPEAKER_HEIGHT * globalScale),
        speakerOffset: Math.floor(B.SPEAKER_OFFSET * globalScale),

        // 본문 (최소 물리 폰트 보정)
        textFontSize: fontFloor(Math.floor(B.TEXT_FONT_SIZE * globalScale), rootScale),
        textLineSpacing: Math.floor(B.TEXT_LINE_SPACING * globalScale),
        textOffset: Math.floor(B.TEXT_OFFSET * globalScale),
        textHeight: Math.floor(B.TEXT_HEIGHT * globalScale),

        // 텍스트 영역 너비
        textAreaWidth: Math.floor(B.WIDTH * globalScale) - Math.floor(B.PADDING_H * globalScale) * 2,

        // 메타 정보
        globalScale,
        isPortrait,
    };
}

export type DialogueDimensions = ReturnType<typeof computeDialogueDimensions>;
