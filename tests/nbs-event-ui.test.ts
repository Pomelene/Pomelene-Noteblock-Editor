import { expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { createDemoProject } from "../src/shared/session";
import { fromNbs, toNbs } from "../src/shared/io";
import { NbsEventSummary } from "../src/renderer/src/NbsEventSummary";

it("discloses normalized control names, positions and retained visual behavior without save actions", () => {
  const project = fromNbs(toNbs(createDemoProject()).data);
  project.nbs!.vanillaInstrumentCount = 20;
  project.nbs!.customInstruments = [
    { name: "Show Save Popup", file: "", key: 45, pressKey: 0 },
  ];
  project.nbsEvents = [
    {
      id: "popup",
      tick: 128,
      layer: 3,
      instrument: 16,
      kind: "visual",
      pitch: 66,
      velocity: 100,
      panning: 100,
      finePitch: 0,
    },
  ];
  const html = renderToStaticMarkup(
    createElement(NbsEventSummary, { project }),
  );
  expect(html).toContain("Show Save Popup");
  expect(html).toContain("tick 128");
  expect(html).toContain("源图层 4");
  expect(html).toContain("视觉效果仅保留、不执行");
  expect(html).toContain("不会保存文件");
  expect(html).not.toContain("<button");
  expect(html).not.toContain("#16");
});

it("omits the disclosure for songs without functional controls", () => {
  expect(
    renderToStaticMarkup(
      createElement(NbsEventSummary, { project: createDemoProject() }),
    ),
  ).toBe("");
});
