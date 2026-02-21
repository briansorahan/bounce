import { BrowserWindow } from 'electron';
import { DatabaseManager } from '../database';
import { debugLog } from '../logger';
import { BufNMF } from '../BufNMF';
import crypto from 'crypto';
import { Command } from './types';

export const analyzeNmfCommand: Command = {
  name: 'analyze-nmf',
  description: 'Analyze audio using Non-negative Matrix Factorization',
  usage: 'analyze-nmf <sample-hash> [options]',
  help: `Perform NMF decomposition on an audio sample.

Usage: analyze-nmf <sample-hash> [options]

Options:
  --components <N>  Number of components (default: 10)
  --iterations <N>  Number of iterations (default: 100)
  --fft-size <N>    FFT size (default: 2048)

Example:
  analyze-nmf 82a4b173
  analyze-nmf 82a4b173 --components 20 --iterations 200`,
  
  execute: async (args: string[], mainWindow: BrowserWindow, dbManager?: any) => {
    debugLog('info', '[AnalyzeNMF] Command executed', { args });

    if (args.length === 0) {
      return { success: false, message: 'Usage: analyze-nmf <sample-hash> [options]' };
    }

    const sampleHash = args[0];
    
    // Parse options
    let components = 10;
    let iterations = 100;
    let fftSize = 2048;
    
    for (let i = 1; i < args.length; i += 2) {
      const option = args[i];
      const value = args[i + 1];
      
      if (option === '--components' && value) {
        components = parseInt(value, 10);
      } else if (option === '--iterations' && value) {
        iterations = parseInt(value, 10);
      } else if (option === '--fft-size' && value) {
        fftSize = parseInt(value, 10);
      }
    }

    debugLog('info', '[AnalyzeNMF] Parsed options', { components, iterations, fftSize });

    if (!dbManager) {
      return { success: false, message: 'Database not initialized' };
    }

    try {
      // Look up sample in database
      const sample = dbManager.db.prepare(
        'SELECT * FROM samples WHERE hash LIKE ?'
      ).get(`${sampleHash}%`) as any;

      if (!sample) {
        debugLog('error', '[AnalyzeNMF] Sample not found', { sampleHash });
        return { success: false, message: `No sample found with hash starting with: ${sampleHash}` };
      }

      debugLog('info', '[AnalyzeNMF] Sample found', { 
        hash: sample.hash, 
        duration: sample.duration,
        sampleRate: sample.sample_rate 
      });

      // Use audio data from sample blob in database
      const audioBuffer = sample.audio_data as Buffer;
      const audioData = new Float32Array(audioBuffer.buffer, audioBuffer.byteOffset, audioBuffer.byteLength / 4);
      
      if (!audioData || audioData.length === 0) {
        debugLog('error', '[AnalyzeNMF] No audio data in sample');
        return { success: false, message: 'Sample has no audio data.' };
      }

      debugLog('info', '[AnalyzeNMF] Starting NMF analysis', { 
        audioDataLength: audioData.length,
        components,
        iterations 
      });

      // Perform NMF analysis
      const nmf = new BufNMF({ components, iterations, fftSize });
      const result = nmf.process(audioData, sample.sample_rate);

      debugLog('info', '[AnalyzeNMF] Analysis complete', {
        basesShape: [result.bases.length, result.bases[0]?.length || 0],
        activationsShape: [result.activations.length, result.activations[0]?.length || 0]
      });

      // Compute feature hash
      const featureData = JSON.stringify({ bases: result.bases, activations: result.activations });
      const featureHash = crypto.createHash('sha256').update(featureData).digest('hex');

      debugLog('info', '[AnalyzeNMF] Computed feature hash', { featureHash: featureHash.substring(0, 8) });

      // Store in features table
      dbManager.db.prepare(`
        INSERT OR REPLACE INTO features (sample_hash, feature_type, feature_hash, feature_data, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run(
        sample.hash,
        'nmf',
        featureHash,
        featureData
      );

      debugLog('info', '[AnalyzeNMF] Feature stored in database');

      return {
        success: true,
        message: `NMF analysis complete for sample ${sample.hash.substring(0, 8)}\n` +
                `Components: ${components}, Iterations: ${iterations}\n` +
                `Feature hash: ${featureHash.substring(0, 8)}`
      };

    } catch (error: any) {
      debugLog('error', '[AnalyzeNMF] Error during analysis', { error: error.message, stack: error.stack });
      return { success: false, message: `NMF analysis failed: ${error.message}` };
    }
  }
};
