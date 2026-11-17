import test from 'node:test';
import assert from 'node:assert/strict';
import {attribute,bucketOf,metricsOf,parseCsv,splitCsvLine,summarize,suggestions,type Work} from '../src/analytics/model.ts';

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
