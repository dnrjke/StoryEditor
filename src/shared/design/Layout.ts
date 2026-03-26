/**
 * Layout - 컴포넌트 좌표, 크기, 패딩
 *
 * Babylon.js GUI 좌표계:
 * - TOP 앵커 + 양수 topInPixels = 아래로 이동
 * - BOTTOM 앵커 + 음수 topInPixels = 위로 이동
 * - CENTER 앵커 + 양수/음수 = 아래/위로 이동
 *
 * 핵심 원칙:
 * 1. TextBlock에 heightInPixels 필수 (없으면 100% 채움)
 * 2. textVerticalAlignment = CENTER (박스 내부 중앙 정렬)
 * 3. 박스 위치는 verticalAlignment + topInPixels로만 제어
 *
 * HEIGHT 규격: 폰트 크기의 약 1.4배 + 여유분
 */

/**
 * 디바이스 safe area inset을 CSS env() 변수에서 읽어옵니다.
 * viewport-fit=cover 설정 필요.
 */
export function getDeviceSafeAreaInsets(): { top: number; bottom: number; left: number; right: number } {
    const style = getComputedStyle(document.documentElement);
    const parse = (prop: string) => parseFloat(style.getPropertyValue(prop)) || 0;
    return {
        top: parse('--sai-top'),
        bottom: parse('--sai-bottom'),
        left: parse('--sai-left'),
        right: parse('--sai-right'),
    };
}

/**
 * 런타임 safe area (디바이스 inset과 기본값 중 큰 값).
 * applyDeviceSafeArea()로 업데이트됩니다.
 * LAYOUT.SAFE_AREA가 const이므로 별도 mutable 객체로 분리.
 */
export const RUNTIME_SAFE_AREA = {
    TOP: 60,
    BOTTOM: 60,
    LEFT: 40,
    RIGHT: 40,
};

/**
 * 디바이스 safe area inset을 읽어 RUNTIME_SAFE_AREA를 갱신합니다.
 * 앱 시작 시 + resize 시 호출하세요.
 */
export function applyDeviceSafeArea(rootScale: number): void {
    const insets = getDeviceSafeAreaInsets();
    const BASE = LAYOUT.SAFE_AREA;
    // 디바이스 inset을 논리 좌표로 변환 (rootScale로 나누기)
    RUNTIME_SAFE_AREA.TOP = Math.max(BASE.TOP, rootScale > 0 ? Math.ceil(insets.top / rootScale) : BASE.TOP);
    RUNTIME_SAFE_AREA.BOTTOM = Math.max(BASE.BOTTOM, rootScale > 0 ? Math.ceil(insets.bottom / rootScale) : BASE.BOTTOM);
    RUNTIME_SAFE_AREA.LEFT = Math.max(BASE.LEFT, rootScale > 0 ? Math.ceil(insets.left / rootScale) : BASE.LEFT);
    RUNTIME_SAFE_AREA.RIGHT = Math.max(BASE.RIGHT, rootScale > 0 ? Math.ceil(insets.right / rootScale) : BASE.RIGHT);
}

