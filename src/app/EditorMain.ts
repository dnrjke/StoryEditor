/**
 * StoryEditor - Main Entry Point
 *
 * 2Test1 내러티브 엔진 기반 시나리오 편집 도구.
 * 천구/스플래시/터치스타트 제거 — 에디터 모드로 직접 시작.
 */

import * as BABYLON from '@babylonjs/core';
import * as GUI from '@babylonjs/gui';

// Shared systems
import { GUIManager } from '../shared/ui/GUIManager';
import { BackgroundLayer } from '../shared/ui/BackgroundLayer';
import { BottomVignetteLayer } from '../shared/ui/BottomVignetteLayer';
import { CharacterLayer } from '../shared/ui/CharacterLayer';
import { COLORS, FONT, RUNTIME_SAFE_AREA, applyDeviceSafeArea } from '../shared/design';

// Narrative engine
import { NarrativeEngine } from '../engines/narrative';
import type { ScenarioStep } from '../engines/narrative/types';

// Editor
import { EditorFlowController } from './EditorFlowController';
import { EditorController } from '../editor/EditorController';
import { EditorPanel } from '../editor/EditorPanel';
import { serializeScenarioYaml } from '../editor/ScenarioSerializer';
import { parseScenarioYaml } from '../engines/narrative/scenario/parseScenarioYaml';
import * as jsYaml from 'js-yaml';

// Stories
import { INTRO_STORY } from './data/stories';

// ============================================
// Main Entry Point
// ============================================

