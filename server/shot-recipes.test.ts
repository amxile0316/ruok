import test from 'node:test';
import assert from 'node:assert/strict';
import {SHOT_RECIPES, SHOT_RECIPE_ATTRIBUTION, shotRecipeBrief} from '../src/studio/shot-recipes.ts';

test('镜头配方：五条都带做法、坑和上游出处', () => {
  assert.equal(SHOT_RECIPES.length, 5);
  for (const recipe of SHOT_RECIPES) {
    assert.ok(recipe.name && recipe.oneLine && recipe.when, `${recipe.id} 缺少摘要`);
    assert.ok(recipe.beats.length >= 3, `${recipe.id} 做法要点太少`);
    assert.ok(recipe.pitfalls.length >= 2, `${recipe.id} 没有记坑`);
    assert.match(recipe.source, /^(references\/shots\/|skills\/)/, `${recipe.id} 出处不是上游路径`);
  }
  assert.equal(new Set(SHOT_RECIPES.map(recipe => recipe.id)).size, SHOT_RECIPES.length);
});

test('镜头配方：复制给 Agent 的那段文字自洽、能直接读', () => {
  for (const recipe of SHOT_RECIPES) {
    const brief = shotRecipeBrief(recipe);
    assert.ok(brief.startsWith(`镜头配方：${recipe.name}`), '开头要报名字');
    assert.ok(brief.includes(recipe.oneLine) && brief.includes(recipe.when));
    for (const beat of recipe.beats) assert.ok(brief.includes(`- ${beat}`), '做法要点要逐条进提示词');
    for (const pitfall of recipe.pitfalls) assert.ok(brief.includes(`- ${pitfall}`), '坑要逐条进提示词');
    assert.ok(brief.includes(recipe.license ?? 'Apache-2.0'), '提示词里要带许可证');
    assert.ok(brief.split('\n').length <= 20, '太长会挤掉对话里的别的内容');
  }
});

test('镜头配方：归属说明指向上游仓库', () => {
  assert.match(SHOT_RECIPE_ATTRIBUTION, /video-shotcraft/);
  assert.match(SHOT_RECIPE_ATTRIBUTION, /Apache-2\.0/);
  assert.match(SHOT_RECIPE_ATTRIBUTION, /cinematic-skill/);
  assert.match(SHOT_RECIPE_ATTRIBUTION, /MIT/);
});
