# StoryEditor — GitHub + Vercel 배포 가이드

## 1. Git 초기화 & 첫 커밋

```bash
cd E:/game/StoryEditor

git init
git add .
git commit -m "Initial commit: StoryEditor"
```

## 2. GitHub 레포지토리 생성 & 연결

1. https://github.com/new 에서 새 레포 생성 (예: `StoryEditor`)
2. **Public** 또는 **Private** 선택 (Vercel은 둘 다 지원)
3. README, .gitignore 등 초기 파일 **추가하지 않음** (이미 로컬에 있으므로)

```bash
git remote add origin https://github.com/<username>/StoryEditor.git
git branch -M main
git push -u origin main
```

git remote add origin https://github.com/dnrjke/StoryEditor.git

## 3. Vercel 배포

1. https://vercel.com 로그인 (GitHub 계정 연동)
2. **Add New Project** → GitHub 레포 `StoryEditor` 선택
3. 설정 자동 감지 확인:
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
4. **Deploy** 클릭 → 완료

이후 main 브랜치에 push할 때마다 자동 빌드 & 배포됩니다.

## 4. 이후 작업 흐름

```bash
# 코드 수정 후
git add <변경된 파일>
git commit -m "변경 내용 설명"
git push
# → Vercel 자동 배포
```