function main() {
    const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
    if (!canvas) {
        console.error('[EditorMain] Canvas not found');
        return;
    }

    // Create Babylon Engine (WebGL2)
    const engine = new BABYLON.Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
    });

    // Create Scene
    const scene = new BABYLON.Scene(engine);
    scene.clearColor = new BABYLON.Color4(0, 0, 0, 1);

    // Camera (stationary, for background rendering)
    const camera = new BABYLON.ArcRotateCamera(
        'camera',
        -Math.PI / 2,
        Math.PI / 2,
        10,
        BABYLON.Vector3.Zero(),
        scene,
    );
    camera.minZ = 0.1;
    camera.maxZ = 100;

    // Lighting
    const hemi = new BABYLON.HemisphericLight(
        'hemiLight',
        new BABYLON.Vector3(0, 1, 0),
        scene,
    );
    hemi.intensity = 0.15;

    // ============================================
    // GUI Layer Setup (HEBS Compliant)
    // ============================================
    const guiManager = new GUIManager(scene);
    const scaleInfo = guiManager.getScaleInfo();

    // Apply device safe area insets (notch, home indicator)
    applyDeviceSafeArea(scaleInfo.rootScale);
    const displayLayer = guiManager.getDisplayLayer();

    const backgroundLayer = new BackgroundLayer(displayLayer);
    const bottomVignetteLayer = new BottomVignetteLayer(displayLayer);
    const characterLayer = new CharacterLayer(displayLayer);

    // Show background + vignette by default (narrative mode)
    backgroundLayer.show();
    backgroundLayer.setColor(COLORS.BG_SPLASH);
    bottomVignetteLayer.show();

    // ============================================
    // Narrative Engine
    // ============================================
    const narrativeEngine = new NarrativeEngine(
        guiManager.getInteractionLayer(),
        displayLayer,
        guiManager.getSkipLayer(),
        guiManager.onScaleChanged,
        scaleInfo,
        guiManager.getSystemLayer()
    );

    // ============================================
    // Editor Flow Controller (simplified event handler)
    // ============================================
    const editorFlow = new EditorFlowController({
        backgroundLayer,
        bottomVignetteLayer,
        characterLayer,
    });

    // ============================================
    // Editor Controller (central coordinator)
    // ============================================
    const editorController = new EditorController(narrativeEngine, editorFlow);

    // ============================================
    // Auto-save toast notification (좌상단 GUI)
    // ============================================
    const autoSaveToast = new GUI.TextBlock('AutoSaveToast');
    autoSaveToast.text = 'Auto-saved';
    autoSaveToast.color = COLORS.SYSTEM_ACCENT;
    autoSaveToast.fontFamily = FONT.FAMILY.BODY;
    autoSaveToast.fontSizeInPixels = 16;
    autoSaveToast.textHorizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    autoSaveToast.textVerticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    autoSaveToast.horizontalAlignment = GUI.Control.HORIZONTAL_ALIGNMENT_LEFT;
    autoSaveToast.verticalAlignment = GUI.Control.VERTICAL_ALIGNMENT_TOP;
    autoSaveToast.leftInPixels = RUNTIME_SAFE_AREA.LEFT + 12;
    autoSaveToast.topInPixels = RUNTIME_SAFE_AREA.TOP + 12;
    autoSaveToast.widthInPixels = 140;
    autoSaveToast.heightInPixels = 28;
    autoSaveToast.alpha = 0;
    autoSaveToast.isHitTestVisible = false;
    guiManager.getSkipLayer().addControl(autoSaveToast);

    let toastFadeTimer: number | null = null;
    function showAutoSaveToast() {
        autoSaveToast.alpha = 1;
        if (toastFadeTimer !== null) clearTimeout(toastFadeTimer);
        // 1.5초 후 페이드 아웃
        toastFadeTimer = window.setTimeout(() => {
            const startAt = performance.now();
            const dur = 600;
            const fadeStep = () => {
                const t = Math.min(1, (performance.now() - startAt) / dur);
                autoSaveToast.alpha = 1 - t;
                if (t < 1) requestAnimationFrame(fadeStep);
            };
            requestAnimationFrame(fadeStep);
            toastFadeTimer = null;
        }, 1500);
    }
    editorController.getSaveManager().onAutoSaved = showAutoSaveToast;

    // ============================================
    // Auto-save preview state (토글 시 stash/restore)
    // ============================================
    let stashedSequence: import('../engines/narrative/types').ScenarioSequence | null = null;

    // ============================================
    // Editor Panel (edit UI overlay)
    // ============================================
    const editorPanel = new EditorPanel(
        guiManager.getSystemLayer(),
        guiManager.onScaleChanged,
        scaleInfo,
        {
            onInsertBefore: (index) => {
                const defaultStep: ScenarioStep = { type: 'narration', text: '(새 텍스트)' };
                editorController.insertStep(index - 1, defaultStep);
                editorPanel.updateSteps(narrativeEngine.getSteps());
                editorPanel.setSelectedIndex(index);
            },
            onInsertAfter: (index) => {
                const defaultStep: ScenarioStep = { type: 'narration', text: '(새 텍스트)' };
                editorController.insertStep(index, defaultStep);
                editorPanel.updateSteps(narrativeEngine.getSteps());
                editorPanel.setSelectedIndex(index + 1);
            },
            onEdit: (_index) => {
                // Edit is handled internally by EditorPanel DOM form
                // The panel dispatches 'editor-panel-step-edited' event
            },
            onDelete: (index) => {
                editorController.deleteStep(index);
                editorPanel.updateSteps(narrativeEngine.getSteps());
            },
            onMoveUp: (index) => {
                if (index > 0) {
                    editorController.moveStep(index, index - 1);
                    editorPanel.updateSteps(narrativeEngine.getSteps());
                    editorPanel.setSelectedIndex(index - 1);
                }
            },
            onMoveDown: (index) => {
                const count = narrativeEngine.getStepCount();
                if (index < count - 1) {
                    editorController.moveStep(index, index + 1);
                    editorPanel.updateSteps(narrativeEngine.getSteps());
                    editorPanel.setSelectedIndex(index + 1);
                }
            },
            onMoveStep: (fromIndex, toIndex) => {
                editorController.moveStep(fromIndex, toIndex);
                editorPanel.updateSteps(narrativeEngine.getSteps());
                editorPanel.setSelectedIndex(toIndex);
            },
            onSave: () => {
                editorController.saveScenario();
            },
            onImport: () => {
                editorController.importFile(() => {
                    editorPanel.updateSteps(narrativeEngine.getSteps());
                });
            },
            onNew: () => {
                editorController.newScenario(() => {
                    editorPanel.updateSteps(narrativeEngine.getSteps());
                });
            },
            onJumpTo: (index) => {
                editorController.jumpToStep(index);
            },
            onCopyYaml: () => {
                const seq = editorController.getCurrentSequence();
                if (!seq) return;
                const yamlText = serializeScenarioYaml(seq);
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    navigator.clipboard.writeText(yamlText).then(
                        () => console.log('[EditorMain] YAML copied to clipboard'),
                        () => fallbackCopy(yamlText)
                    );
                } else {
                    fallbackCopy(yamlText);
                }
            },
            onPasteYaml: () => {
                if (!navigator.clipboard || !navigator.clipboard.readText) {
                    console.warn('[EditorMain] Clipboard API not available');
                    return;
                }
                navigator.clipboard.readText().then((yamlText) => {
                    if (!yamlText.trim()) return;
                    try {
                        const rawObj = jsYaml.load(yamlText);
                        const parsed = parseScenarioYaml(rawObj, 'clipboard');
                        editorController.loadScenario(parsed);
                        editorPanel.updateSteps(narrativeEngine.getSteps());
                        console.log('[EditorMain] YAML pasted from clipboard');
                    } catch (e) {
                        console.error('[EditorMain] Paste failed:', e);
                        alert(`Paste failed: ${e instanceof Error ? e.message : String(e)}`);
                    }
                }).catch((e) => {
                    console.error('[EditorMain] Clipboard read failed:', e);
                });
            },
            onPreviewAutoSave: (enabled) => {
                const currentSeq = editorController.getCurrentSequence();
                if (enabled) {
                    // Stash current and swap to auto-save data (no playback restart)
                    if (currentSeq) {
                        stashedSequence = JSON.parse(JSON.stringify(currentSeq));
                        const autoSaved = saveManager.loadAutoSave(currentSeq.id);
                        if (autoSaved) {
                            narrativeEngine.replaceSequence(autoSaved);
                            editorPanel.updateSteps(narrativeEngine.getSteps());
                            console.log('[EditorMain] Auto-save preview ON');
                        } else {
                            stashedSequence = null;
                            console.warn('[EditorMain] No auto-save data found');
                        }
                    }
                } else {
                    // Restore stashed (no playback restart)
                    if (stashedSequence) {
                        narrativeEngine.replaceSequence(stashedSequence);
                        editorPanel.updateSteps(narrativeEngine.getSteps());
                        stashedSequence = null;
                        console.log('[EditorMain] Auto-save preview OFF — restored');
                    }
                }
            },
            onUndo: () => {
                if (editorController.undo()) {
                    editorPanel.updateSteps(narrativeEngine.getSteps());
                }
            },
            onRedo: () => {
                if (editorController.redo()) {
                    editorPanel.updateSteps(narrativeEngine.getSteps());
                }
            },
            onClose: () => {
                narrativeEngine.setNarrativeUIVisible(true);
            },
        }
    );

    // Listen for step edits from DOM form
    window.addEventListener('editor-panel-step-edited', ((e: CustomEvent) => {
        const { index, step } = e.detail as { index: number; step: ScenarioStep };
        editorController.updateStep(index, step);
        editorPanel.updateSteps(narrativeEngine.getSteps());
    }) as EventListener);

    // NOTE: NarrativeEngine callbacks (onEvent, onSequenceEnd) are wired
    // inside EditorController constructor — no need to set them here.

    // ============================================
    // Wire StoryControls editor callbacks (nav + edit buttons)
    // ============================================
    narrativeEngine.setEditorCallbacks({
        onStepBack: () => editorController.stepBack(),
        onStepForward: () => editorController.stepForward(),
        onToggleEdit: () => {
            if (editorPanel.isVisible) {
                editorPanel.hide();
                // hide() calls onClose which restores narrative UI
            } else {
                narrativeEngine.setNarrativeUIVisible(false);
                editorPanel.updateSteps(narrativeEngine.getSteps());
                editorPanel.setSelectedIndex(narrativeEngine.getCurrentIndex());
                editorPanel.show();
            }
        },
        getEditVisible: () => editorPanel.isVisible,
    });

    // ============================================
    // Wire DialogueLog click-to-jump
    // ============================================
    const dialogueLog = narrativeEngine.getDialogueLog();
    if (dialogueLog) {
        dialogueLog.onEntryClicked = (stepIndex: number) => {
            console.log(`[EditorMain] Log entry clicked: step ${stepIndex}`);
            narrativeEngine.closeLog();
            editorController.jumpToStep(stepIndex);
        };
    }

    // ============================================
    // Clipboard fallback (iOS Safari etc.)
    // ============================================
    function fallbackCopy(text: string): void {
        const textarea = document.createElement('textarea');
        textarea.value = text;
        textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
        document.body.appendChild(textarea);
        textarea.select();
        textarea.setSelectionRange(0, text.length);
        try {
            document.execCommand('copy');
            console.log('[EditorMain] YAML copied (fallback)');
        } catch {
            console.warn('[EditorMain] Copy failed');
        }
        document.body.removeChild(textarea);
    }

    // ============================================
    // Keyboard Shortcuts (Undo/Redo)
    // ============================================
    window.addEventListener('keydown', (e: KeyboardEvent) => {
        // Skip when focus is in an input/textarea (DOM edit forms)
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

        if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
            e.preventDefault();
            if (editorController.undo()) {
                editorPanel.updateSteps(narrativeEngine.getSteps());
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) {
            e.preventDefault();
            if (editorController.redo()) {
                editorPanel.updateSteps(narrativeEngine.getSteps());
            }
        } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
            e.preventDefault();
            if (editorController.redo()) {
                editorPanel.updateSteps(narrativeEngine.getSteps());
            }
        }
    });

    // ============================================
    // Load Default Story (with auto-save recovery)
    // ============================================
    const saveManager = editorController.getSaveManager();
    const defaultId = INTRO_STORY.id;
    if (saveManager.hasAutoSave(defaultId)) {
        const restored = saveManager.loadAutoSave(defaultId);
        if (restored && confirm('이전 자동저장 데이터가 있습니다. 복원하시겠습니까?')) {
            editorController.loadScenario(restored);
            console.log('[EditorMain] Auto-save restored');
        } else {
            editorController.loadScenario(INTRO_STORY);
        }
    } else {
        editorController.loadScenario(INTRO_STORY);
    }

    // ============================================
    // Render Loop
    // ============================================
    let isBackgrounded = false;

    engine.runRenderLoop(() => {
        if (isBackgrounded) return;
        scene.render();
    });

    // ============================================
    // App Lifecycle
    // ============================================
    document.addEventListener('visibilitychange', () => {
        isBackgrounded = document.hidden;
        if (document.hidden) {
            // Flush auto-save immediately when backgrounded (prevents data loss)
            editorController.getSaveManager().flushAutoSave();
        } else {
            engine.resize();
        }
    });

    window.addEventListener('beforeunload', () => {
        editorController.getSaveManager().flushAutoSave();
    });

    window.addEventListener('resize', () => {
        engine.resize();
        applyDeviceSafeArea(guiManager.getScaleInfo().rootScale);
    });

    console.log('[EditorMain] Story Editor initialized');
}

main();
