export type GeometryDescriptor = {
  hasPosition: boolean,
  hasNormal: boolean
  hasUv: boolean
};

export function quadPositions(): Float32Array {
  return new Float32Array([
    -1.0, -1.0,  1.0,
     1.0, -1.0,  1.0,
     1.0,  1.0,  1.0,
    -1.0,  1.0,  1.0,
  ]);
}

export function quadPositionsUvs(): Float32Array {
  return new Float32Array([
    -1, -1, 1, 0, 0,
    1, -1, 1, 1, 0,
    1, 1, 1, 1, 1,
    -1, 1, 1, 0, 1
  ]);
}

export function quadIndices(): Uint16Array {
  return new Uint16Array([0,  1,  2, 0,  2,  3]);
}

export function cubeInterleavedPositionsNormals(): Float32Array {
  return new Float32Array([
    -1.0, -1.0,  1.0,  0, 0, 1,
     1.0, -1.0,  1.0,  0, 0, 1,
     1.0,  1.0,  1.0,  0, 0, 1,
    -1.0,  1.0,  1.0,  0, 0, 1,

    -1.0, -1.0, -1.0,  0, 0, -1,
    -1.0,  1.0, -1.0,  0, 0, -1,
     1.0,  1.0, -1.0,  0, 0, -1,
     1.0, -1.0, -1.0,  0, 0, -1,
    
    -1.0,  1.0, -1.0,  0, 1, 0,
    -1.0,  1.0,  1.0,  0, 1, 0,  
     1.0,  1.0,  1.0,  0, 1, 0,
     1.0,  1.0, -1.0,  0, 1, 0,
  
    -1.0, -1.0, -1.0,  0, -1, 0,
     1.0, -1.0, -1.0,  0, -1, 0,
     1.0, -1.0,  1.0,  0, -1, 0,
    -1.0, -1.0,  1.0,  0, -1, 0,
    
     1.0, -1.0, -1.0,  1, 0, 0,
     1.0,  1.0, -1.0,  1, 0, 0,
     1.0,  1.0,  1.0,  1, 0, 0,
     1.0, -1.0,  1.0,  1, 0, 0,
    
    -1.0, -1.0, -1.0,   -1, 0, 0,
    -1.0, -1.0,  1.0,   -1, 0, 0,
    -1.0,  1.0,  1.0,   -1, 0, 0,
    -1.0,  1.0, -1.0,   -1, 0, 0,
  ]);
}

export function cubeIndices(): Uint16Array {
  return new Uint16Array([
    0,  1,  2,      0,  2,  3,
    4,  5,  6,      4,  6,  7,
    8,  9,  10,     8,  10, 11,
    12, 13, 14,     12, 14, 15,
    16, 17, 18,     16, 18, 19,
    20, 21, 22,     20, 22, 23,
  ]);
}

export function sphereInterleavedDataAndIndices(vertexCount: number = 64): {vertexData: Float32Array, indices: Uint16Array} {
  const vertexData: Array<number> = [];

  for (let i = 0; i < vertexCount; i++) {
    for (let j = 0; j < vertexCount; j++) {
      let xSegment = j / (vertexCount-1);
      let ySegment = i / (vertexCount-1);

      let xPos = Math.cos(xSegment * 2 * Math.PI) * Math.sin(ySegment * Math.PI);
      let yPos = Math.cos(ySegment * Math.PI);
      let zPos = Math.sin(xSegment * 2 * Math.PI) * Math.sin(ySegment * Math.PI);

      vertexData.push(xPos);
      vertexData.push(yPos);
      vertexData.push(zPos);

      vertexData.push(xSegment);
      vertexData.push(ySegment);

      vertexData.push(xPos);
      vertexData.push(yPos);
      vertexData.push(zPos);
    }
  }

  let firstIndex = 0;
  let nextIndex = vertexCount;
  let indexStp = 0;
  let shouldProceed = true;
  let indices: Array<number> = [];

  while (shouldProceed) {
    indices.push(firstIndex);
    indices.push(nextIndex);
    indexStp += 2;

    shouldProceed = nextIndex != (vertexCount * vertexCount) - 1;

    if (indexStp > 0 && (nextIndex+1) % vertexCount == 0 && shouldProceed) {
      indices.push(nextIndex);
      indices.push(firstIndex+1);
      indexStp += 2;
    }

    firstIndex++;
    nextIndex++;
  }

  return {
    vertexData: new Float32Array(vertexData),
    indices: new Uint16Array(indices)
  };
}