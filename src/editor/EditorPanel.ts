/**
 * EditorPanel - 시나리오 에디터 패널 UI
 *
 * BabylonJS GUI 오버레이 (시스템 레이어)
 * DialogueLog 아키텍처 패턴 준수:
 *   overlay -> contentBox -> [stepListViewport + actionPanel]
 *   stepListViewport -> stepListContent (KineticScroller)
 *
 * - 좌측 68%: 스크롤 가능한 스텝 목록 (아코디언 확장)
 * - 우측 32%: 액션 버튼 패널
 * - 닫기 버튼 (우상단 X)
 * - 클릭: 아코디언 확장 (전체 텍스트 표시)
 * - 더블클릭: 인라인 편집 (DOM textarea 오버레이)
 * - DOM 기반 편집 폼 (이벤트 스텝 등 구조화 데이터용)
 */

import * as GUI from '@babylonjs/gui';
import * as BABYLON from '@babylonjs/core';
import { COLORS, FONT, ANIM } from '../shared/design';
import type { DialogueScaleInfo } from '../shared/design';
import type { ScenarioStep } from '../engines/narrative/types';
import { KineticScroller } from '../engines/narrative/log/KineticScroller';
import { computeEditorPanelDimensions, type EditorPanelDimensions } from './EditorPanelScale';

// ============================================
// Type Badge Config
// ============================================

interface BadgeConfig {
    label: string;
    color: string;
}

const BADGE_MAP: Record<ScenarioStep['type'], BadgeConfig> = {
    narration: { label: 'NAR', color: '#888888' },
    dialogue:  { label: 'DLG', color: '#D4A537' },
    auto:      { label: 'AUTO', color: '#33C3FF' },
    event:     { label: 'EVT', color: '#A855F7' },
};

/** 더블클릭 판정 시간 (ms) */
const DOUBLE_CLICK_MS = 400;

// ============================================
// Callbacks
// ============================================

export interface EditorPanelCallbacks {
    onInsertBefore?: (index: number) => void;
    onInsertAfter?: (index: number) => void;
    onEdit?: (index: number) => void;
    onDelete?: (index: number) => void;
    onMoveUp?: (index: number) => void;
    onMoveDown?: (index: number) => void;
    onMoveStep?: (fromIndex: number, toIndex: number) => void;
    onSave?: () => void;
    onImport?: () => void;
    onNew?: () => void;
    onJumpTo?: (index: number) => void;
    onCopyYaml?: () => void;
    onPasteYaml?: () => void;
    onPreviewAutoSave?: (enabled: boolean) => void;
    onUndo?: () => void;
    onRedo?: () => void;
    onClose?: () => void;
}

// ============================================
// EditorPanel
// ============================================

export class EditorPanel {
    // Main containers
    private overlay: GUI.Rectangle;
    private contentBox: GUI.Rectangle;
    private stepListViewport: GUI.Rectangle;
    private stepListContent: GUI.Rectangle;
    private actionPanel: GUI.Rectangle;

    // UI elements
    private closeButton: GUI.Ellipse;
    private closeBtnX!: GUI.TextBlock;
    private scrollIndicator: GUI.Rectangle;

    // Action buttons (tracked for enable/disable)
    private actionButtons: { rect: GUI.Rectangle; text: GUI.TextBlock; needsSelection: boolean }[] = [];

    // Header buttons (drawer + type filters + undo/redo + expand + inline actions)
    private drawerBtn!: GUI.Rectangle;
    private drawerLabel!: GUI.TextBlock;
    private filterButtons: { rect: GUI.Rectangle; text: GUI.TextBlock; type: ScenarioStep['type'] }[] = [];
    private undoBtn!: GUI.Rectangle;
    private undoBtnLabel!: GUI.TextBlock;
    private redoBtn!: GUI.Rectangle;
    private redoBtnLabel!: GUI.TextBlock;
    private expandBtn!: GUI.Rectangle;
    private expandBtnLabel!: GUI.TextBlock;
    private hdrAddAfterBtn!: GUI.Rectangle;
    private hdrAddAfterLabel!: GUI.TextBlock;
    private hdrDeleteBtn!: GUI.Rectangle;
    private hdrDeleteLabel!: GUI.TextBlock;

    // Stats display (bottom of action panel)
    private statsText!: GUI.TextBlock;

    // Scroll
    private scroller: KineticScroller;

    // State
    private _isVisible: boolean = false;
    private isAnimating: boolean = false;
    private currentDims: EditorPanelDimensions | null = null;
    private currentScaleInfo: DialogueScaleInfo | null = null;
    private entryControls: GUI.Container[] = [];
    private entryIndexMap: Map<number, number> = new Map(); // stepIndex → entryControls index
    private steps: ReadonlyArray<ScenarioStep> = [];
    private selectedIndex: number = -1;
    private expandedIndex: number = -1;
    private allExpanded: boolean = false;
    private scrollDragging: boolean = false;
    private compactMode: boolean = false;
    private typeFilters: Map<ScenarioStep['type'], boolean> = new Map([
        ['narration', true],
        ['dialogue', true],
        ['auto', true],
        ['event', true],
    ]);
    private autoSavePreviewActive: boolean = false;

    // Drag reorder state
    private dragState: {
        active: boolean;
        stepIndex: number;       // original step index being dragged
        startY: number;          // pointer Y at drag start
        currentY: number;        // current pointer Y
        holdTimer: number | null;
        entryHeight: number;
    } | null = null;
    private dragGhost: GUI.Rectangle | null = null;
    private dragIndicator: GUI.Rectangle | null = null;
    private dragPlaceholder: GUI.Rectangle | null = null;
    private dragOriginalTops: Map<number, number> = new Map(); // ctrlIdx → original topInPixels

    // Callbacks
    private callbacks: EditorPanelCallbacks;

    // Text measurement
    private measureCanvas: HTMLCanvasElement;
    private measureCtx: CanvasRenderingContext2D;

    // Animation
    private fadeAnimationId: number | null = null;
    private indicatorTimeoutId: number | null = null;
    private indicatorFadeId: number | null = null;

    // Observable subscription
    private scaleObserver: BABYLON.Observer<DialogueScaleInfo> | null = null;

    // DOM edit form & inline editor
    private editFormContainer: HTMLDivElement | null = null;
    private inlineEditorContainer: HTMLDivElement | null = null;

    constructor(
        private parentLayer: GUI.Rectangle,
        private scaleObservable: BABYLON.Observable<DialogueScaleInfo>,
        initialScaleInfo: DialogueScaleInfo,
        callbacks: EditorPanelCallbacks
    ) {
        this.callbacks = callbacks;
        this.scroller = new KineticScroller();

        // Text measurement canvas
        this.measureCanvas = document.createElement('canvas');
        this.measureCtx = this.measureCanvas.getContext('2d')!;

        // Build UI
        this.overlay = this.createOverlay();
        this.contentBox = this.createContentBox();
        this.stepListViewport = this.createStepListViewport();
        this.stepListContent = this.createStepListContent();
        this.actionPanel = this.createActionPanel();
        this.closeButton = this.createCloseButton();
        this.scrollIndicator = this.createScrollIndicator();

        // Header buttons (drawer + type filters)
        this.createHeaderButtons();

        // Stats display
        this.statsText = this.createStatsDisplay();

        // Assemble hierarchy
        this.stepListViewport.addControl(this.stepListContent);
        this.contentBox.addControl(this.stepListViewport);
        this.contentBox.addControl(this.actionPanel);
        this.contentBox.addControl(this.scrollIndicator);
        this.contentBox.addControl(this.drawerBtn);
        for (const fb of this.filterButtons) {
            this.contentBox.addControl(fb.rect);
        }
        this.contentBox.addControl(this.undoBtn);
        this.contentBox.addControl(this.redoBtn);
        this.contentBox.addControl(this.expandBtn);
        this.contentBox.addControl(this.hdrAddAfterBtn);
        this.contentBox.addControl(this.hdrDeleteBtn);
        this.actionPanel.addControl(this.statsText);
        this.overlay.addControl(this.contentBox);
        this.overlay.addControl(this.closeButton);
        this.parentLayer.addControl(this.overlay);

        // Build action buttons
        this.buildActionButtons();

        // Scroll setup
        this.setupScrollInput();
        this.scroller.setOnScrollChange((offset) => this.updateScrollPosition(offset));
        this.scroller.setOnScrollStateChange((isScrolling) => this.updateScrollIndicator(isScrolling));

        // Initial scale
        this.handleScaleChange(initialScaleInfo);

        // Scale subscription
        this.scaleObserver = this.scaleObservable.add((info) => this.handleScaleChange(info));

        console.log('[EditorPanel] Initialized');
    }

    // ========================================
    // Public API
    // ========================================

    get isVisible(): boolean {
        return this._isVisible;
    }

    show(): void {
        if (this._isVisible || this.isAnimating) return;

        this.isAnimating = true;

        this.renderEntries();

        requestAnimationFrame(() => {
            this.updateScrollerDimensions();
            this.scroller.scrollToTop(false);
        });

        this.overlay.isVisible = true;
        this.fadeIn(() => {
            this.isAnimating = false;
            this._isVisible = true;
        });

        console.log('[EditorPanel] Opened');
    }

    hide(): void {
        if (!this._isVisible || this.isAnimating) return;

        this.isAnimating = true;
        this.hideEditForm();
        this.hideInlineEditor();

        this.fadeOut(() => {
            this.overlay.isVisible = false;
            this.isAnimating = false;
            this._isVisible = false;
        });

        this.callbacks.onClose?.();
        console.log('[EditorPanel] Closed');
    }

    updateSteps(steps: ReadonlyArray<ScenarioStep>): void {
        this.steps = steps;

        if (this.selectedIndex >= steps.length) {
            this.selectedIndex = steps.length - 1;
        }
        if (this.expandedIndex >= steps.length) {
            this.expandedIndex = -1;
        }

        if (this._isVisible) {
            this.renderEntries();
            requestAnimationFrame(() => this.updateScrollerDimensions());
        }

        this.updateActionButtonStates();
    }

    setSelectedIndex(index: number): void {
        this.selectedIndex = index;
        this.expandedIndex = index;

        if (this._isVisible) {
            this.renderEntries();
            requestAnimationFrame(() => this.updateScrollerDimensions());
        }

        this.updateActionButtonStates();
    }

    dispose(): void {
        this.cancelDragReorder();
        this.cancelFadeAnimation();
        this.hideEditForm();
        this.hideInlineEditor();

        if (this.indicatorTimeoutId !== null) {
            clearTimeout(this.indicatorTimeoutId);
        }

        if (this.indicatorFadeId !== null) {
            cancelAnimationFrame(this.indicatorFadeId);
        }

        if (this.scaleObserver) {
            this.scaleObservable.remove(this.scaleObserver);
        }

        this.scroller.dispose();

        for (const ctrl of this.entryControls) {
            ctrl.dispose();
        }

        this.overlay.dispose();
        console.log('[EditorPanel] Disposed');
    }

    // ========================================
    // UI Creation
    // ========================================

    private createOverlay(): GUI.Rectangle {
        const overlay = new GUI.Rectangle('EditorPanelOverlay');
        overlay.width = '100%';
        overlay.height = '100%';
        overlay.thickness = 0;
        overlay.background = COLORS.LOG_OVERLAY_BG;
        overlay.zIndex = 1100;
        overlay.isVisible = false;
        overlay.alpha = 0;
        overlay.isHitTestVisible = true;
        overlay.isPointerBlocker = true;
        return overlay;
    }

