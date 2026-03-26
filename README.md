# Story Editor

**스타라이트 앙상블** 시나리오 편집 도구.
BabylonJS GUI 기반 비주얼 노벨 시나리오를 실시간 편집·미리보기·저장할 수 있는 웹 에디터.

## Quick Start

```bash
npm install
npm run dev      # http://localhost:5180
```

```bash
npm run build    # tsc + vite build → dist/
npm run preview  # 빌드 결과 미리보기
```

## 프로젝트 구조

```
src/
├── app/                        # 앱 진입점
│   ├── EditorMain.ts           # 엔진 초기화, 렌더 루프, 컴포넌트 배선
│   ├── EditorFlowController.ts # 내러티브 이벤트 → 시각 상태 적용
│   └── data/stories/           # YAML 시나리오 파일 (*.story.yaml 자동 등록)
│
├── editor/                     # 에디터 코어
│   ├── EditorPanel.ts          # 에디터 오버레이 UI (스텝 리스트 + 액션 패널)
│   ├── EditorPanelScale.ts     # 반응형 스케일 계산
│   ├── EditorController.ts     # 중앙 코디네이터 (CRUD, 파일 I/O, Undo/Redo)
│   ├── SaveManager.ts          # 자동 저장 (localStorage) + 수동 저장 (YAML 다운로드)
│   ├── ScenarioSerializer.ts   # ScenarioSequence ↔ YAML 변환
│   ├── StateReconstructor.ts   # 시각 상태 복원 (배경색, 캐릭터 위치)
│   └── UndoManager.ts          # Undo/Redo 스택
│
├── engines/narrative/          # 내러티브 실행 엔진
│   ├── index.ts                # 퍼사드 (NarrativeEngine 공개 API)
│   ├── types.ts                # 스텝 타입 정의
│   ├── scenario/               # 시나리오 관리 + YAML 파서
│   ├── ui/                     # DialogueBox, StoryControls, InteractionLayer
│   ├── log/                    # 대화 로그 + KineticScroller
│   └── services/               # DialogueLogger
│
└── shared/
    ├── design/                 # 디자인 토큰 (Colors, Typography, ZIndex, Scale)
    ├── config/                 # 에셋 경로
    └── ui/                     # GUIManager, BackgroundLayer, CharacterLayer
```

## 주요 기능

### 시나리오 편집
- **4가지 스텝 타입**: Narration, Dialogue, Auto, Event
- **아코디언 리스트**: 클릭으로 확장/축소, 타입 배지 컬러 표시
- **인라인 편집**: 더블클릭으로 DOM textarea 오버레이 편집
- **드래그 리오더**: 롱프레스(400ms) → 드래그로 스텝 순서 변경, 슬롯 열림 프리뷰
- **Undo/Redo**: `Ctrl+Z` / `Ctrl+Shift+Z` / `Ctrl+Y`
- **타입 필터**: 헤더 좌측 NAR/DLG/AUTO/EVT 토글로 특정 스텝 타입만 표시/숨김

### 에디터 패널 헤더
좌측부터: `[☰] [NAR] [DLG] [AUTO] [EVT]` ... `[+] [✕]` ... `[↩] [↪] [⛶] [×]`

| 버튼 | 위치 | 기능 |
|------|------|------|
| ☰ Drawer | 좌측 모서리 | 컴팩트 모드에서 액션 패널 토글 |
| NAR/DLG/AUTO/EVT | 드로어 우측 | 타입 필터 토글 |
| + (Add After) | 중앙 | 선택 스텝 뒤에 새 스텝 삽입 |
| ✕ (Delete) | 중앙 | 선택 스텝 삭제 |
| ↩ Undo | 우측 그룹 | 되돌리기 |
| ↪ Redo | 우측 그룹 | 다시 실행 |
| ⛶ Expand | 우측 모서리 | 전체 확장/축소 토글 |
| × Close | 우상단 | 에디터 패널 닫기 |

