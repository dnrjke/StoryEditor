/**
 * KineticScroller - 네이티브 앱 수준 키네틱 스크롤
 *
 * 핵심 원칙:
 * 1. 터치 중: 정확히 1:1 (가속도/가중치 없음)
 * 2. 손 뗄 때 속도 < 150: 그 자리에 앵커 고정 (1px 오차 없음)
 * 3. 손 뗄 때 속도 >= 150: 관성 발동, 단호하게 마무리
 *
 * 시각적 일치성 (Visual Anchor):
 * - 관성 미발동 시 손 뗀 좌표 그대로 고정
 * - lerp는 관성 애니메이션 중에만 적용 (터치 중 미적용)
 *
 * 강력한 마찰력:
 * - FRICTION_PER_SEC: 0.03 (97% 감쇠)
 * - 저속 구간 2배 가속 → "언제 멈추지?" 생각할 틈 없음
 */

import { ANIM } from '../../../shared/design';

export interface KineticScrollerConfig {
    frictionPerSec: number;
    minVelocity: number;
    frictionBoostThreshold: number;
    frictionBoostMultiplier: number;
    wheelMultiplier: number;
    snapDuration: number;
}

const DEFAULT_CONFIG: KineticScrollerConfig = {
    frictionPerSec: ANIM.KINETIC_SCROLL.FRICTION_PER_SEC,
    minVelocity: ANIM.KINETIC_SCROLL.MIN_VELOCITY,
    frictionBoostThreshold: ANIM.KINETIC_SCROLL.FRICTION_BOOST_THRESHOLD,
    frictionBoostMultiplier: ANIM.KINETIC_SCROLL.FRICTION_BOOST_MULTIPLIER,
    wheelMultiplier: ANIM.KINETIC_SCROLL.WHEEL_MULTIPLIER,
    snapDuration: ANIM.KINETIC_SCROLL.SNAP_DURATION,
};

interface MovementSample {
    y: number;
    time: number;
}

const SAMPLE_BUFFER_SIZE = 5;
const SAMPLE_MAX_AGE = 100;
/**
 * 관성 중 렌더링 Lerp (60fps 기준, 터치 중에는 미적용)
 * 프레임 독립적으로 적용: 1 - (1 - BASE_LERP)^(deltaTime * 60)
 */
const BASE_LERP_60FPS = 0.85;

export class KineticScroller {
    private config: KineticScrollerConfig;

    // 논리적 스크롤 위치
    private scrollOffset: number = 0;
    // 렌더링용 스크롤 위치 (관성 중에만 lerp 적용)
    private displayOffset: number = 0;

    private velocity: number = 0;
    private contentHeight: number = 0;
    private viewportHeight: number = 0;

    private _isDragging: boolean = false;
    private lastFrameTime: number = 0;

    private movementSamples: MovementSample[] = [];

    private animationId: number | null = null;
    private isAnimating: boolean = false;

    private snapTargetOffset: number | null = null;
    private snapStartOffset: number = 0;
    private snapStartTime: number = 0;

    private onScrollChangeCallback: ((offset: number) => void) | null = null;
    private onScrollStateChangeCallback: ((isScrolling: boolean) => void) | null = null;

    constructor(config?: Partial<KineticScrollerConfig>) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    get isDragging(): boolean {
        return this._isDragging;
    }

    getOffset(): number {
        return Math.round(this.displayOffset);
    }

    setDimensions(contentHeight: number, viewportHeight: number): void {
        this.contentHeight = contentHeight;
        this.viewportHeight = viewportHeight;

        const maxScroll = this.getMaxScroll();
        if (this.scrollOffset > maxScroll) {
            this.scrollOffset = maxScroll;
            this.displayOffset = maxScroll;
            this.notifyScrollChange();
        }
    }

    setOnScrollChange(callback: (offset: number) => void): void {
        this.onScrollChangeCallback = callback;
    }

    setOnScrollStateChange(callback: (isScrolling: boolean) => void): void {
        this.onScrollStateChangeCallback = callback;
    }

    /**
     * 포인터 다운 - 관성 즉시 살해
     */
    onPointerDown(y: number): void {
        // 첫 번째 줄: 관성 즉시 살해
        this.velocity = 0;

        this._isDragging = true;
        this.snapTargetOffset = null;

        this.movementSamples = [{ y, time: performance.now() }];

        this.stopAnimation();

        // 터치 시작: displayOffset 즉시 동기화
        this.displayOffset = this.scrollOffset;

        this.onScrollStateChangeCallback?.(true);
    }

