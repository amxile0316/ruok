import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {talkPlacement, type TalkPlan} from '../shared/talk.ts';
import {talkBackgroundHtml, talkCaptionsHtml, talkFilmHtml, validatePlace} from './talk-place.ts';
import {hyperframesToLayers} from './general/hf-project.ts';
import type {GeneralMedia} from '../src/general/general-contract.ts';

const plan = (compact: boolean): TalkPlan => ({
  duration: 12,
  keptDuration: compact ? 5 : 7,
  all: [
    {id: 's1', text: '第一句', keep: true, start: 0, end: 2},
    {id: 's2', text: '删掉的句子', keep: false, start: 2, end: 4},
    {id: 's3', text: '第二句', keep: true, start: 4, end: 7},
  ],
  sentences: compact
    ? [{id: 's1', text: '第一句', keep: true, start: 0, end: 2}, {id: 's3', text: '第二句', keep: true, start: 2, end: 5}]
    : [{id: 's1', text: '第一句', keep: true, start: 0, end: 2}, {id: 's3', text: '第二句', keep: true, start: 4, end: 7}],
  cuts: [{start: 0, end: 2}, {start: 4, end: 7}],
  srt: '', vtt: '', removed: 1, savedSeconds: 2,
});

test('compact placement joins kept cuts from zero and keeps the source in-points', () => {
  const placed = talkPlacement(plan(true), true);
  assert.deepEqual(placed.segments.map(s => [s.start, s.duration, s.sourceStart]), [[0, 2, 0], [2, 3, 4]]);
  assert.deepEqual(placed.captions.map(c => [c.start, c.duration, c.text]), [[0, 2, '第一句'], [2, 3, '第二句']]);
  assert.equal(placed.duration, 5);
});

test('uncompressed placement leaves the deleted gap on the original timeline', () => {
  const placed = talkPlacement(plan(false), false);
  assert.deepEqual(placed.segments.map(s => [s.start, s.duration, s.sourceStart]), [[0, 2, 0], [4, 3, 4]]);
  assert.equal(placed.duration, 7);
});

const media: GeneralMedia[] = [{id: 'm1', name: '口播.mp4', duration: 12, width: 1920, height: 1080, file: 'clip.mp4'}];

function workdir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'talk-place-'));
  fs.mkdirSync(path.join(dir, 'compositions'), {recursive: true});
  fs.mkdirSync(path.join(dir, 'media'), {recursive: true});
  fs.writeFileSync(path.join(dir, 'media', 'clip.mp4'), '');
  return dir;
}

test('a video cut reads back as footage clips and one caption clip per sentence', async () => {
  const dir = workdir();
  const placed = talkPlacement(plan(true), true);
  fs.writeFileSync(path.join(dir, 'index.html'), talkFilmHtml({
    width: 1920, height: 1080, duration: placed.duration, source: 'media/clip.mp4',
    segments: placed.segments, captions: placed.captions.length, hasVideo: true, hasAudio: true, title: '口播剪辑',
  }));
  fs.writeFileSync(path.join(dir, 'compositions', 'captions.html'), talkCaptionsHtml({
    width: 1920, height: 1080, duration: placed.duration, style: {fontSize: 46, position: 'bottom'}, captions: placed.captions,
  }));
  const layers = await hyperframesToLayers(dir, 'versions/v1/work', media);
  const track = (id: string) => layers.timeline.tracks.find(t => t.id === id)!;
  assert.equal(layers.duration, 5);
  assert.deepEqual(track('g-footage').clips.map(c => [c.start, c.duration, c.sourceStart, c.assetId]), [[0, 2, 0, 'm1'], [2, 3, 4, 'm1']]);
  assert.deepEqual(track('g-text').clips.map(c => [c.start, c.duration, c.text]), [[0, 2, '第一句'], [2, 3, '第二句']]);
  assert.equal(track('g-voice').clips.length, 0);
});

test('an audio-only source lands as a background card, voice clips and captions', async () => {
  const dir = workdir();
  const placed = talkPlacement(plan(true), true);
  fs.writeFileSync(path.join(dir, 'index.html'), talkFilmHtml({
    width: 1920, height: 1080, duration: placed.duration, source: 'media/clip.mp4',
    segments: placed.segments, captions: placed.captions.length, hasVideo: false, hasAudio: true, title: '口播剪辑',
  }));
  fs.writeFileSync(path.join(dir, 'compositions', 'captions.html'), talkCaptionsHtml({
    width: 1920, height: 1080, duration: placed.duration, style: {fontSize: 58, position: 'middle'}, captions: placed.captions,
  }));
  fs.writeFileSync(path.join(dir, 'compositions', 'background.html'), talkBackgroundHtml({width: 1920, height: 1080, duration: placed.duration, title: '音频素材'}));
  const layers = await hyperframesToLayers(dir, 'versions/v1/work', media);
  const track = (id: string) => layers.timeline.tracks.find(t => t.id === id)!;
  assert.deepEqual(track('g-voice').clips.map(c => [c.start, c.duration, c.sourceStart]), [[0, 2, 0], [2, 3, 4]]);
  assert.equal(track('g-page').clips.length, 1);
  assert.deepEqual(track('g-text').clips.map(c => c.text), ['第一句', '第二句']);
  assert.equal(track('g-footage').clips.length, 0);
});

test('placement requests with no segments, bad times or too many captions are refused with a reason', () => {
  const valid = {
    projectId: '00000000-0000-0000-0000-000000000000', mediaId: 'm1', style: {fontSize: 46, position: 'bottom'},
    segments: [{start: 0, duration: 2, sourceStart: 0}], captions: [{start: 0, duration: 2, text: '一句'}],
  };
  assert.deepEqual(validatePlace(valid).segments, [{start: 0, duration: 2, sourceStart: 0}]);
  assert.throws(() => validatePlace({...valid, segments: []}), /没有保留段/);
  assert.throws(() => validatePlace({...valid, segments: [{start: -1, duration: 2, sourceStart: 0}]}), /起止时间不对/);
  assert.throws(() => validatePlace({...valid, captions: [{start: 0, duration: 0, text: '一句'}]}), /时间码不对/);
  assert.throws(() => validatePlace({...valid, captions: [{start: 0, duration: 1, text: ' '}]}), /没有文字/);
  assert.throws(() => validatePlace({...valid, segments: Array.from({length: 501}, () => valid.segments[0])}), /保留段太多/);
});