    private createContentBox(): GUI.Rectangle {
        const box = new GUI.Rectangle('EditorPanelContent');
        box.thickness = 1;
        box.color = COLORS.LOG_CONTENT_BORDER;
        box.background = COLORS.LOG_CONTENT_BG;
        box.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        box.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        box.isHitTestVisible = true;
        return box;
    }

    private createStepListViewport(): GUI.Rectangle {
        const viewport = new GUI.Rectangle('StepListViewport');
        viewport.thickness = 0;
        viewport.clipChildren = true;
        viewport.clipContent = true;
        viewport.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        viewport.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        viewport.isHitTestVisible = true;
        return viewport;
    }

    private createStepListContent(): GUI.Rectangle {
        const content = new GUI.Rectangle('StepListContent');
        content.thickness = 0;
        content.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        content.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        content.isHitTestVisible = false;
        return content;
    }

    private createActionPanel(): GUI.Rectangle {
        const panel = new GUI.Rectangle('ActionPanel');
        panel.thickness = 0;
        panel.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        panel.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        panel.isHitTestVisible = true;
        return panel;
    }

    private createCloseButton(): GUI.Ellipse {
        const btn = new GUI.Ellipse('EditorCloseButton');
        btn.background = COLORS.LOG_CLOSE_BTN_BG;
        btn.thickness = 0;
        btn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        btn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        btn.isHitTestVisible = true;
        btn.isPointerBlocker = true;

        this.closeBtnX = new GUI.TextBlock('EditorCloseBtnX');
        this.closeBtnX.text = '\u00D7';
        this.closeBtnX.color = COLORS.LOG_CLOSE_BTN_X;
        this.closeBtnX.fontFamily = FONT.FAMILY.BODY;
        this.closeBtnX.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.closeBtnX.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.closeBtnX.isHitTestVisible = false;
        btn.addControl(this.closeBtnX);

        btn.onPointerClickObservable.add(() => this.hide());
        btn.onPointerEnterObservable.add(() => { btn.background = COLORS.LOG_CLOSE_BTN_HOVER; });
        btn.onPointerOutObservable.add(() => { btn.background = COLORS.LOG_CLOSE_BTN_BG; });

        return btn;
    }

    private createScrollIndicator(): GUI.Rectangle {
        const indicator = new GUI.Rectangle('EditorScrollIndicator');
        indicator.thickness = 0;
        indicator.background = COLORS.LOG_SCROLL_INDICATOR;
        indicator.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        indicator.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        indicator.alpha = 0;
        indicator.isHitTestVisible = false;
        indicator.cornerRadius = 2;
        return indicator;
    }

    // ========================================
    // Header Buttons (Drawer + Type Filters)
    // ========================================

    private createHeaderButtons(): void {
        // Drawer toggle: compact mode (hide index + badge + action panel)
        this.drawerBtn = new GUI.Rectangle('DrawerBtn');
        this.drawerBtn.thickness = 1;
        this.drawerBtn.color = 'rgba(255, 255, 255, 0.2)';
        this.drawerBtn.background = 'rgba(255, 255, 255, 0.06)';
        this.drawerBtn.cornerRadius = 4;
        this.drawerBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.drawerBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        this.drawerBtn.isHitTestVisible = true;
        this.drawerBtn.isPointerBlocker = true;
        this.drawerBtn.zIndex = 10;

        this.drawerLabel = new GUI.TextBlock('DrawerLabel');
        this.drawerLabel.text = '\u2630'; // ☰ hamburger
        this.drawerLabel.color = COLORS.TEXT_MUTED;
        this.drawerLabel.fontFamily = FONT.FAMILY.BODY;
        this.drawerLabel.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        this.drawerLabel.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        this.drawerLabel.isHitTestVisible = false;
        this.drawerBtn.addControl(this.drawerLabel);

        this.drawerBtn.onPointerClickObservable.add(() => {
            this.compactMode = !this.compactMode;
            this.drawerLabel.color = this.compactMode ? COLORS.SYSTEM_ACCENT : COLORS.TEXT_MUTED;
            this.actionPanel.isVisible = !this.compactMode;
            this.applyDimensions();
            this.renderEntries();
            requestAnimationFrame(() => this.updateScrollerDimensions());
        });
        this.drawerBtn.onPointerEnterObservable.add(() => {
            this.drawerBtn.background = 'rgba(255, 255, 255, 0.12)';
        });
        this.drawerBtn.onPointerOutObservable.add(() => {
            this.drawerBtn.background = 'rgba(255, 255, 255, 0.06)';
        });

        // Type filter buttons (NAR, DLG, AUTO, EVT)
        const types: ScenarioStep['type'][] = ['narration', 'dialogue', 'auto', 'event'];
        for (const t of types) {
            const cfg = BADGE_MAP[t];
            const rect = new GUI.Rectangle(`FilterBtn_${t}`);
            rect.thickness = 0;
            rect.background = cfg.color;
            rect.cornerRadius = 4;
            rect.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            rect.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
            rect.isHitTestVisible = true;
            rect.isPointerBlocker = true;
            rect.zIndex = 10;
            rect.alpha = 1.0;

            const text = new GUI.TextBlock(`FilterBtnText_${t}`);
            text.text = cfg.label;
            text.color = '#FFFFFF';
            text.fontFamily = FONT.FAMILY.BODY;
            text.fontWeight = 'bold';
            text.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            text.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
            text.isHitTestVisible = false;
            rect.addControl(text);

            rect.onPointerClickObservable.add(() => {
                const current = this.typeFilters.get(t) ?? true;
                this.typeFilters.set(t, !current);
                rect.alpha = !current ? 1.0 : 0.25;
                this.renderEntries();
                this.updateStats();
                requestAnimationFrame(() => this.updateScrollerDimensions());
            });

            this.filterButtons.push({ rect, text, type: t });
        }

        // Undo/Redo header buttons (positioned left of close button)
        this.undoBtn = this.createHeaderIconButton('UndoBtn', '\u21A9', () => this.callbacks.onUndo?.());  // ↩
        this.undoBtnLabel = this.undoBtn.children[0] as GUI.TextBlock;
        this.redoBtn = this.createHeaderIconButton('RedoBtn', '\u21AA', () => this.callbacks.onRedo?.()); // ↪
        this.redoBtnLabel = this.redoBtn.children[0] as GUI.TextBlock;

        // Expand/Collapse toggle (right of redo, corner) — ⛶ fullscreen-like icon
        this.expandBtn = this.createHeaderIconButton('ExpandBtn', '\u26F6', () => this.toggleExpandAll());
        this.expandBtnLabel = this.expandBtn.children[0] as GUI.TextBlock;

        // Inline action buttons (header center area): + After, Delete
        this.hdrAddAfterBtn = this.createHeaderIconButton('HdrAddAfterBtn', '+', () => {
            if (this.selectedIndex >= 0) this.callbacks.onInsertAfter?.(this.selectedIndex);
        });
        this.hdrAddAfterLabel = this.hdrAddAfterBtn.children[0] as GUI.TextBlock;

        this.hdrDeleteBtn = this.createHeaderIconButton('HdrDeleteBtn', '\u2715', () => { // ✕
            if (this.selectedIndex >= 0) this.callbacks.onDelete?.(this.selectedIndex);
        });
        this.hdrDeleteLabel = this.hdrDeleteBtn.children[0] as GUI.TextBlock;
    }

    private createHeaderIconButton(name: string, icon: string, handler: () => void): GUI.Rectangle {
        const btn = new GUI.Rectangle(name);
        btn.thickness = 1;
        btn.color = 'rgba(255, 255, 255, 0.2)';
        btn.background = 'rgba(255, 255, 255, 0.06)';
        btn.cornerRadius = 4;
        btn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
        btn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        btn.isHitTestVisible = true;
        btn.isPointerBlocker = true;
        btn.zIndex = 10;

        const label = new GUI.TextBlock(`${name}Label`);
        label.text = icon;
        label.color = COLORS.TEXT_MUTED;
        label.fontFamily = FONT.FAMILY.BODY;
        label.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        label.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        label.isHitTestVisible = false;
        btn.addControl(label);

        btn.onPointerClickObservable.add(() => handler());
        btn.onPointerEnterObservable.add(() => { btn.background = 'rgba(255, 255, 255, 0.12)'; });
        btn.onPointerOutObservable.add(() => { btn.background = 'rgba(255, 255, 255, 0.06)'; });

        return btn;
    }

    private createStatsDisplay(): GUI.TextBlock {
        const stats = new GUI.TextBlock('StatsDisplay');
        stats.text = '';
        stats.color = COLORS.TEXT_MUTED;
        stats.fontFamily = FONT.FAMILY.MONOSPACE;
        stats.textWrapping = 1; // WordWrap
        stats.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        stats.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        stats.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_BOTTOM;
        stats.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        stats.isHitTestVisible = false;
        return stats;
    }

    private updateStats(): void {
        let dlgCount = 0;
        let narDlgCount = 0;
        for (const step of this.steps) {
            const visible = this.typeFilters.get(step.type) ?? true;
            if (!visible) continue;
            if (step.type === 'dialogue') { dlgCount++; narDlgCount++; }
            else if (step.type === 'narration') { narDlgCount++; }
        }
        this.statsText.text = `DLG ${dlgCount}\nDLG+NAR ${narDlgCount}`;
    }

    // ========================================
    // Action Buttons
    // ========================================

    private buildActionButtons(): void {
        const defs: { label: string; needsSelection: boolean; handler: () => void }[] = [
            { label: 'Jump Prev', needsSelection: true, handler: () => { if (this.selectedIndex > 0) { this.hide(); this.callbacks.onJumpTo?.(this.selectedIndex - 1); } } },
            { label: 'Jump', needsSelection: true, handler: () => { if (this.selectedIndex >= 0) { this.hide(); this.callbacks.onJumpTo?.(this.selectedIndex); } } },
            { label: '+ Before', needsSelection: true, handler: () => { if (this.selectedIndex >= 0) this.callbacks.onInsertBefore?.(this.selectedIndex); } },
            { label: '+ After', needsSelection: true, handler: () => { if (this.selectedIndex >= 0) this.callbacks.onInsertAfter?.(this.selectedIndex); } },
            { label: 'Edit', needsSelection: true, handler: () => { this.handleEditClick(); } },
            { label: 'Delete', needsSelection: true, handler: () => { if (this.selectedIndex >= 0) this.callbacks.onDelete?.(this.selectedIndex); } },
            { label: 'Move \u2191', needsSelection: true, handler: () => { if (this.selectedIndex >= 0) this.callbacks.onMoveUp?.(this.selectedIndex); } },
            { label: 'Move \u2193', needsSelection: true, handler: () => { if (this.selectedIndex >= 0) this.callbacks.onMoveDown?.(this.selectedIndex); } },
            // separator handled by gap (index 8)
            { label: 'Copy', needsSelection: false, handler: () => { this.callbacks.onCopyYaml?.(); } },
            { label: 'Paste', needsSelection: false, handler: () => { this.callbacks.onPasteYaml?.(); } },
            { label: 'Saved?', needsSelection: false, handler: () => { this.toggleAutoSavePreview(); } },
            { label: 'Save', needsSelection: false, handler: () => { this.callbacks.onSave?.(); } },
            { label: 'Import', needsSelection: false, handler: () => { this.callbacks.onImport?.(); } },
            { label: 'New', needsSelection: false, handler: () => { this.callbacks.onNew?.(); } },
        ];

        for (const def of defs) {
            const { rect, text } = this.createActionButton(def.label, def.handler);
            this.actionPanel.addControl(rect);
            this.actionButtons.push({ rect, text, needsSelection: def.needsSelection });
        }
    }

