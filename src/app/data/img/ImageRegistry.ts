/**
 * ImageRegistry — Vite import.meta.glob 기반 이미지 URL 레지스트리
 *
 * src/app/data/img/ 하위 모든 이미지를 eager import하여
 * 상대 경로(e.g. "standing/boss_01.jpg") → 런타임 URL 매핑 제공.
 */

const modules = import.meta.glob(
    './**/*.{jpg,jpeg,png,webp}',
    { eager: true, import: 'default' }
) as Record<string, string>;

const registry = new Map<string, string>();

for (const [path, url] of Object.entries(modules)) {
    // path: "./standing/boss_01.jpg" → key: "standing/boss_01.jpg"
    const key = path.startsWith('./') ? path.slice(2) : path;
    registry.set(key, url);
}

/**
 * 상대 경로로 이미지 URL을 조회합니다.
 * @param relativePath - e.g. "standing/boss_01.jpg"
 * @returns 번들된 이미지 URL, 없으면 undefined
 */
export function resolveImageUrl(relativePath: string): string | undefined {
    return registry.get(relativePath);
}
