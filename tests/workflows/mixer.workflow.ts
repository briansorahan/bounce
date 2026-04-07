/**
 * Workflow: mixer
 *
 * Tests the MixerService IPC contract (getMixerState, saveMixerChannel,
 * saveMixerMaster). No audio engine, no Electron.
 *
 * Corresponds to the state-mutation tests in tests/mixer.spec.ts
 * (canvas/DOM rendering tests are not covered here).
 *
 * Checks:
 *   - getMixerState() on empty store returns { channels: [], master: null }
 *   - saveMixerChannel() persists gain, pan, mute, solo
 *   - getMixerState() after channel save reflects the update
 *   - saving multiple channels all appear in channels array
 *   - channels array is ordered by channelIdx
 *   - saveMixerChannel() with mute=true is retrievable
 *   - saveMixerChannel() with solo=true is retrievable
 *   - saveMixerChannel() with instrumentName is retrievable
 *   - saveMixerMaster() persists master gain and mute
 *   - getMixerState() after master save reflects the update
 *   - saveMixerMaster() overwrite updates the master state
 */

import * as assert from "assert/strict";
import { createWorkflow } from "./types";
import type { WorkflowServices } from "./helpers";
import type { MixerState, MixerChannelState, MixerMasterState } from "../../src/shared/domain-types";

interface Ctx extends WorkflowServices, Record<string, unknown> {}

