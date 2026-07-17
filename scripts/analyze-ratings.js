'use strict';
const fs=require('node:fs');
const path=require('node:path');
const scoring=require('../scoring-core.js');

const pearson=(a,b)=>{if(a.length<2||a.length!==b.length)return null;const ma=a.reduce((s,n)=>s+n,0)/a.length,mb=b.reduce((s,n)=>s+n,0)/b.length;let top=0,aa=0,bb=0;for(let i=0;i<a.length;i++){const x=a[i]-ma,y=b[i]-mb;top+=x*y;aa+=x*x;bb+=y*y}return aa&&bb?top/Math.sqrt(aa*bb):null};
const ranks=values=>values.map((value,index)=>({value,index})).sort((a,b)=>a.value-b.value).reduce((out,item,rank)=>(out[item.index]=rank+1,out),[]);
const spearman=(a,b)=>pearson(ranks(a),ranks(b));
const files=process.argv.slice(2);if(!files.length){console.error('使い方: node scripts/analyze-ratings.js ratings-1.json ratings-2.json ratings-3.json');process.exit(1)}
const validation=JSON.parse(fs.readFileSync(path.join(__dirname,'..','research','validation-set.json'),'utf8')),items=new Map(validation.items.map(item=>[item.id,item]));
const submissions=files.map(file=>JSON.parse(fs.readFileSync(path.resolve(file),'utf8')));const raterIds=new Set(submissions.map(data=>String(data.raterId||'')));
const rowsByRater=submissions.map(data=>new Map((Array.isArray(data.ratings)?data.ratings:[]).filter(row=>items.has(row.itemId)).map(row=>[row.itemId,row])));
const byRater=rowsByRater.map(rows=>new Map([...rows].filter(([,row])=>Number(row.funny)>=1&&Number(row.funny)<=5).map(([id,row])=>[id,Number(row.funny)])));
const pairwise=[];for(let i=0;i<byRater.length;i++)for(let j=i+1;j<byRater.length;j++){const common=[...byRater[i].keys()].filter(id=>byRater[j].has(id)),a=common.map(id=>byRater[i].get(id)),b=common.map(id=>byRater[j].get(id));pairwise.push({raters:[i+1,j+1],commonItems:common.length,correlation:spearman(a,b)})}
const modelResults=new Map([...items].map(([id,item])=>[id,scoring.scoreAnswer({answer:item.answer,prompt:item.prompt,responseMs:15000,visual:{...scoring.neutralVisual(),...item.visual}})]));
const human=[],model=[];for(const [id] of items){const values=byRater.map(map=>map.get(id)).filter(Number.isFinite);if(values.length<2)continue;human.push(values.reduce((s,n)=>s+n,0)/values.length);model.push(modelResults.get(id).total)}
const dimensionCorrelations={};for(const dimension of validation.dimensions){const humanAxis=[],modelAxis=[];for(const [id] of items){const values=rowsByRater.map(map=>Number(map.get(id)?.[dimension])).filter(value=>value>=1&&value<=5);if(values.length<2)continue;humanAxis.push(values.reduce((s,n)=>s+n,0)/values.length);modelAxis.push(modelResults.get(id).dimensions[dimension])}dimensionCorrelations[dimension]={ratedItems:humanAxis.length,spearman:spearman(modelAxis,humanAxis)}}
const correlations=pairwise.map(row=>row.correlation).filter(Number.isFinite);const report={status:raterIds.size>=3?'ready':'needs-more-human-raters',uniqueRaters:raterIds.size,ratedItems:human.length,meanPairwiseSpearman:correlations.length?correlations.reduce((s,n)=>s+n,0)/correlations.length:null,modelVsHumanSpearman:spearman(model,human),dimensionCorrelations,pairwise};
console.log(JSON.stringify(report,null,2));if(raterIds.size<3)process.exitCode=2;
