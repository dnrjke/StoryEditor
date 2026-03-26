/**
 * Design System - 통합 진입점
 *
 * arcana_ui_rules.md §3.1: DESIGN_SYSTEM 통합 객체를 통해 참조
 * 모든 디자인 수치는 이 파일을 통해 접근
 */

export { Z_INDEX, type ZIndexValue } from './ZIndex';
export { COLORS } from './Colors';
export { FONT } from './Typography';
export { LAYOUT, RUNTIME_SAFE_AREA, applyDeviceSafeArea, getDeviceSafeAreaInsets } from './Layout';
export { ANIM } from './AnimationConfig';
export { ASSETS_PATH, PathConstants } from './Assets';
export {
    LANDSCAPE_BASE,
    PORTRAIT_BASE,
    SCALE_LIMITS,
    MIN_PHYSICAL_FONT_PX,
    fontFloor,
    computeDialogueDimensions,
    type DialogueScaleInfo,
    type DialogueDimensions,
} from './DialogueScale';
export {
    START_SCREEN_BASE,
    computeStartScreenDimensions,
    type StartScreenDimensions,
} from './StartScreenScale';
