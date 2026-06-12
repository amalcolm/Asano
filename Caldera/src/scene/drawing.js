import * as THREE from "three";

export const INK = 0x505060;
export const COMPONENT_BLUE = 0x274485;
export const CALIBRATED_RED = 0xb4232a;
export const COMPONENT_STROKE_WIDTH = 0.018;

export function makeLine(points, { color = INK, width = 0 } = {}) {
  if (width > 0) {
    return makeThickLine(points, { color, width });
  }

  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.Line(makeGeometry(points), material);
  line.renderOrder = 1;
  return line;
}

export function makeLineLoop(points, { color = INK, width = 0 } = {}) {
  if (width > 0) {
    return makeThickLine(points, { closed: true, color, width });
  }

  const material = new THREE.LineBasicMaterial({
    color,
    depthTest: false,
    depthWrite: false,
  });
  const line = new THREE.LineLoop(makeGeometry(points), material);
  line.renderOrder = 1;
  return line;
}

export function makeFilledPolygon(points, { color = INK } = {}) {
  const [firstPoint, ...otherPoints] = points.map(toVector3);
  const shape = new THREE.Shape();

  shape.moveTo(firstPoint.x, firstPoint.y);
  otherPoints.forEach((point) => shape.lineTo(point.x, point.y));
  shape.lineTo(firstPoint.x, firstPoint.y);

  const mesh = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  mesh.renderOrder = 2;
  return mesh;
}

export function updateLine(line, points) {
  line.geometry.dispose();
  line.geometry = line.userData.isThickLine
    ? makeStrokeGeometry(points, line.userData.strokeWidth, line.userData.closed)
    : makeGeometry(points);
}

export function circlePoints(radius, segments = 48) {
  return Array.from({ length: segments }, (_, index) => {
    const angle = (index / segments) * Math.PI * 2;
    return [Math.cos(angle) * radius, Math.sin(angle) * radius, 0];
  });
}

export function toVector3(point) {
  if (point instanceof THREE.Vector3) {
    return point.clone();
  }

  const [x, y, z = 0] = point;
  return new THREE.Vector3(x, y, z);
}

export function toCssColor(color) {
  if (typeof color === "number") {
    return `#${color.toString(16).padStart(6, "0")}`;
  }

  return color;
}

function makeThickLine(points, { closed = false, color, width }) {
  const mesh = new THREE.Mesh(
    makeStrokeGeometry(points, width, closed),
    new THREE.MeshBasicMaterial({
      color,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  mesh.renderOrder = 1;
  mesh.userData.isThickLine = true;
  mesh.userData.closed = closed;
  mesh.userData.strokeWidth = width;
  return mesh;
}

function makeStrokeGeometry(points, width, closed = false) {
  const sourcePoints = points.map(toVector3);
  const pointCount = sourcePoints.length;

  if (pointCount < 2) {
    return new THREE.BufferGeometry();
  }

  const halfWidth = width / 2;
  const leftPoints = [];
  const rightPoints = [];

  sourcePoints.forEach((point, index) => {
    const offset = getStrokeOffset(sourcePoints, index, halfWidth, closed);

    leftPoints.push(new THREE.Vector3(point.x + offset.x, point.y + offset.y, point.z));
    rightPoints.push(new THREE.Vector3(point.x - offset.x, point.y - offset.y, point.z));
  });

  const vertices = [...leftPoints, ...rightPoints].flatMap((point) => [point.x, point.y, point.z]);
  const indices = [];
  const segmentCount = closed ? pointCount : pointCount - 1;

  for (let index = 0; index < segmentCount; index += 1) {
    const nextIndex = (index + 1) % pointCount;

    indices.push(index, nextIndex, pointCount + index);
    indices.push(nextIndex, pointCount + nextIndex, pointCount + index);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setIndex(indices);
  return geometry;
}

function getStrokeOffset(points, index, halfWidth, closed) {
  if (!closed && index === 0) {
    return getSegmentNormal(points[index], points[index + 1]).multiplyScalar(halfWidth);
  }

  if (!closed && index === points.length - 1) {
    return getSegmentNormal(points[index - 1], points[index]).multiplyScalar(halfWidth);
  }

  const previous = points[(index - 1 + points.length) % points.length];
  const current = points[index];
  const next = points[(index + 1) % points.length];
  const previousNormal = getSegmentNormal(previous, current);
  const nextNormal = getSegmentNormal(current, next);
  const miter = previousNormal.clone().add(nextNormal);

  if (miter.lengthSq() < 0.000001) {
    return nextNormal.multiplyScalar(halfWidth);
  }

  miter.normalize();

  const denominator = Math.max(Math.abs(miter.dot(nextNormal)), 0.25);
  return miter.multiplyScalar(halfWidth / denominator);
}

function getSegmentNormal(start, end) {
  const direction = new THREE.Vector2(end.x - start.x, end.y - start.y);

  if (direction.lengthSq() < 0.000001) {
    return new THREE.Vector2(0, 1);
  }

  direction.normalize();
  return new THREE.Vector2(-direction.y, direction.x);
}

function makeGeometry(points) {
  return new THREE.BufferGeometry().setFromPoints(points.map(toVector3));
}
