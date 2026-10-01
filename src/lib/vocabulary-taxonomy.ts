import {z} from 'zod';
export const TAXONOMY_VERSION='1.0';
export const vocabularyDomains={
 'daily.body.visual':'日常 · 身体与视觉','daily.body.hearing':'日常 · 听觉','daily.body.sensation':'日常 · 身体感受',
 'daily.home.cleaning':'居家 · 清洁','daily.home.cooking':'居家 · 烹饪','daily.home.housing':'居家 · 用品与居住',
 'daily.travel.transport':'出行 · 交通','daily.travel.travel':'出行 · 旅行','daily.travel.shopping':'出行 · 购物',
 'daily.social.relationships':'社交 · 人际关系','daily.social.communication':'社交 · 交流','daily.social.emotions':'社交 · 情绪',
 'work.collaboration.meeting':'工作 · 会议','work.collaboration.mail':'工作 · 邮件','work.collaboration.projects':'工作 · 项目',
 'work.marketing.ads':'电商 · 广告','work.marketing.content':'电商 · 内容','work.marketing.sales':'电商 · 销售','work.marketing.conversion':'电商 · 转化',
 'work.technology.development':'技术 · 开发','work.technology.data':'技术 · 数据','work.technology.design':'技术 · 设计',
 'work.management.budget':'管理 · 预算','work.management.payments':'管理 · 收付款','work.management.hiring':'管理 · 招聘',
 'knowledge.economy':'知识 · 经济','knowledge.politics':'知识 · 政治','knowledge.science':'知识 · 科技','knowledge.history':'知识 · 历史',
} as const;
export const contextTags=['outdoors','home','office','conversation','travel','shopping','study','online'] as const;
const semanticByPos={verb:['action','perception','cognition','communication','change','state'],noun:['person','object','place','event','metric','abstract'],adjective:['quality','emotion','state'],adverb:['manner','time','degree','place'],phrase:['action','perception','cognition','communication','change','state','abstract'],other:['unknown']} as const;
export const enrichmentResultSchema=z.object({
 lemma:z.string().trim().min(1).max(200),selectedDictionarySenseId:z.string().max(128).nullable(),
 meaning:z.object({en:z.string().trim().min(1).max(500).optional(),zh:z.string().trim().min(1).max(300).optional()}).strict().refine(m=>!!(m.en||m.zh)),
 pos:z.enum(['verb','noun','adjective','adverb','phrase','other']),semanticCategory:z.string().max(80),
 domain:z.enum(Object.keys(vocabularyDomains) as [keyof typeof vocabularyDomains,...(keyof typeof vocabularyDomains)[]]).nullable(),
 contextTags:z.array(z.enum(contextTags)).max(3),collocations:z.array(z.string().trim().min(1).max(180)).length(2),uncertain:z.boolean(),
}).strict().refine(v=>(semanticByPos[v.pos] as readonly string[]).includes(v.semanticCategory),'POS-incompatible semantic category');
export type EnrichmentResult=z.infer<typeof enrichmentResultSchema>;
export function taxonomyLabel(code:string){return vocabularyDomains[code as keyof typeof vocabularyDomains]??({outdoors:'户外',home:'居家',office:'办公',conversation:'交流',travel:'旅行',shopping:'购物',study:'学习',online:'线上'} as Record<string,string>)[code]??code;}
export const posLabels={verb:'动词',noun:'名词',adjective:'形容词',adverb:'副词',phrase:'短语',other:'其他'};
