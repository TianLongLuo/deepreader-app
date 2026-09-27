import { z } from 'zod';
export const pdfTextPayloadSchema=z.object({
 title:z.string().max(500), pageCount:z.number().int().min(1).max(50000),
 paragraphs:z.array(z.object({id:z.string().regex(/^pdf-p-\d+$/),orderIndex:z.number().int().min(0),pageNumber:z.number().int().min(1),text:z.string().min(1).max(500000),analysisText:z.string().max(500000)})).min(1).max(50000)
}).superRefine((value,ctx)=>{
 if(value.paragraphs.reduce((n,p)=>n+p.text.length,0)>5000000)ctx.addIssue({code:'custom',message:'PDF text is too large'});
 value.paragraphs.forEach((p,i)=>{if(p.id!=='pdf-p-'+i||p.orderIndex!==i||p.pageNumber>value.pageCount)ctx.addIssue({code:'custom',message:'Invalid PDF text location'});});
});
export type PdfTextPayload=z.infer<typeof pdfTextPayloadSchema>;
