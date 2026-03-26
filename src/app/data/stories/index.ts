/**
 * Stories Index - Phase 1.1
 *
 * StoryRegistry가 *.story.yaml을 자동 탐색.
 * INTRO_STORY는 하위 호환을 위해 named export 유지.
 */

export { getStory, getAllStoryIds } from './StoryRegistry';

import { getStory } from './StoryRegistry';
export const INTRO_STORY = getStory('intro');