    private toggleExpandAll(): void {
        this.allExpanded = !this.allExpanded;
        if (this.allExpanded) {
            this.expandedIndex = -2; // special: all expanded
        } else {
            this.expandedIndex = -1;
        }
        this.hideInlineEditor();
        this.renderEntries();
        requestAnimationFrame(() => this.updateScrollerDimensions());
        // Update button label
        this.updateExpandAllLabel();
    }

    private updateExpandAllLabel(): void {
        // Header icon: ⛶ (expand) ↙ (collapse)
        this.expandBtnLabel.text = this.allExpanded ? '\u2199' : '\u26F6';
    }

    private toggleAutoSavePreview(): void {
        this.autoSavePreviewActive = !this.autoSavePreviewActive;
        this.callbacks.onPreviewAutoSave?.(this.autoSavePreviewActive);

        // Update button visual
        const btn = this.actionButtons.find(b => b.text.text === 'Saved?' || b.text.text === '\u21A9 Back');
        if (btn) {
            if (this.autoSavePreviewActive) {
                btn.text.text = '\u21A9 Back';  // ↩ Back
                btn.rect.background = COLORS.SYSTEM_BTN_BG_ACTIVE;
                btn.rect.color = COLORS.SYSTEM_ACCENT;
                btn.text.color = COLORS.TEXT_WHITE;
            } else {
                btn.text.text = 'Saved?';
                btn.rect.background = COLORS.SYSTEM_BTN_BG;
                btn.rect.color = COLORS.SYSTEM_BTN_BORDER;
                btn.text.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
            }
        }
    }

    private createActionButton(label: string, handler: () => void): { rect: GUI.Rectangle; text: GUI.TextBlock } {
        const rect = new GUI.Rectangle(`ActionBtn_${label}`);
        rect.thickness = 1;
        rect.color = COLORS.SYSTEM_BTN_BORDER;
        rect.background = COLORS.SYSTEM_BTN_BG;
        rect.cornerRadius = 6;
        rect.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        rect.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        rect.isHitTestVisible = true;
        rect.isPointerBlocker = true;

        const text = new GUI.TextBlock(`ActionBtnText_${label}`);
        text.text = label;
        text.color = COLORS.SYSTEM_BTN_TEXT_MUTED;
        text.fontFamily = FONT.FAMILY.BODY;
        text.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        text.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
        text.isHitTestVisible = false;
        rect.addControl(text);

        rect.onPointerClickObservable.add(() => handler());
        rect.onPointerEnterObservable.add(() => {
            if (rect.alpha > 0.5) {
                rect.background = COLORS.SYSTEM_BTN_BG_ACTIVE;
            }
        });
        rect.onPointerOutObservable.add(() => {
            rect.background = COLORS.SYSTEM_BTN_BG;
        });
        // Mobile: pointerOut doesn't fire reliably after touch → reset on pointerUp
        rect.onPointerUpObservable.add(() => {
            rect.background = COLORS.SYSTEM_BTN_BG;
        });

        return { rect, text };
    }

    private updateActionButtonStates(): void {
        const hasSelection = this.selectedIndex >= 0 && this.selectedIndex < this.steps.length;

        for (const btn of this.actionButtons) {
            if (btn.needsSelection) {
                btn.rect.alpha = hasSelection ? 1.0 : 0.4;
                btn.rect.isHitTestVisible = hasSelection;
            }
        }

        // Header inline action buttons (selection-dependent)
        this.hdrAddAfterBtn.alpha = hasSelection ? 1.0 : 0.4;
        this.hdrAddAfterBtn.isHitTestVisible = hasSelection;
        this.hdrDeleteBtn.alpha = hasSelection ? 1.0 : 0.4;
        this.hdrDeleteBtn.isHitTestVisible = hasSelection;
    }

    private handleEditClick(): void {
        if (this.selectedIndex < 0 || this.selectedIndex >= this.steps.length) return;
        const step = this.steps[this.selectedIndex];
        this.showEditForm(step, this.selectedIndex);
    }

    // ========================================
    // Scale Handling
    // ========================================

    private handleScaleChange(scaleInfo: DialogueScaleInfo): void {
        this.currentDims = computeEditorPanelDimensions(scaleInfo);
        this.currentScaleInfo = scaleInfo;

        // Portrait 모드에서 자동 compact (액션 패널 숨김)
        const shouldCompact = scaleInfo.isPortrait;
        if (shouldCompact !== this.compactMode) {
            this.compactMode = shouldCompact;
            this.actionPanel.isVisible = !this.compactMode;
            this.drawerLabel.color = this.compactMode ? COLORS.SYSTEM_ACCENT : COLORS.TEXT_MUTED;
        }

        this.applyDimensions();

        if (this._isVisible) {
            this.renderEntries();
            requestAnimationFrame(() => this.updateScrollerDimensions());
        }
    }

    private applyDimensions(): void {
        if (!this.currentDims) return;
        const d = this.currentDims;

        // Content box
        this.contentBox.widthInPixels = d.panelWidth;
        this.contentBox.heightInPixels = d.panelHeight;
        this.contentBox.cornerRadius = d.panelCornerRadius;

        const innerTop = d.panelPaddingTop;
        const innerHeight = d.panelHeight - d.panelPaddingTop - d.panelPaddingBottom;
        const innerWidth = d.panelWidth - d.panelPaddingH * 2;

        // Step list viewport width adapts when compact mode (action panel hidden)
        const effectiveStepListWidth = this.compactMode
            ? innerWidth
            : d.stepListWidth;

        // Step list viewport (left region)
        this.stepListViewport.widthInPixels = effectiveStepListWidth;
        this.stepListViewport.heightInPixels = innerHeight;
        this.stepListViewport.topInPixels = innerTop;
        this.stepListViewport.leftInPixels = d.panelPaddingH;

        // Step list content
        this.stepListContent.widthInPixels = effectiveStepListWidth;

        // Action panel (right region, fixed width)
        this.actionPanel.widthInPixels = d.actionPanelWidth;
        this.actionPanel.heightInPixels = innerHeight;
        this.actionPanel.topInPixels = innerTop;
        this.actionPanel.leftInPixels = -(d.panelPaddingH);

        // Layout action buttons vertically
        let btnTop = 0;
        // Separator gaps after: Move↓ (7), Saved? (10)
        const separatorIndices = new Set([7, 10]);

        for (let i = 0; i < this.actionButtons.length; i++) {
            const btn = this.actionButtons[i];
            btn.rect.widthInPixels = d.actionBtnWidth;
            btn.rect.heightInPixels = d.actionBtnHeight;
            btn.rect.topInPixels = btnTop;
            btn.text.fontSizeInPixels = d.actionBtnFontSize;

            btnTop += d.actionBtnHeight + d.actionBtnGap;

            if (separatorIndices.has(i)) {
                btnTop += d.actionBtnGap * 2;
            }
        }

        // Stats display (below buttons, bottom-aligned in action panel)
        this.statsText.widthInPixels = d.actionBtnWidth;
        this.statsText.heightInPixels = Math.floor(d.actionBtnHeight * 2);
        this.statsText.fontSizeInPixels = Math.max(9, Math.floor(d.actionBtnFontSize * 0.72));
        this.statsText.paddingBottomInPixels = 8;

        // Close button
        this.closeButton.widthInPixels = d.closeBtnSize;
        this.closeButton.heightInPixels = d.closeBtnSize;
        this.closeButton.topInPixels = d.closeBtnOffsetTop;
        this.closeButton.leftInPixels = -d.closeBtnOffsetRight;
        this.closeBtnX.fontSizeInPixels = Math.floor(d.closeBtnSize * 0.6);

        // Scroll indicator
        this.scrollIndicator.widthInPixels = d.scrollIndicatorWidth;
        this.scrollIndicator.leftInPixels = d.panelPaddingH + effectiveStepListWidth - d.scrollIndicatorWidth - 2;

        // Header buttons: drawer + type filters
        const hdrBtnH = Math.floor(d.closeBtnSize * 0.65);
        const hdrBtnTop = Math.floor(d.closeBtnOffsetTop * 0.8);
        const hdrFontSize = Math.floor(hdrBtnH * 0.55);

        this.drawerBtn.widthInPixels = hdrBtnH;
        this.drawerBtn.heightInPixels = hdrBtnH;
        this.drawerBtn.topInPixels = hdrBtnTop;
        this.drawerBtn.leftInPixels = d.panelPaddingH;
        this.drawerLabel.fontSizeInPixels = Math.floor(hdrBtnH * 0.6);

        // Type filter buttons (positioned right of drawer btn)
        const filterW = Math.floor(hdrBtnH * 1.5);
        const filterGap = 4;
        let filterLeft = d.panelPaddingH + hdrBtnH + filterGap + 4;
        for (const fb of this.filterButtons) {
            fb.rect.widthInPixels = filterW;
            fb.rect.heightInPixels = hdrBtnH;
            fb.rect.topInPixels = hdrBtnTop;
            fb.rect.leftInPixels = filterLeft;
            fb.text.fontSizeInPixels = hdrFontSize;
            filterLeft += filterW + filterGap;
        }

        // Right-side header buttons: [undo] [redo] [expand] [close]
        const undoRedoW = Math.floor(hdrBtnH * 1.2);
        const undoRedoGap = 4;
        const expandGap = 8; // slightly larger margin between redo and expand

        // Close button is at right = closeBtnOffsetRight, close button size = closeBtnSize
        // Expand → right of redo, tucked into corner next to close
        const expandRight = d.closeBtnOffsetRight + d.closeBtnSize + undoRedoGap;
        const redoRight = expandRight + undoRedoW + expandGap;
        const undoRight = redoRight + undoRedoW + undoRedoGap;

        this.expandBtn.widthInPixels = undoRedoW;
        this.expandBtn.heightInPixels = hdrBtnH;
        this.expandBtn.topInPixels = hdrBtnTop;
        this.expandBtn.leftInPixels = -expandRight;
        this.expandBtnLabel.fontSizeInPixels = Math.floor(hdrBtnH * 0.6);

        this.redoBtn.widthInPixels = undoRedoW;
        this.redoBtn.heightInPixels = hdrBtnH;
        this.redoBtn.topInPixels = hdrBtnTop;
        this.redoBtn.leftInPixels = -redoRight;
        this.redoBtnLabel.fontSizeInPixels = Math.floor(hdrBtnH * 0.6);

        this.undoBtn.widthInPixels = undoRedoW;
        this.undoBtn.heightInPixels = hdrBtnH;
        this.undoBtn.topInPixels = hdrBtnTop;
        this.undoBtn.leftInPixels = -undoRight;
        this.undoBtnLabel.fontSizeInPixels = Math.floor(hdrBtnH * 0.6);

        // Inline action buttons: + After, Delete (header center, capped at filter button size)
        const inlineW = Math.min(filterW, Math.floor(hdrBtnH * 1.5));
        const inlineGap = 6;
        // Center between end of filters and start of undo
        const filterEndLeft = filterLeft; // filterLeft is already past the last filter
        const undoStartLeft = d.panelWidth - undoRight - undoRedoW; // undo button left edge from panel left
        const centerZone = (filterEndLeft + undoStartLeft) / 2;
        const totalInlineW = inlineW * 2 + inlineGap;
        const inlineStartLeft = centerZone - totalInlineW / 2;

        this.hdrAddAfterBtn.widthInPixels = inlineW;
        this.hdrAddAfterBtn.heightInPixels = hdrBtnH;
        this.hdrAddAfterBtn.topInPixels = hdrBtnTop;
        this.hdrAddAfterBtn.leftInPixels = inlineStartLeft;
        this.hdrAddAfterBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.hdrAddAfterLabel.fontSizeInPixels = Math.floor(hdrBtnH * 0.65);

        this.hdrDeleteBtn.widthInPixels = inlineW;
        this.hdrDeleteBtn.heightInPixels = hdrBtnH;
        this.hdrDeleteBtn.topInPixels = hdrBtnTop;
        this.hdrDeleteBtn.leftInPixels = inlineStartLeft + inlineW + inlineGap;
        this.hdrDeleteBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        this.hdrDeleteLabel.fontSizeInPixels = Math.floor(hdrBtnH * 0.65);
    }

