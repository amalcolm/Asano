import * as THREE from "three";
import { COMPONENT_BLUE, COMPONENT_STROKE_WIDTH, makeLine, updateLine } from "../drawing.js";
import { Shape } from "./Shape.js";
import { TextLabel } from "./TextLabel.js";

export class GroundSymbol extends Shape {
  constructor({
    color = COMPONENT_BLUE,
    labelVisible = true,
    minimumConnectorLength = 0.18,
    nodeY = 0.45,
    position = [0, 0, 0],
    scale = 1,
  } = {}) {
    super({ name: "GroundSymbol", position, scale });

    this.color = color;
    this.connectorBaseY = 0.10;
    this.minimumConnectorLength = minimumConnectorLength;
    this.nodePort = this.addPort("node", [0, nodeY], {
      direction: [0, 1, 0],
      kind: "ground",
      signal: { voltage: 0 },
    });

    this.connector = makeLine([]);
    this.add(this.connector);
    this.setNodeY(nodeY);

    this.add(makeLine([[-0.18,  0.10], [0.18,  0.10]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(makeLine([[-0.13,  0.00], [0.13,  0.00]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.add(makeLine([[-0.08, -0.10], [0.08, -0.10]], { color, width: COMPONENT_STROKE_WIDTH }));
    this.label = new TextLabel("GND", { color, position: [0, -0.32, 0], width: 0.48, height: 0.22 });
    this.label.visible = labelVisible;
    this.add(this.label);
  }

  setNodeWorldY(worldY) {
    const localPoint = this.worldToLocal(new THREE.Vector3(0, worldY, 0));
    this.setNodeY(localPoint.y);
  }

  setNodeY(y) {
    const minimumNodeY = this.connectorBaseY + this.minimumConnectorLength;

    this.nodePort.position.y = Math.max(y, minimumNodeY);
    updateLine(this.connector, [[0, this.nodePort.position.y], [0, this.connectorBaseY]]);
  }

  evaluateVoltage() {
    this.nodePort.voltage = 0;
  }
}
