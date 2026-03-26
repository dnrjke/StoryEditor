/**
 * AnimationConfig - 연출 시간, 이징, 루프 여부
 *
 * arcana_ui_rules.md §3.1: 모든 애니메이션 수치는 src/shared/design/에서 관리
 * Magic-Number Zero 원칙 준수
 */

export const ANIM = {
    // ============================================
    // Splash Screen
    // ============================================
    SPLASH: {
        FADE_IN_DURATION: 800,
        HOLD_DURATION: 1500,
        FADE_OUT_DURATION: 600,
    },

    // ============================================
    // Touch-to-Start Screen
    // ============================================
    TOUCH_TO_START: {
        FADE_IN_DURATION: 500,
        FADE_OUT_DURATION: 400,

        // 점멸 애니메이션
        BLINK_INTERVAL: 1200,
        BLINK_MIN_ALPHA: 0.3,
        BLINK_MAX_ALPHA: 0.9,
    },

    // ============================================
    // Dialogue Box
    // ============================================
    DIALOGUE: {
        FADE_IN_DURATION: 250,
        FADE_OUT_DURATION: 200,
        TYPING_SPEED: 30, // ms per character
    },

    // ============================================
    // General Transitions
    // ============================================
    TRANSITION: {
        DEFAULT_DURATION: 300,
        FAST_DURATION: 150,
        SLOW_DURATION: 500,
    },

    // ============================================
    // Story System Controls (Skip / Auto)
    // ============================================
    STORY_CONTROLS: {
        // Skip: hold-to-trigger (>= 1s)
        SKIP_HOLD_MS: 1000,
        // Release animation: ring drains back
        SKIP_RELEASE_RETURN_MS: 220,
        // Skip visual scale (slight pop)
        SKIP_SCALE_MAX: 1.08,

        // Auto: after typing completes (waiting state)
        AUTO_WAIT_DELAY_MS: 1200,

        // Fast-forward: short wait between lines
        FAST_FORWARD_WAIT_DELAY_MS: 150,
    },

    // ============================================
    // Tactical View (Hologram System) - Phase 2+
    // ============================================
    HOLOGRAM: {
        // Glow intensity for selected node halo / path
        GLOW_INTENSITY: 0.9,
        GLOW_BLUR_KERNEL: 24,

        // Arcana path draw feel
        PATH_DRAW_MS_PER_SEGMENT: 220,
        PATH_SPARK_BURST_MS: 220,

        // Particle (Cyan spark) along path
        PATH_PARTICLE_EMIT_RATE: 700,
        PATH_PARTICLE_MIN_SIZE: 0.06,
        PATH_PARTICLE_MAX_SIZE: 0.12,
        PATH_PARTICLE_MIN_LIFE: 0.18,
        PATH_PARTICLE_MAX_LIFE: 0.35,
        PATH_PARTICLE_MIN_SPEED: 18,
        PATH_PARTICLE_MAX_SPEED: 34,
    },

    // ============================================
    // Dialogue Log
    // ============================================
    DIALOGUE_LOG: {
        FADE_IN_DURATION: 250,
        FADE_OUT_DURATION: 200,
        /** 스크롤 인디케이터 페이드 애니메이션 시간 (ms) */
        SCROLL_INDICATOR_FADE_MS: 300,
        /** 스크롤 정지 후 인디케이터 숨김 지연 (ms) */
        SCROLL_INDICATOR_HIDE_DELAY: 1000,
    },

    // ============================================
    // Kinetic Scroll Physics (모바일 최적화)
    // ============================================
    KINETIC_SCROLL: {
        /** 관성 감쇠 계수 (1초당 속도 잔존율, 0.03 = 97% 감쇠 - 단호한 정지) */
        FRICTION_PER_SEC: 0.03,
        /** 관성 발동 임계 속도 (px/sec) - 어중간한 스와이프 차단 */
        MIN_VELOCITY: 150,
        /** 가속 감쇠 임계값 (MIN_VELOCITY의 배수) */
        FRICTION_BOOST_THRESHOLD: 2,
        /** 저속 구간 감쇠 가속 배율 */
        FRICTION_BOOST_MULTIPLIER: 2.0,
        /** 휠 배율 (1% 감도 - 한 줄 정도)*/
        WHEEL_MULTIPLIER: 0.01,
        /** 스냅 애니메이션 시간 (ms) */
        SNAP_DURATION: 100,
        /** 터치 속도 보간 계수 (0~1, 낮을수록 부드러움) */
        VELOCITY_LERP: 0.25,
    },

    // ============================================
    // Easing (참조용 이름)
    // ============================================
    EASING: {
        OUT_QUAD: 'easeOutQuad',
        IN_OUT_QUAD: 'easeInOutQuad',
        LINEAR: 'linear',
    },
} as const;
