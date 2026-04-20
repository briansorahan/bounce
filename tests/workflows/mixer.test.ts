import { describe, it, beforeAll, afterAll } from "vitest";
import * as assert from "assert/strict";
import { bootServices } from "./helpers";
import type { WorkflowServices } from "./helpers";
import type { MixerState, MixerChannelState, MixerMasterState } from "../../src/shared/domain-types";

describe("mixer", () => {
  let services: WorkflowServices;
  let cleanup: () => void;
  let stateAfterCh1: MixerState;
  let stateAfterMute: MixerState;
  let stateAfterSolo: MixerState;
  let ch5State: MixerChannelState | null;
  let multiState: MixerState;
  let stateAfterMaster: MixerState;
  let masterMuteState: MixerMasterState | null;
  let overwrittenMaster: MixerMasterState | null;

  beforeAll(() => {
    const booted = bootServices();
    services = booted.ctx;
    cleanup = booted.cleanup;
  });

  afterAll(() => cleanup?.());

  it("initial-state-has-empty-channels-and-null-master", async () => {
    const state = await services.mixerClient.invoke("getMixerState", {});
    assert.deepEqual(state.channels, []);
    assert.equal(state.master, null);
  });

  it("save-channel-1", async () => {
    await services.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 1,
      gainDb: -12,
      pan: 0,
      mute: false,
      solo: false,
      instrumentName: null,
    });
  });

  it("read-state-after-ch1", async () => {
    stateAfterCh1 = await services.mixerClient.invoke("getMixerState", {});
  });

  it("channel-1-gain-is-persisted", () => {
    const ch = stateAfterCh1.channels.find((c) => c.channelIdx === 1);
    assert.ok(ch, "channel 1 should exist");
    assert.equal(ch!.gainDb, -12);
  });

  it("channel-1-pan-is-persisted", () => {
    const ch = stateAfterCh1.channels.find((c) => c.channelIdx === 1)!;
    assert.equal(ch.pan, 0);
  });

  it("channel-1-mute-is-false", () => {
    const ch = stateAfterCh1.channels.find((c) => c.channelIdx === 1)!;
    assert.equal(ch.mute, false);
  });

  it("save-channel-1-muted", async () => {
    await services.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 1,
      gainDb: -12,
      pan: 0,
      mute: true,
      solo: false,
      instrumentName: null,
    });
  });

  it("read-state-after-mute", async () => {
    stateAfterMute = await services.mixerClient.invoke("getMixerState", {});
  });

  it("channel-1-mute-is-true-after-mute", () => {
    const ch = stateAfterMute.channels.find((c) => c.channelIdx === 1)!;
    assert.equal(ch.mute, true);
  });

  it("save-channel-4-solo", async () => {
    await services.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 4,
      gainDb: 0,
      pan: 0.5,
      mute: false,
      solo: true,
      instrumentName: null,
    });
  });

  it("read-state-after-solo", async () => {
    stateAfterSolo = await services.mixerClient.invoke("getMixerState", {});
  });

  it("channel-4-solo-is-true", () => {
    const ch = stateAfterSolo.channels.find((c) => c.channelIdx === 4);
    assert.ok(ch, "channel 4 should exist");
    assert.equal(ch!.solo, true);
  });

  it("channel-4-pan-is-persisted", () => {
    const ch = stateAfterSolo.channels.find((c) => c.channelIdx === 4)!;
    assert.equal(ch.pan, 0.5);
  });

  it("save-channel-5-with-instrument", async () => {
    await services.mixerClient.invoke("saveMixerChannel", {
      channelIdx: 5,
      gainDb: -6,
      pan: -0.2,
      mute: false,
      solo: false,
      instrumentName: "keys",
    });
  });

  it("read-channel-5", async () => {
    const state = await services.mixerClient.invoke("getMixerState", {});
    ch5State = state.channels.find((c) => c.channelIdx === 5) ?? null;
  });

  it("channel-5-instrument-name-is-persisted", () => {
    assert.ok(ch5State, "channel 5 should exist");
    assert.equal(ch5State!.instrumentName, "keys");
  });

  it("save-channels-8-6-7", async () => {
    for (const idx of [8, 6, 7]) {
      await services.mixerClient.invoke("saveMixerChannel", {
        channelIdx: idx,
        gainDb: -idx,
        pan: 0,
        mute: false,
        solo: false,
        instrumentName: null,
      });
    }
  });

  it("read-state-multi-channels", async () => {
    multiState = await services.mixerClient.invoke("getMixerState", {});
  });

  it("channels-are-ordered-by-index", () => {
    const indices = multiState.channels.map((c) => c.channelIdx);
    const sorted = [...indices].sort((a, b) => a - b);
    assert.deepEqual(indices, sorted, `channels should be sorted by index, got ${JSON.stringify(indices)}`);
  });

  it("save-master", async () => {
    await services.mixerClient.invoke("saveMixerMaster", {
      gainDb: -3,
      mute: false,
    });
  });

  it("read-state-after-master", async () => {
    stateAfterMaster = await services.mixerClient.invoke("getMixerState", {});
  });

  it("master-gain-is-persisted", () => {
    assert.ok(stateAfterMaster.master !== null, "master should not be null");
    assert.equal(stateAfterMaster.master!.gainDb, -3);
  });

  it("master-mute-is-false", () => {
    assert.equal(stateAfterMaster.master!.mute, false);
  });

  it("save-master-muted", async () => {
    await services.mixerClient.invoke("saveMixerMaster", {
      gainDb: -3,
      mute: true,
    });
  });

  it("read-state-after-master-mute", async () => {
    const state = await services.mixerClient.invoke("getMixerState", {});
    masterMuteState = state.master;
  });

  it("master-mute-is-true-after-mute", () => {
    assert.ok(masterMuteState !== null);
    assert.equal(masterMuteState!.mute, true);
  });

  it("overwrite-master", async () => {
    await services.mixerClient.invoke("saveMixerMaster", {
      gainDb: -6,
      mute: false,
    });
  });

  it("read-overwritten-master", async () => {
    const state = await services.mixerClient.invoke("getMixerState", {});
    overwrittenMaster = state.master;
  });

  it("overwrite-master-updates-gain", () => {
    assert.equal(overwrittenMaster!.gainDb, -6);
  });
});
