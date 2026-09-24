import type { AIProviderInterface, AICompletionRequest, AICompletionResponse, AICompletionStreamChunk } from '@/types/ai';
import { abortableDelay } from '@/server/reading-assistant/cancellation';
import { validateMimoBaseUrl } from './mimo-config';
export interface MimoConfig {
  baseUrl: string; apiKey: string; model: string; temperature: number;
  maxTokens: number; topP: number; timeoutMs: number; retryCount: number;
}
class MimoHttpError extends Error {
  constructor(public status: number) {
    super(status === 401 || status === 403 ? 'MiMo authentication failed. Check the API key and matching billing endpoint.' : `MiMo API request failed (${status}). Please retry or check your quota.`);
  }
}
export class MimoProvider implements AIProviderInterface {
  readonly providerKey = 'mimo';
  private config: MimoConfig;
  constructor(config: MimoConfig) { this.config = { ...config, baseUrl: validateMimoBaseUrl(config.baseUrl) }; }
  private payload(request: AICompletionRequest, stream: boolean) {
    const wantsJson = /json/i.test(request.systemPrompt + request.userPrompt);
    return {
      model: this.config.model,
      messages: [{role:'system',content:request.systemPrompt},{role:'user',content:request.userPrompt}],
      max_completion_tokens: request.maxTokens ?? this.config.maxTokens,
      temperature: request.temperature ?? this.config.temperature,
      top_p: request.topP ?? this.config.topP,
      stream,
      ...(wantsJson ? {response_format:{type:'json_object'}} : {}),
    };
  }
  private async fetchResponse(request: AICompletionRequest, stream: boolean, signal: AbortSignal) {
    signal.throwIfAborted();
    const response = await fetch(`${this.config.baseUrl}/chat/completions`, {
      method:'POST',redirect:'error',signal,
      headers:{'Content-Type':'application/json','api-key':this.config.apiKey,...(stream?{Accept:'text/event-stream'}:{})},
      body:JSON.stringify(this.payload(request,stream)),
    });
    if (!response.ok) {
      await response.body?.cancel();
      throw new MimoHttpError(response.status);
    }
    return response;
  }
  async complete(request: AICompletionRequest): Promise<AICompletionResponse> {
    const started = Date.now();
    const attempts = Math.max(1, Math.min(4,this.config.retryCount+1));
    for (let attempt=0;attempt<attempts;attempt++) {
      request.signal?.throwIfAborted();
      const controller = new AbortController();
      const timer = setTimeout(()=>controller.abort(new DOMException('MiMo request timed out','TimeoutError')),this.config.timeoutMs);
      const signal = request.signal ? AbortSignal.any([request.signal,controller.signal]) : controller.signal;
      try {
        const response = await this.fetchResponse(request,false,signal);
        if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) throw new Error('MiMo returned a non-JSON response. Please retry.');
        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;
        if (typeof content !== 'string' || !content.trim()) throw new Error('MiMo returned empty content. Please retry.');
        return {content,model:data.model || this.config.model,provider:this.providerKey,latencyMs:Date.now()-started,
          usage:data.usage?{promptTokens:data.usage.prompt_tokens,completionTokens:data.usage.completion_tokens,totalTokens:data.usage.total_tokens}:undefined};
      } catch(error) {
        request.signal?.throwIfAborted();
        const transient = error instanceof MimoHttpError ? error.status===429 || error.status>=500 : error instanceof TypeError;
        if (!transient || attempt===attempts-1) throw error;
      } finally {clearTimeout(timer);controller.abort();}
      await abortableDelay(Math.min(750*2**attempt,3000),request.signal);
    }
    throw new Error('MiMo request failed');
  }
  async *stream(request: AICompletionRequest): AsyncIterable<AICompletionStreamChunk> {
    request.signal?.throwIfAborted();
    const controller = new AbortController();
    const timer = setTimeout(()=>controller.abort(new DOMException('MiMo stream timed out','TimeoutError')),this.config.timeoutMs);
    const signal = request.signal ? AbortSignal.any([request.signal,controller.signal]) : controller.signal;
    let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
    try {
      const response = await this.fetchResponse(request,true,signal);
      if (!response.body || !response.headers.get('content-type')?.toLowerCase().includes('text/event-stream')) throw new Error('MiMo returned an invalid streaming response. Please retry.');
      reader=response.body.getReader();
      const decoder=new TextDecoder();let buffer='';
      while (true) {
        signal.throwIfAborted();
        const {done,value}=await reader.read();
        buffer+=done?decoder.decode():decoder.decode(value,{stream:true});
        const lines=buffer.split(/\r?\n/);buffer=done?'':lines.pop()||'';
        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw=line.slice(5).trim();if (!raw) continue;if(raw==='[DONE]') return;
          let data;
          try {data=JSON.parse(raw);} catch {throw new Error('MiMo returned malformed stream data. Please retry.');}
          if (data.error) throw new Error('MiMo reported an upstream stream error. Please retry.');
          const content=data.choices?.[0]?.delta?.content;
          if (typeof content==='string' && content) yield {content};
        }
        if(done)break;
      }
    } finally {clearTimeout(timer);controller.abort();await reader?.cancel().catch(()=>{});reader?.releaseLock();}
  }
  async testConnection() {
    const started=Date.now();
    try {
      await this.complete({systemPrompt:'You are a test assistant.',userPrompt:'Reply with OK.',maxTokens:128});
      return {success:true,message:`Connected to ${this.config.model}`,latencyMs:Date.now()-started};
    } catch(error) {return {success:false,message:error instanceof Error?error.message:'MiMo connection failed',latencyMs:Date.now()-started};}
  }
}
