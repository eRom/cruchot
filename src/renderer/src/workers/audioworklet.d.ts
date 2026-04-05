// Type declarations for AudioWorklet global scope
// These globals are available inside AudioWorkletProcessor files

declare class AudioWorkletProcessor {
  readonly port: MessagePort
  process(inputs: Float32Array[][], outputs: Float32Array[][], parameters: Record<string, Float32Array>): boolean
}

declare function registerProcessor(name: string, processorCtor: new () => AudioWorkletProcessor): void

declare const sampleRate: number
