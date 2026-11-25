import test from 'node:test';
import assert from 'node:assert/strict';
import {attribute,bucketOf,captureMetrics,metricsOf,parseCsv,pendingMetrics,splitCsvLine,staleWorks,summarize,suggestions,type Work} from '../src/analytics/model.ts';

const work=(patch:Partial<Work>={}):Work=>({id:crypto.randomUUID(),title:'作品',platform:'小红书',publishedAt:'2026-11-01',durationSec:45,style:'产品宣传片',hook:'反常识',topic:'效率',views:1000,likes:40,comments:10,shares:5,saves:15,follows:8,...patch});

test('互动率按播放计算，时长分桶覆盖边界',()=>{
  assert.equal(metricsOf(work()).engagement,0.07);
  assert.equal(bucketOf(work({durationSec:30})),'≤30s');
  assert.equal(bucketOf(work({durationSec:31})),'31–60s');
  assert.equal(bucketOf(work({durationSec:121})),'>120s');
});

test('汇总给出总播放、互动率与最佳作品',()=>{
  const stats=summarize([work({views:1000}),work({id:'b',title:'爆款',views:5000,likes:600})]);
  assert.equal(stats.count,2);
  assert.equal(stats.views,6000);
  assert.equal(stats.best?.title,'爆款');
  assert.ok(stats.engagement>0.07);
});

test('CSV 支持中文表头、引号与「万」',()=>{
  const csv=['标题,平台,发布日期,时长,风格,钩子,题材,播放,点赞,评论,转发,收藏,涨粉',
    '"一条,带逗号",抖音,2026/11/2,38,产品宣传片,反常识,效率,1.2万,300,20,10,40,6'].join('\n');
  const {works,skipped}=parseCsv(csv);
  assert.equal(skipped,0);
  assert.equal(works[0].title,'一条,带逗号');
  assert.equal(works[0].publishedAt,'2026-11-02');
  assert.equal(works[0].views,12000);
  assert.equal(works[0].durationSec,38);
});

test('CSV 跳过没有标题的行，空文件不报错',()=>{
  assert.equal(parseCsv('标题,播放\n,10\n有标题,20').works.length,1);
  assert.deepEqual(parseCsv('').works,[]);
  assert.deepEqual(splitCsvLine('a,"b,c",d'),['a','b,c','d']);
});

test('归因按互动率排序，并跳过多余维度',()=>{
  const rows=[work({style:'A',views:1000,likes:10}),work({style:'A',views:1000,likes:20}),work({style:'B',views:1000,likes:200})];
  const groups=attribute(rows,'style');
  assert.deepEqual(groups.map(group=>group.key),['B','A']);
  assert.equal(groups[0].engagement,0.23);
  assert.equal(groups[1].count,2);
});

test('建议从数据出发；空数据和单条数据说清楚不能比较',()=>{
  assert.match(suggestions([])[0],/先录入/);
  assert.match(suggestions([work()])[0],/只有一条/);
  const rows=[work({views:200}),work({views:800}),work({views:5000,likes:400,style:'B'}),work({views:4000,likes:300,style:'B'})];
  const lines=suggestions(rows);
  assert.ok(lines.length>=2&&lines.length<=5);
  assert.ok(lines.some(line=>/风格|钩子|题材|最佳/.test(line)));
});

test('指标陈旧：只统计有快照且超过 14 天的作品，最久未更新排前面',()=>{
  const now=Date.parse('2026-11-25T00:00:00.000Z');
  const fresh=work({id:'a',metricsCapturedAt:'2026-11-20T00:00:00.000Z'});
  const older=work({id:'b',metricsCapturedAt:'2026-11-01T00:00:00.000Z'});
  const oldest=work({id:'e',metricsCapturedAt:'2026-10-01T00:00:00.000Z'});
  const never=work({id:'c'}); // 从没记录更新日期：旧数据不提示
  const broken=work({id:'d',metricsCapturedAt:'not-a-date'});
  const rows=staleWorks([fresh,older,never,oldest,broken],now);
  assert.deepEqual(rows.map(row=>row.work.id),['e','b']);
  assert.equal(rows[1].days,24);
  assert.equal(rows[1].capturedAt,'2026-11-01T00:00:00.000Z');
  assert.equal(staleWorks([fresh,older],now,60).length,0); // 放宽到 60 天就都还算新
  assert.deepEqual(staleWorks([],now),[]);
  assert.deepEqual(staleWorks([never,broken],now),[]);
});

test('待补指标：只列人工确认发布、还没录过指标的作品，与陈旧提醒互不重叠',()=>{
  const confirmed=work({id:'a',publicationSource:'manual-confirmed',views:0,likes:0,comments:0,shares:0,saves:0,follows:0});
  const confirmedFilled=work({id:'b',publicationSource:'manual-confirmed',metricsCapturedAt:'2026-11-20T00:00:00.000Z'});
  const legacy=work({id:'c',publicationSource:'legacy'});
  const manual=work({id:'d'});
  assert.deepEqual(pendingMetrics([confirmed,confirmedFilled,legacy,manual]).map(row=>row.id),['a']);
  assert.deepEqual(pendingMetrics([]),[]);
  // 待补作品没有快照，所以不会同时出现在陈旧列表里
  assert.deepEqual(staleWorks([confirmed],Date.parse('2026-11-25T00:00:00.000Z')),[]);
});

test('指标快照：CSV 导入标记来源 csv，captureMetrics 写入采集时间与来源且不丢字段',()=>{
  const imported=parseCsv('标题,播放\n作品,100').works[0];
  assert.equal(imported.metricsSource,'csv');
  assert.ok(imported.metricsCapturedAt);
  const base={title:'手填',platform:'小红书',publishedAt:'2026-11-01',durationSec:45,views:1000,likes:10,comments:0,shares:0,saves:0,follows:0};
  const snap=captureMetrics(base,'manual','2026-11-25T00:00:00.000Z');
  assert.equal(snap.metricsSource,'manual');
  assert.equal(snap.metricsCapturedAt,'2026-11-25T00:00:00.000Z');
  assert.equal(snap.title,'手填');
  assert.equal(snap.views,1000);
});
