import { COMPONENT_STROKE_WIDTH, makeLine } from "../drawing.js";
import { GroundSymbol } from "./GroundSymbol.js";
import { VoltageSource } from "./VoltageSource.js";

const DEFAULT_MARKER_SCALE = 0.5;
const SUPPLY_RADIUS = 0.14;
const SUPPLY_CENTER_OFFSET = 0.42;
const GROUND_NODE_Y = 0.62;

export function addPowerRailMarkers(shape, {
  color,
  scale = DEFAULT_MARKER_SCALE,
  x = 0,
  topY,
  bottomY,
} = {}) {
  const supplyCenterY = topY + SUPPLY_CENTER_OFFSET * scale;
  const supplyOutputY = supplyCenterY - SUPPLY_RADIUS * scale;
  const groundCenterY = bottomY - GROUND_NODE_Y * scale;

  const supply = new VoltageSource({
    color,
    outputDirection: [0, -1, 0],
    position: [x, supplyCenterY, 0],
    scale,
  });
  const supplyLead = makeLine([[x, topY], [x, supplyOutputY]], {
    color,
    width: COMPONENT_STROKE_WIDTH * scale,
  });
  const ground = new GroundSymbol({
    color,
    labelVisible: false,
    nodeY: GROUND_NODE_Y,
    position: [x, groundCenterY, 0],
    scale,
  });

  shape.add(supplyLead, supply, ground);

  return { ground, supply, supplyLead };
}