    /**
     * 포인터 이동 - 정확히 1:1, 어떤 가중치도 없음
     */
    onPointerMove(y: number): void {
        if (!this._isDragging) return;

        const now = performance.now();
        const samples = this.movementSamples;

        const lastSample = samples[samples.length - 1];
        const deltaY = lastSample.y - y;

        // 순수 1:1 이동 (경계 클램핑만)
        const maxScroll = this.getMaxScroll();
        this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + deltaY));

        // 샘플 기록 (관성 계산용)
        samples.push({ y, time: now });
        while (samples.length > SAMPLE_BUFFER_SIZE) {
            samples.shift();
        }

        // 터치 중: displayOffset = scrollOffset (lerp 없음, 정확히 1:1)
        this.displayOffset = this.scrollOffset;

        this.notifyScrollChange();
    }

    /**
     * 포인터 업 - 관성 발동 여부 결정
     */
    onPointerUp(): void {
        if (!this._isDragging) return;
        this._isDragging = false;

        const releaseVelocity = this.calculateReleaseVelocity();

        // 어중간한 스와이프 차단: 속도 < MIN_VELOCITY면 앵커 고정
        if (Math.abs(releaseVelocity) > this.config.minVelocity) {
            this.velocity = releaseVelocity;
            this.lastFrameTime = performance.now();
            this.startInertiaAnimation();
        } else {
            // ========== 시각적 일치성: 앵커 고정 ==========
            // displayOffset은 이미 scrollOffset과 동일
            // 1px 오차 없이 손 뗀 그 자리에 고정
            this.onScrollStateChangeCallback?.(false);
        }

        this.movementSamples = [];
    }

    private calculateReleaseVelocity(): number {
        const samples = this.movementSamples;
        const now = performance.now();

        const validSamples = samples.filter(s => (now - s.time) < SAMPLE_MAX_AGE);

        if (validSamples.length < 2) return 0;

        const first = validSamples[0];
        const last = validSamples[validSamples.length - 1];
        const deltaY = first.y - last.y;
        const deltaTime = last.time - first.time;

        if (deltaTime <= 0) return 0;

        return (deltaY / deltaTime) * 1000;
    }

    /**
     * 마우스 휠 - 관성 없이 직접 이동
     */
    onWheel(deltaY: number): void {
        if (this._isDragging) return;

        const scrollAmount = deltaY * this.config.wheelMultiplier;

        const maxScroll = this.getMaxScroll();
        this.scrollOffset = Math.max(0, Math.min(maxScroll, this.scrollOffset + scrollAmount));

        // 휠: 직접 동기화 (lerp 없음)
        this.displayOffset = this.scrollOffset;

        this.notifyScrollChange();
        this.onScrollStateChangeCallback?.(true);

        this.stopAnimation();

        // 짧은 지연 후 스크롤 상태 종료
        this.animationId = requestAnimationFrame(() => {
            this.animationId = null;
            this.onScrollStateChangeCallback?.(false);
        });
    }

    snapToBottom(): void {
        const maxScroll = this.getMaxScroll();

        if (Math.abs(this.scrollOffset - maxScroll) < 1) {
            this.scrollOffset = maxScroll;
            this.displayOffset = maxScroll;
            this.notifyScrollChange();
            return;
        }

        this.snapTargetOffset = maxScroll;
        this.snapStartOffset = this.scrollOffset;
        this.snapStartTime = performance.now();
        this.velocity = 0;

        this.stopAnimation();
        this.startSnapAnimation();
    }

    scrollToBottom(animated: boolean = true): void {
        if (animated) {
            this.snapToBottom();
        } else {
            this.scrollOffset = this.getMaxScroll();
            this.displayOffset = this.scrollOffset;
            this.notifyScrollChange();
        }
    }

    scrollToTop(animated: boolean = true): void {
        if (animated) {
            this.snapTargetOffset = 0;
            this.snapStartOffset = this.scrollOffset;
            this.snapStartTime = performance.now();
            this.velocity = 0;
            this.stopAnimation();
            this.startSnapAnimation();
        } else {
            this.scrollOffset = 0;
            this.displayOffset = 0;
            this.notifyScrollChange();
        }
    }

    private getMaxScroll(): number {
        return Math.max(0, this.contentHeight - this.viewportHeight);
    }

    private startInertiaAnimation(): void {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.snapTargetOffset = null;
        this.tickInertia();
    }

    private startSnapAnimation(): void {
        if (this.isAnimating) return;
        this.isAnimating = true;
        this.onScrollStateChangeCallback?.(true);
        this.tickSnap();
    }

    private stopAnimation(): void {
        if (this.animationId !== null) {
            cancelAnimationFrame(this.animationId);
            this.animationId = null;
        }
        this.isAnimating = false;
    }

    /**
     * 관성 프레임 - 강력한 마찰력으로 단호하게 정지
     */
    private tickInertia = (): void => {
        // 터치 인터럽트
        if (this._isDragging) {
            this.isAnimating = false;
            this.animationId = null;
            return;
        }

        const now = performance.now();
        const deltaTime = Math.min(50, now - this.lastFrameTime) / 1000;
        this.lastFrameTime = now;

        const maxScroll = this.getMaxScroll();
        const {
            frictionPerSec,
            minVelocity,
            frictionBoostThreshold,
            frictionBoostMultiplier,
        } = this.config;

        // 저속 구간 감쇠 2배 가속
        const boostThreshold = minVelocity * frictionBoostThreshold;
        const effectiveDeltaTime = Math.abs(this.velocity) < boostThreshold
            ? deltaTime * frictionBoostMultiplier
            : deltaTime;

        // 강력한 마찰력 적용
        this.velocity *= Math.pow(frictionPerSec, effectiveDeltaTime);

        // 위치 업데이트
        this.scrollOffset += this.velocity * deltaTime;

        // 경계 클램핑
        if (this.scrollOffset < 0) {
            this.scrollOffset = 0;
            this.velocity = 0;
        } else if (this.scrollOffset > maxScroll) {
            this.scrollOffset = maxScroll;
            this.velocity = 0;
        }

        // 관성 중: 프레임 독립적 lerp (60Hz/120Hz 동일한 수렴 속도)
        const lerpFactor = 1 - Math.pow(1 - BASE_LERP_60FPS, deltaTime * 60);
        this.displayOffset += (this.scrollOffset - this.displayOffset) * lerpFactor;

        this.notifyScrollChange();

        if (Math.abs(this.velocity) > minVelocity) {
            this.animationId = requestAnimationFrame(this.tickInertia);
        } else {
            // 관성 종료: 최종 위치 고정
            this.displayOffset = this.scrollOffset;
            this.notifyScrollChange();
            this.isAnimating = false;
            this.animationId = null;
            this.onScrollStateChangeCallback?.(false);
        }
    };

    /**
     * 스냅 애니메이션 (easeOutQuad)
     */
    private tickSnap = (): void => {
        if (this.snapTargetOffset === null) {
            this.isAnimating = false;
            this.animationId = null;
            this.onScrollStateChangeCallback?.(false);
            return;
        }

        const elapsed = performance.now() - this.snapStartTime;
        const progress = Math.min(1, elapsed / this.config.snapDuration);
        const eased = 1 - (1 - progress) * (1 - progress);

        this.scrollOffset = this.snapStartOffset +
            (this.snapTargetOffset - this.snapStartOffset) * eased;

        // 스냅 중: easeOutQuad가 이미 부드러우므로 직접 동기화
        this.displayOffset = this.scrollOffset;

        this.notifyScrollChange();

        if (progress < 1) {
            this.animationId = requestAnimationFrame(this.tickSnap);
        } else {
            this.scrollOffset = this.snapTargetOffset;
            this.displayOffset = this.snapTargetOffset;
            this.notifyScrollChange();
            this.snapTargetOffset = null;
            this.isAnimating = false;
            this.animationId = null;
            this.onScrollStateChangeCallback?.(false);
        }
    };

    private notifyScrollChange(): void {
        this.onScrollChangeCallback?.(Math.round(this.displayOffset));
    }

    dispose(): void {
        this.stopAnimation();
        this.movementSamples = [];
        this.onScrollChangeCallback = null;
        this.onScrollStateChangeCallback = null;
    }
}