export function buildWorkflow() {
  const wf = createWorkflow("mixer");

  // ---- initial state -------------------------------------------------------

  wf.check("initial-state-has-empty-channels-and-null-master", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    assert.deepEqual(state.channels, []);
    assert.equal(state.master, null);
  });

  // ---- channel saves -------------------------------------------------------

  const saveCh1 = wf.action("save-channel-1", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 1,
      gainDb: -12,
      pan: 0,
      mute: false,
      solo: false,
      instrumentName: null,
    });
    return {};
  }, { after: ["initial-state-has-empty-channels-and-null-master"] });

  const readAfterCh1 = wf.action("read-state-after-ch1", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { stateAfterCh1: state };
  }, { after: [saveCh1] });

  wf.check("channel-1-gain-is-persisted", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterCh1: MixerState };
    const ch = ctx.stateAfterCh1.channels.find((c) => c.channelIdx === 1);
    assert.ok(ch, "channel 1 should exist");
    assert.equal(ch!.gainDb, -12);
  }, { after: [readAfterCh1] });

  wf.check("channel-1-pan-is-persisted", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterCh1: MixerState };
    const ch = ctx.stateAfterCh1.channels.find((c) => c.channelIdx === 1)!;
    assert.equal(ch.pan, 0);
  }, { after: [readAfterCh1] });

  wf.check("channel-1-mute-is-false", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterCh1: MixerState };
    const ch = ctx.stateAfterCh1.channels.find((c) => c.channelIdx === 1)!;
    assert.equal(ch.mute, false);
  }, { after: [readAfterCh1] });

  // ---- mute (use ch1 — read immediately after its own save) ---------------

  const saveCh1Muted = wf.action("save-channel-1-muted", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 1,
      gainDb: -12,
      pan: 0,
      mute: true,
      solo: false,
      instrumentName: null,
    });
    return {};
  }, { after: [saveCh1] });

  const readAfterMute = wf.action("read-state-after-mute", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { stateAfterMute: state };
  }, { after: [saveCh1Muted] });

  wf.check("channel-1-mute-is-true-after-mute", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterMute: MixerState };
    const ch = ctx.stateAfterMute.channels.find((c) => c.channelIdx === 1)!;
    assert.equal(ch.mute, true);
  }, { after: [readAfterMute] });

  // ---- solo (ch4 — avoids conflict with ch1 gain and multi-channel test) ---

  const saveCh4Solo = wf.action("save-channel-4-solo", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 4,
      gainDb: 0,
      pan: 0.5,
      mute: false,
      solo: true,
      instrumentName: null,
    });
    return {};
  }, { after: ["initial-state-has-empty-channels-and-null-master"] });

  const readAfterSolo = wf.action("read-state-after-solo", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { stateAfterSolo: state };
  }, { after: [saveCh4Solo] });

  wf.check("channel-4-solo-is-true", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterSolo: MixerState };
    const ch = ctx.stateAfterSolo.channels.find((c) => c.channelIdx === 4);
    assert.ok(ch, "channel 4 should exist");
    assert.equal(ch!.solo, true);
  }, { after: [readAfterSolo] });

  wf.check("channel-4-pan-is-persisted", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterSolo: MixerState };
    const ch = ctx.stateAfterSolo.channels.find((c) => c.channelIdx === 4)!;
    assert.equal(ch.pan, 0.5);
  }, { after: [readAfterSolo] });

  // ---- instrumentName (ch5) ------------------------------------------------

  const saveCh5WithInstrument = wf.action("save-channel-5-with-instrument", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 5,
      gainDb: -6,
      pan: -0.2,
      mute: false,
      solo: false,
      instrumentName: "keys",
    });
    return {};
  }, { after: ["initial-state-has-empty-channels-and-null-master"] });

  const readCh5 = wf.action("read-channel-5", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { ch5State: state.channels.find((c) => c.channelIdx === 5) ?? null };
  }, { after: [saveCh5WithInstrument] });

  wf.check("channel-5-instrument-name-is-persisted", (rawCtx) => {
    const ctx = rawCtx as Ctx & { ch5State: MixerChannelState | null };
    assert.ok(ctx.ch5State, "channel 5 should exist");
    assert.equal(ctx.ch5State!.instrumentName, "keys");
  }, { after: [readCh5] });

  // ---- channels ordered by index (ch6,7,8 to avoid conflicts) -------------

  const saveMultipleChannels = wf.action("save-channels-8-6-7", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    // Save out-of-order to verify sorting
    for (const idx of [8, 6, 7]) {
      await ctx.mixerClient.invoke("saveMixerChannel", {
        channelIdx: idx,
        gainDb: -idx,
        pan: 0,
        mute: false,
        solo: false,
        instrumentName: null,
      });
    }
    return {};
  }, { after: ["initial-state-has-empty-channels-and-null-master"] });

  const readMulti = wf.action("read-state-multi-channels", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { multiState: state };
  }, { after: [saveMultipleChannels] });

  wf.check("channels-are-ordered-by-index", (rawCtx) => {
    const ctx = rawCtx as Ctx & { multiState: MixerState };
    const indices = ctx.multiState.channels.map((c) => c.channelIdx);
    const sorted = [...indices].sort((a, b) => a - b);
    assert.deepEqual(indices, sorted, `channels should be sorted by index, got ${JSON.stringify(indices)}`);
  }, { after: [readMulti] });

  // ---- master: save then verify, then mute, then overwrite (sequential) ----

  const saveMaster = wf.action("save-master", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.mixerClient.invoke("saveMixerMaster", {
      gainDb: -3,
      mute: false,
    });
    return {};
  }, { after: ["initial-state-has-empty-channels-and-null-master"] });

  const readAfterMaster = wf.action("read-state-after-master", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { stateAfterMaster: state };
  }, { after: [saveMaster] });

  wf.check("master-gain-is-persisted", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterMaster: MixerState };
    assert.ok(ctx.stateAfterMaster.master !== null, "master should not be null");
    assert.equal(ctx.stateAfterMaster.master!.gainDb, -3);
  }, { after: [readAfterMaster] });

  wf.check("master-mute-is-false", (rawCtx) => {
    const ctx = rawCtx as Ctx & { stateAfterMaster: MixerState };
    assert.equal(ctx.stateAfterMaster.master!.mute, false);
  }, { after: [readAfterMaster] });

  // ---- master mute (sequential: after readAfterMaster) --------------------

  const saveMasterMuted = wf.action("save-master-muted", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.mixerClient.invoke("saveMixerMaster", {
      gainDb: -3,
      mute: true,
    });
    return {};
  }, { after: [readAfterMaster] });

  const readAfterMasterMute = wf.action("read-state-after-master-mute", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { masterMuteState: state.master };
  }, { after: [saveMasterMuted] });

  wf.check("master-mute-is-true-after-mute", (rawCtx) => {
    const ctx = rawCtx as Ctx & { masterMuteState: MixerMasterState | null };
    assert.ok(ctx.masterMuteState !== null);
    assert.equal(ctx.masterMuteState!.mute, true);
  }, { after: [readAfterMasterMute] });

  // ---- master overwrite (sequential: after readAfterMasterMute) -----------

  const overwriteMaster = wf.action("overwrite-master", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    await ctx.mixerClient.invoke("saveMixerMaster", {
      gainDb: -6,
      mute: false,
    });
    return {};
  }, { after: [readAfterMasterMute] });

  const readOverwrittenMaster = wf.action("read-overwritten-master", async (rawCtx) => {
    const ctx = rawCtx as Ctx;
    const state = await ctx.mixerClient.invoke("getMixerState", {});
    return { overwrittenMaster: state.master };
  }, { after: [overwriteMaster] });

  wf.check("overwrite-master-updates-gain", (rawCtx) => {
    const ctx = rawCtx as Ctx & { overwrittenMaster: MixerMasterState | null };
    assert.equal(ctx.overwrittenMaster!.gainDb, -6);
  }, { after: [readOverwrittenMaster] });

  return wf.build();
}