    // ========================================
    // Entry Rendering (Accordion)
    // ========================================

    private renderEntries(): void {
        if (!this.currentDims) return;

        // Clear existing
        for (const ctrl of this.entryControls) {
            this.stepListContent.removeControl(ctrl);
            ctrl.dispose();
        }
        this.entryControls = [];
        this.entryIndexMap.clear();

        const d = this.currentDims;
        const innerWidth = d.panelWidth - d.panelPaddingH * 2;
        const effectiveWidth = this.compactMode ? innerWidth : d.stepListWidth;
        let totalHeight = 0;

        for (let i = 0; i < this.steps.length; i++) {
            const step = this.steps[i];

            // Type filter
            if (!(this.typeFilters.get(step.type) ?? true)) continue;

            const isSelected = i === this.selectedIndex;
            const isExpanded = this.expandedIndex === -2 || i === this.expandedIndex;
            const entryHeight = isExpanded
                ? this.computeExpandedHeight(step, d, effectiveWidth)
                : d.stepListEntryHeight;

            const entryControl = this.createStepEntry(step, i, totalHeight, isSelected, isExpanded, entryHeight, effectiveWidth);
            this.stepListContent.addControl(entryControl);
            this.entryIndexMap.set(i, this.entryControls.length);
            this.entryControls.push(entryControl);
            totalHeight += entryHeight;
        }

        this.stepListContent.heightInPixels = Math.max(
            totalHeight,
            this.stepListViewport.heightInPixels
        );

        this.updateStats();
    }

    /**
     * 확장 상태의 엔트리 높이를 계산합니다.
     * 헤더 행 + 전체 텍스트의 워드랩 높이
     */
    private computeExpandedHeight(step: ScenarioStep, d: EditorPanelDimensions, effectiveWidth?: number): number {
        const headerHeight = d.stepListEntryHeight;
        const listW = effectiveWidth ?? d.stepListWidth;
        const textAreaWidth = listW - 24; // padding
        const fullText = this.getStepFullText(step);
        const textHeight = this.measureWrappedTextHeight(
            fullText,
            d.stepPreviewFontSize,
            textAreaWidth
        );
        const lineHeight = d.stepPreviewFontSize + 6;
        const maxTextHeight = lineHeight * 20; // cap at 20 lines
        return headerHeight + Math.min(textHeight, maxTextHeight) + 16; // 16 = bottom padding
    }

    /**
     * 캔버스 기반 워드랩 텍스트 높이 측정
     */
    private measureWrappedTextHeight(text: string, fontSize: number, maxWidth: number): number {
        if (!text) return fontSize + 6;

        this.measureCtx.font = `${fontSize}px ${FONT.FAMILY.BODY}`;
        const lines = text.split('\n');
        let totalLines = 0;

        for (const line of lines) {
            if (!line.trim()) {
                totalLines++;
                continue;
            }
            const words = line.split(/\s+/);
            let currentLine = '';
            let lineCount = 1;

            for (const word of words) {
                const test = currentLine ? currentLine + ' ' + word : word;
                if (this.measureCtx.measureText(test).width > maxWidth && currentLine) {
                    lineCount++;
                    currentLine = word;
                } else {
                    currentLine = test;
                }
            }
            totalLines += lineCount;
        }

        return totalLines * (fontSize + 6);
    }

    /**
     * 스텝의 전체 텍스트를 반환합니다 (축약 없이).
     */
    private getStepFullText(step: ScenarioStep): string {
        switch (step.type) {
            case 'narration':
                return step.text;
            case 'dialogue':
                return `[${step.speaker}]\n${step.text}`;
            case 'auto':
                return `[${step.speaker ?? ''}] (${step.duration}ms)\n${step.text ?? ''}`;
            case 'event': {
                const payloadStr = step.payload != null
                    ? `\n${JSON.stringify(step.payload, null, 2)}`
                    : '';
                return `EVENT: ${step.event}${payloadStr}`;
            }
        }
    }

    private createStepEntry(
        step: ScenarioStep,
        index: number,
        topOffset: number,
        isSelected: boolean,
        isExpanded: boolean,
        entryHeight: number,
        effectiveWidth?: number
    ): GUI.Rectangle {
        if (!this.currentDims) throw new Error('Dimensions not set');
        const d = this.currentDims;
        const listW = effectiveWidth ?? d.stepListWidth;

        // --- Outer container (visual frame only, no hit test) ---
        const container = new GUI.Rectangle(`StepEntry_${index}`);
        container.thickness = isSelected ? 1 : 0;
        container.color = isSelected ? COLORS.SYSTEM_ACCENT : 'transparent';
        container.background = isSelected ? 'rgba(51, 195, 255, 0.10)' : '';
        container.widthInPixels = listW;
        container.heightInPixels = entryHeight;
        container.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        container.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        container.topInPixels = topOffset;
        container.isHitTestVisible = false;
        container.cornerRadius = 4;

        // --- Header row hit target: 클릭 → 선택 + 아코디언 토글 ---
        const headerHit = new GUI.Rectangle(`StepHeader_${index}`);
        headerHit.thickness = 0;
        headerHit.widthInPixels = listW;
        headerHit.heightInPixels = d.stepListEntryHeight;
        headerHit.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        headerHit.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        headerHit.isHitTestVisible = true;

        let headerDownX = 0;
        let headerDownY = 0;

        headerHit.onPointerDownObservable.add((info) => {
            headerDownX = info.x;
            headerDownY = info.y;

            // Start long-press timer for drag reorder
            this.cancelDragHoldTimer();
            this.dragState = {
                active: false,
                stepIndex: index,
                startY: info.y,
                currentY: info.y,
                holdTimer: window.setTimeout(() => {
                    if (!this.dragState || this.dragState.stepIndex !== index) return;
                    // Check pointer hasn't moved too far
                    const dy = this.dragState.currentY - this.dragState.startY;
                    if (Math.abs(dy) < 5) {
                        this.startDragReorder(index, info.y, entryHeight);
                    }
                }, 400),
                entryHeight,
            };
        });

        headerHit.onPointerUpObservable.add((info) => {
            // If drag is active, let the overlay handler deal with it
            if (this.dragState?.active) return;

            this.cancelDragHoldTimer();
            this.endScrollDrag();

            const dx = info.x - headerDownX;
            const dy = info.y - headerDownY;
            if (Math.sqrt(dx * dx + dy * dy) >= 5) return;

            // 싱글클릭: 선택 + 아코디언 토글
            this.selectedIndex = index;
            if (this.expandedIndex === -2) {
                // Was all-expanded; collapse to just this one, or collapse all
                this.allExpanded = false;
                this.expandedIndex = index;
                this.updateExpandAllLabel();
            } else if (this.expandedIndex === index) {
                this.expandedIndex = -1;
            } else {
                this.expandedIndex = index;
            }

            this.hideInlineEditor();
            this.renderEntries();
            this.updateActionButtonStates();
            requestAnimationFrame(() => this.updateScrollerDimensions());
        });

        // Hover effect (only when not selected)
        if (!isSelected) {
            headerHit.onPointerEnterObservable.add(() => {
                container.background = 'rgba(255, 255, 255, 0.05)';
            });
            headerHit.onPointerOutObservable.add(() => {
                container.background = isSelected ? 'rgba(51, 195, 255, 0.10)' : '';
            });
        }
        container.addControl(headerHit);

        // --- Compact mode: color bar on left edge ---
        if (this.compactMode) {
            const badgeConfig = BADGE_MAP[step.type];
            const colorBar = new GUI.Rectangle(`StepColorBar_${index}`);
            colorBar.widthInPixels = 4;
            colorBar.heightInPixels = entryHeight;
            colorBar.background = badgeConfig.color;
            colorBar.thickness = 0;
            colorBar.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            colorBar.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
            colorBar.isHitTestVisible = false;
            container.addControl(colorBar);
        }

        // --- Header row visuals (inside headerHit) ---
        let leftOffset = this.compactMode ? 14 : 8; // color bar(4px) + margin(10px)

        if (!this.compactMode) {
            // Step index
            const indexBlock = new GUI.TextBlock(`StepIndex_${index}`);
            indexBlock.text = String(index).padStart(3, ' ');
            indexBlock.color = COLORS.TEXT_MUTED;
            indexBlock.fontSizeInPixels = d.indexFontSize;
            indexBlock.fontFamily = FONT.FAMILY.MONOSPACE;
            indexBlock.widthInPixels = d.stepIndexWidth;
            indexBlock.heightInPixels = d.stepListEntryHeight;
            indexBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
            indexBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            indexBlock.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            indexBlock.leftInPixels = leftOffset;
            indexBlock.isHitTestVisible = false;
            headerHit.addControl(indexBlock);
            leftOffset += d.stepIndexWidth + 8;

            // Type badge
            const badgeConfig = BADGE_MAP[step.type];
            const badge = new GUI.Rectangle(`StepBadge_${index}`);
            badge.widthInPixels = d.stepBadgeWidth;
            badge.heightInPixels = d.stepBadgeHeight;
            badge.background = badgeConfig.color;
            badge.cornerRadius = 4;
            badge.thickness = 0;
            badge.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            badge.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            badge.leftInPixels = leftOffset;
            badge.isHitTestVisible = false;
            headerHit.addControl(badge);

            const badgeText = new GUI.TextBlock(`StepBadgeText_${index}`);
            badgeText.text = badgeConfig.label;
            badgeText.color = '#FFFFFF';
            badgeText.fontSizeInPixels = d.stepBadgeFontSize;
            badgeText.fontFamily = FONT.FAMILY.BODY;
            badgeText.fontWeight = 'bold';
            badgeText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            badgeText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
            badgeText.isHitTestVisible = false;
            badge.addControl(badgeText);
            leftOffset += d.stepBadgeWidth + 10;
        }

        // Preview text (always shown in header)
        const availableWidth = listW - leftOffset - 12;
        const previewText = this.getStepPreview(step);
        const truncated = this.truncateText(previewText, availableWidth, d.stepPreviewFontSize);

        const preview = new GUI.TextBlock(`StepPreview_${index}`);
        preview.text = truncated;
        preview.color = isExpanded ? 'rgba(255, 255, 255, 0.5)' : COLORS.TEXT_WHITE;
        preview.fontSizeInPixels = d.stepPreviewFontSize;
        preview.fontFamily = FONT.FAMILY.BODY;
        preview.widthInPixels = availableWidth;
        preview.heightInPixels = d.stepListEntryHeight;
        preview.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        preview.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
        preview.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        preview.leftInPixels = leftOffset;
        preview.isHitTestVisible = false;
        headerHit.addControl(preview);

        // --- Expanded text area: 더블클릭 → 인라인 편집 ---
        if (isExpanded) {
            const expandedAreaHeight = entryHeight - d.stepListEntryHeight;

            // Hit target for expanded text area
            const textHit = new GUI.Rectangle(`StepTextHit_${index}`);
            textHit.thickness = 0;
            textHit.background = 'rgba(255, 255, 255, 0.03)';
            textHit.widthInPixels = listW;
            textHit.heightInPixels = expandedAreaHeight;
            textHit.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
            textHit.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            textHit.topInPixels = d.stepListEntryHeight;
            textHit.isHitTestVisible = true;
            textHit.cornerRadius = 4;

            // Double-click detection on expanded text area
            let textDownX = 0;
            let textDownY = 0;
            let textLastClick = 0;

            textHit.onPointerDownObservable.add((info) => {
                textDownX = info.x;
                textDownY = info.y;
            });

            textHit.onPointerUpObservable.add((info) => {
                this.endScrollDrag();

                const dx = info.x - textDownX;
                const dy = info.y - textDownY;
                if (Math.sqrt(dx * dx + dy * dy) >= 5) return;

                const now = Date.now();
                if ((now - textLastClick) < DOUBLE_CLICK_MS) {
                    // 더블클릭: 인라인 편집
                    this.startInlineEdit(index, step);
                    textLastClick = 0;
                } else {
                    textLastClick = now;
                }
            });

            // Hover
            textHit.onPointerEnterObservable.add(() => {
                textHit.background = 'rgba(255, 255, 255, 0.06)';
            });
            textHit.onPointerOutObservable.add(() => {
                textHit.background = 'rgba(255, 255, 255, 0.03)';
            });

            container.addControl(textHit);

            // Full text (visual, inside textHit)
            const fullText = this.getStepFullText(step);
            const textBlock = new GUI.TextBlock(`StepFull_${index}`);
            textBlock.text = fullText;
            textBlock.color = COLORS.TEXT_WHITE;
            textBlock.fontSizeInPixels = d.stepPreviewFontSize;
            textBlock.fontFamily = FONT.FAMILY.BODY;
            textBlock.textWrapping = 1; // TextWrapping.WordWrap
            textBlock.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            textBlock.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
            textBlock.widthInPixels = listW - 24;
            textBlock.heightInPixels = expandedAreaHeight - 8;
            textBlock.leftInPixels = 12;
            textBlock.topInPixels = 4;
            textBlock.isHitTestVisible = false;
            textHit.addControl(textBlock);

            // Edit button (top-right of expanded area)
            const editBtnSize = Math.floor(d.stepListEntryHeight * 0.6);
            const editBtn = new GUI.Rectangle(`StepEditBtn_${index}`);
            editBtn.widthInPixels = editBtnSize;
            editBtn.heightInPixels = editBtnSize;
            editBtn.cornerRadius = 4;
            editBtn.thickness = 1;
            editBtn.color = 'rgba(255, 255, 255, 0.25)';
            editBtn.background = 'rgba(51, 195, 255, 0.15)';
            editBtn.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_RIGHT;
            editBtn.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
            editBtn.leftInPixels = -6;
            editBtn.topInPixels = 6;
            editBtn.isHitTestVisible = true;
            editBtn.isPointerBlocker = true;

            const editBtnIcon = new GUI.TextBlock(`StepEditIcon_${index}`);
            editBtnIcon.text = '\u270E'; // ✎
            editBtnIcon.color = COLORS.SYSTEM_ACCENT;
            editBtnIcon.fontFamily = FONT.FAMILY.BODY;
            editBtnIcon.fontSizeInPixels = Math.floor(editBtnSize * 0.6);
            editBtnIcon.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            editBtnIcon.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_CENTER;
            editBtnIcon.isHitTestVisible = false;
            editBtn.addControl(editBtnIcon);

            editBtn.onPointerClickObservable.add(() => {
                this.showEditForm(step, index);
            });
            editBtn.onPointerEnterObservable.add(() => {
                editBtn.background = 'rgba(51, 195, 255, 0.30)';
            });
            editBtn.onPointerOutObservable.add(() => {
                editBtn.background = 'rgba(51, 195, 255, 0.15)';
            });

            textHit.addControl(editBtn);
        }

        return container;
    }