export const LAYOUT = {
    // ============================================
    // Global (1080x1920 기준)
    // ============================================
    IDEAL_WIDTH: 1080,
    IDEAL_HEIGHT: 1920,

    // NOTE: Portrait 스케일링은 DialogueScale.ts의 DIALOGUE_BASE.WIDTH(800) 기준
    // 대화창 스케일과 rootScaler 스케일이 통합됨

    SAFE_AREA: {
        TOP: 60,
        BOTTOM: 60,
        LEFT: 40,
        RIGHT: 40,
    },

    // ============================================
    // DisplayLayer Internal Z Ordering
    // Background < Character < Dialogue
    // ============================================
    DISPLAY_ORDER: {
        BACKGROUND_Z: 0,
        CHARACTER_Z: 100,
        VIGNETTE_Z: 150,
        DIALOGUE_Z: 200,
    },

    // ============================================
    // Splash Screen
    // CENTER 앵커, 로고 정중앙
    // ============================================
    SPLASH: {
        // 타이틀: 폰트 72px → 높이 100px
        TITLE_WIDTH: 800,
        TITLE_HEIGHT: 100,
        TITLE_OFFSET: -30,      // CENTER 기준, 위로 30px

        // 서브타이틀: 폰트 36px → 높이 50px
        SUBTITLE_WIDTH: 600,
        SUBTITLE_HEIGHT: 50,
        SUBTITLE_OFFSET: 50,    // CENTER 기준, 아래로 50px
    },

    // ============================================
    // Touch-to-Start Screen
    // 타이틀: TOP 앵커, Prompt: BOTTOM 앵커
    // ============================================
    TOUCH_TO_START: {
        // 타이틀: 폰트 72px → 높이 100px
        TITLE_WIDTH: 800,
        TITLE_HEIGHT: 100,
        TITLE_OFFSET: 300,      // TOP 기준, 아래로 300px

        // 서브타이틀: 폰트 36px → 높이 50px
        SUBTITLE_WIDTH: 600,
        SUBTITLE_HEIGHT: 50,
        SUBTITLE_OFFSET: 420,   // TOP 기준, 아래로 420px

        // Prompt: 폰트 32px → 높이 50px
        PROMPT_WIDTH: 400,
        PROMPT_HEIGHT: 50,
        PROMPT_OFFSET: -200,    // BOTTOM 기준, 위로 200px
    },

    // ============================================
    // Dialogue Box
    // BOTTOM 앵커
    // ============================================
    DIALOGUE: {
        WIDTH: 1000,
        HEIGHT: 300,
        OFFSET: -40,            // BOTTOM 기준, 위로 40px
        PADDING: 40,
        CORNER_RADIUS: 16,
        BORDER_THICKNESS: 2,

        // Speaker: 폰트 28px → 높이 40px
        SPEAKER_WIDTH: 920,     // WIDTH - PADDING*2
        SPEAKER_HEIGHT: 40,
        SPEAKER_OFFSET: 25,     // 컨테이너 TOP 기준, 아래로 25px

        // Text: 폰트 26px → 높이 200px (멀티라인)
        TEXT_WIDTH: 920,        // WIDTH - PADDING*2
        TEXT_HEIGHT: 200,
        TEXT_OFFSET: 75,        // 컨테이너 TOP 기준, 아래로 75px
    },

    // ============================================
    // Bottom Vignette (NIKKE / StarRail readability)
    // DialogueBox 바로 뒤, CharacterLayer 앞
    // ============================================
    VIGNETTE: {
        HEIGHT: 400,
        // Bottom 기준. Safe Area는 VignetteLayer에서 적용
        OFFSET: 0,
    },

    // ============================================
    // Character Layer
    // NIKKE-style: BOTTOM_CENTER 앵커 (하단 중앙 기준)
    // ============================================
    CHARACTER: {
        // 스태틱 이미지 기준(향후 Live2D로 교체 용이한 "시각 루트" 컨테이너)
        // - Anchor: BOTTOM_CENTER
        // - DialogueBox가 하반신을 가리도록 캐릭터는 화면 하단에 붙는다.
        WIDTH: 900,
        HEIGHT: 1400,
        OFFSET: 0,              // BOTTOM 기준, 0px (화면 하단에 부착)

        // 좌/우 위치 오프셋
        // NIKKE 스타일: 기본은 CENTER, 좌/우는 미세 오프셋만 허용
        LEFT_OFFSET: -180,      // CENTER 기준, 왼쪽으로 180px
        RIGHT_OFFSET: 180,      // CENTER 기준, 오른쪽으로 180px

        // (디버그) 이름 라벨: 폰트 18px → 높이 30px
        LABEL_WIDTH: 240,
        LABEL_HEIGHT: 30,
        LABEL_OFFSET: -10,      // 캐릭터 BOTTOM 기준, 위로 10px
    },

    // ============================================
    // Minimum Touch Target (HEBS §2.2)
    // ============================================
    MIN_TOUCH_TARGET: 44,

    // ============================================
    // Story System Controls (Skip / Auto) - Layer 3 (SKIP)
    // ============================================
    STORY_CONTROLS: {
        // Common top padding from safe area
        TOP_OFFSET: 12,

        // Skip (Long-Press Circle) - Right Top
        SKIP_SIZE: 96,
        SKIP_RING_THICKNESS: 6,

        // Auto Toggle - Left Top
        AUTO_WIDTH: 144,
        AUTO_HEIGHT: 56,
        AUTO_CORNER_RADIUS: 18,

        // Spacing between Skip and Auto (px)
        GAP: 28,
    },

    // ============================================
    // Tactical View (Hologram System) - Phase 2+
    // ============================================
    HOLOGRAM: {
        // Grid
        GRID_SIZE: 44,      // world units
        GRID_STEP: 2,
        GRID_RADIUS: 22,    // R in alpha falloff formula

        // Node hierarchy (world units)
        NODE_CORE_DIAMETER: 0.8,
        NODE_RING_DIAMETER: 1.8,
        NODE_RING_THICKNESS: 0.08,
        NODE_RING_THICKNESS_SELECTED: 0.14,

        // Link / path
        EDGE_LINE_WIDTH: 1.0,     // conceptual (LinesMesh has fixed width in WebGL)
        PATH_RADIUS: 0.12,        // tube radius
        PATH_RADIUS_SELECTED: 0.18,
    },

    // ============================================
    // Dialogue Log (1080p 기준)
    // ============================================
    DIALOGUE_LOG: {
        // 콘텐츠 박스 (중앙 정렬, 클램핑)
        CONTENT_MAX_WIDTH: 920,
        CONTENT_PADDING_H: 32,
        CONTENT_PADDING_TOP: 80,
        CONTENT_PADDING_BOTTOM: 40,
        CONTENT_CORNER_RADIUS: 12,
        CONTENT_BORDER_THICKNESS: 1,

        // 로그 항목
        ENTRY_SPEAKER_FONT_SIZE: 22,
        ENTRY_SPEAKER_HEIGHT: 30,
        ENTRY_TEXT_FONT_SIZE: 20,
        ENTRY_TEXT_LINE_HEIGHT: 28,
        ENTRY_MARGIN_BOTTOM: 20,

        // 닫기 버튼
        CLOSE_BTN_SIZE: 48,
        CLOSE_BTN_OFFSET_TOP: 16,
        CLOSE_BTN_OFFSET_RIGHT: 16,

        // 스크롤 인디케이터
        SCROLL_INDICATOR_WIDTH: 3,
        SCROLL_INDICATOR_MIN_HEIGHT: 40,
        SCROLL_INDICATOR_MARGIN: 6,

        // LOG 버튼 (StoryControls)
        LOG_BTN_WIDTH: 80,
        LOG_BTN_HEIGHT: 48,
    },
} as const;
