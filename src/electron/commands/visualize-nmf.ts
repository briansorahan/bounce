import { BrowserWindow } from 'electron';
import { debugLog } from '../logger';
import { Command, CommandResult } from './types';

export const visualizeNmfCommand: Command = {
  name: 'visualize-nmf',
  description: 'Visualize NMF decomposition for a sample',
  usage: 'visualize-nmf <sample-hash>',
  execute: async (args: string[], mainWindow, dbManager): Promise<CommandResult> => {
    debugLog('info', '[VisualizeNMF] Command called', { args });
    
    const hash = args[0];
    if (!hash) {
      debugLog('info', '[VisualizeNMF] No hash provided');
      return { success: false, message: 'Usage: visualize-nmf <sample-hash>' };
    }

    try {
      debugLog('info', '[VisualizeNMF] Looking up NMF feature', { hash });

      if (!dbManager) {
        return { success: false, message: 'Database not initialized' };
      }

      // Find sample by hash prefix
      const sample = dbManager.getSampleByHash(hash);

      if (!sample) {
        return { success: false, message: `No sample found with hash starting with: ${hash}` };
      }

      debugLog('info', '[VisualizeNMF] Found sample', { sampleHash: sample.hash });

      // Find NMF feature for this sample
      const feature = dbManager.getFeature(sample.hash, 'nmf');

      if (!feature) {
        return { success: false, message: `No NMF analysis found for sample ${hash}. Run 'analyze-nmf ${hash}' first.` };
      }

      debugLog('info', '[VisualizeNMF] Found NMF feature', { featureHash: feature.feature_hash });

      // Parse the NMF data
      const nmfData = JSON.parse(feature.feature_data);
      
      debugLog('info', '[VisualizeNMF] Parsed NMF data', { 
        components: nmfData.bases?.length,
        basisRows: nmfData.bases?.length,
        basisCols: nmfData.bases?.[0]?.length,
        activationsRows: nmfData.activations?.length,
        activationsCols: nmfData.activations?.[0]?.length
      });

      // Send to renderer to overlay on waveform
      debugLog('info', '[VisualizeNMF] Sending to renderer', { 
        sampleHash: sample.hash,
        components: nmfData.bases?.length || 0
      });
      
      mainWindow.webContents.send('overlay-nmf-visualization', {
        sampleHash: sample.hash,
        nmfData: {
          components: nmfData.bases?.length || 0,
          basis: nmfData.bases,
          activations: nmfData.activations
        },
        featureHash: feature.feature_hash
      });

      debugLog('info', '[VisualizeNMF] Sent to renderer successfully');
      
      return { success: true, message: `NMF visualization overlaid for sample ${hash.substring(0, 8)}` };
    } catch (error) {
      debugLog('error', '[VisualizeNMF] Error', { error: String(error) });
      return { success: false, message: `Error visualizing NMF: ${error instanceof Error ? error.message : String(error)}` };
    }
  }
};