    // ========================================
    // Inline Editing (DOM Overlay)
    // ========================================

    /**
     * 더블클릭 시 인라인 편집을 시작합니다.
     * 텍스트 스텝: DOM textarea 오버레이
     * 이벤트 스텝: 기존 DOM 폼
     */
    private startInlineEdit(index: number, step: ScenarioStep): void {
        if (step.type === 'event') {
            this.showEditForm(step, index);
            return;
        }

        this.hideInlineEditor();

        if (!this.currentScaleInfo || !this.currentDims) return;

        const canvas = document.querySelector('canvas') as HTMLCanvasElement;
        if (!canvas) return;
        const canvasRect = canvas.getBoundingClientRect();
        const rootScale = this.currentScaleInfo.rootScale;
        const d = this.currentDims;

        // Compute entry position in scaler coordinates
        const scalerW = this.currentScaleInfo.scalerWidth;
        const scalerH = this.currentScaleInfo.scalerHeight;
        const boxLeft = (scalerW - d.panelWidth) / 2;
        const boxTop = (scalerH - d.panelHeight) / 2;

        // Find entry top from entryControls (via index map for filtered lists)
        const entryIdx = this.entryIndexMap.get(index);
        if (entryIdx == null) return;
        const entryCtrl = this.entryControls[entryIdx];
        if (!entryCtrl) return;
        const entryTop = (entryCtrl as GUI.Rectangle).topInPixels;
        const scrollOffset = -this.stepListContent.topInPixels;

        // Text area position in scaler coords
        const innerWidth = d.panelWidth - d.panelPaddingH * 2;
        const effectiveListW = this.compactMode ? innerWidth : d.stepListWidth;
        const textLeft = boxLeft + d.panelPaddingH + 12;
        const textTop = boxTop + d.panelPaddingTop + entryTop - scrollOffset + d.stepListEntryHeight;
        const textWidth = effectiveListW - 24;
        const entryHeight = (entryCtrl as GUI.Rectangle).heightInPixels;
        const textHeight = entryHeight - d.stepListEntryHeight - 8;

        // Convert to screen coords (clamp to viewport for mobile portrait)
        const rawScreenLeft = canvasRect.left + textLeft * rootScale;
        const rawScreenWidth = textWidth * rootScale;
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        const screenLeft = Math.max(4, Math.min(rawScreenLeft, viewportWidth - rawScreenWidth - 4));
        const screenWidth = Math.min(rawScreenWidth, viewportWidth - 8);
        const rawScreenTop = canvasRect.top + textTop * rootScale;
        const rawScreenHeight = Math.max(textHeight * rootScale, 40);
        // Clamp height: on mobile portrait, limit to 40% of viewport height
        const maxEditorHeight = this.compactMode ? viewportHeight * 0.4 : viewportHeight * 0.6;
        const screenHeight = Math.min(rawScreenHeight, maxEditorHeight);
        // Clamp top: ensure editor is fully visible within viewport
        const screenTop = Math.max(8, Math.min(rawScreenTop, viewportHeight - screenHeight - 8));

        // Determine editable text content
        let editableText = '';
        if (step.type === 'narration') {
            editableText = step.text;
        } else if (step.type === 'dialogue') {
            editableText = step.text;
        } else if (step.type === 'auto') {
            editableText = step.text ?? '';
        }

        // Create DOM textarea overlay
        const container = document.createElement('div');
        container.id = 'editor-panel-inline-edit';
        container.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            z-index: 10000;
        `;

        const textarea = document.createElement('textarea');
        textarea.value = editableText;
        textarea.style.cssText = `
            position: fixed;
            left: ${screenLeft}px;
            top: ${screenTop}px;
            width: ${screenWidth}px;
            height: ${screenHeight}px;
            background: rgba(10, 22, 40, 0.95);
            border: 2px solid #33C3FF;
            border-radius: 4px;
            color: #ffffff;
            font-family: ${FONT.FAMILY.BODY};
            font-size: ${Math.max(14, d.stepPreviewFontSize * rootScale)}px;
            padding: 6px 8px;
            resize: vertical;
            outline: none;
            box-sizing: border-box;
            line-height: 1.4;
            overflow-y: auto;
            z-index: 10001;
        `;

        // Speaker input for dialogue/auto steps
        let speakerInput: HTMLInputElement | null = null;
        if (step.type === 'dialogue' || step.type === 'auto') {
            speakerInput = document.createElement('input');
            speakerInput.type = 'text';
            speakerInput.value = step.type === 'dialogue' ? step.speaker : (step.speaker ?? '');
            speakerInput.placeholder = 'Speaker';
            const speakerFontSize = Math.max(14, d.stepPreviewFontSize * rootScale * 0.85);
            const speakerHeight = Math.max(32 * rootScale, speakerFontSize + 16);
            speakerInput.style.cssText = `
                position: fixed;
                left: ${screenLeft}px;
                top: ${screenTop - speakerHeight - 4}px;
                width: ${Math.min(screenWidth * 0.5, 200)}px;
                height: ${speakerHeight}px;
                background: rgba(10, 22, 40, 0.95);
                border: 2px solid #D4A537;
                border-radius: 4px;
                color: #FFD700;
                font-family: ${FONT.FAMILY.BODY};
                font-size: ${speakerFontSize}px;
                padding: 2px 8px;
                outline: none;
                box-sizing: border-box;
                z-index: 10001;
            `;
            container.appendChild(speakerInput);
        }

        // Duration input for auto steps
        let durationInput: HTMLInputElement | null = null;
        if (step.type === 'auto') {
            durationInput = document.createElement('input');
            durationInput.type = 'number';
            durationInput.value = String(step.duration);
            durationInput.min = '0';
            durationInput.step = '100';
            durationInput.placeholder = 'Duration (ms)';
            const durFontSize = Math.max(14, d.stepPreviewFontSize * rootScale * 0.85);
            const durHeight = Math.max(32 * rootScale, durFontSize + 16);
            const durLeft = speakerInput
                ? screenLeft + Math.min(screenWidth * 0.5, 200) + 8
                : screenLeft;
            durationInput.style.cssText = `
                position: fixed;
                left: ${durLeft}px;
                top: ${screenTop - durHeight - 4}px;
                width: ${100 * rootScale}px;
                height: ${durHeight}px;
                background: rgba(10, 22, 40, 0.95);
                border: 2px solid #33C3FF;
                border-radius: 4px;
                color: #33C3FF;
                font-family: ${FONT.FAMILY.BODY};
                font-size: ${durFontSize}px;
                padding: 2px 8px;
                outline: none;
                box-sizing: border-box;
                z-index: 10001;
            `;
            container.appendChild(durationInput);
        }

        container.appendChild(textarea);

        // Auto-expand textarea on newlines (max 20 lines)
        const textareaFontSize = Math.max(14, d.stepPreviewFontSize * rootScale);
        const textareaLineHeight = textareaFontSize * 1.4;
        const maxLines = 20;
        const autoExpandTextarea = () => {
            const lineCount = Math.min((textarea.value.split('\n').length) + 1, maxLines);
            const newHeight = Math.max(screenHeight, lineCount * textareaLineHeight + 16);
            textarea.style.height = `${newHeight}px`;
        };
        textarea.addEventListener('input', autoExpandTextarea);
        // Initial size
        autoExpandTextarea();

        // Save function
        const saveAndClose = () => {
            const newText = textarea.value;
            const newSpeaker = speakerInput?.value;
            const newDuration = durationInput ? parseInt(durationInput.value, 10) : undefined;

            let newStep: ScenarioStep | null = null;
            if (step.type === 'narration') {
                newStep = { type: 'narration', text: newText };
            } else if (step.type === 'dialogue') {
                newStep = { type: 'dialogue', speaker: newSpeaker ?? '', text: newText };
            } else if (step.type === 'auto') {
                newStep = {
                    type: 'auto',
                    duration: (newDuration != null && !isNaN(newDuration)) ? newDuration : 2000,
                } as ScenarioStep;
                if (newSpeaker) (newStep as import('../engines/narrative/types').AutoStep).speaker = newSpeaker;
                if (newText) (newStep as import('../engines/narrative/types').AutoStep).text = newText;
            }

            if (newStep) {
                const event = new CustomEvent('editor-panel-step-edited', {
                    detail: { index, step: newStep }
                });
                window.dispatchEvent(event);
            }

            this.hideInlineEditor();
        };

        // Click outside → save
        container.addEventListener('mousedown', (e) => {
            if (e.target === container) {
                saveAndClose();
            }
        });

        // Ctrl+Enter → save, Escape → cancel
        const keyHandler = (e: KeyboardEvent) => {
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                saveAndClose();
            } else if (e.key === 'Escape') {
                this.hideInlineEditor();
            }
        };
        textarea.addEventListener('keydown', keyHandler);
        speakerInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                textarea.focus();
            } else if (e.key === 'Escape') {
                this.hideInlineEditor();
            }
        });
        durationInput?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                textarea.focus();
            } else if (e.key === 'Escape') {
                this.hideInlineEditor();
            }
        });

        document.body.appendChild(container);
        this.inlineEditorContainer = container;

        // Mobile keyboard avoidance via visualViewport API
        const adjustForKeyboard = () => {
            const vv = window.visualViewport;
            if (!vv) return;
            const visibleBottom = vv.offsetTop + vv.height;
            const textareaRect = textarea.getBoundingClientRect();
            const textareaBottom = textareaRect.bottom;
            if (textareaBottom > visibleBottom - 8) {
                // Textarea is behind keyboard → move it up
                const shift = textareaBottom - visibleBottom + 16;
                textarea.style.top = `${parseFloat(textarea.style.top) - shift}px`;
                if (speakerInput) {
                    speakerInput.style.top = `${parseFloat(speakerInput.style.top) - shift}px`;
                }
                if (durationInput) {
                    durationInput.style.top = `${parseFloat(durationInput.style.top) - shift}px`;
                }
            }
        };
        if (window.visualViewport) {
            window.visualViewport.addEventListener('resize', adjustForKeyboard);
        }

        // Focus
        requestAnimationFrame(() => textarea.focus());

        // Store cleanup ref for keyboard listener
        (container as HTMLDivElement & { _keyboardCleanup?: () => void })._keyboardCleanup = () => {
            window.visualViewport?.removeEventListener('resize', adjustForKeyboard);
        };
    }

    private hideInlineEditor(): void {
        if (this.inlineEditorContainer) {
            // Clean up keyboard listener
            const cleanup = (this.inlineEditorContainer as HTMLDivElement & { _keyboardCleanup?: () => void })._keyboardCleanup;
            cleanup?.();
            this.inlineEditorContainer.remove();
            this.inlineEditorContainer = null;
        }
    }

    // ========================================
    // Helpers
    // ========================================

    private getStepPreview(step: ScenarioStep): string {
        switch (step.type) {
            case 'narration':
                return step.text;
            case 'dialogue':
                return `${step.speaker}: ${step.text}`;
            case 'auto':
                return `${step.speaker ?? ''}: ${step.text ?? ''} (${step.duration}ms)`.trim();
            case 'event': {
                const payloadStr = step.payload != null
                    ? ` ${JSON.stringify(step.payload)}`
                    : '';
                return `${step.event}${payloadStr}`;
            }
        }
    }

    private truncateText(text: string, maxWidth: number, fontSize: number): string {
        this.measureCtx.font = `${fontSize}px ${FONT.FAMILY.BODY}`;

        // Replace newlines with spaces for single-line display
        const clean = text.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();

        const metrics = this.measureCtx.measureText(clean);
        if (metrics.width <= maxWidth) return clean;

        // Binary search for truncation point
        const ellipsis = '\u2026';
        let lo = 0;
        let hi = clean.length;

        while (lo < hi) {
            const mid = (lo + hi + 1) >> 1;
            const testStr = clean.substring(0, mid) + ellipsis;
            if (this.measureCtx.measureText(testStr).width <= maxWidth) {
                lo = mid;
            } else {
                hi = mid - 1;
            }
        }

        return lo > 0 ? clean.substring(0, lo) + ellipsis : ellipsis;
    }

    // ========================================
    // Scroll Input
    // ========================================

    private setupScrollInput(): void {
        this.stepListViewport.onPointerDownObservable.add((info) => {
            if (this.dragState?.active) return;
            if (this.scrollDragging) return;
            this.scrollDragging = true;
            this.scroller.onPointerDown(info.y);
        });

        this.overlay.onPointerMoveObservable.add((info) => {
            // Track pointer movement for long-press cancellation
            if (this.dragState && !this.dragState.active) {
                this.dragState.currentY = info.y;
                const dy = Math.abs(info.y - this.dragState.startY);
                if (dy >= 5) {
                    // Moved too far — cancel hold timer (it's a scroll)
                    this.cancelDragHoldTimer();
                }
            }

            // If drag reorder is active, update drag position
            if (this.dragState?.active) {
                this.updateDragReorder(info.y);
                return;
            }

            if (!this.scrollDragging) return;
            this.scroller.onPointerMove(info.y);
        });

        // pointerUp on overlay
        this.overlay.onPointerUpObservable.add(() => {
            if (this.dragState?.active) {
                this.endDragReorder();
                return;
            }
            this.cancelDragHoldTimer();
            this.endScrollDrag();
        });

        this.overlay.onWheelObservable.add((info) => {
            if (this.dragState?.active) return;
            this.scroller.onWheel(info.y * 40);
        });
    }

    /** 스크롤 드래그 종료 (entry 클릭 시에도 호출) */
    private endScrollDrag(): void {
        if (!this.scrollDragging) return;
        this.scrollDragging = false;
        this.scroller.onPointerUp();
    }

    private updateScrollPosition(offset: number): void {
        this.stepListContent.topInPixels = -offset;

        if (!this.currentDims) return;

        const viewportH = this.stepListViewport.heightInPixels;
        const contentH = this.stepListContent.heightInPixels;

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
        const indicatorTop = this.currentDims.panelPaddingTop +
            scrollRatio * (viewportH - indicatorH);

        this.scrollIndicator.heightInPixels = Math.floor(indicatorH);
        this.scrollIndicator.topInPixels = Math.round(indicatorTop);
    }

    private updateScrollIndicator(isScrolling: boolean): void {
        if (this.indicatorTimeoutId !== null) {
            clearTimeout(this.indicatorTimeoutId);
            this.indicatorTimeoutId = null;
        }

        if (isScrolling) {
            this.fadeIndicator(0.5);
        } else {
            this.indicatorTimeoutId = window.setTimeout(() => {
                if (!this.scroller.isDragging) {
                    this.fadeIndicator(0);
                }
            }, ANIM.DIALOGUE_LOG.SCROLL_INDICATOR_HIDE_DELAY);
        }
    }

    private fadeIndicator(targetAlpha: number): void {
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
            this.stepListContent.heightInPixels,
            this.stepListViewport.heightInPixels
        );
    }

    // ========================================
    // Drag Reorder
    // ========================================

    private cancelDragHoldTimer(): void {
        if (this.dragState?.holdTimer != null) {
            clearTimeout(this.dragState.holdTimer);
            this.dragState.holdTimer = null;
        }
    }

    /**
     * Builds a map of visible entry indices to their top offsets and heights.
     * Returns entries in display order (top to bottom).
     */
    private getVisibleEntryLayout(): { stepIndex: number; top: number; height: number }[] {
        const layout: { stepIndex: number; top: number; height: number }[] = [];
        for (const [stepIdx, ctrlIdx] of this.entryIndexMap.entries()) {
            const ctrl = this.entryControls[ctrlIdx] as GUI.Rectangle;
            layout.push({
                stepIndex: stepIdx,
                top: ctrl.topInPixels,
                height: ctrl.heightInPixels,
            });
        }
        layout.sort((a, b) => a.top - b.top);
        return layout;
    }

    private startDragReorder(stepIndex: number, pointerY: number, entryHeight: number): void {
        if (!this.currentDims) return;

        // Cancel scroll if in progress
        if (this.scrollDragging) {
            this.endScrollDrag();
        }

        const d = this.currentDims;
        const innerWidth = d.panelWidth - d.panelPaddingH * 2;
        const effectiveWidth = this.compactMode ? innerWidth : d.stepListWidth;

        // Mark drag as active
        this.dragState = {
            active: true,
            stepIndex,
            startY: pointerY,
            currentY: pointerY,
            holdTimer: null,
            entryHeight,
        };

        // Find the original entry control and fade it (placeholder)
        const entryIdx = this.entryIndexMap.get(stepIndex);
        if (entryIdx != null) {
            const origCtrl = this.entryControls[entryIdx] as GUI.Rectangle;
            origCtrl.alpha = 0.3;
            this.dragPlaceholder = origCtrl;
        }

        // Save original entry positions for slot-opening animation
        this.dragOriginalTops.clear();
        for (let i = 0; i < this.entryControls.length; i++) {
            const ctrl = this.entryControls[i] as GUI.Rectangle;
            this.dragOriginalTops.set(i, ctrl.topInPixels);
        }

        // Create ghost element (floating in contentBox, above scroll clip)
        const ghost = new GUI.Rectangle('DragGhost');
        ghost.widthInPixels = effectiveWidth - 8;
        ghost.heightInPixels = Math.min(entryHeight, d.stepListEntryHeight);
        ghost.thickness = 2;
        ghost.color = COLORS.SYSTEM_ACCENT;
        ghost.background = 'rgba(51, 195, 255, 0.15)';
        ghost.cornerRadius = 6;
        ghost.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        ghost.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        ghost.leftInPixels = d.panelPaddingH + 4;
        ghost.isHitTestVisible = false;
        ghost.zIndex = 100;
        ghost.alpha = 0.75;
        ghost.scaleY = 0.88;

        // Ghost text — show step preview
        const step = this.steps[stepIndex];
        if (step) {
            const previewText = this.getStepPreview(step);
            const truncated = this.truncateText(previewText, effectiveWidth - 40, d.stepPreviewFontSize);
            const ghostText = new GUI.TextBlock('DragGhostText');
            ghostText.text = truncated;
            ghostText.color = COLORS.TEXT_WHITE;
            ghostText.fontSizeInPixels = d.stepPreviewFontSize;
            ghostText.fontFamily = FONT.FAMILY.BODY;
            ghostText.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
            ghostText.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_CENTER;
            ghostText.leftInPixels = 12;
            ghostText.isHitTestVisible = false;
            ghost.addControl(ghostText);
        }

        // Position ghost at current pointer Y relative to contentBox
        // Convert raw ADT pointer Y to scaler space before subtracting scaler-space offsets
        const scalerY = this.pointerToScalerY(pointerY);
        const pointerInContent = scalerY - this.getContentBoxScreenTop();
        ghost.topInPixels = pointerInContent - ghost.heightInPixels / 2;

        this.contentBox.addControl(ghost);
        this.dragGhost = ghost;

        // Create insertion indicator line
        const indicator = new GUI.Rectangle('DragIndicator');
        indicator.widthInPixels = effectiveWidth - 16;
        indicator.heightInPixels = 3;
        indicator.thickness = 0;
        indicator.background = COLORS.SYSTEM_ACCENT;
        indicator.cornerRadius = 2;
        indicator.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
        indicator.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
        indicator.leftInPixels = d.panelPaddingH + 8;
        indicator.isHitTestVisible = false;
        indicator.zIndex = 99;
        indicator.isVisible = false;

        this.contentBox.addControl(indicator);
        this.dragIndicator = indicator;

        this.updateDragReorder(pointerY);
    }

    /**
     * Convert raw pointer Y (ADT/CSS pixel space) to scaler coordinate space.
     * BabylonJS GUI observable callbacks deliver coordinates in the ADT's native
     * pixel space, not the rootScaler's logical space. Dividing by rootScale
     * converts to scaler coordinates matching control dimensions.
     */
    private pointerToScalerY(rawY: number): number {
        if (!this.currentScaleInfo) return rawY;
        return rawY / this.currentScaleInfo.rootScale;
    }

    /**
     * Get the scaler-space Y position of the top of contentBox.
     * contentBox is CENTER-aligned, so its top = (scalerH - panelHeight) / 2.
     */
    private getContentBoxScreenTop(): number {
        if (!this.currentDims || !this.currentScaleInfo) return 0;
        const d = this.currentDims;
        const scalerH = this.currentScaleInfo.scalerHeight;
        return (scalerH - d.panelHeight) / 2;
    }

    private updateDragReorder(pointerY: number): void {
        if (!this.dragState?.active || !this.currentDims) return;

        this.dragState.currentY = pointerY;
        const d = this.currentDims;

        // Convert raw ADT pointer Y to scaler space
        const scalerY = this.pointerToScalerY(pointerY);

        // Position ghost relative to contentBox (scaler coords)
        const contentBoxTop = this.getContentBoxScreenTop();
        const pointerInBox = scalerY - contentBoxTop;

        if (this.dragGhost) {
            this.dragGhost.topInPixels = pointerInBox - this.dragGhost.heightInPixels / 2;
        }

        // Reset entry positions to originals before computing drop target
        // (so getVisibleEntryLayout/getDropTargetIndex see clean positions)
        this.resetEntryPositions();

        // Determine drop target and position indicator
        const targetIdx = this.getDropTargetIndex(pointerY);
        const layout = this.getVisibleEntryLayout();
        const viewportTop = d.panelPaddingTop;
        const scrollOffset = -this.stepListContent.topInPixels;

        if (layout.length > 0 && this.dragIndicator) {
            let indicatorContentY: number;
            if (targetIdx <= 0) {
                indicatorContentY = layout[0].top;
            } else if (targetIdx >= layout.length) {
                const last = layout[layout.length - 1];
                indicatorContentY = last.top + last.height;
            } else {
                indicatorContentY = layout[targetIdx].top;
            }

            const indicatorBoxY = viewportTop + indicatorContentY - scrollOffset;
            this.dragIndicator.topInPixels = indicatorBoxY - 1.5;
            this.dragIndicator.isVisible = true;
        }

        // Apply slot-opening gap: shift entries at/after the drop target down
        this.applyDragSlotGap(layout, targetIdx);

        // Auto-scroll when dragging near viewport edges
        this.handleDragAutoScroll(scalerY, contentBoxTop, d);
    }

    /** Reset all entry controls to their original topInPixels (before gap offsets) */
    private resetEntryPositions(): void {
        for (const [ctrlIdx, origTop] of this.dragOriginalTops) {
            const ctrl = this.entryControls[ctrlIdx] as GUI.Rectangle | undefined;
            if (ctrl) ctrl.topInPixels = origTop;
        }
    }

    /** Push entries at/after the drop target down to create a visual slot gap */
    private applyDragSlotGap(
        layout: { stepIndex: number; top: number; height: number }[],
        dropVisibleIdx: number
    ): void {
        if (!this.dragState || layout.length === 0 || !this.currentDims) return;

        const gapSize = this.dragState.entryHeight * 0.5;

        // Shift all entries at/after the drop position (including the placeholder).
        // This prevents overlap between shifted and unshifted entries.
        for (let i = dropVisibleIdx; i < layout.length; i++) {
            const ctrlIdx = this.entryIndexMap.get(layout[i].stepIndex);
            if (ctrlIdx == null) continue;
            const ctrl = this.entryControls[ctrlIdx] as GUI.Rectangle | undefined;
            if (ctrl) ctrl.topInPixels += gapSize;
        }
    }

    /** Auto-scroll rAF handle for drag near edges */
    private dragAutoScrollTimer: number | null = null;

    /**
     * Compute auto-scroll intensity from current pointer position.
     * Returns [-1, 1]: negative = scroll up, positive = scroll down, 0 = no scroll.
     * Intensity increases as pointer moves further beyond the edge zone boundary,
     * with extra acceleration when pointer is outside the viewport entirely.
     */
    private getDragScrollIntensity(scalerY: number): number {
        if (!this.currentDims || !this.currentScaleInfo) return 0;
        const d = this.currentDims;
        const contentBoxTop = this.getContentBoxScreenTop();
        const viewportTop = contentBoxTop + d.panelPaddingTop;
        const viewportBottom = contentBoxTop + d.panelHeight - d.panelPaddingBottom;
        const edgeZone = 60; // inner zone: gentle scroll
        const outerBoost = 120; // beyond viewport edge: aggressive ramp

        if (scalerY < viewportTop + edgeZone) {
            // How far into the edge zone (0 = just entered, 1 = at viewport top)
            const intoEdge = (viewportTop + edgeZone) - scalerY;
            // Gentle 0→1 within the 60px edge zone
            const base = Math.min(1, intoEdge / edgeZone);
            // Beyond viewport top: extra acceleration up to 2x
            const beyond = Math.max(0, viewportTop - scalerY);
            const boost = Math.min(1, beyond / outerBoost);
            return -(base + boost);
        } else if (scalerY > viewportBottom - edgeZone) {
            const intoEdge = scalerY - (viewportBottom - edgeZone);
            const base = Math.min(1, intoEdge / edgeZone);
            const beyond = Math.max(0, scalerY - viewportBottom);
            const boost = Math.min(1, beyond / outerBoost);
            return base + boost;
        }
        return 0;
    }

    private handleDragAutoScroll(
        scalerY: number,
        _contentBoxTop: number,
        d: EditorPanelDimensions
    ): void {
        const intensity = this.getDragScrollIntensity(scalerY);

        if (Math.abs(intensity) < 0.05) {
            this.stopDragAutoScroll();
            return;
        }

        // Start auto-scroll loop if not already running
        if (this.dragAutoScrollTimer != null) return;

        const baseSpeed = 3; // scaler pixels per frame at intensity 1.0

        const scrollStep = () => {
            if (!this.dragState?.active) {
                this.stopDragAutoScroll();
                return;
            }

            // Re-read pointer position each frame for responsive speed changes
            const currentScalerY = this.pointerToScalerY(this.dragState.currentY);
            const frameIntensity = this.getDragScrollIntensity(currentScalerY);

            if (Math.abs(frameIntensity) < 0.05) {
                this.stopDragAutoScroll();
                return;
            }

            // Ease-in curve: slow start, fast at extremes
            const eased = Math.sign(frameIntensity) * (frameIntensity * frameIntensity);
            const delta = eased * baseSpeed;

            const currentOffset = -this.stepListContent.topInPixels;
            const contentH = this.stepListContent.heightInPixels;
            const viewportH = this.stepListViewport.heightInPixels;
            const maxOffset = Math.max(0, contentH - viewportH);
            const newOffset = Math.max(0, Math.min(maxOffset, currentOffset + delta));
            this.stepListContent.topInPixels = -newOffset;

            // Reset positions, recompute drop target, reapply gap + indicator
            this.resetEntryPositions();
            const layout = this.getVisibleEntryLayout();
            const targetIdx = this.getDropTargetIndex(this.dragState.currentY);
            const scrollOffset = newOffset;
            const vTop = d.panelPaddingTop;

            if (this.dragIndicator && layout.length > 0) {
                let indicatorContentY: number;
                if (targetIdx <= 0) {
                    indicatorContentY = layout[0].top;
                } else if (targetIdx >= layout.length) {
                    const last = layout[layout.length - 1];
                    indicatorContentY = last.top + last.height;
                } else {
                    indicatorContentY = layout[targetIdx].top;
                }
                this.dragIndicator.topInPixels = vTop + indicatorContentY - scrollOffset - 1.5;
            }
            this.applyDragSlotGap(layout, targetIdx);

            this.dragAutoScrollTimer = requestAnimationFrame(scrollStep);
        };
        this.dragAutoScrollTimer = requestAnimationFrame(scrollStep);
    }

    private stopDragAutoScroll(): void {
        if (this.dragAutoScrollTimer != null) {
            cancelAnimationFrame(this.dragAutoScrollTimer);
            this.dragAutoScrollTimer = null;
        }
    }

    /**
     * Returns the visible-entry insertion index (0-based in visible order)
     * where the dragged item would be dropped.
     */
    private getDropTargetIndex(pointerY: number): number {
        if (!this.currentDims) return 0;
        const d = this.currentDims;
        const layout = this.getVisibleEntryLayout();
        if (layout.length === 0) return 0;

        const contentBoxTop = this.getContentBoxScreenTop();
        const viewportTop = d.panelPaddingTop;
        const scrollOffset = -this.stepListContent.topInPixels;

        // Convert raw ADT pointer Y to scaler space, then to stepListContent coords
        const scalerY = this.pointerToScalerY(pointerY);
        const pointerInContent = (scalerY - contentBoxTop - viewportTop) + scrollOffset;

        for (let i = 0; i < layout.length; i++) {
            const midY = layout[i].top + layout[i].height / 2;
            if (pointerInContent < midY) {
                return i;
            }
        }
        return layout.length;
    }

    private endDragReorder(): void {
        if (!this.dragState?.active) {
            this.cleanupDragReorder();
            return;
        }

        const fromStepIndex = this.dragState.stepIndex;
        const layout = this.getVisibleEntryLayout();
        const dropVisibleIdx = this.getDropTargetIndex(this.dragState.currentY);

        // Find the fromIndex position in layout
        const fromVisibleIdx = layout.findIndex(e => e.stepIndex === fromStepIndex);

        this.cleanupDragReorder();

        if (fromVisibleIdx < 0) return;

        // Convert visible drop index to actual step index.
        // moveStep(from, to) does splice(from,1) then splice(to,0,item),
        // so 'to' is the post-removal insertion index.
        let toStepIndex: number;
        if (dropVisibleIdx <= 0) {
            // Before the first visible entry
            toStepIndex = layout[0].stepIndex;
            if (fromStepIndex < toStepIndex) {
                toStepIndex--;
            }
        } else if (dropVisibleIdx >= layout.length) {
            // After the last visible entry
            toStepIndex = layout[layout.length - 1].stepIndex;
            // No adjustment: splice(to) on post-removal array appends correctly
        } else {
            toStepIndex = layout[dropVisibleIdx].stepIndex;
            if (fromStepIndex < toStepIndex) {
                toStepIndex--;
            }
        }

        // No-op if dropping in the same spot
        if (fromStepIndex === toStepIndex) return;
        // Also no-op if dropping immediately after its own position
        if (dropVisibleIdx === fromVisibleIdx + 1) return;

        this.callbacks.onMoveStep?.(fromStepIndex, toStepIndex);
    }

    private cancelDragReorder(): void {
        this.cancelDragHoldTimer();
        this.cleanupDragReorder();
    }

    private cleanupDragReorder(): void {
        // Stop auto-scroll
        this.stopDragAutoScroll();

        // Restore original entry positions (undo slot gap offsets)
        this.resetEntryPositions();
        this.dragOriginalTops.clear();

        // Remove ghost
        if (this.dragGhost) {
            this.contentBox.removeControl(this.dragGhost);
            this.dragGhost.dispose();
            this.dragGhost = null;
        }

        // Remove indicator
        if (this.dragIndicator) {
            this.contentBox.removeControl(this.dragIndicator);
            this.dragIndicator.dispose();
            this.dragIndicator = null;
        }

        // Restore placeholder alpha
        if (this.dragPlaceholder) {
            this.dragPlaceholder.alpha = 1.0;
            this.dragPlaceholder = null;
        }

        this.dragState = null;
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
    // DOM Edit Form (structured data editing)
    // ========================================

    private showEditForm(step: ScenarioStep, index: number): void {
        this.hideEditForm();

        const canvas = document.querySelector('canvas');
        if (!canvas) return;

        const container = document.createElement('div');
        container.id = 'editor-panel-edit-form';
        container.style.cssText = `
            position: fixed;
            top: 0; left: 0; right: 0; bottom: 0;
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
            background: rgba(0, 0, 0, 0.6);
            font-family: Arial, sans-serif;
        `;

        const form = document.createElement('div');
        form.style.cssText = `
            background: #0a1628;
            border: 1px solid rgba(100, 180, 255, 0.3);
            border-radius: 12px;
            padding: 24px;
            min-width: 400px;
            max-width: 600px;
            width: 90%;
            color: #ffffff;
            box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
        `;

        // Mutable copy of step data
        let currentType: ScenarioStep['type'] = step.type;
        let speaker = '';
        let text = '';
        let duration = 2000;
        let eventName = '';
        let payloadStr = '';

        if (step.type === 'dialogue') {
            speaker = step.speaker;
            text = step.text;
        } else if (step.type === 'narration') {
            text = step.text;
        } else if (step.type === 'auto') {
            speaker = step.speaker ?? '';
            text = step.text ?? '';
            duration = step.duration;
        } else if (step.type === 'event') {
            eventName = step.event;
            payloadStr = step.payload != null ? JSON.stringify(step.payload, null, 2) : '';
        }

        // Helper to create labeled input
        const createField = (label: string, element: HTMLElement): HTMLDivElement => {
            const row = document.createElement('div');
            row.style.cssText = 'margin-bottom: 12px;';

            const lbl = document.createElement('label');
            lbl.textContent = label;
            lbl.style.cssText = 'display: block; margin-bottom: 4px; color: #FFD700; font-size: 13px;';

            row.appendChild(lbl);
            row.appendChild(element);
            return row;
        };

        const inputStyle = `
            width: 100%;
            box-sizing: border-box;
            padding: 8px 10px;
            background: rgba(255, 255, 255, 0.08);
            border: 1px solid rgba(255, 255, 255, 0.2);
            border-radius: 6px;
            color: #ffffff;
            font-family: Arial, sans-serif;
            font-size: 14px;
            outline: none;
        `;

        const textareaStyle = `${inputStyle} resize: vertical; min-height: 80px;`;

        // Title
        const title = document.createElement('div');
        title.textContent = `Edit Step #${index}`;
        title.style.cssText = 'font-size: 18px; font-weight: bold; margin-bottom: 16px; color: #33C3FF;';
        form.appendChild(title);

        // Type selector
        const typeSelect = document.createElement('select');
        typeSelect.style.cssText = inputStyle;
        for (const t of ['narration', 'dialogue', 'auto', 'event'] as const) {
            const opt = document.createElement('option');
            opt.value = t;
            opt.textContent = t.charAt(0).toUpperCase() + t.slice(1);
            opt.style.cssText = 'background: #0a1628; color: #ffffff;';
            if (t === currentType) opt.selected = true;
            typeSelect.appendChild(opt);
        }
        form.appendChild(createField('Type', typeSelect));

        // Speaker input
        const speakerInput = document.createElement('input');
        speakerInput.type = 'text';
        speakerInput.value = speaker;
        speakerInput.placeholder = 'Speaker name';
        speakerInput.style.cssText = inputStyle;
        const speakerRow = createField('Speaker', speakerInput);
        form.appendChild(speakerRow);

        // Text textarea
        const textArea = document.createElement('textarea');
        textArea.value = text;
        textArea.placeholder = 'Text content';
        textArea.style.cssText = textareaStyle;
        const textRow = createField('Text', textArea);
        form.appendChild(textRow);

        // Duration input
        const durationInput = document.createElement('input');
        durationInput.type = 'number';
        durationInput.value = String(duration);
        durationInput.min = '0';
        durationInput.step = '100';
        durationInput.style.cssText = inputStyle;
        const durationRow = createField('Duration (ms)', durationInput);
        form.appendChild(durationRow);

        // Event name input
        const eventInput = document.createElement('input');
        eventInput.type = 'text';
        eventInput.value = eventName;
        eventInput.placeholder = 'Event name';
        eventInput.style.cssText = inputStyle;
        const eventRow = createField('Event Name', eventInput);
        form.appendChild(eventRow);

        // Payload textarea
        const payloadArea = document.createElement('textarea');
        payloadArea.value = payloadStr;
        payloadArea.placeholder = '{ "key": "value" }';
        payloadArea.style.cssText = textareaStyle;
        const payloadRow = createField('Payload (JSON)', payloadArea);
        form.appendChild(payloadRow);

        // Visibility toggle based on type
        const updateFieldVisibility = () => {
            const t = typeSelect.value as ScenarioStep['type'];
            currentType = t;

            const showSpeaker = t === 'dialogue' || t === 'auto';
            const showText = t === 'narration' || t === 'dialogue' || t === 'auto';
            const showDuration = t === 'auto';
            const showEvent = t === 'event';
            const showPayload = t === 'event';

            speakerRow.style.display = showSpeaker ? 'block' : 'none';
            textRow.style.display = showText ? 'block' : 'none';
            durationRow.style.display = showDuration ? 'block' : 'none';
            eventRow.style.display = showEvent ? 'block' : 'none';
            payloadRow.style.display = showPayload ? 'block' : 'none';
        };

        typeSelect.addEventListener('change', updateFieldVisibility);
        updateFieldVisibility();

        // Button row
        const btnRow = document.createElement('div');
        btnRow.style.cssText = 'display: flex; gap: 12px; justify-content: flex-end; margin-top: 20px;';

        const btnStyle = `
            padding: 8px 20px;
            border-radius: 6px;
            border: 1px solid rgba(255, 255, 255, 0.3);
            font-family: Arial, sans-serif;
            font-size: 14px;
            cursor: pointer;
            outline: none;
        `;

        const cancelBtn = document.createElement('button');
        cancelBtn.textContent = 'Cancel';
        cancelBtn.style.cssText = `${btnStyle} background: rgba(255, 255, 255, 0.08); color: #ffffff;`;
        cancelBtn.addEventListener('click', () => this.hideEditForm());

        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.style.cssText = `${btnStyle} background: rgba(51, 195, 255, 0.3); color: #33C3FF; border-color: #33C3FF;`;
        saveBtn.addEventListener('click', () => {
            const newStep = this.buildStepFromForm(
                currentType,
                speakerInput.value,
                textArea.value,
                durationInput.value,
                eventInput.value,
                payloadArea.value
            );

            if (newStep) {
                this.hideEditForm();
                this.callbacks.onEdit?.(index);

                // Dispatch custom event with new step data for the controller to pick up
                const event = new CustomEvent('editor-panel-step-edited', {
                    detail: { index, step: newStep }
                });
                window.dispatchEvent(event);
            }
        });

        btnRow.appendChild(cancelBtn);
        btnRow.appendChild(saveBtn);
        form.appendChild(btnRow);

        container.appendChild(form);

        // Close on backdrop click
        container.addEventListener('click', (e) => {
            if (e.target === container) {
                this.hideEditForm();
            }
        });

        // Close on Escape
        const escHandler = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                this.hideEditForm();
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
        (container as HTMLDivElement & { _escCleanup?: () => void })._escCleanup = () => {
            document.removeEventListener('keydown', escHandler);
        };

        document.body.appendChild(container);
        this.editFormContainer = container;
    }

