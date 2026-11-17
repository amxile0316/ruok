import test from 'node:test';
import assert from 'node:assert/strict';
import {parseTranscript,planTranscript,buildSrt,cutListText,buildAss} from '../shared/talk.ts';

test('逐字稿按句末标点拆句，空白句被丢掉',()=>{
  const rows=parseTranscript('今天讲一件事。先说结论！\n然后按句删掉口误？');
  assert.deepEqual(rows.map(r=>r.text),['今天讲一件事','先说结论','然后按句删掉口误']);
  assert.ok(rows.every(r=>r.keep));
});

test('SRT 导入保留自带时间',()=>{
  const source='1\n00:00:01,000 --> 00:00:03,500\n第一句\n\n2\n00:00:04,000 --> 00:00:06,000\n第二句';
  const rows=parseTranscript(source);
  assert.deepEqual(rows.map(r=>[r.text,r.start,r.end]),[['第一句',1,3.5],['第二句',4,6]]);
});

test('没有时间的句子按句长铺满素材，最后一句不越界',()=>{
  const rows=parseTranscript('短句。这是一句明显更长的句子，用来检查配比是否按字数走。收尾。');
  const plan=planTranscript({sentences:rows,duration:10});
  assert.equal(plan.sentences.length,3);
  assert.ok(plan.sentences.at(-1)!.end<=10.001);
  assert.ok(plan.sentences[1].end-plan.sentences[1].start>plan.sentences[0].end-plan.sentences[0].start);
});

test('删除句后挤压空白：成片变短、字幕重新编号、剪切清单是不重叠区间',()=>{
  const rows=parseTranscript('第一句。第二句。第三句。第四句。');
  const kept=rows.map((row,index)=>({...row,keep:index!==1}));
  const plan=planTranscript({sentences:kept,duration:8,compact:true});
  assert.equal(plan.removed,1);
  assert.equal(plan.sentences.length,3);
  assert.ok(plan.keptDuration<8);
  assert.ok(plan.sentences[0].start===0);
  assert.match(plan.srt,/^1\n/);
  assert.equal(plan.srt.trim().split('\n\n').length,3);
  for(let i=1;i<plan.cuts.length;i++)assert.ok(plan.cuts[i].start>=plan.cuts[i-1].end);
  assert.equal(cutListText(plan).split('\n').length,plan.cuts.length);
});

test('不挤压空白时保留原时间轴，删除句留空',()=>{
  const rows=parseTranscript('第一句。第二句。第三句。');
  const plan=planTranscript({sentences:rows.map((row,index)=>({...row,keep:index!==0})),duration:9,compact:false});
  assert.ok(plan.sentences[0].start>0);
  assert.equal(plan.all.length,3);
  assert.equal(plan.all[0].keep,false);
  assert.ok(plan.keptDuration>plan.sentences[0].start);
});

test('VTT 与 SRT 都是每句一条，不丢内容',()=>{
  const rows=parseTranscript('一。二。');
  const plan=planTranscript({sentences:rows,duration:4});
  assert.match(plan.vtt,/^WEBVTT/);
  assert.equal(plan.vtt.split('\n\n').length,3);
  assert.ok(buildSrt(plan.sentences).includes('二'));
});

test('ASS 带可调字号与位置，时间用 h:mm:ss.cc',()=>{
  const rows=parseTranscript('第一句。第二句。');
  const plan=planTranscript({sentences:rows,duration:6});
  const ass=buildAss(plan.sentences,{fontSize:58,position:'middle'});
  assert.match(ass,/\[V4\+ Styles\]/);
  assert.match(ass,/,58,&H00F0F4EE/);
  assert.match(ass,/,1,2,1,5,120,120,0,1/);
  assert.match(ass,/Dialogue: 0,0:00:00\.00,0:00:02\.9\d/);
});