### 액션 패널 (우측)
| 버튼 | 선택 필요 | 기능 |
|------|:---------:|------|
| Jump Prev | ✓ | 선택 스텝 바로 앞 단계로 점프 |
| Jump | ✓ | 선택 스텝으로 점프 |
| + Before | ✓ | 선택 스텝 앞에 삽입 |
| + After | ✓ | 선택 스텝 뒤에 삽입 |
| Edit | ✓ | 편집 폼 열기 |
| Delete | ✓ | 스텝 삭제 |
| Move ↑ / ↓ | ✓ | 스텝 순서 이동 |
| Copy | | YAML 클립보드 복사 |
| Paste | | YAML 클립보드 붙여넣기 |
| Saved? | | 자동 저장 미리보기 토글 |
| Save | | YAML 파일 다운로드 |
| Import | | YAML 파일 불러오기 |
| New | | 새 시나리오 생성 |

### 저장 시스템
- **자동 저장**: localStorage, 30초 간격, 앱 시작 시 복원 프롬프트
- **수동 저장**: YAML 파일 다운로드 (iOS Safari Web Share API 폴백)
- **자동 저장 미리보기**: "Saved?" 토글로 자동 저장 데이터 확인/복원
- **클립보드**: YAML 복사/붙여넣기

### 내러티브 엔진
- **실시간 재생**: 타이핑 애니메이션, 자동 진행
- **스킵 버튼** (원형, 2줄 라벨 "editor / SKIP"):
  - **탭** (< 300ms): Fast-Forward 토글 (라벨 SKIP ↔ FAST)
  - **홀드** (≥ 1s): 시나리오 즉시 종료 (다이얼로그 숨김, skipToEnd)
- **대화 로그**: 히스토리 열람, 클릭으로 해당 스텝 점프
- **이벤트 디스패치**: `CHANGE_BG`, `SHOW_CHARACTER`, `HIDE_CHARACTER`, `FLOW_COMPLETE`
- **에디터 모드**: 이벤트 스텝에서 자동 전진 억제, 스텝 단위 네비게이션

### 모바일 대응
- Safe area inset 지원 (노치, 홈 인디케이터)
- 세로/가로 자동 스케일 (Portrait 540px / Landscape 1080px 기준)
- 터치 스크롤 (KineticScroller, 관성 물리)
- 드래그 시 자동 스크롤 (에지 존 가속)

## 스토리 파일 형식

`src/app/data/stories/` 에 `*.story.yaml` 파일을 추가하면 자동 등록됩니다.

```yaml
id: my_story
name: "My Story"
steps:
  - type: event
    event: CHANGE_BG
    payload: { color: "#1a1a2e" }

  - type: narration
    text: "어둠 속에서 빛이 피어올랐다."

  - type: dialogue
    speaker: "소라"
    text: "여기가... 어디지?"

  - type: auto
    text: "바람이 불어왔다."
    duration: 2000

  - type: event
    event: SHOW_CHARACTER
    payload: { id: sora, position: center }
```

## 기술 스택

| 영역 | 기술 |
|------|------|
| 렌더링 | BabylonJS 8.x (WebGL2) |
| GUI | @babylonjs/gui (AdvancedDynamicTexture) |
| 빌드 | Vite 5 + TypeScript 5.3 |
| 데이터 | js-yaml (YAML ↔ JSON) |
| 저장 | localStorage (자동) + Blob/Share API (수동) |

## 아키텍처

- **HEBS** (Hierarchical Event Blocking System): Interaction → Display → Effect → System → Skip 레이어 계층
- **Scale-based UI**: 해상도 변경 시 1회 계산, globalScale로 전체 동기화
- **Facade Pattern**: NarrativeEngine이 내부 모듈(ScenarioManager, DialogueBox 등)을 캡슐화
- **Callback-driven**: EditorPanel ↔ EditorController 간 함수 콜백 통신