    private buildStepFromForm(
        type: ScenarioStep['type'],
        speaker: string,
        text: string,
        durationStr: string,
        eventName: string,
        payloadStr: string
    ): ScenarioStep | null {
        switch (type) {
            case 'narration':
                return { type: 'narration', text: text || '' };
            case 'dialogue':
                return { type: 'dialogue', speaker: speaker || '', text: text || '' };
            case 'auto': {
                const dur = parseInt(durationStr, 10);
                const result: ScenarioStep = {
                    type: 'auto',
                    duration: isNaN(dur) ? 2000 : dur,
                };
                if (speaker) (result as import('../engines/narrative/types').AutoStep).speaker = speaker;
                if (text) (result as import('../engines/narrative/types').AutoStep).text = text;
                return result;
            }
            case 'event': {
                let payload: unknown = undefined;
                if (payloadStr.trim()) {
                    try {
                        payload = JSON.parse(payloadStr);
                    } catch {
                        // Invalid JSON — keep as string
                        payload = payloadStr;
                    }
                }
                const result: ScenarioStep = {
                    type: 'event',
                    event: eventName || '',
                };
                if (payload !== undefined) {
                    (result as import('../engines/narrative/types').EventStep).payload = payload;
                }
                return result;
            }
            default:
                return null;
        }
    }

    private hideEditForm(): void {
        if (this.editFormContainer) {
            const cleanup = (this.editFormContainer as HTMLDivElement & { _escCleanup?: () => void })._escCleanup;
            cleanup?.();
            this.editFormContainer.remove();
            this.editFormContainer = null;
        }
    }
}
