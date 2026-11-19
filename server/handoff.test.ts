import test from 'node:test';
import assert from 'node:assert/strict';
import {analyticsHandoffFromCopy,PUBLISH_PLATFORMS,topicSource,topicsHandoffFromWork} from '../src/workspace/handoff.ts';

test('选题素材带标题、钩子和编号大纲',()=>{
  const source=topicSource({title:'口播剪辑｜3 个步骤',hook:'先说结论，再讲过程。',outline:['开场','主体','结尾']});
  assert.equal(source,'口播剪辑｜3 个步骤\n\n先说结论，再讲过程。\n\n1. 开场\n2. 主体\n3. 结尾');
});

test('选题篮里只有标题和钩子也能带进写稿',()=>{
  assert.equal(topicSource({title:'一条选题',hook:'一个钩子'}),'一条选题\n\n一个钩子');
  assert.equal(topicSource({title:'空大纲',hook:'钩子',outline:[]}),'空大纲\n\n钩子');
});

test('文案发布到运营分析：平台转中文名，空字段不写入',()=>{
  assert.deepEqual(analyticsHandoffFromCopy({title:'标题',platform:'xiaohongshu'}),{title:'标题',platform:'小红书'});
  assert.deepEqual(analyticsHandoffFromCopy({title:'标题',platform:'bilibili',hook:'钩子'}),{title:'标题',platform:'B 站',hook:'钩子'});
});

test('发布平台清单覆盖选题的四个平台且顺序稳定',()=>{
  assert.deepEqual(PUBLISH_PLATFORMS.slice(0,4).map(item=>item.id),['xiaohongshu','douyin','shipinhao','bilibili']);
  assert.deepEqual(PUBLISH_PLATFORMS.slice(0,4).map(item=>item.name),['小红书','抖音','视频号','B 站']);
});

test('运营分析到选题：题材优先做关键词，平台按中文名回到选题平台',()=>{
  assert.deepEqual(topicsHandoffFromWork({title:'标题',platform:'小红书',topic:'录屏',style:'清单'}),{keyword:'录屏',platform:'xiaohongshu'});
  assert.deepEqual(topicsHandoffFromWork({title:'标题',platform:'B 站',style:'清单'}),{keyword:'清单',platform:'bilibili'});
  assert.deepEqual(topicsHandoffFromWork({title:'一条标题',platform:'抖音'}),{keyword:'一条标题',platform:'douyin'});
});

test('运营分析到选题：选题没有的平台退回小红书，空白标题不带过去',()=>{
  assert.deepEqual(topicsHandoffFromWork({title:'一条标题',platform:'YouTube'}),{keyword:'一条标题',platform:'xiaohongshu'});
  assert.deepEqual(topicsHandoffFromWork({title:'一条标题',platform:'shipinhao'}),{keyword:'一条标题',platform:'shipinhao'});
  assert.equal(topicsHandoffFromWork({title:'  ',platform:'小红书',topic:'  ',style:'  '}),null);
});
