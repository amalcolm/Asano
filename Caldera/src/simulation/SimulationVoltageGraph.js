import { FloatingGraph } from "../helpers/graph/FloatingGraph.js";

const VOLTAGE_HOVER_TEMPLATE = "%{text}<br>Voltage %{y:.3f} V<extra></extra>";
const DEFAULT_SERIES = Object.freeze({
  color: "#8fc7ff",
  hoverTemplate: VOLTAGE_HOVER_TEMPLATE,
  id: "output",
  name: "Mid output voltage",
});

export class SimulationVoltageGraph {
  constructor(root) {
    this.graph = new FloatingGraph(root, {
      frameTitle: "ThreePot voltage graph",
      sceneOptions: {
        ariaLabel: "ThreePot voltage sweep graph",
        series: [DEFAULT_SERIES],
        title: "ThreePot voltage sweep",
        xAxis: {
          range: [0, 255],
        },
        xAxisTitle: "Sweep position",
        yAxis: {
          autorange: false,
          dtick: 0.1,
          range: [0, 0.62],
          tickformat: ".2f",
          ticksuffix: " V",
        },
        yAxisTitle: "Voltage",
      },
    });
  }

  start() {
    return this.graph.start();
  }

  stop() {
    return this.graph.stop();
  }

  clear() {
    return this.graph.clear();
  }

  prepareSweep({ ariaLabel, series, title, xAxisTitle } = {}) {
    const definitions = Array.isArray(series) && series.length > 0
      ? series
      : [DEFAULT_SERIES];

    return this.graph.prepare({
      ariaLabel,
      series: definitions.map((definition) => ({
        ...definition,
        hoverTemplate: definition.hoverTemplate ?? VOLTAGE_HOVER_TEMPLATE,
      })),
      title,
      xAxisTitle,
    });
  }

  setPresentation(presentation = {}) {
    return this.graph.setPresentation(presentation);
  }

  appendSamples(samples) {
    if (!Array.isArray(samples)) {
      return Promise.resolve();
    }

    return this.graph.appendPoints(samples.flatMap((sample) => {
      if (!Number.isFinite(sample?.wiper) || !Number.isFinite(sample?.voltage)) {
        return [];
      }

      return [{
        seriesId: sample.seriesId,
        text: sample.label ?? `Sweep ${sample.wiper}`,
        x: sample.wiper,
        y: sample.voltage,
      }];
    }));
  }

  popOut() {
    return this.graph.popOut();
  }

  redock() {
    return this.graph.redock();
  }

  maximise() {
    return this.graph.maximise();
  }
}
